"use strict";

const CONTROL_KEYS = {
  runtimeLibraryId: true,
  runtimeActionForward: true,
  runtimeActionReverse: true,
  providerRef: true,
  providerDefinitionId: true,
  providerInterfaces: true,
  preview: true,
};

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

function mergeGenerationConfig(request, value, label) {
  const generationConfig = parseJsonObject(value, label);
  for (const [key, entry] of Object.entries(generationConfig)) {
    if (BLOCKED_REQUEST_KEYS[key]) continue;
    if (entry === null || entry === undefined || entry === "") continue;
    request[key] = clone(entry);
  }
}

function mergeRuntimeRequest(payload) {
  const request = {};
  const config = objectValue(payload && payload.config);
  const input = objectValue(payload && payload.input);
  for (const [key, value] of Object.entries(config)) {
    if (CONTROL_KEYS[key]) continue;
    if (BLOCKED_REQUEST_KEYS[key]) continue;
    if (value === null || value === undefined || value === "") continue;
    if (key === "generationConfig") {
      mergeGenerationConfig(request, value, "generationConfig");
      continue;
    }
    request[key] = clone(value);
  }
  for (const [key, value] of Object.entries(input)) {
    if (key === "config") continue;
    if (BLOCKED_REQUEST_KEYS[key]) continue;
    if (value === null || value === undefined || value === "") continue;
    if (key === "generationConfig") {
      mergeGenerationConfig(request, value, "generationConfig");
      continue;
    }
    request[key] = clone(value);
  }
  return request;
}

function callProvider(payload, host, operation, providerAction) {
  const providerRuntime = host && host.providerRuntime ? host.providerRuntime : null;
  if (!providerRuntime || typeof providerRuntime.call !== "function") {
    throw new Error("host.providerRuntime.call unavailable");
  }
  const config = objectValue(payload && payload.config);
  const input = objectValue(payload && payload.input);
  const providerRef = trim(input.config) || trim(config.providerRef);
  if (!providerRef) {
    throw new Error("Diffusion provider config is required");
  }
  const request = mergeRuntimeRequest(payload);
  if (operation) request.operation = operation;
  const output = providerRuntime.call({
    providerRef,
    definitionId: trim(config.providerDefinitionId) || "diffusion",
    config: config,
    action: providerAction,
    payload: request,
  });
  invokePreviewControl(config.preview, output, host);
  return { output };
}

function invokePreviewControl(targetId, output, host) {
  const previewTarget = trim(targetId);
  if (!previewTarget) return;
  const graph = host && host.graph ? host.graph : null;
  if (!graph || typeof graph.invoke !== "function") {
    throw new Error("host.graph.invoke unavailable");
  }
  const result = graph.invoke({
    controlId: previewTarget,
    input: output,
  });
  if (result && result.ok === false) {
    const error = result.error && typeof result.error === "object" ? result.error : {};
    throw new Error(trim(error.message) || "Diffusion preview failed");
  }
}

module.exports = {
  "text-to-image-control": function (payload, host) {
    return callProvider(payload, host, "text-to-image", "renderImage");
  },
  "image-to-image-control": function (payload, host) {
    return callProvider(payload, host, "image-to-image", "renderImage");
  },
  "text-to-video-control": function (payload, host) {
    return callProvider(payload, host, "text-to-video", "renderVideo");
  },
  "image-to-video-control": function (payload, host) {
    return callProvider(payload, host, "image-to-video", "renderVideo");
  },
};
