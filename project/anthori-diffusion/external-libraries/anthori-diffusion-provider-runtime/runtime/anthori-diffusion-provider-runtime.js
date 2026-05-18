"use strict";

const APP_EXTENSION_ID = "anthori.app.diffusion";
const APP_RUNTIME_LIBRARY_ID = "anthori-diffusion-runtime";
const BLOCKED_REQUEST_KEYS = {
  modelRoot: true,
};

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    const next = {};
    for (const [key, entry] of Object.entries(value)) next[key] = clone(entry);
    return next;
  }
  return value;
}

function objectValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return clone(value);
}

function trim(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseJsonObject(value, label) {
  if (!value) return {};
  if (value && typeof value === "object" && !Array.isArray(value)) return clone(value);
  const text = trim(value);
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch (_error) {
    // Use the clearer validation message below.
  }
  throw new Error(`${label} must be a JSON object`);
}

function shouldSkipRequestKey(key, value) {
  if (BLOCKED_REQUEST_KEYS[key]) return true;
  return value === null || value === undefined || value === "";
}

function mergeGenerationConfig(merged, value, label) {
  const generationConfig = parseJsonObject(value, label);
  for (const [key, entry] of Object.entries(generationConfig)) {
    if (shouldSkipRequestKey(key, entry)) continue;
    merged[key] = clone(entry);
  }
}

function hasLoraValue(value) {
  if (Array.isArray(value)) return value.some((entry) => hasLoraValue(entry));
  if (value && typeof value === "object") {
    return Boolean(trim(value.path || value.modelPath || value.id || value.file));
  }
  return trim(value) !== "";
}

function requestDefinesLoras(request) {
  return hasLoraValue(request.loras) || hasLoraValue(request.loraPaths) || hasLoraValue(request.loraPath);
}

function clearProviderLoraSlots(merged) {
  delete merged.loras;
  delete merged.loraPaths;
  delete merged.loraPath;
  for (let index = 1; index <= 5; index += 1) {
    delete merged[`loraPath${index}`];
    delete merged[`loraWeight${index}`];
    delete merged[`loraHighNoise${index}`];
  }
}

function mergeRequest(input, options) {
  const provider = objectValue(input && input.provider);
  const config = objectValue(provider.config);
  const request = objectValue(input && input.request);
  const opts = objectValue(options);
  const merged = {};
  for (const [key, value] of Object.entries(config)) {
    if (shouldSkipRequestKey(key, value)) continue;
    if (key === "generationConfig") {
      mergeGenerationConfig(merged, value, "generationConfig");
      continue;
    }
    merged[key] = clone(value);
  }
  if (requestDefinesLoras(request)) {
    clearProviderLoraSlots(merged);
  }
  for (const [key, value] of Object.entries(request)) {
    if (shouldSkipRequestKey(key, value)) continue;
    if (key === "generationConfig") {
      mergeGenerationConfig(merged, value, "generationConfig");
      continue;
    }
    merged[key] = clone(value);
  }
  if (opts.includeImageBase64) merged.includeImageBase64 = true;
  if (opts.includeVideoBase64) merged.includeVideoBase64 = true;
  return merged;
}

function unwrapOutput(response) {
  if (response && typeof response === "object" && Object.prototype.hasOwnProperty.call(response, "output")) {
    return objectValue(response.output);
  }
  return objectValue(response);
}

function callDiffusionApp(actionId, input, host) {
  const appExtensions = host && host.appExtensions ? host.appExtensions : null;
  if (!appExtensions || typeof appExtensions.call !== "function") {
    throw new Error("host.appExtensions.call unavailable");
  }
  return appExtensions.call({
    extensionId: APP_EXTENSION_ID,
    libraryId: APP_RUNTIME_LIBRARY_ID,
    actionId,
    input: input && typeof input === "object" ? input : {},
  });
}

function listModels(input, host) {
  const provider = objectValue(input && input.provider);
  const config = objectValue(provider.config);
  const response = callDiffusionApp("models-list", {}, host);
  const output = unwrapOutput(response);
  const seen = {};
  const items = [];
  const models = Array.isArray(output.models) ? output.models : [];
  for (const model of models) {
    if (!model || typeof model !== "object") continue;
    const role = trim(model.role);
    if (role && role !== "checkpoint" && role !== "lora") continue;
    const id = trim(model.id || model.relativePath || model.path);
    if (!id || seen[id]) continue;
    seen[id] = true;
    items.push({
      id,
      label: trim(model.name || model.relativePath || id) || id,
      role: role || "checkpoint",
    });
  }
  return {
    output: {
      items,
      defaultModel: trim(config.modelPath),
      reachable: true,
      reason: items.length > 0 ? "" : "No diffusion models found.",
    },
  };
}

function renderImage(input, host) {
  const provider = objectValue(input && input.provider);
  const request = mergeRequest(input, { includeImageBase64: true });
  if (!trim(request.prompt)) {
    throw new Error("prompt is required");
  }
  const operation = trim(request.operation || request.mode);
  const hasInputImage = trim(request.imagePath || request.inputImagePath || request.initImagePath || request.initImageBase64);
  const actionId = operation === "image-to-image" || hasInputImage ? "image-to-image" : "text-to-image";
  const response = callDiffusionApp(actionId, request, host);
  const output = unwrapOutput(response);
  const imageBase64 = trim(output.imageBase64);
  if (!imageBase64) {
    throw new Error("Diffusion app runtime did not return image bytes");
  }
  const mediaType = trim(output.mediaType) || trim(output.mimeType) || "image/png";
  return {
    output: {
      imageBase64,
      mimeType: mediaType,
      mediaType,
      imagePath: trim(output.imagePath),
      imageBytes: output.imageBytes,
      width: output.width,
      height: output.height,
      modelPath: trim(output.modelPath),
      bundleId: trim(output.bundleId),
      bundleName: trim(output.bundleName),
      bundleVariant: trim(output.bundleVariant),
      lowNoiseModelPath: trim(output.lowNoiseModelPath),
      highNoiseModelPath: trim(output.highNoiseModelPath),
      vaePath: trim(output.vaePath),
      taesdPath: trim(output.taesdPath),
      t5xxlPath: trim(output.t5xxlPath),
      clipVisionPath: trim(output.clipVisionPath),
      loras: Array.isArray(output.loras) ? output.loras : [],
      runtimePath: trim(output.runtimePath),
      runtimeId: trim(output.runtimeId),
      backend: trim(output.backend),
      paramsBackend: trim(output.paramsBackend),
      elapsedMs: output.elapsedMs,
      providerId: trim(provider.id),
      providerDefinitionId: trim(provider.definitionId) || "diffusion",
    },
  };
}

function renderVideo(input, host) {
  const provider = objectValue(input && input.provider);
  const request = mergeRequest(input, { includeVideoBase64: false });
  if (!trim(request.prompt)) {
    throw new Error("prompt is required");
  }
  const operation = trim(request.operation || request.mode);
  const hasInputImage = trim(request.imagePath || request.inputImagePath || request.initImagePath || request.initImageBase64);
  const actionId = operation === "image-to-video" || hasInputImage ? "image-to-video" : "text-to-video";
  const response = callDiffusionApp(actionId, request, host);
  const output = unwrapOutput(response);
  const videoBase64 = trim(output.videoBase64);
  const videoPath = trim(output.videoPath || output.mediaPath);
  if (!videoBase64 && !videoPath) {
    throw new Error("Diffusion app runtime did not return video output");
  }
  const mediaType = trim(output.mediaType) || trim(output.mimeType) || "video/webm";
  return {
    output: {
      videoBase64,
      videoPath,
      mimeType: mediaType,
      mediaType,
      videoBytes: output.videoBytes,
      width: output.width,
      height: output.height,
      videoFrames: output.videoFrames,
      fps: output.fps,
      modelPath: trim(output.modelPath),
      bundleId: trim(output.bundleId),
      bundleName: trim(output.bundleName),
      bundleVariant: trim(output.bundleVariant),
      lowNoiseModelPath: trim(output.lowNoiseModelPath),
      highNoiseModelPath: trim(output.highNoiseModelPath),
      vaePath: trim(output.vaePath),
      taesdPath: trim(output.taesdPath),
      t5xxlPath: trim(output.t5xxlPath),
      clipVisionPath: trim(output.clipVisionPath),
      loras: Array.isArray(output.loras) ? output.loras : [],
      runtimePath: trim(output.runtimePath),
      runtimeId: trim(output.runtimeId),
      backend: trim(output.backend),
      paramsBackend: trim(output.paramsBackend),
      elapsedMs: output.elapsedMs,
      providerId: trim(provider.id),
      providerDefinitionId: trim(provider.definitionId) || "diffusion",
    },
  };
}

module.exports = {
  "list-models": listModels,
  "render-image": renderImage,
  "render-video": renderVideo,
};
