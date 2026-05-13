"use strict";

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function trim(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function runtimeError(message) {
  return { error: trim(message) || "provider runtime failed" };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  if (typeof Uint8Array !== "undefined" && value instanceof Uint8Array) {
    return new Uint8Array(value);
  }
  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) {
    return value.slice(0);
  }
  if (typeof ArrayBuffer !== "undefined" && typeof ArrayBuffer.isView === "function" && ArrayBuffer.isView(value)) {
    return new value.constructor(value);
  }
  if (Array.isArray(value)) return value.map(clone);
  if (isPlainObject(value)) {
    const next = {};
    for (const key of Object.keys(value)) next[key] = clone(value[key]);
    return next;
  }
  return value;
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInt(value, fallback) {
  const parsed = finiteNumber(value);
  return parsed !== 0 || String(value || "").trim() === "0" ? Math.trunc(parsed) : fallback;
}

function toNumber(value, fallback) {
  const parsed = finiteNumber(value);
  return parsed !== 0 || String(value || "").trim() === "0" ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeTransportErrorMessage(message, fallback) {
  const text = trim(message) || fallback;
  const normalized = text.toLowerCase();
  if (
    normalized.indexOf("stream error:") >= 0 ||
    normalized.indexOf("internal_error") >= 0 ||
    normalized.indexOf("received from peer") >= 0 ||
    normalized.indexOf("unexpected eof") >= 0 ||
    normalized.indexOf("http2") >= 0 ||
    normalized.indexOf("dial tcp") >= 0 ||
    normalized.indexOf("connect: connection refused") >= 0 ||
    normalized.indexOf("no such host") >= 0 ||
    normalized.indexOf("i/o timeout") >= 0 ||
    normalized.indexOf("context deadline exceeded") >= 0 ||
    normalized.indexOf("connection reset by peer") >= 0 ||
    normalized.indexOf("transport is closing") >= 0 ||
    normalized === "eof"
  ) {
    return "ComfyUI request failed. The provider may be unavailable right now. Upstream error: " + text;
  }
  return text || fallback;
}

function hostFetch(host, request) {
  try {
    return host.http.fetch(request);
  } catch (error) {
    throw new Error(
      normalizeTransportErrorMessage(
        error && error.message ? error.message : error,
        "ComfyUI request failed"
      )
    );
  }
}

function parseJSON(text, message) {
  try {
    return JSON.parse(String(text || ""));
  } catch (_error) {
    throw new Error(message);
  }
}

function baseUrl(config) {
  const keys = ["comfyBaseUrl", "baseUrl", "http", "llmBaseUrl"];
  for (const key of keys) {
    const value = trim(config[key]);
    if (value) return value.replace(/\/+$/g, "");
  }
  return "";
}

function timeoutSeconds(config, request) {
  let value = request.timeoutSeconds;
  if (value === null || value === undefined || trim(value) === "") {
    value = config.httpTimeoutSeconds;
  }
  const parsed = toInt(value, 120);
  return clamp(parsed, 10, 600);
}

function isWorkflowGraph(value) {
  if (!isPlainObject(value)) return false;
  for (const node of Object.values(value)) {
    if (isPlainObject(node) && trim(node.class_type) !== "") return true;
  }
  return false;
}

function parseWorkflowGraph(raw) {
  let value = raw;
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const text = trim(value);
    if (!text) return null;
    value = parseJSON(text, "workflow JSON was invalid");
  }
  if (!isPlainObject(value)) return null;
  if (isWorkflowGraph(value)) return clone(value);
  for (const key of ["prompt", "workflow", "graph"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const nested = parseWorkflowGraph(value[key]);
      if (nested) return nested;
    }
  }
  return null;
}

function normalizeWorkflowId(value) {
  return trim(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function loadWorkflowTemplates(config) {
  const raw = Array.isArray(config.workflows)
    ? config.workflows
    : Array.isArray(config.workflowTemplates)
      ? config.workflowTemplates
      : [];
  const templates = [];
  const used = {};
  for (let index = 0; index < raw.length; index += 1) {
    const entry = raw[index];
    if (!isPlainObject(entry)) continue;
    let graph = parseWorkflowGraph(entry.graph);
    if (!graph) graph = parseWorkflowGraph(entry.workflow);
    if (!graph) graph = parseWorkflowGraph(entry.prompt);
    if (!graph) graph = parseWorkflowGraph(entry);
    if (!graph) continue;
    let id = normalizeWorkflowId(entry.id ?? entry.name ?? `workflow-${index + 1}`);
    if (!id) id = `workflow-${index + 1}`;
    const base = id;
    let suffix = 2;
    while (used[id]) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    used[id] = true;
    templates.push({
      id: id,
      name: trim(entry.name) || id,
      graph: graph,
    });
  }
  return templates;
}

function resolveWorkflowTemplate(request, config) {
  const templates = loadWorkflowTemplates(config);
  if (templates.length === 0) return null;
  const requested = normalizeWorkflowId(request.workflowId);
  if (requested) {
    for (const template of templates) {
      if (template.id === requested) return template;
    }
    throw new Error("workflowId not found; available workflow IDs: " + templates.map((entry) => entry.id).join(", "));
  }
  const defaultId = normalizeWorkflowId(config.defaultWorkflowId);
  if (defaultId) {
    for (const template of templates) {
      if (template.id === defaultId) return template;
    }
  }
  return templates[0];
}

function configuredCheckpoint(config) {
  for (const key of ["checkpoint", "ckptName", "checkpointName", "model"]) {
    const value = trim(config[key]);
    if (value) return value;
  }
  return "";
}

function workflowContainsCheckpointToken(value) {
  if (typeof value === "string") {
    return value.indexOf("{{CHECKPOINT}}") >= 0 || value.indexOf("__CHECKPOINT__") >= 0;
  }
  if (Array.isArray(value)) {
    return value.some(workflowContainsCheckpointToken);
  }
  if (isPlainObject(value)) {
    return Object.values(value).some(workflowContainsCheckpointToken);
  }
  return false;
}

function workflowNeedsCheckpoint(workflow) {
  if (!workflow) return true;
  if (workflowContainsCheckpointToken(workflow)) return true;
  for (const node of Object.values(workflow)) {
    if (!isPlainObject(node)) continue;
    if (trim(node.class_type).toLowerCase() === "checkpointloadersimple") return true;
  }
  return false;
}

function resolveCheckpoint(config, endpoint, host, request, workflow) {
  const configured = configuredCheckpoint(config);
  if (configured) return configured;
  if (!workflowNeedsCheckpoint(workflow)) return "";

  const response = hostFetch(host, {
    url: endpoint + "/object_info/CheckpointLoaderSimple",
    method: "GET",
    timeoutSeconds: timeoutSeconds(config, request),
  });
  if (!response || !response.ok) {
    throw new Error(trim(response && response.body) || "failed to fetch CheckpointLoaderSimple object info");
  }
  const parsed = parseJSON(response.body, "CheckpointLoaderSimple returned invalid JSON");
  const node = isPlainObject(parsed.CheckpointLoaderSimple) ? parsed.CheckpointLoaderSimple : parsed;
  const required = isPlainObject(node.input) && isPlainObject(node.input.required) ? node.input.required : {};
  const options = required.ckpt_name;
  if (Array.isArray(options) && options.length > 0) {
    if (Array.isArray(options[0]) && options[0].length > 0) return trim(options[0][0]);
    return trim(options[0]);
  }
  throw new Error("no checkpoints available in ComfyUI (CheckpointLoaderSimple)");
}

function runtimeDimensions(request, config) {
  let width = toInt(request.width, 0);
  if (width <= 0) width = toInt(config.width, 640);
  let height = toInt(request.height, 0);
  if (height <= 0) height = toInt(config.height, 480);
  width = clamp(width, 256, 2048);
  height = clamp(height, 256, 2048);
  width = Math.floor(width / 8) * 8;
  height = Math.floor(height / 8) * 8;
  return { width, height };
}

function buildDefaultWorkflow(request, config, checkpoint) {
  const dimensions = runtimeDimensions(request, config);
  let steps = toInt(request.steps, toInt(config.steps, 20));
  steps = clamp(steps, 4, 80);
  let cfg = toNumber(request.cfgScale, toNumber(config.cfgScale, 7));
  cfg = toNumber(config.cfg, cfg);
  cfg = clamp(cfg, 1, 20);
  let seed = toInt(request.seed, 0);
  if (seed <= 0) seed = Date.now();
  const sampler = trim(request.samplerName) || trim(config.samplerName) || trim(config.sampler) || "euler";
  const scheduler = trim(request.scheduler) || trim(config.scheduler) || "normal";
  const negative = trim(request.negativePrompt);
  return {
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: seed,
        steps: steps,
        cfg: cfg,
        sampler_name: sampler,
        scheduler: scheduler,
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: checkpoint },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: {
        width: dimensions.width,
        height: dimensions.height,
        batch_size: 1,
      },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: trim(request.prompt),
        clip: ["4", 1],
      },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: negative,
        clip: ["4", 1],
      },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["3", 0],
        vae: ["4", 2],
      },
    },
    "9": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: "anthori",
        images: ["8", 0],
      },
    },
  };
}

function replaceAll(text, search, replacement) {
  return String(text).split(search).join(String(replacement));
}

function replaceTokens(value, replacements) {
  if (value === null || value === undefined || typeof value !== "object") {
    const text = value === null || value === undefined ? "" : value;
    const trimmed = trim(text);
    if (Object.prototype.hasOwnProperty.call(replacements, trimmed)) {
      return replacements[trimmed];
    }
    let next = String(text);
    for (const token of Object.keys(replacements)) {
      const replacement = replacements[token];
      if (replacement === null || replacement === undefined || typeof replacement === "object") continue;
      next = replaceAll(next, token, replacement);
    }
    return next;
  }
  if (Array.isArray(value)) return value.map((entry) => replaceTokens(entry, replacements));
  const next = {};
  for (const key of Object.keys(value)) next[key] = replaceTokens(value[key], replacements);
  return next;
}

function applyTemplateRuntime(workflow, request, config, checkpoint) {
  const dimensions = runtimeDimensions(request, config);
  let seed = toInt(request.seed, 0);
  if (seed <= 0) seed = Date.now();
  const steps = toInt(request.steps, toInt(config.steps, 20));
  const cfg = toNumber(request.cfgScale, toNumber(config.cfgScale, 0));
  const sampler = trim(request.samplerName) || trim(config.samplerName) || trim(config.sampler);
  const scheduler = trim(request.scheduler) || trim(config.scheduler);
  const negative = trim(request.negativePrompt);
  const replacements = {
    "{{PROMPT}}": trim(request.prompt),
    "__PROMPT__": trim(request.prompt),
    "{{NEGATIVE_PROMPT}}": negative,
    "__NEGATIVE_PROMPT__": negative,
    "{{WIDTH}}": dimensions.width,
    "__WIDTH__": dimensions.width,
    "{{HEIGHT}}": dimensions.height,
    "__HEIGHT__": dimensions.height,
    "{{SEED}}": seed,
    "__SEED__": seed,
    "{{STEPS}}": steps,
    "__STEPS__": steps,
    "{{CFG}}": cfg,
    "__CFG__": cfg,
    "{{SAMPLER}}": sampler,
    "__SAMPLER__": sampler,
    "{{SCHEDULER}}": scheduler,
    "__SCHEDULER__": scheduler,
    "{{CHECKPOINT}}": checkpoint,
    "__CHECKPOINT__": checkpoint,
  };
  const next = replaceTokens(clone(workflow), replacements);
  return isPlainObject(next) ? next : clone(workflow);
}

function applyCommonRuntime(workflow, request, config, checkpoint) {
  const dimensions = runtimeDimensions(request, config);
  let seed = toInt(request.seed, 0);
  if (seed <= 0) seed = Date.now();
  const steps = toInt(request.steps, toInt(config.steps, 20));
  let cfg = toNumber(request.cfgScale, 0);
  if (cfg <= 0) cfg = toNumber(config.cfgScale, cfg);
  if (cfg <= 0) cfg = toNumber(config.cfg, cfg);
  const sampler = trim(request.samplerName) || trim(config.samplerName) || trim(config.sampler);
  const scheduler = trim(request.scheduler) || trim(config.scheduler);
  const prompt = trim(request.prompt);
  const negative = trim(request.negativePrompt);
  let positiveAssigned = false;
  let negativeAssigned = false;

  for (const nodeID of Object.keys(workflow).sort()) {
    const node = workflow[nodeID];
    if (!isPlainObject(node) || !isPlainObject(node.inputs)) continue;
    const classType = trim(node.class_type).toLowerCase();
    const inputs = node.inputs;
    if (classType === "ksampler") {
      if (Object.prototype.hasOwnProperty.call(inputs, "seed")) inputs.seed = seed;
      if (Object.prototype.hasOwnProperty.call(inputs, "steps") && steps > 0) inputs.steps = steps;
      if (Object.prototype.hasOwnProperty.call(inputs, "cfg") && cfg > 0) inputs.cfg = cfg;
      if (Object.prototype.hasOwnProperty.call(inputs, "sampler_name") && sampler) inputs.sampler_name = sampler;
      if (Object.prototype.hasOwnProperty.call(inputs, "scheduler") && scheduler) inputs.scheduler = scheduler;
    } else if (classType === "emptylatentimage") {
      if (Object.prototype.hasOwnProperty.call(inputs, "width")) inputs.width = dimensions.width;
      if (Object.prototype.hasOwnProperty.call(inputs, "height")) inputs.height = dimensions.height;
    } else if (classType === "checkpointloadersimple") {
      if (Object.prototype.hasOwnProperty.call(inputs, "ckpt_name") && trim(checkpoint)) inputs.ckpt_name = checkpoint;
    } else if (classType === "cliptextencode") {
      const current = trim(inputs.text);
      if (!positiveAssigned && (current === "" || current.indexOf("{{PROMPT}}") >= 0 || current.indexOf("__PROMPT__") >= 0)) {
        inputs.text = prompt;
        positiveAssigned = true;
        continue;
      }
      if (!negativeAssigned && (current === "" || current.indexOf("{{NEGATIVE_PROMPT}}") >= 0 || current.indexOf("__NEGATIVE_PROMPT__") >= 0)) {
        inputs.text = negative;
        negativeAssigned = true;
      }
    }
  }
}

function base64Index(char) {
  const index = BASE64_ALPHABET.indexOf(char);
  if (index < 0) throw new Error("init image payload was not valid base64");
  return index;
}

function decodeBase64ToBytes(value) {
  const input = String(value || "").replace(/\s+/g, "");
  if (!input) return new Uint8Array(0);
  if (input.length % 4 !== 0) throw new Error("init image payload was not valid base64");
  let outputLength = (input.length / 4) * 3;
  if (input.endsWith("==")) outputLength -= 2;
  else if (input.endsWith("=")) outputLength -= 1;
  const output = new Uint8Array(outputLength);
  let offset = 0;
  for (let index = 0; index < input.length; index += 4) {
    const a = base64Index(input[index]);
    const b = base64Index(input[index + 1]);
    const c = input[index + 2] === "=" ? 0 : base64Index(input[index + 2]);
    const d = input[index + 3] === "=" ? 0 : base64Index(input[index + 3]);
    const block = (a << 18) | (b << 12) | (c << 6) | d;
    output[offset] = (block >> 16) & 0xff;
    offset += 1;
    if (input[index + 2] !== "=") {
      output[offset] = (block >> 8) & 0xff;
      offset += 1;
    }
    if (input[index + 3] !== "=") {
      output[offset] = block & 0xff;
      offset += 1;
    }
  }
  return output;
}

function asciiBytes(text) {
  const value = String(text || "");
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }
  return bytes;
}

function concatBytes(chunks) {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
}

function decodeInitImage(rawBase64, rawMime) {
  let text = trim(rawBase64);
  let mime = trim(rawMime);
  if (!text) throw new Error("init image payload was empty");
  const dataMatch = /^data:([^;]+);base64,(.+)$/i.exec(text);
  if (dataMatch) {
    if (!mime) mime = trim(dataMatch[1]);
    text = trim(dataMatch[2]);
  }
  const bytes = decodeBase64ToBytes(text);
  if (!bytes || bytes.length === 0) throw new Error("init image payload was not valid base64");
  if (!mime) mime = "image/png";
  mime = mime.toLowerCase();
  if (mime.indexOf("image/") !== 0) throw new Error("init image must use an image/* MIME type");
  return { bytes, mime };
}

function mimeExtension(mime) {
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "image/bmp") return "bmp";
  return "png";
}

function uploadInitImage(host, endpoint, config, request, image) {
  const filename = "anthori-init-" + Date.now() + "." + mimeExtension(image.mime);
  const boundary = "----------------anthori" + Date.now() + Math.floor(Math.random() * 100000);
  const body = concatBytes([
    asciiBytes("--" + boundary + "\r\n"),
    asciiBytes('Content-Disposition: form-data; name="image"; filename="' + filename + '"\r\n'),
    asciiBytes("Content-Type: " + image.mime + "\r\n\r\n"),
    image.bytes,
    asciiBytes("\r\n--" + boundary + "\r\n"),
    asciiBytes('Content-Disposition: form-data; name="type"\r\n\r\ninput\r\n'),
    asciiBytes("--" + boundary + "\r\n"),
    asciiBytes('Content-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n'),
    asciiBytes("--" + boundary + "--\r\n"),
  ]);
  const response = hostFetch(host, {
    url: endpoint + "/upload/image",
    method: "POST",
    headers: {
      "content-type": "multipart/form-data; boundary=" + boundary,
    },
    body: body,
    timeoutSeconds: timeoutSeconds(config, request),
  });
  if (!response || !response.ok) {
    throw new Error(trim(response && response.body) || "comfy init image upload failed");
  }
  const parsed = parseJSON(response.body, "comfy init image upload returned invalid JSON");
  if (!isPlainObject(parsed)) throw new Error("comfy init image upload returned invalid JSON");
  return {
    filename: trim(parsed.name || parsed.filename || filename),
    subfolder: trim(parsed.subfolder),
    type: trim(parsed.type) || "input",
  };
}

function applyInitImageRuntime(workflow, imageRef) {
  let imagePath = imageRef.filename;
  if (trim(imageRef.subfolder)) imagePath = trim(imageRef.subfolder) + "/" + imageRef.filename;
  const replacements = {
    "{{INIT_IMAGE}}": imageRef.filename,
    "__INIT_IMAGE__": imageRef.filename,
    "{{INIT_IMAGE_FILENAME}}": imageRef.filename,
    "__INIT_IMAGE_FILENAME__": imageRef.filename,
    "{{INIT_IMAGE_PATH}}": imagePath,
    "__INIT_IMAGE_PATH__": imagePath,
    "{{INIT_IMAGE_SUBFOLDER}}": trim(imageRef.subfolder),
    "__INIT_IMAGE_SUBFOLDER__": trim(imageRef.subfolder),
    "{{INIT_IMAGE_TYPE}}": trim(imageRef.type),
    "__INIT_IMAGE_TYPE__": trim(imageRef.type),
  };
  let next = replaceTokens(workflow, replacements);
  if (!isPlainObject(next)) next = workflow;
  for (const node of Object.values(next)) {
    if (!isPlainObject(node) || !isPlainObject(node.inputs)) continue;
    if (trim(node.class_type).toLowerCase() !== "loadimage") continue;
    if (Object.prototype.hasOwnProperty.call(node.inputs, "image")) node.inputs.image = imageRef.filename;
    if (Object.prototype.hasOwnProperty.call(node.inputs, "filename")) node.inputs.filename = imageRef.filename;
    if (Object.prototype.hasOwnProperty.call(node.inputs, "subfolder")) node.inputs.subfolder = trim(imageRef.subfolder);
    if (Object.prototype.hasOwnProperty.call(node.inputs, "type")) node.inputs.type = trim(imageRef.type);
  }
  return next;
}

function firstImageRef(value) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const image = firstImageRef(entry);
      if (image) return image;
    }
    return null;
  }
  if (!isPlainObject(value)) return null;
  if (trim(value.filename)) {
    return {
      filename: trim(value.filename),
      subfolder: trim(value.subfolder),
      type: trim(value.type) || "output",
    };
  }
  for (const nested of Object.values(value)) {
    const image = firstImageRef(nested);
    if (image) return image;
  }
  return null;
}

function headerValue(headers, key) {
  if (!isPlainObject(headers)) return "";
  const target = trim(key).toLowerCase();
  for (const [name, value] of Object.entries(headers)) {
    if (trim(name).toLowerCase() !== target) continue;
    if (Array.isArray(value)) return trim(value[0]);
    return trim(value);
  }
  return "";
}

function fetchComfyImage(host, endpoint, config, request, imageRef) {
  const query = ["filename=" + encodeURIComponent(imageRef.filename)];
  if (trim(imageRef.subfolder)) query.push("subfolder=" + encodeURIComponent(trim(imageRef.subfolder)));
  if (trim(imageRef.type)) query.push("type=" + encodeURIComponent(trim(imageRef.type)));
  const response = hostFetch(host, {
    url: endpoint + "/view?" + query.join("&"),
    method: "GET",
    responseType: "base64",
    timeoutSeconds: timeoutSeconds(config, request),
  });
  if (!response || !response.ok) {
    throw new Error(trim(response && response.body) || "comfy image fetch failed");
  }
  const mime = headerValue(response.headers, "Content-Type").replace(/;.*$/g, "") || "image/png";
  return {
    imageBase64: trim(response.body),
    mimeType: mime,
  };
}

function summarizeComfyError(entry) {
  if (!isPlainObject(entry)) return "";
  const messages = Array.isArray(entry.status && entry.status.messages) ? entry.status.messages : [];
  for (const message of messages) {
    const text = trim(Array.isArray(message) ? message.join(" ") : message);
    if (text) return text;
  }
  return trim(entry.status && (entry.status.status_str || entry.status.completed));
}

function renderImage(input, host) {
  const provider = input && isPlainObject(input.provider) ? input.provider : {};
  const config = provider && isPlainObject(provider.config) ? provider.config : {};
  const request = input && isPlainObject(input.request) ? input.request : {};
  const endpoint = baseUrl(config);
  if (!endpoint) throw new Error("comfy provider base URL is required");
  if (!trim(request.prompt)) throw new Error("ComfyUI prompt was empty");

  const template = resolveWorkflowTemplate(request, config);
  const templateGraph = template ? clone(template.graph) : null;
  const checkpoint = resolveCheckpoint(config, endpoint, host, request, templateGraph);
  let workflow = templateGraph
    ? applyTemplateRuntime(templateGraph, request, config, checkpoint)
    : buildDefaultWorkflow(request, config, checkpoint);
  applyCommonRuntime(workflow, request, config, checkpoint);

  if (trim(request.initImageBase64)) {
    const initImage = decodeInitImage(request.initImageBase64, request.initImageMimeType);
    const imageRef = uploadInitImage(host, endpoint, config, request, initImage);
    workflow = applyInitImageRuntime(workflow, imageRef);
  }

  const dimensions = runtimeDimensions(request, config);
  const promptResponse = hostFetch(host, {
    url: endpoint + "/prompt",
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      client_id: "anthori",
      prompt: workflow,
    }),
    timeoutSeconds: timeoutSeconds(config, request),
  });
  if (!promptResponse || !promptResponse.ok) {
    throw new Error(trim(promptResponse && promptResponse.body) || "comfy prompt request failed");
  }
  const parsed = parseJSON(promptResponse.body, "comfy prompt request returned invalid JSON");
  const promptId = trim(parsed.prompt_id);
  if (!promptId) throw new Error("comfy prompt_id missing");

  const deadline = Date.now() + timeoutSeconds(config, request) * 1000;
  while (Date.now() < deadline) {
    const history = hostFetch(host, {
      url: endpoint + "/history/" + encodeURIComponent(promptId),
      method: "GET",
      timeoutSeconds: Math.min(10, timeoutSeconds(config, request)),
    });
    if (!history || !history.ok) {
      throw new Error(trim(history && history.body) || "comfy history request failed");
    }
    const historyParsed = parseJSON(history.body, "comfy history returned invalid JSON");
    const entry = isPlainObject(historyParsed[promptId]) ? historyParsed[promptId] : null;
    if (entry) {
      const status = isPlainObject(entry.status) ? trim(entry.status.status_str).toLowerCase() : "";
      if (status === "error") {
        throw new Error(summarizeComfyError(entry) || "comfy render failed");
      }
      const imageRef = firstImageRef(entry.outputs);
      if (imageRef) {
        const image = fetchComfyImage(host, endpoint, config, request, imageRef);
        return {
          imageBase64: image.imageBase64,
          mimeType: image.mimeType || "image/png",
          width: dimensions.width,
          height: dimensions.height,
        };
      }
    }
    if (host && host.execution && typeof host.execution.delay === "function") {
      host.execution.delay(600);
    }
  }

  throw new Error("comfy render timed out");
}

module.exports = {
  "render-image": function (input, host) {
    try {
      return {
        output: renderImage(input, host),
      };
    } catch (error) {
      return runtimeError(error && error.message ? error.message : error);
    }
  },
};
