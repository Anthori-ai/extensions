"use strict";

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

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

function trim(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toUint8Array(value) {
  if (typeof Uint8Array !== "undefined" && value instanceof Uint8Array) {
    return new Uint8Array(value);
  }
  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (typeof ArrayBuffer !== "undefined" && typeof ArrayBuffer.isView === "function" && ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value)) {
    return new Uint8Array(value);
  }
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

function base64Index(char) {
  const index = BASE64_ALPHABET.indexOf(char);
  if (index < 0) {
    throw new Error("Upload base64 content is invalid");
  }
  return index;
}

function decodeBase64ToBytes(value) {
  const input = stringValue(value).replace(/\s+/g, "");
  if (!input) return new Uint8Array(0);
  if (input.length % 4 !== 0) {
    throw new Error("Upload base64 content length must be divisible by 4");
  }
  let outputLength = (input.length / 4) * 3;
  if (input.endsWith("==")) {
    outputLength -= 2;
  } else if (input.endsWith("=")) {
    outputLength -= 1;
  }
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

function inputValue(payload, label) {
  if (!payload || typeof payload !== "object") return {};
  if (!Object.prototype.hasOwnProperty.call(payload, "input")) return {};
  const value = payload.input;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} input must be an object`);
  }
  return clone(value);
}

function normalizeRequestBase(input, label) {
  const request = {
    url: trim(input.url),
  };
  if (!request.url) {
    throw new Error(`${label} input url is required`);
  }
  request.method = stringValue(input.method).trim().toUpperCase();
  if (!request.method) {
    throw new Error(`${label} input method is required`);
  }
  if (input.headers && typeof input.headers === "object" && !Array.isArray(input.headers)) {
    request.headers = clone(input.headers);
  }
  if (Number.isFinite(Number(input.timeoutSeconds))) {
    request.timeoutSeconds = Math.floor(Number(input.timeoutSeconds));
  }
  if (trim(input.responseType) !== "") {
    request.responseType = trim(input.responseType).toLowerCase();
  }
  return request;
}

function normalizeFetchRequest(payload) {
  const input = inputValue(payload, "Fetch");
  const request = normalizeRequestBase(input, "Fetch");
  if (Object.prototype.hasOwnProperty.call(input, "body")) {
    request.body = clone(input.body);
  }
  return request;
}

function normalizeDownloadRequest(payload) {
  const input = inputValue(payload, "Download");
  const request = normalizeRequestBase(input, "Download");
  if (Object.prototype.hasOwnProperty.call(input, "body")) {
    request.body = clone(input.body);
  }
  const hasPath = trim(input.path) !== "";
  const mode = trim(input.mode);
  if (!hasPath) {
    if (mode !== "") {
      throw new Error("Download input mode is only allowed when path is provided");
    }
    return request;
  }
  if (trim(input.responseType) !== "") {
    throw new Error("Download input responseType is not allowed when path is provided");
  }
  request.path = trim(input.path);
  if (mode !== "") {
    request.mode = mode;
  }
  delete request.responseType;
  return request;
}

function normalizeUploadInput(payload, requireContent) {
  const input = inputValue(payload, "Upload");
  const request = normalizeRequestBase(input, "Upload");
  const encoding = trim(input.encoding).toLowerCase();
  if (encoding !== "utf8" && encoding !== "base64" && encoding !== "bytes") {
    throw new Error("Upload input encoding must be utf8, base64, or bytes");
  }
  request.encoding = encoding;
  const hasContent = Object.prototype.hasOwnProperty.call(input, "content");
  const hasPath = trim(input.path) !== "";
  if (hasContent && hasPath) {
    throw new Error("Upload input cannot include both content and path");
  }
  if (hasPath) {
    if (!requireContent) {
      throw new Error("Upload input path is only allowed for one-shot upload");
    }
    request.path = trim(input.path);
  }
  if (requireContent && !hasContent && !hasPath) {
    throw new Error("Upload input content or path is required");
  }
  if (hasContent) {
    request.content = clone(input.content);
  }
  return request;
}

function normalizeFetchResponse(response) {
  return response && typeof response === "object" ? clone(response) : {};
}

function buildTransferOutput(response) {
  const normalized = normalizeFetchResponse(response);
  const output = {
    ok: !!normalized.ok,
    status: normalized.status,
    statusText: normalized.statusText,
    headers: clone(normalized.headers || {}),
  };
  if (Object.prototype.hasOwnProperty.call(normalized, "body")) {
    output.content = clone(normalized.body);
  }
  return output;
}

function normalizeTransferPullOutput(output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return output;
  }
  const next = clone(output);
  const phase = trim(next.phase).toLowerCase();
  if (phase !== "end" && phase !== "error" && phase !== "cancel") {
    return next;
  }
  if (Object.prototype.hasOwnProperty.call(next, "content")) {
    if (next.content && typeof next.content === "object" && !Array.isArray(next.content)) {
      if (phase === "end") {
        const terminal = clone(next.content);
        delete terminal.content;
        delete terminal.body;
        delete terminal.contentEncoding;
        delete terminal.bodyEncoding;
        if (Object.prototype.hasOwnProperty.call(terminal, "ok")) {
          next.ok = !!terminal.ok;
          delete terminal.ok;
        }
        if (Object.prototype.hasOwnProperty.call(terminal, "status")) {
          next.status = terminal.status;
          delete terminal.status;
        }
        if (Object.prototype.hasOwnProperty.call(terminal, "statusText")) {
          next.statusText = terminal.statusText;
          delete terminal.statusText;
        }
        if (Object.prototype.hasOwnProperty.call(terminal, "headers")) {
          next.headers = clone(terminal.headers || {});
          delete terminal.headers;
        }
      }
    }
    delete next.content;
  }
  delete next.metadata;
  return next;
}

function runtimePullRequest(input) {
  const pull = input && typeof input === "object" && !Array.isArray(input) ? input : null;
  if (!pull) return null;
  const pullMode = trim(pull.pull).toLowerCase();
  if (pullMode !== "start" && pullMode !== "step" && pullMode !== "cancel") return null;
  const payload = clone(pull);
  delete payload.pull;
  delete payload.taskId;
  delete payload.ownerInvocationId;
  delete payload.reason;
  return {
    pull: pullMode,
    taskId: trim(pull.taskId),
    ownerInvocationId: trim(pull.ownerInvocationId),
    reason: trim(pull.reason),
    payload: payload,
  };
}

function runtimePushRequest(input) {
  const push = input && typeof input === "object" && !Array.isArray(input) ? input : null;
  if (!push) return null;
  const pushMode = trim(push.push).toLowerCase();
  if (pushMode !== "start" && pushMode !== "step" && pushMode !== "end" && pushMode !== "cancel") return null;
  const payload = clone(push);
  delete payload.push;
  delete payload.taskId;
  delete payload.ownerInvocationId;
  delete payload.reason;
  delete payload.sequence;
  delete payload.content;
  return {
    push: pushMode,
    taskId: trim(push.taskId),
    ownerInvocationId: trim(push.ownerInvocationId),
    reason: trim(push.reason),
    sequence: Number.isFinite(Number(push.sequence)) ? Math.floor(Number(push.sequence)) : 0,
    content: Object.prototype.hasOwnProperty.call(push, "content") ? clone(push.content) : undefined,
    payload: payload,
  };
}

function ensureHTTPHost(host) {
  if (!host || !host.http || typeof host.http.fetch !== "function") {
    throw new Error("host.http.fetch unavailable");
  }
}

function ensureTaskHost(host) {
  if (!host || !host.task) {
    throw new Error("host.task unavailable");
  }
  if (typeof host.task.start !== "function") throw new Error("host.task.start unavailable");
  if (typeof host.task.write !== "function") throw new Error("host.task.write unavailable");
  if (typeof host.task.finish !== "function") throw new Error("host.task.finish unavailable");
  if (typeof host.task.cancel !== "function") throw new Error("host.task.cancel unavailable");
}

function ensureFilesystemReadHost(host) {
  if (!host || !host.fs || typeof host.fs.read !== "function") {
    throw new Error("host.fs.read unavailable");
  }
}

function ensureFilesystemHost(host, action) {
  if (!host || !host.fs || typeof host.fs[action] !== "function") {
    throw new Error(`host.fs.${action} unavailable`);
  }
}

function buildUploadBodyFromParts(chunks, encoding) {
  if (encoding === "utf8") {
    return chunks.map((chunk) => stringValue(chunk)).join("");
  }
  if (encoding === "base64") {
    return decodeBase64ToBytes(chunks.map((chunk) => stringValue(chunk)).join(""));
  }
  return concatUint8Arrays(chunks.map((chunk) => {
    const bytes = toUint8Array(chunk);
    if (!bytes) {
      throw new Error("Upload chunk state must contain bytes");
    }
    return bytes;
  }));
}

function buildUploadRequestFromInput(request) {
  const output = {
    url: request.url,
    method: request.method,
  };
  if (request.headers && typeof request.headers === "object" && !Array.isArray(request.headers)) {
    output.headers = clone(request.headers);
  }
  if (Number.isFinite(Number(request.timeoutSeconds))) {
    output.timeoutSeconds = Math.floor(Number(request.timeoutSeconds));
  }
  if (trim(request.responseType) !== "") {
    output.responseType = trim(request.responseType).toLowerCase();
  }
  output.body = buildUploadBodyFromParts([request.content], request.encoding);
  return output;
}

function buildDownloadFileFetchRequest(request) {
  const output = {
    url: request.url,
    method: request.method,
    responseType: "bytes",
  };
  if (request.headers && typeof request.headers === "object" && !Array.isArray(request.headers)) {
    output.headers = clone(request.headers);
  }
  if (Number.isFinite(Number(request.timeoutSeconds))) {
    output.timeoutSeconds = Math.floor(Number(request.timeoutSeconds));
  }
  if (Object.prototype.hasOwnProperty.call(request, "body")) {
    output.body = clone(request.body);
  }
  return output;
}

function resolveUploadRequestBodySource(request, host) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("Upload request must be an object");
  }
  if (!Object.prototype.hasOwnProperty.call(request, "path")) {
    return request;
  }
  ensureFilesystemReadHost(host);
  const fileRead = host.fs.read({
    path: request.path,
    encoding: request.encoding,
  });
  if (!fileRead || typeof fileRead !== "object" || Array.isArray(fileRead)) {
    throw new Error("Upload path read must return an object");
  }
  if (!Object.prototype.hasOwnProperty.call(fileRead, "content")) {
    throw new Error("Upload path read must return content");
  }
  const next = clone(request);
  next.content = clone(fileRead.content);
  delete next.path;
  return next;
}

function activeInvocationId(host) {
  const invocationId = trim(host && host.execution && host.execution.invocationId);
  if (!invocationId) {
    throw new Error("host.execution.invocationId unavailable");
  }
  return invocationId;
}

function taskIdFromStartResult(result, label) {
  const taskId = trim(result && result.taskId);
  if (!taskId) {
    throw new Error(`${label} start must return taskId`);
  }
  return taskId;
}

function createDownloadTarget(request, host) {
  ensureFilesystemHost(host, "create");
  const createRequest = {
    path: request.path,
    type: "file",
  };
  if (trim(request.mode) !== "") {
    createRequest.mode = trim(request.mode);
  }
  host.fs.create(createRequest);
}

function removeDownloadTargetIfCreated(request, host, created) {
  if (!created) {
    return;
  }
  if (!host || !host.fs || typeof host.fs.delete !== "function") {
    return;
  }
  host.fs.delete({
    path: request.path,
  });
}

function downloadFileOutput(response, bytesWritten) {
  const output = buildTransferOutput(response);
  delete output.content;
  output.bytesWritten = bytesWritten;
  return output;
}

function runDownloadToPath(request, host) {
  ensureHTTPHost(host);
  ensureTaskHost(host);
  const ownerInvocationId = activeInvocationId(host);
  let taskId = "";
  let created = false;
  try {
    createDownloadTarget(request, host);
    created = true;
    taskId = taskIdFromStartResult(host.task.start({
      kind: "filesystem.write",
      ownerInvocationId: ownerInvocationId,
      request: {
        path: request.path,
        encoding: "bytes",
      },
    }), "Download file write");
    let sequence = 1;
    let bytesWritten = 0;
    const response = host.http.fetch(buildDownloadFileFetchRequest(request), function(event) {
      if (!event || typeof event !== "object") {
        return;
      }
      if (trim(event.type).toLowerCase() !== "chunk") {
        return;
      }
      const chunkValue = toUint8Array(event.value);
      if (!chunkValue) {
        throw new Error("Download file chunk must be bytes");
      }
      host.task.write({
        taskId: taskId,
        sequence: sequence,
        content: chunkValue,
      });
      sequence += 1;
      if (event.metadata && Number.isFinite(Number(event.metadata.bytes))) {
        bytesWritten += Math.floor(Number(event.metadata.bytes));
      } else {
        bytesWritten += chunkValue.length;
      }
    });
    host.task.finish({
      taskId: taskId,
    });
    return {
      output: downloadFileOutput(response, bytesWritten),
    };
  } catch (error) {
    if (taskId) {
      try {
        host.task.cancel({
          taskId: taskId,
          reason: trim(error && error.message) || "download failed",
        });
      } catch (_cancelError) {
      }
    }
    try {
      removeDownloadTargetIfCreated(request, host, created);
    } catch (_deleteError) {
    }
    throw error;
  }
}

function runFetch(payload, host) {
  ensureHTTPHost(host);
  const pull = runtimePullRequest(payload && payload.input);
  if (pull) {
    if (!host.task) {
      throw new Error("host.task unavailable");
    }
    if (pull.pull === "start") {
      return {
        output: host.task.start({
          kind: "network.fetch",
          ownerInvocationId: pull.ownerInvocationId,
          request: {
            input: normalizeFetchRequest({ input: pull.payload }),
          },
        }),
      };
    }
    if (pull.pull === "step") {
      return {
        output: normalizeTransferPullOutput(host.task.pull({
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
  const request = normalizeFetchRequest(payload);
  const response = host.http.fetch(request);
  return {
    output: normalizeFetchResponse(response),
  };
}

function runDownload(payload, host) {
  ensureHTTPHost(host);
  const pull = runtimePullRequest(payload && payload.input);
  if (pull) {
    if (!host.task) {
      throw new Error("host.task unavailable");
    }
    if (pull.pull === "start") {
      return {
        output: host.task.start({
          kind: "network.download",
          ownerInvocationId: pull.ownerInvocationId,
          request: {
            input: normalizeDownloadRequest({ input: pull.payload }),
          },
        }),
      };
    }
    if (pull.pull === "step") {
      return {
        output: normalizeTransferPullOutput(host.task.pull({
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
  const request = normalizeDownloadRequest(payload);
  if (Object.prototype.hasOwnProperty.call(request, "path")) {
    return runDownloadToPath(request, host);
  }
  const response = host.http.fetch(request);
  return {
    output: buildTransferOutput(response),
  };
}

function runUpload(payload, host) {
  ensureHTTPHost(host);
  const push = runtimePushRequest(payload && payload.input);
  if (!push) {
    const request = resolveUploadRequestBodySource(normalizeUploadInput(payload, true), host);
    const response = host.http.fetch(buildUploadRequestFromInput(request));
    return {
      output: buildTransferOutput(response),
    };
  }
  ensureTaskHost(host);
  if (push.push === "start") {
    const startInput = normalizeUploadInput({ input: push.payload }, false);
    return {
      output: host.task.start({
        kind: "network.upload",
        ownerInvocationId: push.ownerInvocationId,
        request: {
          input: startInput,
        },
      }),
    };
  }
  if (push.push === "step") {
    if (push.sequence < 1) {
      throw new Error("Upload push step sequence must be >= 1");
    }
    return {
      output: host.task.write({
        taskId: push.taskId,
        sequence: push.sequence,
        content: push.content,
      }),
    };
  }
  if (push.push === "end") {
    const finished = host.task.finish({
      taskId: push.taskId,
    });
    const output = finished && typeof finished === "object" && finished.output && typeof finished.output === "object"
      ? clone(finished.output)
      : {};
    output.taskId = push.taskId;
    return {
      output: output,
    };
  }
  return {
    output: host.task.cancel({
      taskId: push.taskId,
      reason: push.reason,
    }),
  };
}

module.exports = {
  "fetch": runFetch,
  "download": runDownload,
  "upload": runUpload,
};
