#!/usr/bin/env python3
import ctypes
import json
import os
import platform
import re
import shutil
import signal
import socket
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

STABLE_TAG = "b9113"
LATEST_RELEASE_API_URL = "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest"
DEFAULT_RUNTIME_PORT = 11435
GPU_SELECTION_NONE = "__none__"


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
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in ("true", "on", "yes", "1"):
            return True
        if lowered in ("false", "off", "no", "0"):
            return False
    return fallback


def normalize_int(value, minimum=None, maximum=None):
    if value is None or value == "":
        return None
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        return None
    if minimum is not None and parsed < minimum:
        return None
    if maximum is not None and parsed > maximum:
        return None
    return parsed


def normalize_float(value, minimum=None, maximum=None):
    if value is None or value == "":
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if minimum is not None and parsed < minimum:
        return None
    if maximum is not None and parsed > maximum:
        return None
    return parsed


def normalize_kv_cache_type(value):
    text = normalize_string(value).lower()
    if text in ("f32", "f16", "bf16", "q8_0", "q4_0", "q4_1", "iq4_nl", "q5_0", "q5_1"):
        return text
    return ""


def normalize_runtime_tag(value):
    tag = normalize_string(value).lower()
    if re.fullmatch(r"b[0-9]+", tag):
        return tag
    return ""


def compare_runtime_tags(left, right):
    left = normalize_runtime_tag(left)
    right = normalize_runtime_tag(right)
    if not left and not right:
        return 0
    if not left:
        return -1
    if not right:
        return 1
    left_number = int(left[1:])
    right_number = int(right[1:])
    if left_number < right_number:
        return -1
    if left_number > right_number:
        return 1
    return 0


def safe_name(value):
    text = normalize_string(value)
    text = re.sub(r"[^A-Za-z0-9._-]+", "_", text)
    return text[:180] or "item"


def path_inside(root, value):
    try:
        root_resolved = Path(root).resolve()
        value_resolved = Path(value).resolve()
        return value_resolved == root_resolved or root_resolved in value_resolved.parents
    except OSError:
        return False


def extension_state_dir(input_value):
    extension = input_value.get("extension") if isinstance(input_value, dict) else {}
    state_dir = normalize_string(extension.get("stateDir") if isinstance(extension, dict) else "")
    if not state_dir:
        raise ValueError("extension state directory is unavailable")
    path = Path(state_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def extension_request(input_value):
    if isinstance(input_value, dict) and isinstance(input_value.get("request"), dict):
        return input_value.get("request")
    return {}


def model_root(state_dir, value):
    default_root = state_dir / "models"
    text = normalize_string(value)
    if not text:
        return default_root
    path = Path(text)
    if path.is_absolute():
        return path
    return default_root / path


def runtime_root(state_dir):
    return state_dir / "runtimes"


def downloads_root(state_dir):
    return state_dir / "downloads"


def runtime_status_path(state_dir):
    return state_dir / "runtime" / "status.json"


def runtime_log_path(state_dir):
    return state_dir / "runtime" / "llama-server.log"


def read_json(path, fallback=None):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return fallback
    except json.JSONDecodeError:
        return fallback


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    with open(temp, "w", encoding="utf-8") as handle:
        json.dump(value, handle, separators=(",", ":"))
    os.replace(temp, path)


def llama_server_executable_name():
    return "llama-server.exe" if os.name == "nt" else "llama-server"


def platform_id():
    system = sys.platform
    if system == "darwin":
        os_name = "mac"
    elif system.startswith("win"):
        os_name = "windows"
    elif system.startswith("linux"):
        os_name = "linux"
    else:
        os_name = system
    machine = platform.machine().lower()
    if machine in ("x86_64", "amd64"):
        arch = "amd64"
    elif machine in ("arm64", "aarch64"):
        arch = "arm64"
    else:
        arch = machine
    return os_name + "-" + arch


def release_url(tag, asset):
    return "https://github.com/ggml-org/llama.cpp/releases/download/{}/{}".format(tag, asset)


def runtime_asset(tag, asset):
    return {"name": asset, "url": release_url(tag, asset)}


def runtime_catalog_for(platform_value, version=STABLE_TAG):
    tag = normalize_runtime_tag(version) or STABLE_TAG
    catalog = {
        "mac-arm64": [
            {
                "id": "llama.cpp.metal",
                "name": "Metal llama.cpp (macOS)",
                "description": "Apple Silicon llama.cpp engine",
                "type": "GGUF",
                "variant": "Metal",
                "platform": "mac-arm64",
                "version": tag,
                "assets": [runtime_asset(tag, "llama-{}-bin-macos-arm64.tar.gz".format(tag))],
                "installable": True,
            }
        ],
        "mac-amd64": [
            {
                "id": "llama.cpp.cpu",
                "name": "CPU llama.cpp (macOS)",
                "description": "CPU-only llama.cpp engine",
                "type": "GGUF",
                "variant": "CPU",
                "platform": "mac-amd64",
                "version": tag,
                "assets": [runtime_asset(tag, "llama-{}-bin-macos-x64.tar.gz".format(tag))],
                "installable": True,
            }
        ],
        "windows-amd64": [
            {
                "id": "llama.cpp.cpu",
                "name": "CPU llama.cpp (Windows)",
                "description": "CPU-only llama.cpp engine",
                "type": "GGUF",
                "variant": "CPU",
                "platform": "windows-amd64",
                "version": tag,
                "assets": [runtime_asset(tag, "llama-{}-bin-win-cpu-x64.zip".format(tag))],
                "installable": True,
            },
            {
                "id": "llama.cpp.cuda12",
                "name": "CUDA 12 llama.cpp (Windows)",
                "description": "NVIDIA CUDA 12.4 accelerated llama.cpp engine",
                "type": "GGUF",
                "variant": "CUDA",
                "platform": "windows-amd64",
                "version": tag,
                "assets": [
                    runtime_asset(tag, "llama-{}-bin-win-cuda-12.4-x64.zip".format(tag)),
                    runtime_asset(tag, "cudart-llama-bin-win-cuda-12.4-x64.zip"),
                ],
                "installable": True,
            },
            {
                "id": "llama.cpp.cuda13",
                "name": "CUDA 13 llama.cpp (Windows)",
                "description": "NVIDIA CUDA 13.1 accelerated llama.cpp engine",
                "type": "GGUF",
                "variant": "CUDA",
                "platform": "windows-amd64",
                "version": tag,
                "assets": [
                    runtime_asset(tag, "llama-{}-bin-win-cuda-13.1-x64.zip".format(tag)),
                    runtime_asset(tag, "cudart-llama-bin-win-cuda-13.1-x64.zip"),
                ],
                "installable": True,
            },
            {
                "id": "llama.cpp.vulkan",
                "name": "Vulkan llama.cpp (Windows)",
                "description": "Vulkan accelerated llama.cpp engine",
                "type": "GGUF",
                "variant": "Vulkan",
                "platform": "windows-amd64",
                "version": tag,
                "assets": [runtime_asset(tag, "llama-{}-bin-win-vulkan-x64.zip".format(tag))],
                "installable": True,
            },
        ],
        "windows-arm64": [
            {
                "id": "llama.cpp.cpu",
                "name": "CPU llama.cpp (Windows)",
                "description": "CPU-only llama.cpp engine",
                "type": "GGUF",
                "variant": "CPU",
                "platform": "windows-arm64",
                "version": tag,
                "assets": [runtime_asset(tag, "llama-{}-bin-win-cpu-arm64.zip".format(tag))],
                "installable": True,
            }
        ],
        "linux-amd64": [
            {
                "id": "llama.cpp.cpu",
                "name": "CPU llama.cpp (Linux)",
                "description": "CPU-only llama.cpp engine",
                "type": "GGUF",
                "variant": "CPU",
                "platform": "linux-amd64",
                "version": tag,
                "assets": [runtime_asset(tag, "llama-{}-bin-ubuntu-x64.tar.gz".format(tag))],
                "installable": True,
            },
            {
                "id": "llama.cpp.vulkan",
                "name": "Vulkan llama.cpp (Linux)",
                "description": "Vulkan accelerated llama.cpp engine",
                "type": "GGUF",
                "variant": "Vulkan",
                "platform": "linux-amd64",
                "version": tag,
                "assets": [runtime_asset(tag, "llama-{}-bin-ubuntu-vulkan-x64.tar.gz".format(tag))],
                "installable": True,
            },
        ],
        "linux-arm64": [
            {
                "id": "llama.cpp.cpu",
                "name": "CPU llama.cpp (Linux)",
                "description": "CPU-only llama.cpp engine",
                "type": "GGUF",
                "variant": "CPU",
                "platform": "linux-arm64",
                "version": tag,
                "assets": [runtime_asset(tag, "llama-{}-bin-ubuntu-arm64.tar.gz".format(tag))],
                "installable": True,
            },
            {
                "id": "llama.cpp.vulkan",
                "name": "Vulkan llama.cpp (Linux)",
                "description": "Vulkan accelerated llama.cpp engine",
                "type": "GGUF",
                "variant": "Vulkan",
                "platform": "linux-arm64",
                "version": tag,
                "assets": [runtime_asset(tag, "llama-{}-bin-ubuntu-vulkan-arm64.tar.gz".format(tag))],
                "installable": True,
            },
        ],
    }
    return catalog.get(platform_value, [])


def runtime_dir(state_dir, runtime_id):
    runtime_id = normalize_string(runtime_id).lower()
    if not re.fullmatch(r"[a-z0-9._-]+", runtime_id):
        raise ValueError("runtimeId is invalid")
    return runtime_root(state_dir) / runtime_id


def runtime_binary_candidates(directory):
    exe = llama_server_executable_name()
    return [directory / exe, directory / "bin" / exe, directory / "build" / "bin" / exe]


def installed_runtime_binary(directory):
    for candidate in runtime_binary_candidates(Path(directory)):
        if candidate.is_file():
            return str(candidate), True
    return str(Path(directory) / llama_server_executable_name()), False


def read_runtime_record(directory):
    record = read_json(Path(directory) / "VERSION.json", None)
    if isinstance(record, dict):
        return record
    return None


def find_runtime_definition(runtime_id, version=STABLE_TAG):
    target = normalize_string(runtime_id).lower()
    for definition in runtime_catalog_for(platform_id(), version):
        if normalize_string(definition.get("id")).lower() == target:
            return definition
    return None


def resolve_binary_path(state_dir, runtime_id):
    selected = normalize_string(runtime_id).lower()
    if selected == "system":
        resolved = shutil.which(llama_server_executable_name())
        return resolved or llama_server_executable_name(), bool(resolved), None
    definitions = runtime_catalog_for(platform_id())
    if selected:
        definition = find_runtime_definition(selected)
        if not definition:
            return "", False, "unknown Llama runtime pack: {}".format(selected)
        return installed_runtime_binary(runtime_dir(state_dir, selected)) + (None,)
    for definition in definitions:
        binary_path, available = installed_runtime_binary(runtime_dir(state_dir, definition["id"]))
        if available:
            return binary_path, True, None
    resolved = shutil.which(llama_server_executable_name())
    if resolved:
        return resolved, True, None
    if definitions:
        path, _available = installed_runtime_binary(runtime_dir(state_dir, definitions[0]["id"]))
        return path, False, None
    return str(runtime_root(state_dir) / llama_server_executable_name()), False, None


def process_alive(pid):
    if not pid:
        return False
    if os.name == "nt":
        completed = subprocess.run(
            ["tasklist", "/FI", "PID eq {}".format(pid), "/FO", "CSV", "/NH"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=3,
        )
        return str(pid) in completed.stdout
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def health_ready(base_url, timeout=1.0):
    url = normalize_string(base_url).rstrip("/") + "/health"
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "Anthori"})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return 200 <= int(response.status) < 300
    except Exception:
        return False


def wait_for_ready(base_url, timeout_seconds=300):
    deadline = time.time() + timeout_seconds
    parsed = urllib.parse.urlparse(normalize_string(base_url))
    host = parsed.hostname
    port = parsed.port
    last_error = "runtime did not become ready"
    while time.time() < deadline:
        if host and port:
            try:
                with socket.create_connection((host, port), timeout=0.25):
                    pass
            except OSError as exc:
                last_error = str(exc)
                time.sleep(0.2)
                continue
        if health_ready(base_url, timeout=1.0):
            return
        time.sleep(0.2)
    raise TimeoutError("llama runtime did not become ready: {}".format(last_error))


def port_available(port):
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(("127.0.0.1", int(port)))
        return True
    except OSError:
        return False


def runtime_status(state_dir, request):
    binary_path, binary_available, binary_error = resolve_binary_path(state_dir, request.get("runtimeId"))
    status = read_json(runtime_status_path(state_dir), {}) or {}
    base_url = normalize_string(status.get("baseUrl")) or "http://127.0.0.1:{}".format(DEFAULT_RUNTIME_PORT)
    pid = normalize_int(status.get("pid"), 1) or 0
    running = process_alive(pid)
    ready = running and health_ready(base_url, timeout=0.5)
    if not running:
        return {
            "running": False,
            "ready": False,
            "starting": False,
            "baseUrl": base_url,
            "modelPath": normalize_string(status.get("modelPath")),
            "binaryPath": binary_path,
            "binaryAvailable": binary_available,
            "lastError": binary_error or normalize_string(status.get("lastError")),
            "stderr": tail_text(runtime_log_path(state_dir), 32768),
        }
    return {
        "running": True,
        "ready": ready,
        "starting": not ready,
        "pid": pid,
        "baseUrl": base_url,
        "modelPath": normalize_string(status.get("modelPath")),
        "binaryPath": binary_path,
        "binaryAvailable": binary_available,
        "startedAt": normalize_string(status.get("startedAt")),
        "lastError": binary_error or normalize_string(status.get("lastError")),
        "stderr": tail_text(runtime_log_path(state_dir), 32768),
    }


def tail_text(path, limit):
    try:
        with open(path, "rb") as handle:
            handle.seek(0, os.SEEK_END)
            size = handle.tell()
            handle.seek(max(0, size - limit), os.SEEK_SET)
            return handle.read().decode("utf-8", errors="replace").strip()
    except OSError:
        return ""


def list_runtime_packs(state_dir, request, version=STABLE_TAG):
    selected_id = normalize_string(request.get("runtimeId")).lower()
    target_version = normalize_runtime_tag(version) or STABLE_TAG
    definitions = runtime_catalog_for(platform_id(), target_version)
    runtimes = []
    for index, definition in enumerate(definitions):
        runtime_id = definition["id"]
        directory = runtime_dir(state_dir, runtime_id)
        binary_path, binary_available = installed_runtime_binary(directory)
        record = read_runtime_record(directory) or {}
        installed_version = normalize_string(record.get("version"))
        installed = bool(binary_available)
        if not selected_id and installed:
            selected_id = runtime_id
        selected = selected_id == runtime_id
        if index == 0 and not selected_id:
            selected = True
            selected_id = runtime_id
        runtimes.append({
            "id": runtime_id,
            "name": definition["name"],
            "description": definition.get("description", ""),
            "type": definition.get("type", "GGUF"),
            "variant": definition.get("variant", ""),
            "platform": definition.get("platform", platform_id()),
            "version": definition.get("version", target_version),
            "installedVersion": installed_version,
            "installed": installed,
            "selected": selected,
            "compatible": True,
            "latest": (not installed) or (not installed_version) or compare_runtime_tags(installed_version, definition.get("version", target_version)) >= 0,
            "installable": bool(definition.get("installable") and definition.get("assets")),
            "removable": installed,
            "binaryPath": binary_path,
            "assets": definition.get("assets", []),
        })
    system_path = shutil.which(llama_server_executable_name())
    if system_path:
        if not selected_id:
            selected_id = "system"
        runtimes.append({
            "id": "system",
            "name": "System llama.cpp",
            "description": "llama-server found on PATH",
            "type": "GGUF",
            "variant": "System",
            "platform": platform_id(),
            "installed": True,
            "selected": selected_id == "system",
            "compatible": True,
            "latest": True,
            "installable": False,
            "removable": False,
            "binaryPath": system_path,
            "assets": [],
        })
    runtimes.sort(key=lambda item: (not item.get("selected"), not item.get("installed"), item.get("name", "")))
    return {
        "platform": platform_id(),
        "selectedRuntimeId": selected_id,
        "currentVersion": STABLE_TAG,
        "latestVersion": target_version,
        "updateAvailable": compare_runtime_tags(target_version, STABLE_TAG) > 0,
        "runtimes": runtimes,
        "status": runtime_status(state_dir, request),
    }


def model_info_from_path(root, path_value, source):
    path = Path(path_value)
    stat = path.stat()
    try:
        rel = path.relative_to(Path(root))
    except ValueError:
        rel = Path(path.name)
    return {
        "id": rel.as_posix(),
        "name": path.stem,
        "path": str(path),
        "source": source,
        "bytes": int(stat.st_size),
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(stat.st_mtime)),
    }


def list_models(state_dir, request):
    root = model_root(state_dir, request.get("modelRoot"))
    models = []
    if root.exists():
        for path in root.rglob("*"):
            if path.is_file() and path.suffix.lower() == ".gguf":
                models.append(model_info_from_path(root, path, "directory"))
    models.sort(key=lambda item: item.get("id", "").lower())
    return {"modelRoot": str(root), "models": models}


def normalize_hugging_face_path(value, field):
    text = normalize_string(value).replace("\\", "/").strip("/")
    if not text:
        raise ValueError("{} is required".format(field))
    parts = text.split("/")
    for part in parts:
        if part in ("", ".", ".."):
            raise ValueError("{} contains an invalid path segment".format(field))
    return "/".join(parts)


def escape_segments(value):
    return "/".join(urllib.parse.quote(part, safe="") for part in value.split("/"))


def hugging_face_resolve_url(repository, revision, file_name):
    return "https://huggingface.co/{}/resolve/{}/{}".format(
        escape_segments(repository),
        urllib.parse.quote(revision, safe=""),
        escape_segments(file_name),
    )


def progress_path(state_dir, download_id):
    return downloads_root(state_dir) / (safe_name(download_id) + ".json")


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


def start_model_download(state_dir, request):
    download_id = normalize_string(request.get("id")) or "download-{}".format(time.time_ns())
    repository = normalize_hugging_face_path(request.get("repository"), "repository")
    file_name = normalize_hugging_face_path(request.get("file"), "file")
    revision = normalize_string(request.get("revision")) or "main"
    root = model_root(state_dir, request.get("modelRoot"))
    progress = {
        "id": download_id,
        "repository": repository,
        "file": file_name,
        "revision": revision,
        "status": "starting",
        "bytesTotal": normalize_int(request.get("bytes"), 0) or 0,
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
    request_path = downloads_root(state_dir) / (safe_name(download_id) + ".request.json")
    write_json(request_path, worker_request)
    args = [sys.executable, str(Path(__file__).resolve()), "--download-worker", str(request_path)]
    popen_kwargs = {
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
        "close_fds": os.name != "nt",
    }
    if os.name == "nt":
        popen_kwargs["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    else:
        popen_kwargs["start_new_session"] = True
    subprocess.Popen(args, **popen_kwargs)
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
    dest = root / Path(file_name)
    repository_dir = root / Path(repository)
    dest = repository_dir / Path(file_name)
    if not path_inside(root, dest):
        raise ValueError("download path escapes model directory")
    dest.parent.mkdir(parents=True, exist_ok=True)
    source_url = hugging_face_resolve_url(repository, revision, file_name)
    progress = read_progress(state_dir, download_id) or {
        "id": download_id,
        "repository": repository,
        "file": file_name,
        "revision": revision,
        "startedAt": now_iso(),
    }
    progress["status"] = "downloading"
    write_progress(state_dir, progress)
    temp_path = dest.with_suffix(dest.suffix + ".download")
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
    os.replace(temp_path, dest)
    model = model_info_from_path(root, dest, "huggingface")
    progress["status"] = "complete"
    progress["bytesDownloaded"] = model.get("bytes", 0)
    if not progress.get("bytesTotal"):
        progress["bytesTotal"] = model.get("bytes", 0)
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


def safe_archive_target(root, name):
    clean = Path(str(name).replace("\\", "/")).as_posix()
    clean = os.path.normpath(clean).replace("\\", "/")
    if clean in ("", ".", "/") or clean.startswith("../") or clean == ".." or os.path.isabs(clean):
        raise ValueError('archive path "{}" is invalid'.format(name))
    target = Path(root) / Path(clean)
    if not path_inside(root, target):
        raise ValueError('archive path "{}" escapes extraction directory'.format(name))
    return target


def extract_zip(archive_path, dest):
    with zipfile.ZipFile(archive_path) as archive:
        for info in archive.infolist():
            if not info.filename or info.filename in (".", "/"):
                continue
            target = safe_archive_target(dest, info.filename)
            mode = (info.external_attr >> 16) & 0o777777
            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            if stat_is_symlink(mode):
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as source, open(target, "wb") as out:
                shutil.copyfileobj(source, out)
            if mode:
                try_chmod(target, mode & 0o777)


def stat_is_symlink(mode):
    return (mode & 0o170000) == 0o120000


def try_chmod(path, mode):
    if os.name == "nt":
        return
    try:
        os.chmod(path, mode)
    except OSError:
        pass


def extract_tar_gz(archive_path, dest):
    pending = []
    symlink_targets = {}
    with tarfile.open(archive_path, "r:gz") as archive:
        for member in archive.getmembers():
            if not member.name or member.name in (".", "/"):
                continue
            target = safe_archive_target(dest, member.name)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                target.parent.mkdir(parents=True, exist_ok=True)
                source = archive.extractfile(member)
                if source is None:
                    continue
                with source, open(target, "wb") as out:
                    shutil.copyfileobj(source, out)
                try_chmod(target, member.mode & 0o777)
            elif member.issym():
                link_target = safe_archive_target(target.parent, member.linkname)
                symlink_targets[str(target)] = str(link_target)
                pending.append((target, link_target, member.mode & 0o777))
    for link_path, link_target, mode in pending:
        resolved = resolve_symlink_target(link_target, symlink_targets)
        if not Path(resolved).is_file():
            raise ValueError("archive symlink target is unavailable: {}".format(resolved))
        shutil.copy2(resolved, link_path)
        try_chmod(link_path, mode or 0o644)


def resolve_symlink_target(target, symlink_targets):
    seen = set()
    current = str(target)
    while current in symlink_targets:
        if current in seen:
            raise ValueError("archive symlink loop detected: {}".format(target))
        seen.add(current)
        current = symlink_targets[current]
    return current


def extract_archive(archive_path, dest):
    lower = str(archive_path).lower()
    if lower.endswith(".zip"):
        extract_zip(archive_path, dest)
        return
    if lower.endswith(".tar.gz"):
        extract_tar_gz(archive_path, dest)
        return
    raise ValueError("unsupported archive type: {}".format(archive_path))


def runtime_file_allowed(path):
    lower = Path(path).name.lower()
    exe = llama_server_executable_name().lower()
    if lower == exe:
        return True
    if lower == "license" or lower.startswith("license."):
        return True
    return lower.endswith(".dylib") or lower.endswith(".so") or ".so." in lower or lower.endswith(".dll")


def copy_extracted_runtime_files(extract_dir, target_dir):
    target_dir.mkdir(parents=True, exist_ok=True)
    exe = llama_server_executable_name().lower()
    for path in Path(extract_dir).rglob("*"):
        if not path.is_file() or not runtime_file_allowed(path):
            continue
        target = target_dir / path.name
        shutil.copy2(path, target)
        if path.name.lower() == exe:
            try_chmod(target, 0o755)


def download_url(url, dest):
    request = urllib.request.Request(url, headers={"User-Agent": "Anthori"})
    with urllib.request.urlopen(request, timeout=60) as response, open(dest, "wb") as out:
        shutil.copyfileobj(response, out)


def install_runtime_pack(state_dir, request):
    runtime_id = normalize_string(request.get("runtimeId")).lower()
    version = normalize_runtime_tag(request.get("version")) or STABLE_TAG
    definition = find_runtime_definition(runtime_id, version)
    if not definition:
        raise ValueError("unknown runtime pack")
    assets = definition.get("assets") or []
    if not assets:
        raise ValueError("runtime pack has no download assets")
    stop_runtime(state_dir, request)
    base_dir = runtime_root(state_dir)
    base_dir.mkdir(parents=True, exist_ok=True)
    target_dir = runtime_dir(state_dir, runtime_id)
    with tempfile.TemporaryDirectory(prefix=".download-", dir=str(base_dir)) as temp_name:
        temp_dir = Path(temp_name)
        extract_dir = temp_dir / "extract"
        extract_dir.mkdir(parents=True, exist_ok=True)
        asset_names = []
        for asset in assets:
            name = normalize_string(asset.get("name"))
            url = normalize_string(asset.get("url"))
            if not name or not url:
                raise ValueError("runtime pack has an invalid asset")
            asset_names.append(name)
            archive_path = temp_dir / name
            download_url(url, archive_path)
            extract_archive(archive_path, extract_dir)
        stage_dir = temp_dir / "runtime"
        copy_extracted_runtime_files(extract_dir, stage_dir)
        binary_path, binary_available = installed_runtime_binary(stage_dir)
        if not binary_available:
            raise ValueError("downloaded runtime did not include {}".format(llama_server_executable_name()))
        try_chmod(binary_path, 0o755)
        write_json(stage_dir / "VERSION.json", {
            "source": "ggml-org/llama.cpp",
            "version": definition.get("version", version),
            "runtimeId": runtime_id,
            "platform": definition.get("platform", platform_id()),
            "assets": ", ".join(asset_names),
            "installedAt": now_iso(),
        })
        if target_dir.exists():
            shutil.rmtree(target_dir)
        shutil.move(str(stage_dir), str(target_dir))
    next_request = dict(request)
    next_request["runtimeId"] = runtime_id
    return list_runtime_packs(state_dir, next_request, version)


def remove_runtime_pack(state_dir, request):
    runtime_id = normalize_string(request.get("runtimeId")).lower()
    if not runtime_id or runtime_id == "system":
        raise ValueError("runtime pack cannot be removed")
    if not find_runtime_definition(runtime_id):
        raise ValueError("unknown runtime pack")
    stop_runtime(state_dir, request)
    directory = runtime_dir(state_dir, runtime_id)
    if directory.exists():
        shutil.rmtree(directory)
    next_request = dict(request)
    if normalize_string(next_request.get("runtimeId")).lower() == runtime_id:
        next_request["runtimeId"] = ""
    return list_runtime_packs(state_dir, next_request)


def fetch_latest_runtime_tag():
    request = urllib.request.Request(
        LATEST_RELEASE_API_URL,
        headers={"Accept": "application/vnd.github+json", "User-Agent": "Anthori"},
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        payload = json.loads(response.read().decode("utf-8"))
    tag = normalize_runtime_tag(payload.get("tag_name"))
    if not tag:
        raise ValueError("GitHub returned an invalid llama.cpp release tag")
    return tag


def run_command(timeout, args):
    try:
        completed = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=timeout)
    except (OSError, subprocess.SubprocessError):
        return ""
    if completed.returncode != 0:
        return ""
    return completed.stdout.strip()


def cpu_name():
    if sys.platform == "darwin":
        return run_command(2, ["sysctl", "-n", "machdep.cpu.brand_string"])
    if sys.platform.startswith("linux"):
        try:
            for line in Path("/proc/cpuinfo").read_text(encoding="utf-8", errors="replace").splitlines():
                if ":" not in line:
                    continue
                key, value = line.split(":", 1)
                if key.strip().lower() in ("model name", "hardware"):
                    return value.strip()
        except OSError:
            return ""
    if os.name == "nt":
        output_text = run_command(2, ["wmic", "cpu", "get", "Name", "/value"])
        for line in output_text.splitlines():
            if line.lower().startswith("name="):
                return line.split("=", 1)[1].strip()
    return ""


def ram_bytes():
    if sys.platform == "darwin":
        value = run_command(2, ["sysctl", "-n", "hw.memsize"])
        return normalize_int(value, 0) or 0
    if sys.platform.startswith("linux"):
        try:
            for line in Path("/proc/meminfo").read_text(encoding="utf-8", errors="replace").splitlines():
                if line.startswith("MemTotal:"):
                    parts = line.split()
                    if len(parts) >= 2:
                        return int(parts[1]) * 1024
        except OSError:
            return 0
    if os.name == "nt":
        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]
        status = MEMORYSTATUSEX()
        status.dwLength = ctypes.sizeof(status)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            return int(status.ullTotalPhys)
    return 0


def nvidia_gpus():
    output_text = run_command(
        2,
        ["nvidia-smi", "--query-gpu=index,name,memory.total", "--format=csv,noheader,nounits"],
    )
    if not output_text:
        return []
    gpus = []
    for line in output_text.splitlines():
        parts = [part.strip() for part in line.split(",")]
        if len(parts) < 3 or not parts[0] or not parts[1]:
            continue
        memory_mib = normalize_int(parts[2], 0) or 0
        gpus.append({
            "id": parts[0],
            "name": parts[1],
            "backend": "CUDA",
            "vramBytes": memory_mib * 1024 * 1024,
        })
    return gpus


def hardware_info():
    features = []
    machine = platform.machine().lower()
    if machine in ("x86_64", "amd64"):
        features.append("x86_64")
    return {
        "cpu": {
            "name": cpu_name(),
            "architecture": platform.machine().lower() or platform.machine(),
            "cores": os.cpu_count() or 0,
            "features": features,
        },
        "memory": {"ramBytes": ram_bytes()},
        "gpus": nvidia_gpus(),
    }


def selected_gpu_ids(settings, hardware):
    configured = settings.get("enabledGpuIds") if isinstance(settings.get("enabledGpuIds"), list) else []
    configured = [normalize_string(value) for value in configured if normalize_string(value)]
    if len(configured) == 1 and configured[0] == GPU_SELECTION_NONE:
        return []
    if configured:
        items = [item for item in configured if item != GPU_SELECTION_NONE]
        if settings.get("gpuStrategy") == "first" and len(items) > 1:
            return items[:1]
        return items
    ids = [normalize_string(gpu.get("id")) for gpu in hardware.get("gpus", []) if normalize_string(gpu.get("id"))]
    if settings.get("gpuStrategy") == "first" and len(ids) > 1:
        return ids[:1]
    return ids


def selected_gpu_memory(settings, hardware):
    selected = set(selected_gpu_ids(settings, hardware))
    total = 0
    for gpu in hardware.get("gpus", []):
        if normalize_string(gpu.get("id")) in selected:
            total += int(gpu.get("vramBytes") or 0)
    return total


def guardrail_ratio(value):
    normalized = normalize_string(value).lower()
    if normalized == "off":
        return 0
    if normalized == "balanced":
        return 0.80
    if normalized == "strict":
        return 0.65
    return 0.95


def runtime_settings_from_request(request):
    strategy = normalize_string(request.get("gpuStrategy"))
    if strategy != "first":
        strategy = "split-evenly"
    enabled = request.get("enabledGpuIds") if isinstance(request.get("enabledGpuIds"), list) else []
    guardrail = normalize_string(request.get("modelGuardrail")).lower()
    if guardrail not in ("off", "relaxed", "balanced", "strict"):
        guardrail = "relaxed"
    return {
        "gpuStrategy": strategy,
        "enabledGpuIds": [normalize_string(value) for value in enabled if normalize_string(value)],
        "limitDedicatedGpuMemory": normalize_bool(request.get("limitDedicatedGpuMemory"), True),
        "offloadKvCache": normalize_bool(request.get("defaultOffloadKvCache"), True),
        "modelGuardrail": guardrail,
    }


def check_model_guardrail(settings, hardware, model_path, include_gpu_memory):
    ratio = guardrail_ratio(settings.get("modelGuardrail"))
    if ratio <= 0:
        return
    capacity = int(hardware.get("memory", {}).get("ramBytes") or 0)
    if include_gpu_memory:
        capacity += selected_gpu_memory(settings, hardware)
    size = Path(model_path).stat().st_size
    if capacity <= 0 or size <= 0:
        return
    if size > int(capacity * ratio):
        raise ValueError("model exceeds the {} loading guardrail; choose a smaller model or lower the guardrail".format(settings.get("modelGuardrail")))


def resolve_model_path(state_dir, request):
    text = normalize_string(request.get("modelPath"))
    if not text:
        raise ValueError("modelPath is required")
    return resolve_model_path_value(state_dir, request, text, "modelPath")


def resolve_model_path_value(state_dir, request, text, field_name):
    path = Path(text)
    if path.is_absolute():
        return path
    root = model_root(state_dir, request.get("modelRoot"))
    resolved = root / path
    if not path_inside(root, resolved):
        raise ValueError("{} escapes model directory".format(field_name))
    return resolved


def choose_port(value):
    port = normalize_int(value, 1, 65535)
    return port or DEFAULT_RUNTIME_PORT


def build_server_args(request, model_path, draft_model_path, port, settings, hardware, allow_device_selection):
    args = [
        "--host", "127.0.0.1",
        "--port", str(port),
        "--model", str(model_path),
        "--flash-attn", "on",
        "--no-mmap",
    ]
    if draft_model_path:
        args.extend(["--model-draft", str(draft_model_path)])
    mappings = [
        ("contextSize", "--ctx-size", 1),
        ("threads", "--threads", 1),
        ("gpuLayers", "--n-gpu-layers", 0),
        ("evalBatchSize", "--ubatch-size", 1),
        ("seed", "--seed", -1),
        ("topK", "--top-k", 0),
    ]
    for key, flag, minimum in mappings:
        value = normalize_int(request.get(key), minimum)
        if value is not None:
            args.extend([flag, str(value)])
    float_mappings = [
        ("topP", "--top-p", 0, 1),
        ("minP", "--min-p", 0, 1),
        ("presencePenalty", "--presence-penalty", None, None),
        ("repeatPenalty", "--repeat-penalty", 0, None),
    ]
    for key, flag, minimum, maximum in float_mappings:
        value = normalize_float(request.get(key), minimum, maximum)
        if value is not None:
            args.extend([flag, str(value)])
    for key, flag in (("cacheTypeK", "--cache-type-k"), ("cacheTypeV", "--cache-type-v")):
        value = normalize_kv_cache_type(request.get(key))
        if value:
            args.extend([flag, value])
    if not allow_device_selection:
        return args
    args.extend(["--fit", "on" if settings.get("limitDedicatedGpuMemory") else "off"])
    offload_kv = settings.get("offloadKvCache", True)
    override = request.get("offloadKvCache")
    if isinstance(override, bool):
        offload_kv = override
    args.append("--kv-offload" if offload_kv else "--no-kv-offload")
    if settings.get("enabledGpuIds") == [GPU_SELECTION_NONE]:
        args.extend(["--device", "none"])
        return args
    gpu_ids = selected_gpu_ids(settings, hardware)
    if gpu_ids:
        args.extend(["--device", ",".join(gpu_ids)])
        if settings.get("gpuStrategy") == "first":
            args.extend(["--split-mode", "none", "--main-gpu", gpu_ids[0]])
        elif len(gpu_ids) > 1:
            args.extend(["--split-mode", "layer", "--tensor-split", ",".join(["1"] * len(gpu_ids))])
        else:
            args.extend(["--main-gpu", gpu_ids[0]])
    return args


def stop_runtime(state_dir, request):
    status = read_json(runtime_status_path(state_dir), {}) or {}
    pid = normalize_int(status.get("pid"), 1) or 0
    if pid and process_alive(pid):
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            try:
                os.kill(pid, signal.SIGTERM)
                deadline = time.time() + 5
                while time.time() < deadline and process_alive(pid):
                    time.sleep(0.1)
                if process_alive(pid):
                    os.kill(pid, signal.SIGKILL)
            except OSError:
                pass
    next_status = {
        "running": False,
        "ready": False,
        "starting": False,
        "baseUrl": normalize_string(status.get("baseUrl")) or "http://127.0.0.1:{}".format(DEFAULT_RUNTIME_PORT),
        "modelPath": normalize_string(status.get("modelPath")),
        "exitedAt": now_iso(),
    }
    write_json(runtime_status_path(state_dir), next_status)
    return runtime_status(state_dir, request)


def start_runtime(state_dir, request):
    stop_runtime(state_dir, request)
    binary_path, available, binary_error = resolve_binary_path(state_dir, request.get("runtimeId"))
    if binary_error:
        raise ValueError(binary_error)
    if not available:
        raise ValueError("llama-server is not available at {}".format(binary_path))
    model_path = resolve_model_path(state_dir, request)
    if not model_path.is_file():
        raise ValueError("modelPath is not a file: {}".format(model_path))
    draft_model_path = None
    draft_model_value = normalize_string(request.get("draftModelPath"))
    if draft_model_value:
        draft_model_path = resolve_model_path_value(state_dir, request, draft_model_value, "draftModelPath")
        if not draft_model_path.is_file():
            raise ValueError("draftModelPath is not a file: {}".format(draft_model_path))
    port = choose_port(request.get("port"))
    if not port_available(port):
        raise ValueError("port {} is unavailable".format(port))
    settings = runtime_settings_from_request(request)
    hardware = hardware_info()
    runtime_id = normalize_string(request.get("runtimeId")).lower()
    allow_device_selection = ".cpu" not in runtime_id
    check_model_guardrail(settings, hardware, model_path, allow_device_selection)
    args = build_server_args(request, model_path, draft_model_path, port, settings, hardware, allow_device_selection)
    log_path = runtime_log_path(state_dir)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_file = open(log_path, "ab")
    try:
        popen_kwargs = {
            "cwd": str(Path(binary_path).parent),
            "stdout": log_file,
            "stderr": log_file,
            "stdin": subprocess.DEVNULL,
            "close_fds": os.name != "nt",
        }
        if os.name == "nt":
            popen_kwargs["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        else:
            popen_kwargs["start_new_session"] = True
        process = subprocess.Popen([binary_path] + args, **popen_kwargs)
    finally:
        log_file.close()
    base_url = "http://127.0.0.1:{}".format(port)
    write_json(runtime_status_path(state_dir), {
        "running": True,
        "ready": False,
        "starting": True,
        "pid": process.pid,
        "baseUrl": base_url,
        "modelPath": str(model_path),
        "binaryPath": binary_path,
        "binaryAvailable": True,
        "startedAt": now_iso(),
    })
    try:
        wait_for_ready(base_url, 300)
    except Exception as exc:
        current = read_json(runtime_status_path(state_dir), {}) or {}
        current["lastError"] = str(exc)
        write_json(runtime_status_path(state_dir), current)
        raise
    current = read_json(runtime_status_path(state_dir), {}) or {}
    current["ready"] = True
    current["starting"] = False
    write_json(runtime_status_path(state_dir), current)
    return runtime_status(state_dir, request)


def dispatch(action, input_value):
    state_dir = extension_state_dir(input_value)
    request = extension_request(input_value)
    if action == "models-list":
        return list_models(state_dir, request)
    if action == "models-download":
        return start_model_download(state_dir, request)
    if action == "models-download-status":
        download_id = normalize_string(request.get("id"))
        if download_id:
            return {"download": read_progress(state_dir, download_id)}
        return {"downloads": read_progress(state_dir, "")}
    if action == "runtimes-list":
        return list_runtime_packs(state_dir, request)
    if action == "runtimes-check-updates":
        return list_runtime_packs(state_dir, request, fetch_latest_runtime_tag())
    if action == "runtimes-install":
        return install_runtime_pack(state_dir, request)
    if action == "runtimes-remove":
        return remove_runtime_pack(state_dir, request)
    if action == "hardware-info":
        return hardware_info()
    if action == "runtime-status":
        return runtime_status(state_dir, request)
    if action == "runtime-start":
        return start_runtime(state_dir, request)
    if action == "runtime-stop":
        return stop_runtime(state_dir, request)
    raise ValueError("unknown action: {}".format(action))


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--download-worker":
        run_download_worker(sys.argv[2])
        return
    payload = json.loads(sys.stdin.read() or "{}")
    action = normalize_string(payload.get("actionId"))
    if not action:
        action = normalize_string(payload.get("action"))
    result = dispatch(action, payload.get("input") if isinstance(payload.get("input"), dict) else {})
    output(result)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        fail(exc)
        sys.exit(1)
