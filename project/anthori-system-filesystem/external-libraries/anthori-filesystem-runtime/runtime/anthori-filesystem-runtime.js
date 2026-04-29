"use strict";

function normalizeString(value) {
  return String(value == null ? "" : value).trim();
}

function hasOwn(value, key) {
  return !!value && Object.prototype.hasOwnProperty.call(value, key);
}

function clone(value) {
  if (typeof Uint8Array !== "undefined" && value instanceof Uint8Array) return new Uint8Array(value);
  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) return value.slice(0);
  if (typeof ArrayBuffer !== "undefined" && typeof ArrayBuffer.isView === "function" && ArrayBuffer.isView(value)) {
    return new value.constructor(value);
  }
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    const next = {};
    for (const [key, entry] of Object.entries(value)) next[key] = clone(entry);
    return next;
  }
  return value;
}

function stringValue(value) {
  if (value == null) return "";
  return String(value);
}

function toUint8Array(value) {
  if (typeof Uint8Array !== "undefined" && value instanceof Uint8Array) return new Uint8Array(value);
  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof ArrayBuffer !== "undefined" && typeof ArrayBuffer.isView === "function" && ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value)) return new Uint8Array(value);
  return null;
}

function concatUint8Arrays(chunks) {
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

function rebuildFilesystemReadResponse(response, encoding, textChunks, byteChunks) {
  const next = response && typeof response === "object" ? clone(response) : {};
  const normalizedEncoding = normalizeString(encoding).toLowerCase();
  if (normalizedEncoding === "bytes") {
    next.content = concatUint8Arrays(byteChunks);
  } else {
    next.content = textChunks.join("");
  }
  return next;
}

function isStreamCancelledError(error) {
  return !!(error && typeof error === "object" && normalizeString(error.code).toLowerCase() === "stream_cancelled");
}

function streamCancelledOutput(error) {
  if (!error || typeof error !== "object") return undefined;
  return Object.prototype.hasOwnProperty.call(error, "output") ? error.output : undefined;
}

function configValue(config, key) {
  if (!config || typeof config !== "object") return undefined;
  return config[key];
}

function configString(config, key) {
  return normalizeString(configValue(config, key));
}

function wantsFilesystemDetails(payload) {
  return !!(payload && payload.details === true);
}

function buildFilesystemRequest(payload) {
  const input = payload && Object.prototype.hasOwnProperty.call(payload, "input") ? payload.input : null;
  let request;
  if (input && typeof input === "object" && !Array.isArray(input)) {
    request = clone(input);
  } else if (typeof input === "string") {
    request = { path: input };
  } else if (input == null) {
    request = {};
  } else {
    request = { value: clone(input) };
  }
  return request;
}

function unwrapFilesystemResponse(response) {
  if (response && typeof response === "object" && !Array.isArray(response) && Object.prototype.hasOwnProperty.call(response, "value")) {
    return {
      value: response.value,
      details: response.details && typeof response.details === "object" && !Array.isArray(response.details)
        ? clone(response.details)
        : null,
    };
  }
  return {
    value: response,
    details: null,
  };
}

function wrapFilesystemOperationDetails(operation) {
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) return null;
  return {
    version: 1,
    operations: [clone(operation)],
  };
}

function buildFilesystemFallbackDetails(action, request, output) {
  const normalizedAction = normalizeString(action).toLowerCase();
  if (normalizedAction === "read") {
    const path = normalizeString(output && output.path) || normalizeString(request && request.path);
    const details = {
      kind: "filesystem.read",
    };
    if (path) details.path = path;
    const bytesRead = Number(output && output.bytesRead);
    if (Number.isFinite(bytesRead) && bytesRead >= 0) details.bytesRead = bytesRead;
    const fileByteCount = Number(output && output.fileByteCount);
    if (Number.isFinite(fileByteCount) && fileByteCount >= 0) details.fileByteCount = fileByteCount;
    return wrapFilesystemOperationDetails(details);
  }
  return null;
}

function runtimePullRequest(input) {
  const pull = input && typeof input === "object" && !Array.isArray(input) ? input : null;
  if (!pull) return null;
  const pullMode = normalizeString(pull.pull).toLowerCase();
  if (pullMode !== "start" && pullMode !== "step" && pullMode !== "cancel") return null;
  const payload = clone(pull);
  delete payload.pull;
  delete payload.taskId;
  delete payload.ownerInvocationId;
  delete payload.reason;
  return {
    pull: pullMode,
    taskId: normalizeString(pull.taskId),
    ownerInvocationId: normalizeString(pull.ownerInvocationId),
    reason: normalizeString(pull.reason),
    payload: payload,
  };
}

function normalizeFilesystemReadPullOutput(output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return output;
  const next = clone(output);
  const phase = normalizeString(next.phase).toLowerCase();
  if (phase === "error" || phase === "cancel") {
    delete next.content;
    delete next.metadata;
  } else if (phase === "end") {
    const terminal = next.content && typeof next.content === "object" && !Array.isArray(next.content)
      ? next.content
      : null;
    delete next.content;
    delete next.metadata;
    if (terminal) {
      for (const [key, value] of Object.entries(terminal)) {
        if (key === "content" || hasOwn(next, key)) continue;
        next[key] = clone(value);
      }
    }
  }
  return next;
}

function normalizeFilesystemReadLinesPullOutput(output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return output;
  const next = clone(output);
  const phase = normalizeString(next.phase).toLowerCase();
  if (phase === "error" || phase === "cancel") {
    delete next.content;
    delete next.metadata;
  } else if (phase === "end") {
    const terminal = next.content && typeof next.content === "object" && !Array.isArray(next.content)
      ? next.content
      : null;
    delete next.content;
    delete next.metadata;
    if (terminal) {
      for (const [key, value] of Object.entries(terminal)) {
        if (key === "content" || hasOwn(next, key)) continue;
        next[key] = clone(value);
      }
    }
  }
  return next;
}

function callFilesystem(action, payload, host) {
  const fs = host && host.fs ? host.fs : null;
  if (!fs || typeof fs[action] !== "function") {
    throw new Error("host.fs." + action + " unavailable");
  }
  const request = buildFilesystemRequest(payload);
  const wantsDetails = wantsFilesystemDetails(payload);
  const response = wantsDetails ? fs[action](request, { details: true }) : fs[action](request);
  const unwrapped = unwrapFilesystemResponse(response);
  const next = { output: unwrapped.value };
  const details = unwrapped.details || (wantsDetails ? buildFilesystemFallbackDetails(action, request, unwrapped.value) : null);
  if (details) next.details = details;
  return next;
}

function callFilesystemRead(payload, host) {
  const fs = host && host.fs ? host.fs : null;
  if (!fs || typeof fs.read !== "function") {
    throw new Error("host.fs.read unavailable");
  }
  const pull = runtimePullRequest(payload && payload.input);
  const request = buildFilesystemRequest(pull && pull.pull === "start"
    ? { input: pull.payload }
    : payload);
  if (pull) {
    if (!host.task) {
      throw new Error("host.task unavailable");
    }
    if (pull.pull === "start") {
      return {
        output: host.task.start({
          kind: "filesystem.read",
          ownerInvocationId: pull.ownerInvocationId,
          request: {
            input: request,
          },
        }),
      };
    }
    if (pull.pull === "step") {
      return {
        output: normalizeFilesystemReadPullOutput(host.task.pull({
          taskId: pull.taskId,
        })),
      };
    }
    return {
      output: host.task.cancel({
        taskId: pull.taskId,
        reason: pull.reason,
      }),
    };
  }
  const wantsDetails = wantsFilesystemDetails(payload);
  const response = wantsDetails ? fs.read(request, { details: true }) : fs.read(request);
  const unwrapped = unwrapFilesystemResponse(response);
  const next = { output: unwrapped.value };
  const details = unwrapped.details || (wantsDetails ? buildFilesystemFallbackDetails("read", request, unwrapped.value) : null);
  if (details) next.details = details;
  return next;
}

function callFilesystemReadLines(payload, host) {
  const fs = host && host.fs ? host.fs : null;
  if (!fs || typeof fs.readLines !== "function") {
    throw new Error("host.fs.readLines unavailable");
  }
  const pull = runtimePullRequest(payload && payload.input);
  const request = buildFilesystemRequest(pull && pull.pull === "start"
    ? { input: pull.payload }
    : payload);
  if (pull) {
    if (!host.task) {
      throw new Error("host.task unavailable");
    }
    if (pull.pull === "start") {
      return {
        output: host.task.start({
          kind: "filesystem.read-lines",
          ownerInvocationId: pull.ownerInvocationId,
          request: {
            input: request,
          },
        }),
      };
    }
    if (pull.pull === "step") {
      return {
        output: normalizeFilesystemReadLinesPullOutput(host.task.pull({
          taskId: pull.taskId,
        })),
      };
    }
    return {
      output: host.task.cancel({
        taskId: pull.taskId,
        reason: pull.reason,
      }),
    };
  }
  return callFilesystem("readLines", payload, host);
}

function callFilesystemWrite(payload, host) {
  const fs = host && host.fs ? host.fs : null;
  if (!fs || typeof fs.write !== "function") {
    throw new Error("host.fs.write unavailable");
  }
  const request = buildFilesystemRequest(payload);
  const wantsDetails = wantsFilesystemDetails(payload);
  const response = wantsDetails ? fs.write(request, { details: true }) : fs.write(request);
  const unwrapped = unwrapFilesystemResponse(response);
  const next = { output: unwrapped.value };
  if (unwrapped.details) next.details = unwrapped.details;
  return next;
}

module.exports = {
  "read": function (payload, host) { return callFilesystemRead(payload, host); },
  "list": function (payload, host) { return callFilesystem("list", payload, host); },
  "write": function (payload, host) { return callFilesystemWrite(payload, host); },
  "info": function (payload, host) { return callFilesystem("info", payload, host); },
  "exists": function (payload, host) { return callFilesystem("exists", payload, host); },
  "create": function (payload, host) { return callFilesystem("create", payload, host); },
  "delete": function (payload, host) { return callFilesystem("delete", payload, host); },
  "rename": function (payload, host) { return callFilesystem("rename", payload, host); },
  "copy": function (payload, host) { return callFilesystem("copy", payload, host); },
  "find": function (payload, host) { return callFilesystem("find", payload, host); },
  "read-lines": function (payload, host) { return callFilesystemReadLines(payload, host); },
  "write-lines": function (payload, host) { return callFilesystem("writeLines", payload, host); },
  "count-lines": function (payload, host) { return callFilesystem("countLines", payload, host); },
  "chmod": function (payload, host) { return callFilesystem("chmod", payload, host); },
  "chown": function (payload, host) { return callFilesystem("chown", payload, host); },
};
