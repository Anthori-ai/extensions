#!/usr/bin/env python3
import base64
import json
import os
import platform
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

MODEL_EXTENSIONS = {".safetensors", ".gguf", ".ckpt"}
DEFAULT_TIMEOUT_SECONDS = 600
WINDOWS_FILE_RETRY_ATTEMPTS = 80
WAN22_T2V_A14B_VARIANTS = {
    "q3_k_m": {
        "label": "Q3_K_M",
        "highNoiseModelPath": "QuantStack/Wan2.2-T2V-A14B-GGUF/HighNoise/Wan2.2-T2V-A14B-HighNoise-Q3_K_M.gguf",
        "lowNoiseModelPath": "QuantStack/Wan2.2-T2V-A14B-GGUF/LowNoise/Wan2.2-T2V-A14B-LowNoise-Q3_K_M.gguf",
        "t5xxlPath": "city96/umt5-xxl-encoder-gguf/umt5-xxl-encoder-Q3_K_M.gguf",
        "vaePath": "QuantStack/Wan2.2-T2V-A14B-GGUF/VAE/Wan2.1_VAE.safetensors",
    },
    "q4_k_m": {
        "label": "Q4_K_M",
        "highNoiseModelPath": "QuantStack/Wan2.2-T2V-A14B-GGUF/HighNoise/Wan2.2-T2V-A14B-HighNoise-Q4_K_M.gguf",
        "lowNoiseModelPath": "QuantStack/Wan2.2-T2V-A14B-GGUF/LowNoise/Wan2.2-T2V-A14B-LowNoise-Q4_K_M.gguf",
        "t5xxlPath": "city96/umt5-xxl-encoder-gguf/umt5-xxl-encoder-Q4_K_M.gguf",
        "vaePath": "QuantStack/Wan2.2-T2V-A14B-GGUF/VAE/Wan2.1_VAE.safetensors",
    },
    "q5_k_m": {
        "label": "Q5_K_M",
        "highNoiseModelPath": "QuantStack/Wan2.2-T2V-A14B-GGUF/HighNoise/Wan2.2-T2V-A14B-HighNoise-Q5_K_M.gguf",
        "lowNoiseModelPath": "QuantStack/Wan2.2-T2V-A14B-GGUF/LowNoise/Wan2.2-T2V-A14B-LowNoise-Q5_K_M.gguf",
        "t5xxlPath": "city96/umt5-xxl-encoder-gguf/umt5-xxl-encoder-Q5_K_M.gguf",
        "vaePath": "QuantStack/Wan2.2-T2V-A14B-GGUF/VAE/Wan2.1_VAE.safetensors",
    },
    "q6": {
        "label": "Q6_K",
        "highNoiseModelPath": "QuantStack/Wan2.2-T2V-A14B-GGUF/HighNoise/Wan2.2-T2V-A14B-HighNoise-Q6_K.gguf",
        "lowNoiseModelPath": "QuantStack/Wan2.2-T2V-A14B-GGUF/LowNoise/Wan2.2-T2V-A14B-LowNoise-Q6_K.gguf",
        "t5xxlPath": "city96/umt5-xxl-encoder-gguf/umt5-xxl-encoder-Q6_K.gguf",
        "vaePath": "QuantStack/Wan2.2-T2V-A14B-GGUF/VAE/Wan2.1_VAE.safetensors",
    },
    "q8": {
        "label": "Q8_0",
        "highNoiseModelPath": "QuantStack/Wan2.2-T2V-A14B-GGUF/HighNoise/Wan2.2-T2V-A14B-HighNoise-Q8_0.gguf",
        "lowNoiseModelPath": "QuantStack/Wan2.2-T2V-A14B-GGUF/LowNoise/Wan2.2-T2V-A14B-LowNoise-Q8_0.gguf",
        "t5xxlPath": "city96/umt5-xxl-encoder-gguf/umt5-xxl-encoder-Q8_0.gguf",
        "vaePath": "QuantStack/Wan2.2-T2V-A14B-GGUF/VAE/Wan2.1_VAE.safetensors",
    },
}


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def output(value):
    sys.stdout.write(json.dumps({"output": value}, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def fail(message):
    sys.stdout.write(json.dumps({"error": str(message)}, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def normalize_string(value):
    return str(value or "").strip()


def normalize_bool(value, fallback=False):
    if isinstance(value, bool):
        return value
    text = normalize_string(value).lower()
    if text in ("true", "on", "yes", "1"):
        return True
    if text in ("false", "off", "no", "0"):
        return False
    return fallback


def normalize_int(value, fallback=None, minimum=None, maximum=None):
    if value is None or value == "":
        return fallback
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        return fallback
    if minimum is not None and parsed < minimum:
        return fallback
    if maximum is not None and parsed > maximum:
        return fallback
    return parsed


def normalize_float(value, fallback=None, minimum=None, maximum=None):
    if value is None or value == "":
        return fallback
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    if minimum is not None and parsed < minimum:
        return fallback
    if maximum is not None and parsed > maximum:
        return fallback
    return parsed


def extension_state_dir(input_value):
    extension = input_value.get("extension") if isinstance(input_value, dict) else {}
    state_dir = normalize_string(extension.get("stateDir") if isinstance(extension, dict) else "")
    if not state_dir:
        raise ValueError("extension state directory is unavailable")
    path = Path(state_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def extension_request(input_value):
    settings = {}
    if isinstance(input_value, dict) and isinstance(input_value.get("extension"), dict):
        extension = input_value.get("extension")
        if isinstance(extension.get("settings"), dict):
            settings = dict(extension.get("settings"))
    if isinstance(input_value, dict) and isinstance(input_value.get("request"), dict):
        request = dict(input_value.get("request"))
        settings.update(request)
        return settings
    if isinstance(input_value, dict):
        request = dict(input_value)
        settings.update(request)
        return settings
    return settings


def safe_name(value):
    text = normalize_string(value)
    text = re.sub(r"[^A-Za-z0-9._-]+", "_", text)
    return text[:160] or "item"


def path_inside(root, value):
    try:
        root_resolved = Path(root).resolve()
        value_resolved = Path(value).resolve()
        return value_resolved == root_resolved or root_resolved in value_resolved.parents
    except OSError:
        return False


def file_size(path):
    try:
        return Path(path).stat().st_size
    except OSError:
        return 0


def transient_file_attempts():
    return WINDOWS_FILE_RETRY_ATTEMPTS if os.name == "nt" else 1


def sleep_for_transient_file_error(index):
    if os.name == "nt":
        time.sleep(min(0.02 * (index + 1), 0.25))


def replace_file(source, target):
    last_error = None
    for index in range(transient_file_attempts()):
        try:
            os.replace(source, target)
            return
        except PermissionError as exc:
            last_error = exc
            if os.name != "nt":
                raise
            sleep_for_transient_file_error(index)
    if last_error is not None:
        raise last_error


def read_json(path, fallback=None):
    last_permission_error = None
    for index in range(transient_file_attempts()):
        try:
            with open(path, "r", encoding="utf-8") as handle:
                return json.load(handle)
        except FileNotFoundError:
            return fallback
        except json.JSONDecodeError:
            return fallback
        except PermissionError as exc:
            if os.name != "nt":
                raise
            last_permission_error = exc
            sleep_for_transient_file_error(index)
    if last_permission_error is not None:
        return fallback
    return fallback


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name("{}.tmp.{}.{}".format(path.name, os.getpid(), time.time_ns()))
    try:
        with open(temp, "w", encoding="utf-8") as handle:
            json.dump(value, handle, separators=(",", ":"))
        replace_file(temp, path)
    finally:
        try:
            if temp.exists():
                temp.unlink()
        except OSError:
            pass


def executable_name(base):
    return base + ".exe" if os.name == "nt" else base


def home_dependency_root():
    return Path.home() / "Git" / "Anthori_Dependencies"


def platform_id():
    system = platform.system().lower()
    if system == "darwin":
        os_name = "mac"
    elif system.startswith("windows"):
        os_name = "windows"
    elif system.startswith("linux"):
        os_name = "linux"
    else:
        os_name = system or "unknown"
    machine = platform.machine().lower()
    if machine in ("x86_64", "amd64"):
        arch = "amd64"
    elif machine in ("arm64", "aarch64"):
        arch = "arm64"
    else:
        arch = machine or "unknown"
    return os_name + "-" + arch


def runtime_root(state_dir):
    return state_dir / "runtimes"


def normalize_runtime_id(value):
    runtime_id = normalize_string(value).lower()
    if not runtime_id:
        return ""
    if not re.fullmatch(r"[a-z0-9._-]+", runtime_id):
        return ""
    return runtime_id


def runtime_path_entry(root_kind, relative_dir):
    return {"root": root_kind, "dir": relative_dir}


def stable_diffusion_definition(runtime_id, name, description, variant, backend, paths):
    return {
        "id": runtime_id,
        "name": name,
        "description": description,
        "type": "Stable Diffusion",
        "variant": variant,
        "backend": backend,
        "paramsBackend": backend,
        "paths": paths,
        "installable": False,
        "assets": [],
    }


def runtime_catalog_for(platform_value):
    cpu = stable_diffusion_definition(
        "stable-diffusion.cpp.cpu",
        "CPU stable-diffusion.cpp",
        "CPU-only stable-diffusion.cpp engine",
        "CPU",
        "cpu",
        [
            runtime_path_entry("state", "stable-diffusion.cpp.cpu/bin"),
            runtime_path_entry("state", "stable-diffusion.cpp/build-cpu/bin"),
            runtime_path_entry("state", "stable-diffusion.cpp/bin"),
            runtime_path_entry("dependencies", "stable-diffusion.cpp/build-cpu/bin"),
            runtime_path_entry("dependencies", "stable-diffusion.cpp/bin"),
        ],
    )
    metal = stable_diffusion_definition(
        "stable-diffusion.cpp.metal",
        "Metal stable-diffusion.cpp",
        "Apple Metal accelerated stable-diffusion.cpp engine",
        "Metal",
        "metal",
        [
            runtime_path_entry("state", "stable-diffusion.cpp.metal/bin"),
            runtime_path_entry("state", "stable-diffusion.cpp/build-metal/bin"),
            runtime_path_entry("dependencies", "stable-diffusion.cpp/build-metal/bin"),
        ],
    )
    cuda = stable_diffusion_definition(
        "stable-diffusion.cpp.cuda",
        "CUDA stable-diffusion.cpp",
        "NVIDIA CUDA accelerated stable-diffusion.cpp engine",
        "CUDA",
        "cuda",
        [
            runtime_path_entry("state", "stable-diffusion.cpp.cuda/bin"),
            runtime_path_entry("state", "stable-diffusion.cpp/build-cuda/bin"),
            runtime_path_entry("dependencies", "stable-diffusion.cpp/build-cuda/bin"),
        ],
    )
    vulkan = stable_diffusion_definition(
        "stable-diffusion.cpp.vulkan",
        "Vulkan stable-diffusion.cpp",
        "Vulkan accelerated stable-diffusion.cpp engine",
        "Vulkan",
        "vulkan",
        [
            runtime_path_entry("state", "stable-diffusion.cpp.vulkan/bin"),
            runtime_path_entry("state", "stable-diffusion.cpp/build-vulkan/bin"),
            runtime_path_entry("dependencies", "stable-diffusion.cpp/build-vulkan/bin"),
        ],
    )
    catalog = {
        "mac-arm64": [metal, cpu],
        "mac-amd64": [cpu, metal],
        "windows-amd64": [cpu, cuda, vulkan],
        "windows-arm64": [cpu],
        "linux-amd64": [cpu, cuda, vulkan],
        "linux-arm64": [cpu, vulkan],
    }
    return list(catalog.get(platform_value, [cpu]))


def system_runtime_definition():
    binary = executable_name("sd-cli")
    env_path = normalize_string(os.environ.get("ANTHORI_SD_CLI"))
    system_path = env_path or normalize_string(shutil.which(binary))
    if not system_path:
        return None
    return {
        "id": "system",
        "name": "System stable-diffusion.cpp",
        "description": "sd-cli found from environment or PATH",
        "type": "Stable Diffusion",
        "variant": "System",
        "backend": "cpu",
        "paramsBackend": "cpu",
        "systemPath": system_path,
        "installable": False,
        "assets": [],
    }


def runtime_definitions():
    definitions = runtime_catalog_for(platform_id())
    system_definition = system_runtime_definition()
    if system_definition:
        definitions.append(system_definition)
    return definitions


def find_runtime_definition(runtime_id):
    target = normalize_runtime_id(runtime_id)
    if not target:
        return None
    for definition in runtime_definitions():
        if normalize_runtime_id(definition.get("id")) == target:
            return definition
    return None


def runtime_definition_candidates(state_dir, definition):
    binary = executable_name("sd-cli")
    system_path = normalize_string(definition.get("systemPath"))
    if system_path:
        return [Path(system_path).expanduser()]
    candidates = []
    for entry in definition.get("paths", []):
        root_kind = normalize_string(entry.get("root"))
        relative_dir = normalize_string(entry.get("dir"))
        if not relative_dir:
            continue
        if root_kind == "state":
            base = runtime_root(state_dir)
        elif root_kind == "dependencies":
            base = home_dependency_root()
        else:
            continue
        path = base / relative_dir / binary
        if path not in candidates:
            candidates.append(path)
    return candidates


def installed_runtime_binary(state_dir, definition):
    candidates = runtime_definition_candidates(state_dir, definition)
    for path in candidates:
        try:
            if path.is_file() and os.access(path, os.X_OK):
                return path, True, candidates
        except OSError:
            continue
    return (candidates[0] if candidates else Path(executable_name("sd-cli"))), False, candidates


def model_roots(state_dir, request):
    roots = []
    for value in (
        request.get("modelRoot"),
        os.environ.get("ANTHORI_DIFFUSION_MODEL_ROOT"),
        state_dir / "models",
    ):
        text = normalize_string(value)
        if not text:
            continue
        path = Path(text).expanduser()
        if path not in roots:
            roots.append(path)
    return roots


def managed_output_root(state_dir):
    return state_dir / "outputs"


def downloads_root(state_dir):
    return state_dir / "downloads"


def runtime_candidates(state_dir, request):
    candidates = []
    runtime_id = normalize_runtime_id(request.get("runtimeId"))
    definitions = [find_runtime_definition(runtime_id)] if runtime_id else runtime_definitions()
    for definition in definitions:
        if not definition:
            continue
        for path in runtime_definition_candidates(state_dir, definition):
            if path not in candidates:
                candidates.append(path)
    return candidates


def model_role(path):
    lowered = path.name.lower()
    parts = [part.lower() for part in path.parts]
    joined = "/".join(parts)
    if "highnoise" in joined or "high-noise" in joined or "high_noise" in joined:
        return "high_noise"
    if "lownoise" in joined or "low-noise" in joined or "low_noise" in joined:
        return "low_noise"
    if "umt5" in lowered or "t5xxl" in lowered or "text_encoder" in joined or "text-encoder" in joined:
        return "t5xxl"
    if "clip_vision" in joined or "clip-vision" in joined or "clipvision" in joined:
        return "clip_vision"
    if "taesd" in parts or "tae" in lowered or "taesd" in lowered:
        return "taesd"
    if "vae" in parts or "vae" in lowered:
        return "vae"
    if "lora" in parts or "loras" in parts or "lora" in joined or "lora" in lowered:
        return "lora"
    if "controlnet" in parts or "control" in parts:
        return "controlnet"
    return "checkpoint"


def list_models(state_dir, request):
    roots = model_roots(state_dir, request)
    models = []
    seen = set()
    for root in roots:
        if not root.exists() or not root.is_dir():
            continue
        root_resolved = root.resolve()
        for path in sorted(root.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in MODEL_EXTENSIONS:
                continue
            resolved = str(path.resolve())
            if resolved in seen:
                continue
            seen.add(resolved)
            try:
                relative = path.resolve().relative_to(root_resolved).as_posix()
            except ValueError:
                relative = path.name
            role = model_role(path)
            models.append({
                "id": relative,
                "name": path.name,
                "path": resolved,
                "relativePath": relative,
                "root": str(root_resolved),
                "role": role,
                "sizeBytes": file_size(path),
                "extension": path.suffix.lower(),
            })
    bundles = []
    for variant_id, variant in WAN22_T2V_A14B_VARIANTS.items():
        bundle_id = "wan2.2-t2v-a14b:{}".format(variant_id)
        components = {}
        missing = []
        for key, role in {
            "lowNoiseModelPath": "low_noise",
            "highNoiseModelPath": "high_noise",
            "t5xxlPath": "t5xxl",
            "vaePath": "vae",
        }.items():
            reference = normalize_string(variant.get(key))
            path = resolve_model_path_value(state_dir, request, models, reference, role)
            if path:
                components[key] = path
            else:
                missing.append(reference)
        bundles.append({
            "id": bundle_id,
            "name": "Wan 2.2 T2V A14B - {}".format(variant.get("label") or variant_id),
            "family": "Wan 2.2",
            "operation": "text-to-video",
            "variant": variant_id,
            "installed": len(missing) == 0,
            "missing": missing,
            "components": components,
        })
    return {
        "modelRoot": str(roots[0]) if roots else "",
        "modelRoots": [str(root) for root in roots],
        "models": models,
        "bundles": bundles,
    }


def run_version(path):
    try:
        result = subprocess.run(
            [str(path), "-h"],
            check=False,
            capture_output=True,
            text=True,
            timeout=8,
        )
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    text = (result.stdout or "") + "\n" + (result.stderr or "")
    first = ""
    for line in text.splitlines():
        if "stable-diffusion.cpp version" in line:
            first = line.strip()
            break
    if not first:
        first = text.splitlines()[0].strip() if text.splitlines() else ""
    return {
        "ok": result.returncode == 0,
        "exitCode": result.returncode,
        "version": first,
    }


def runtime_status(state_dir, request):
    requested_id = normalize_runtime_id(request.get("runtimeId"))
    definitions = runtime_definitions()
    selected_definition = find_runtime_definition(requested_id) if requested_id else None
    selected = None
    candidates = []
    if selected_definition:
        selected, available, candidates = installed_runtime_binary(state_dir, selected_definition)
        if not available:
            selected = None
    else:
        for definition in definitions:
            path, available, definition_candidates = installed_runtime_binary(state_dir, definition)
            for candidate in definition_candidates:
                if candidate not in candidates:
                    candidates.append(candidate)
            if available:
                selected_definition = definition
                selected = path
                break
        if not selected_definition and definitions:
            selected_definition = definitions[0]
            selected, _available, candidates = installed_runtime_binary(state_dir, selected_definition)
            selected = None
    if selected_definition and not candidates:
        candidates = runtime_definition_candidates(state_dir, selected_definition)
    runtime_id = normalize_runtime_id(selected_definition.get("id")) if selected_definition else requested_id
    backend = normalize_string(selected_definition.get("backend")) if selected_definition else "cpu"
    params_backend = normalize_string(selected_definition.get("paramsBackend")) if selected_definition else backend
    info = {
        "available": selected is not None,
        "runtimeId": runtime_id,
        "name": normalize_string(selected_definition.get("name")) if selected_definition else "",
        "variant": normalize_string(selected_definition.get("variant")) if selected_definition else "",
        "backend": backend or "cpu",
        "paramsBackend": params_backend or backend or "cpu",
        "runtimePath": str(selected) if selected else "",
        "candidates": [str(path) for path in candidates],
    }
    if selected:
        info.update(run_version(selected))
    return info


def list_runtimes(state_dir, request):
    status = runtime_status(state_dir, request)
    runtimes = []
    selected_id = normalize_runtime_id(status.get("runtimeId"))
    for definition in runtime_definitions():
        runtime_id = normalize_runtime_id(definition.get("id"))
        binary_path, installed, candidates = installed_runtime_binary(state_dir, definition)
        backend = normalize_string(definition.get("backend")) or "cpu"
        runtimes.append({
            "id": runtime_id,
            "name": normalize_string(definition.get("name")) or runtime_id,
            "description": normalize_string(definition.get("description")),
            "type": normalize_string(definition.get("type")) or "Stable Diffusion",
            "variant": normalize_string(definition.get("variant")),
            "backend": backend,
            "paramsBackend": normalize_string(definition.get("paramsBackend")) or backend,
            "platform": platform_id(),
            "installed": installed,
            "available": installed,
            "compatible": True,
            "latest": True,
            "installable": False,
            "removable": False,
            "path": str(binary_path),
            "binaryPath": str(binary_path),
            "candidates": [str(path) for path in candidates],
            "sizeBytes": file_size(binary_path) if installed else 0,
            "selected": runtime_id == selected_id,
            "assets": [],
        })
    runtimes.sort(key=lambda item: (not item.get("selected"), not item.get("installed"), item.get("name", "")))
    return {
        "platform": platform_id(),
        "selectedRuntimeId": selected_id,
        "runtimes": runtimes,
        "runtime": status,
        "status": status,
    }


def memory_bytes():
    if sys.platform == "darwin":
        try:
            result = subprocess.run(["sysctl", "-n", "hw.memsize"], check=False, capture_output=True, text=True, timeout=3)
            parsed = normalize_int(result.stdout, 0, minimum=1) or 0
            if parsed > 0:
                return parsed
        except Exception:
            pass
    if hasattr(os, "sysconf"):
        try:
            pages = os.sysconf("SC_PHYS_PAGES")
            page_size = os.sysconf("SC_PAGE_SIZE")
            return int(pages) * int(page_size)
        except (OSError, ValueError):
            return 0
    return 0


def hardware_info():
    return {
        "platform": platform.platform(),
        "system": platform.system(),
        "machine": platform.machine(),
        "processor": platform.processor(),
        "cpuCount": os.cpu_count() or 0,
        "memoryBytes": memory_bytes(),
        "pythonVersion": platform.python_version(),
    }


def first_model_path(models, role):
    for model in models:
        if model.get("role") == role:
            return normalize_string(model.get("path"))
    return ""


def normalize_relative_model_reference(value):
    text = normalize_string(value).replace("\\", "/").strip("/")
    if not text:
        return ""
    for part in text.split("/"):
        if part in ("", ".", ".."):
            raise ValueError("model reference contains an invalid path segment")
    return text


def resolve_model_path_value(state_dir, request, models, value, role):
    text = normalize_string(value)
    if not text:
        return first_model_path(models, role)
    roots = model_roots(state_dir, request)
    candidate = Path(text).expanduser()
    if candidate.is_absolute():
        for root in roots:
            if path_inside(root, candidate) and candidate.is_file():
                return str(candidate.resolve())
        return ""
    relative = normalize_relative_model_reference(text)
    for model in models:
        if role and model.get("role") != role:
            continue
        if relative in (
            normalize_string(model.get("id")).replace("\\", "/"),
            normalize_string(model.get("relativePath")).replace("\\", "/"),
            normalize_string(model.get("name")),
        ):
            path = normalize_string(model.get("path"))
            if path and Path(path).is_file():
                return path
    for root in roots:
        path = root / Path(relative)
        if path_inside(root, path) and path.is_file():
            return str(path.resolve())
    return ""


def parse_bundle_id(value):
    text = normalize_string(value).lower()
    if not text:
        return "", ""
    if ":" in text:
        bundle_id, variant_id = text.split(":", 1)
    else:
        bundle_id, variant_id = text, "q4_k_m"
    return bundle_id.strip(), variant_id.strip()


def bundle_definition(value):
    bundle_id, variant_id = parse_bundle_id(value)
    if bundle_id not in ("wan2.2-t2v-a14b", "wan22-t2v-a14b"):
        return None
    variant = WAN22_T2V_A14B_VARIANTS.get(variant_id)
    if not variant:
        raise ValueError("unknown Wan 2.2 bundle variant: {}".format(variant_id))
    return {
        "id": "wan2.2-t2v-a14b:{}".format(variant_id),
        "name": "Wan 2.2 T2V A14B - {}".format(variant.get("label") or variant_id),
        "variant": variant_id,
        "components": dict(variant),
    }


def resolve_bundle_components(state_dir, request, models):
    definition = bundle_definition(request.get("bundleId") or request.get("modelBundle") or request.get("bundle"))
    if not definition:
        return {}
    components = {}
    missing = []
    roles = {
        "lowNoiseModelPath": "low_noise",
        "highNoiseModelPath": "high_noise",
        "t5xxlPath": "t5xxl",
        "vaePath": "vae",
    }
    for key, role in roles.items():
        reference = normalize_string(definition["components"].get(key))
        path = resolve_model_path_value(state_dir, request, models, reference, role)
        if path:
            components[key] = path
        else:
            missing.append(reference)
    if missing:
        raise ValueError("{} is not fully downloaded. Missing: {}".format(definition["name"], ", ".join(missing)))
    components["bundleId"] = definition["id"]
    components["bundleName"] = definition["name"]
    components["bundleVariant"] = definition["variant"]
    return components


def split_text_list(value):
    if isinstance(value, list):
        items = []
        for entry in value:
            if isinstance(entry, dict):
                items.append(entry)
            else:
                items.extend(split_text_list(entry))
        return items
    if isinstance(value, dict):
        return [value]
    text = normalize_string(value)
    if not text:
        return []
    items = []
    for line in text.splitlines():
        for part in line.split(","):
            normalized = normalize_string(part)
            if normalized:
                items.append(normalized)
    return items


def parse_lora_text_item(value):
    text = normalize_string(value)
    if not text:
        return {}
    high_noise = False
    if text.startswith("|high_noise|"):
        high_noise = True
        text = text[len("|high_noise|"):]
    weight = 1.0
    for separator in ("=", "|"):
        if separator in text:
            left, right = text.rsplit(separator, 1)
            parsed_weight = normalize_float(right, None)
            if parsed_weight is not None:
                text = left
                weight = parsed_weight
                break
    return {"path": normalize_string(text), "weight": weight, "highNoise": high_noise}


def normalize_lora_entries(request):
    raw = request.get("loras")
    entries = []
    if isinstance(raw, list):
        entries.extend(raw)
    elif isinstance(raw, dict):
        entries.append(raw)
    elif normalize_string(raw):
        entries.extend(split_text_list(raw))
    for key in ("loraPaths", "loraPath"):
        entries.extend(split_text_list(request.get(key)))
    for index in range(1, 6):
        path = normalize_string(request.get("loraPath{}".format(index)))
        if not path:
            continue
        entries.append({
            "path": path,
            "weight": request.get("loraWeight{}".format(index)),
            "highNoise": request.get("loraHighNoise{}".format(index)),
        })

    normalized = []
    for entry in entries:
        if isinstance(entry, str):
            entry = parse_lora_text_item(entry)
        if not isinstance(entry, dict):
            continue
        path = normalize_string(entry.get("path") or entry.get("modelPath") or entry.get("id") or entry.get("file"))
        if not path:
            continue
        raw_weight = entry.get("weight") if "weight" in entry else entry.get("multiplier")
        weight = normalize_float(raw_weight, 1.0)
        if weight is None:
            weight = 1.0
        normalized.append({
            "path": path,
            "weight": weight,
            "highNoise": normalize_bool(entry.get("highNoise") if "highNoise" in entry else entry.get("isHighNoise"), False),
        })
    return normalized


def resolve_lora_entries(state_dir, request, models):
    resolved = []
    for entry in normalize_lora_entries(request):
        path = resolve_model_path_value(state_dir, request, models, entry.get("path"), "lora")
        if not path:
            raise ValueError("LoRA model is unavailable: {}".format(entry.get("path")))
        resolved.append({
            "path": path,
            "weight": entry.get("weight"),
            "highNoise": entry.get("highNoise") is True,
        })
    return resolved


def lora_prompt_tags(loras):
    tags = []
    for entry in loras:
        path = normalize_string(entry.get("path"))
        if not path:
            continue
        prefix = "|high_noise|" if entry.get("highNoise") is True else ""
        weight = normalize_float(entry.get("weight"), 1.0)
        tags.append("<lora:{}{}:{}>".format(prefix, path, weight if weight is not None else 1.0))
    return " ".join(tags)


def media_mime_type(path, media_kind):
    suffix = Path(path).suffix.lower()
    if suffix == ".webm":
        return "video/webm"
    if suffix == ".avi":
        return "video/x-msvideo"
    if suffix == ".webp":
        return "image/webp"
    if media_kind == "video":
        return "video/webm"
    return "image/png"


def output_extension(request, media_kind):
    if media_kind != "video":
        return ".png"
    output_format = normalize_string(request.get("outputFormat")).lower().lstrip(".")
    if output_format in ("avi", "webm", "webp"):
        return "." + output_format
    return ".webm"


def resolve_output_path(state_dir, request, media_kind):
    output_root = managed_output_root(state_dir)
    output_root.mkdir(parents=True, exist_ok=True)
    extension = output_extension(request, media_kind)
    output_value = normalize_string(request.get("outputPath"))
    if output_value:
        name = safe_name(Path(output_value).name)
        if not Path(name).suffix:
            name += extension
    else:
        name = "anthori-diffusion-{}-{}{}".format(media_kind, int(time.time() * 1000), extension)
    output_path = output_root / name
    output_path.parent.mkdir(parents=True, exist_ok=True)
    return output_path


def base64_image_extension(mime_type):
    mime = normalize_string(mime_type).lower()
    if "webp" in mime:
        return ".webp"
    if "jpeg" in mime or "jpg" in mime:
        return ".jpg"
    return ".png"


def write_base64_input_image(state_dir, request):
    encoded = normalize_string(request.get("initImageBase64") or request.get("imageBase64"))
    if not encoded:
        return ""
    if "," in encoded and encoded.lower().startswith("data:"):
        encoded = encoded.split(",", 1)[1]
    try:
        data = base64.b64decode(encoded, validate=True)
    except Exception as exc:
        raise ValueError("input image base64 is invalid") from exc
    if not data:
        raise ValueError("input image base64 is empty")
    input_root = state_dir / "inputs"
    input_root.mkdir(parents=True, exist_ok=True)
    extension = base64_image_extension(request.get("initImageMimeType") or request.get("mimeType") or request.get("mediaType"))
    path = input_root / ("anthori-diffusion-input-{}{}".format(int(time.time() * 1000), extension))
    path.write_bytes(data)
    return str(path)


def resolve_input_image_path(state_dir, request):
    for key in ("inputImagePath", "initImagePath", "imagePath"):
        text = normalize_string(request.get(key))
        if not text:
            continue
        path = Path(text).expanduser()
        if not path.is_file():
            raise ValueError("{} does not point to a readable input image".format(key))
        return str(path.resolve())
    return write_base64_input_image(state_dir, request)


def generate_diffusion_media(state_dir, request, operation):
    status = runtime_status(state_dir, request)
    runtime_path = normalize_string(status.get("runtimePath"))
    if not runtime_path:
        raise ValueError("stable-diffusion.cpp sd-cli runtime is unavailable")

    prompt = normalize_string(request.get("prompt"))
    if not prompt:
        raise ValueError("prompt is required")

    operation = normalize_string(operation)
    media_kind = "video" if operation in ("text-to-video", "image-to-video") else "image"
    requires_input_image = operation in ("image-to-image", "image-to-video")

    models = list_models(state_dir, request).get("models", [])
    bundle_components = resolve_bundle_components(state_dir, request, models)
    low_noise_path = resolve_model_path_value(
        state_dir,
        request,
        models,
        request.get("lowNoiseModelPath") or request.get("diffusionModelPath") or bundle_components.get("lowNoiseModelPath"),
        "low_noise",
    )
    high_noise_path = resolve_model_path_value(
        state_dir,
        request,
        models,
        request.get("highNoiseModelPath") or bundle_components.get("highNoiseModelPath"),
        "high_noise",
    )
    model_path = resolve_model_path_value(state_dir, request, models, request.get("modelPath"), "checkpoint")
    if not model_path and low_noise_path:
        model_path = low_noise_path
    if not model_path:
        raise ValueError("diffusion checkpoint model is unavailable")

    taesd_path = resolve_model_path_value(state_dir, request, models, request.get("taesdPath"), "taesd")
    vae_path = resolve_model_path_value(state_dir, request, models, request.get("vaePath") or bundle_components.get("vaePath"), "vae")
    t5xxl_path = resolve_model_path_value(
        state_dir,
        request,
        models,
        request.get("t5xxlPath") or request.get("textEncoderPath") or bundle_components.get("t5xxlPath"),
        "t5xxl",
    )
    clip_vision_path = resolve_model_path_value(state_dir, request, models, request.get("clipVisionPath"), "clip_vision")
    loras = resolve_lora_entries(state_dir, request, models)

    width = normalize_int(request.get("width"), 512, minimum=64, maximum=2048)
    height = normalize_int(request.get("height"), 512, minimum=64, maximum=2048)
    steps = normalize_int(request.get("steps"), 20, minimum=1, maximum=150)
    threads = normalize_int(request.get("threads"), os.cpu_count() or 1, minimum=1, maximum=128)
    timeout = normalize_int(request.get("timeoutSeconds"), DEFAULT_TIMEOUT_SECONDS, minimum=30, maximum=1800)
    seed = normalize_int(request.get("seed"), None)
    strength = normalize_float(request.get("strength"), 0.75, minimum=0.0, maximum=1.0)
    video_frames = normalize_int(request.get("videoFrames") or request.get("frames"), 16, minimum=1, maximum=240)
    fps = normalize_int(request.get("fps"), 12, minimum=1, maximum=60)
    backend = normalize_string(request.get("backend")) or normalize_string(status.get("backend")) or "cpu"
    params_backend = normalize_string(request.get("paramsBackend")) or normalize_string(status.get("paramsBackend")) or backend
    flow_shift = normalize_float(request.get("flowShift"), None)
    high_noise_steps = normalize_int(request.get("highNoiseSteps"), None, minimum=1, maximum=150)
    moe_boundary = normalize_float(request.get("moeBoundary"), None)
    cfg_scale = normalize_float(request.get("cfgScale"), None, minimum=0.0)
    guidance = normalize_float(request.get("guidance"), None, minimum=0.0)
    high_noise_cfg_scale = normalize_float(request.get("highNoiseCfgScale"), None, minimum=0.0)
    high_noise_guidance = normalize_float(request.get("highNoiseGuidance"), None, minimum=0.0)
    sampling_method = normalize_string(request.get("samplingMethod"))
    high_noise_sampling_method = normalize_string(request.get("highNoiseSamplingMethod"))
    scheduler = normalize_string(request.get("scheduler"))

    input_image_path = resolve_input_image_path(state_dir, request) if requires_input_image else ""
    if requires_input_image and not input_image_path:
        raise ValueError("input image path is required")

    output_path = resolve_output_path(state_dir, request, media_kind)
    component_model = bool(low_noise_path or high_noise_path or t5xxl_path or clip_vision_path)

    args = [
        runtime_path,
        "--backend", backend,
        "--params-backend", params_backend,
        "-t", str(threads),
        "-W", str(width),
        "-H", str(height),
        "--steps", str(steps),
        "--rng", "cpu",
        "-p", "{} {}".format(prompt, lora_prompt_tags(loras)).strip() if loras else prompt,
        "-o", str(output_path),
    ]
    if component_model:
        args.extend(["--diffusion-model", model_path])
    else:
        args.extend(["-m", model_path])
    if high_noise_path:
        args.extend(["--high-noise-diffusion-model", high_noise_path])
    if vae_path:
        args.extend(["--vae", vae_path])
    if t5xxl_path:
        args.extend(["--t5xxl", t5xxl_path])
    if clip_vision_path:
        args.extend(["--clip_vision", clip_vision_path])
    if loras:
        args.extend(["--lora-model-dir", str(model_roots(state_dir, request)[0])])
        lora_apply_mode = normalize_string(request.get("loraApplyMode"))
        if lora_apply_mode in ("auto", "immediately", "at_runtime"):
            args.extend(["--lora-apply-mode", lora_apply_mode])
    if flow_shift is not None:
        args.extend(["--flow-shift", str(flow_shift)])
    if high_noise_steps is not None:
        args.extend(["--high-noise-steps", str(high_noise_steps)])
    if moe_boundary is not None:
        args.extend(["--moe-boundary", str(moe_boundary)])
    if cfg_scale is not None:
        args.extend(["--cfg-scale", str(cfg_scale)])
    if guidance is not None:
        args.extend(["--guidance", str(guidance)])
    if high_noise_cfg_scale is not None:
        args.extend(["--high-noise-cfg-scale", str(high_noise_cfg_scale)])
    if high_noise_guidance is not None:
        args.extend(["--high-noise-guidance", str(high_noise_guidance)])
    if sampling_method:
        args.extend(["--sampling-method", sampling_method])
    if high_noise_sampling_method:
        args.extend(["--high-noise-sampling-method", high_noise_sampling_method])
    if scheduler:
        args.extend(["--scheduler", scheduler])
    if media_kind == "video":
        args.extend(["-M", "vid_gen", "--video-frames", str(video_frames), "--fps", str(fps)])
    if input_image_path:
        args.extend(["-i", input_image_path, "--strength", str(strength)])
    if taesd_path:
        args.extend(["--taesd", taesd_path])
    negative = normalize_string(request.get("negativePrompt"))
    if negative:
        args.extend(["-n", negative])
    if seed is not None:
        args.extend(["-s", str(seed)])
    if normalize_bool(request.get("vaeTiling"), False):
        args.append("--vae-tiling")
    if normalize_bool(request.get("temporalTiling"), False):
        args.append("--temporal-tiling")

    started = time.time()
    result = subprocess.run(args, check=False, capture_output=True, text=True, timeout=timeout)
    elapsed_ms = int((time.time() - started) * 1000)
    stdout = result.stdout or ""
    stderr = result.stderr or ""
    if result.returncode != 0:
        detail = (stderr or stdout).strip()
        raise RuntimeError(detail or "{} failed".format(operation or "diffusion generation"))
    media_type = media_mime_type(output_path, media_kind)
    output_payload = {
        "width": width,
        "height": height,
        "modelPath": model_path,
        "bundleId": bundle_components.get("bundleId", ""),
        "bundleName": bundle_components.get("bundleName", ""),
        "bundleVariant": bundle_components.get("bundleVariant", ""),
        "lowNoiseModelPath": low_noise_path,
        "highNoiseModelPath": high_noise_path,
        "vaePath": vae_path,
        "taesdPath": taesd_path,
        "t5xxlPath": t5xxl_path,
        "clipVisionPath": clip_vision_path,
        "loras": loras,
        "runtimePath": runtime_path,
        "runtimeId": normalize_string(status.get("runtimeId")),
        "backend": backend,
        "paramsBackend": params_backend,
        "elapsedMs": elapsed_ms,
        "stdoutTail": stdout[-4000:],
        "stderrTail": stderr[-4000:],
        "mediaType": media_type,
        "mimeType": media_type,
    }
    if media_kind == "video":
        output_payload["videoPath"] = str(output_path)
        output_payload["videoFrames"] = video_frames
        output_payload["fps"] = fps
        output_payload["videoBytes"] = file_size(output_path)
        if normalize_bool(request.get("includeVideoBase64"), False):
            data = output_path.read_bytes()
            output_payload["videoBase64"] = base64.b64encode(data).decode("ascii")
            output_payload["videoBytes"] = len(data)
    else:
        output_payload["imagePath"] = str(output_path)
        output_payload["imageBytes"] = file_size(output_path)
    if media_kind == "image" and normalize_bool(request.get("includeImageBase64"), False):
        data = output_path.read_bytes()
        output_payload["imageBase64"] = base64.b64encode(data).decode("ascii")
        output_payload["imageBytes"] = len(data)
    if normalize_bool(request.get("deleteOutput"), False):
        try:
            output_path.unlink()
            output_payload["mediaDeleted"] = True
        except OSError:
            output_payload["mediaDeleted"] = False
    return output_payload


def text_to_image(state_dir, request):
    return generate_diffusion_media(state_dir, request, "text-to-image")


def image_to_image(state_dir, request):
    return generate_diffusion_media(state_dir, request, "image-to-image")


def text_to_video(state_dir, request):
    return generate_diffusion_media(state_dir, request, "text-to-video")


def image_to_video(state_dir, request):
    return generate_diffusion_media(state_dir, request, "image-to-video")


def normalize_hugging_face_path(value, field):
    text = normalize_string(value).replace("\\", "/").strip("/")
    if not text:
        raise ValueError("{} is required".format(field))
    for part in text.split("/"):
        if part in ("", ".", ".."):
            raise ValueError("{} contains an invalid path segment".format(field))
    return text


def escape_segments(value):
    return "/".join(urllib.parse.quote(part, safe="") for part in value.split("/"))


def hugging_face_resolve_url(repository, revision, file_name):
    return "https://huggingface.co/{}/resolve/{}/{}".format(
        escape_segments(repository),
        urllib.parse.quote(revision, safe=""),
        escape_segments(file_name),
    )


def download_model_root(state_dir, request):
    roots = model_roots(state_dir, request)
    return roots[0] if roots else state_dir / "models"


def progress_path(state_dir, download_id):
    return downloads_root(state_dir) / (safe_name(download_id) + ".json")


def download_request_path(state_dir, download_id):
    return downloads_root(state_dir) / (safe_name(download_id) + ".request.json")


def write_progress(state_dir, progress):
    progress["updatedAt"] = now_iso()
    write_json(progress_path(state_dir, progress.get("id")), progress)


def read_progress(state_dir, download_id):
    if download_id:
        return read_json(progress_path(state_dir, download_id), None)
    root = downloads_root(state_dir)
    items = []
    if root.exists():
        for path in root.glob("*.json"):
            item = read_json(path, None)
            if isinstance(item, dict):
                items.append(item)
    items.sort(key=lambda item: normalize_string(item.get("updatedAt")), reverse=True)
    return items


def download_worker_request(state_dir, download_id):
    payload = read_json(download_request_path(state_dir, download_id), {}) or {}
    return payload.get("request") if isinstance(payload.get("request"), dict) else {}


def request_bool(value):
    if value is True:
        return True
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")
    return False


def process_alive(pid):
    if not pid:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def stop_process_tree(pid, timeout_seconds=10):
    pid = normalize_int(pid, 1) or 0
    if not pid:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        return
    try:
        os.kill(pid, signal.SIGTERM)
        deadline = time.time() + timeout_seconds
        while time.time() < deadline and process_alive(pid):
            time.sleep(0.1)
        if process_alive(pid):
            os.kill(pid, signal.SIGKILL)
    except OSError:
        pass


def remove_download_temp_file(root, repository, file_name):
    root = Path(root)
    temp_path = (root / Path(repository) / Path(file_name)).with_suffix(Path(file_name).suffix + ".download")
    if not path_inside(root, temp_path):
        return
    try:
        temp_path.unlink(missing_ok=True)
    except OSError:
        pass


def cancel_model_download(state_dir, request):
    if request_bool(request.get("remove")):
        return remove_model_download(state_dir, request)
    download_id = normalize_string(request.get("id"))
    if not download_id:
        raise ValueError("id is required")
    progress = read_progress(state_dir, download_id) or {"id": download_id}
    if normalize_string(progress.get("status")) in ("complete", "failed", "canceled"):
        return {"download": progress}
    worker_pid = normalize_int(progress.get("workerPid"), 1) or 0
    if worker_pid:
        stop_process_tree(worker_pid, 2)
    worker_request = download_worker_request(state_dir, download_id)
    try:
        repository = normalize_hugging_face_path(worker_request.get("repository"), "repository")
        file_name = normalize_hugging_face_path(worker_request.get("file"), "file")
        root = Path(normalize_string(worker_request.get("modelRoot")))
        if root:
            remove_download_temp_file(root, repository, file_name)
    except Exception:
        pass
    progress = read_progress(state_dir, download_id) or progress
    if normalize_string(progress.get("status")) in ("complete", "failed", "canceled"):
        return {"download": progress}
    progress["id"] = download_id
    progress["status"] = "canceled"
    progress["error"] = ""
    progress["canceledAt"] = now_iso()
    write_progress(state_dir, progress)
    return {"download": progress}


def remove_model_download(state_dir, request):
    download_id = normalize_string(request.get("id"))
    if not download_id:
        raise ValueError("id is required")
    progress = read_progress(state_dir, download_id) or {"id": download_id}
    if normalize_string(progress.get("status")) in ("starting", "downloading"):
        cancel_request = dict(request)
        cancel_request.pop("remove", None)
        cancel_model_download(state_dir, cancel_request)
    worker_request = download_worker_request(state_dir, download_id)
    try:
        repository = normalize_hugging_face_path(worker_request.get("repository") or progress.get("repository"), "repository")
        file_name = normalize_hugging_face_path(worker_request.get("file") or progress.get("file"), "file")
        root_text = normalize_string(worker_request.get("modelRoot"))
        root = Path(root_text) if root_text else download_model_root(state_dir, request)
        remove_download_temp_file(root, repository, file_name)
    except Exception:
        pass
    progress_path(state_dir, download_id).unlink(missing_ok=True)
    download_request_path(state_dir, download_id).unlink(missing_ok=True)
    return {"id": download_id, "removed": True}


def model_info_from_path(root, path):
    path = Path(path)
    try:
        relative = path.resolve().relative_to(Path(root).resolve()).as_posix()
    except ValueError:
        relative = path.name
    return {
        "id": relative,
        "name": path.name,
        "path": str(path.resolve()),
        "relativePath": relative,
        "root": str(Path(root).resolve()),
        "role": model_role(path),
        "sizeBytes": file_size(path),
        "extension": path.suffix.lower(),
    }


def start_model_download(state_dir, request):
    download_id = normalize_string(request.get("id")) or "download-{}".format(time.time_ns())
    repository = normalize_hugging_face_path(request.get("repository"), "repository")
    file_name = normalize_hugging_face_path(request.get("file"), "file")
    revision = normalize_string(request.get("revision")) or "main"
    if Path(file_name).suffix.lower() not in MODEL_EXTENSIONS:
        raise ValueError("file must be a supported diffusion model file")
    root = download_model_root(state_dir, request)
    bytes_total = normalize_int(request.get("bytes"), 0) or 0
    progress = {
        "id": download_id,
        "repository": repository,
        "file": file_name,
        "revision": revision,
        "status": "starting",
        "bytesTotal": bytes_total,
        "bytesDownloaded": 0,
        "startedAt": now_iso(),
        "updatedAt": now_iso(),
    }
    write_progress(state_dir, progress)
    worker_request = {
        "stateDir": str(state_dir),
        "request": {
            "id": download_id,
            "modelRoot": str(root),
            "repository": repository,
            "file": file_name,
            "revision": revision,
        },
    }
    downloads_root(state_dir).mkdir(parents=True, exist_ok=True)
    request_path = download_request_path(state_dir, download_id)
    write_json(request_path, worker_request)
    args = [sys.executable, str(Path(__file__).resolve()), "--download-worker", str(request_path)]
    popen_kwargs = {
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
        "close_fds": True,
    }
    if os.name == "nt":
        popen_kwargs["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    else:
        popen_kwargs["start_new_session"] = True
    try:
        process = subprocess.Popen(args, **popen_kwargs)
    except Exception as exc:
        progress["status"] = "failed"
        progress["error"] = "Download worker failed to start: {}".format(exc)
        write_progress(state_dir, progress)
        raise
    current = read_progress(state_dir, download_id) or progress
    if normalize_string(current.get("status")) == "starting":
        current["workerPid"] = process.pid
        write_progress(state_dir, current)
    return {"download": progress}


def download_worker(request_path):
    payload = read_json(request_path, {}) or {}
    state_dir = Path(normalize_string(payload.get("stateDir")))
    request = payload.get("request") if isinstance(payload.get("request"), dict) else {}
    download_id = normalize_string(request.get("id"))
    repository = normalize_hugging_face_path(request.get("repository"), "repository")
    file_name = normalize_hugging_face_path(request.get("file"), "file")
    revision = normalize_string(request.get("revision")) or "main"
    root = Path(normalize_string(request.get("modelRoot")))
    repository_dir = root / Path(repository)
    destination = repository_dir / Path(file_name)
    if not path_inside(root, destination):
        raise ValueError("download path escapes model directory")

    progress = read_progress(state_dir, download_id) or {
        "id": download_id,
        "repository": repository,
        "file": file_name,
        "revision": revision,
        "startedAt": now_iso(),
    }
    progress["workerPid"] = os.getpid()
    progress["status"] = "downloading"
    write_progress(state_dir, progress)

    destination.parent.mkdir(parents=True, exist_ok=True)
    source_url = hugging_face_resolve_url(repository, revision, file_name)
    temp_path = destination.with_suffix(destination.suffix + ".download")
    request_obj = urllib.request.Request(source_url, headers={"User-Agent": "Anthori"})
    with urllib.request.urlopen(request_obj, timeout=60) as response:
        total = int(response.headers.get("Content-Length") or "0")
        if total > 0:
            progress["bytesTotal"] = total
            write_progress(state_dir, progress)
        downloaded = 0
        reported = 0
        with open(temp_path, "wb") as handle:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                handle.write(chunk)
                downloaded += len(chunk)
                if downloaded - reported >= 1024 * 1024:
                    reported = downloaded
                    progress["bytesDownloaded"] = downloaded
                    write_progress(state_dir, progress)
    replace_file(temp_path, destination)
    model = model_info_from_path(root, destination)
    progress["status"] = "complete"
    progress["bytesDownloaded"] = downloaded or model.get("sizeBytes", 0)
    if not progress.get("bytesTotal"):
        progress["bytesTotal"] = progress["bytesDownloaded"]
    progress["model"] = model
    write_progress(state_dir, progress)


def run_download_worker(request_path):
    try:
        download_worker(request_path)
    except Exception as exc:
        payload = read_json(request_path, {}) or {}
        state_dir = Path(normalize_string(payload.get("stateDir")))
        request = payload.get("request") if isinstance(payload.get("request"), dict) else {}
        download_id = normalize_string(request.get("id"))
        if download_id and state_dir:
            progress = read_progress(state_dir, download_id) or {
                "id": download_id,
                "repository": normalize_string(request.get("repository")),
                "file": normalize_string(request.get("file")),
                "revision": normalize_string(request.get("revision")) or "main",
                "startedAt": now_iso(),
            }
            progress["status"] = "failed"
            progress["error"] = str(exc)
            write_progress(state_dir, progress)
        raise


def dispatch(action, input_value):
    state_dir = extension_state_dir(input_value)
    request = extension_request(input_value)
    if action == "models-list":
        return list_models(state_dir, request)
    if action == "models-download":
        return start_model_download(state_dir, request)
    if action == "models-download-status":
        if request_bool(request.get("remove")):
            return remove_model_download(state_dir, request)
        if request_bool(request.get("cancel")):
            return cancel_model_download(state_dir, request)
        download_id = normalize_string(request.get("id"))
        if download_id:
            return {"download": read_progress(state_dir, download_id)}
        return {"downloads": read_progress(state_dir, "")}
    if action == "runtimes-list":
        return list_runtimes(state_dir, request)
    if action == "hardware-info":
        return hardware_info()
    if action == "runtime-status":
        return runtime_status(state_dir, request)
    if action == "text-to-image":
        return text_to_image(state_dir, request)
    if action == "image-to-image":
        return image_to_image(state_dir, request)
    if action == "text-to-video":
        return text_to_video(state_dir, request)
    if action == "image-to-video":
        return image_to_video(state_dir, request)
    raise ValueError("unknown action: {}".format(action))


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--download-worker":
        run_download_worker(sys.argv[2])
        return
    payload = json.loads(sys.stdin.read() or "{}")
    action = normalize_string(payload.get("actionId")) or normalize_string(payload.get("action"))
    result = dispatch(action, payload.get("input") if isinstance(payload.get("input"), dict) else {})
    output(result)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        fail(exc)
