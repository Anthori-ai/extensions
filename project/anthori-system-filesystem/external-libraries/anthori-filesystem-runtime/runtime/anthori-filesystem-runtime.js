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

function filesystemActionDefaultOutput(action) {
  switch (normalizeString(action).toLowerCase()) {
    case "create":
    case "copy":
    case "exists":
    case "list":
    case "find":
    case "info":
    case "read":
    case "readlines":
    case "read-lines":
      return "text";
    case "readoutline":
    case "read-outline":
      return "yaml";
    case "write":
    case "writelines":
    case "write-lines":
    case "countlines":
    case "count-lines":
    case "chown":
      return "text";
    default:
      return "";
  }
}

function selectedFilesystemOutput(action, payload) {
  const configured = configString(payload && payload.config, "outputFormat").toLowerCase();
  if (configured === "text" || configured === "yaml" || configured === "json") return configured;
  return filesystemActionDefaultOutput(action);
}

function applyFilesystemOutput(action, payload, request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) return;
  if (hasOwn(request, "output")) return;
  const output = selectedFilesystemOutput(action, payload);
  if (output) request.output = output;
}

function wantsFilesystemDetails(payload) {
  return !!(payload && payload.details === true);
}

function buildFilesystemRequest(action, payload) {
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
  applyFilesystemOutput(action, payload, request);
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
  const request = buildFilesystemRequest(action, payload);
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
  const request = buildFilesystemRequest("read", pull && pull.pull === "start"
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
  const request = buildFilesystemRequest("readLines", pull && pull.pull === "start"
    ? { input: pull.payload, config: payload && payload.config }
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
  const request = buildFilesystemRequest("write", payload);
  const wantsDetails = wantsFilesystemDetails(payload);
  const response = wantsDetails ? fs.write(request, { details: true }) : fs.write(request);
  const unwrapped = unwrapFilesystemResponse(response);
  const next = { output: unwrapped.value };
  if (unwrapped.details) next.details = unwrapped.details;
  return next;
}

const shellOutputFilters = typeof WeakMap === "function" ? new WeakMap() : null;

function shellSuccess(stdout) {
  return { output: stringValue(stdout) };
}

function shellCommandResult(stdout, exitCode) {
  return { output: stringValue(stdout) };
}

function shellFailure(message, exitCode) {
  const text = normalizeString(message) || "invalid arguments";
  throw new Error(text);
}

function shellInputArgs(payload) {
  const input = payload && Object.prototype.hasOwnProperty.call(payload, "input") ? payload.input : null;
  if (typeof input === "string") return input;
  if (input && typeof input === "object" && !Array.isArray(input)) return stringValue(input.args);
  return "";
}

function splitShellCommandList(args) {
  const source = stringValue(args);
  const segments = [];
  let current = "";
  let quote = "";
  let escaped = false;
  let hadSeparator = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\" && quote !== "'") {
      current += ch;
      escaped = true;
      continue;
    }
    if (quote) {
      current += ch;
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === "'" || ch === "\"") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ";" || (ch === "&" && source[i + 1] === "&")) {
      const segment = normalizeString(current);
      if (!segment) throw new Error("missing shell command before operator");
      segments.push(segment);
      current = "";
      hadSeparator = true;
      if (ch === "&") i += 1;
      continue;
    }
    if (ch === "\n" || ch === "\r" || ch === "<" || ch === ">" || ch === "&") {
      throw new Error("unsupported shell operator in args");
    }
    current += ch;
  }
  if (quote) throw new Error("unterminated quote in args");
  const segment = normalizeString(current);
  if (segment) segments.push(segment);
  else if (hadSeparator) throw new Error("missing shell command after operator");
  return { segments: segments.length > 0 ? segments : [source], hadSeparator: hadSeparator };
}

function parseShellArgs(args, options) {
  const source = stringValue(args);
  const allowPipe = options && options.allowPipe === true;
  const tokens = [];
  let current = "";
  let quote = "";
  let escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = "";
      else current += ch;
      continue;
    }
    if (ch === "'" || ch === "\"") {
      quote = ch;
      continue;
    }
    if (ch === "|") {
      if (!allowPipe) throw new Error("unsupported shell operator in args");
      if (current !== "") {
        tokens.push(current);
        current = "";
      }
      tokens.push("|");
      continue;
    }
    if (ch === "\n" || ch === "\r" || ch === ";" || ch === "<" || ch === ">" || ch === "&") {
      throw new Error("unsupported shell operator in args");
    }
    if (/\s/.test(ch)) {
      if (current !== "") {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (escaped) current += "\\";
  if (quote) throw new Error("unterminated quote in args");
  if (current !== "") tokens.push(current);
  return tokens;
}

function shellCommandTokenName(token) {
  const value = normalizeString(token);
  if (!value) return "";
  const parts = value.split(/[\/\\]+/);
  return normalizeString(parts[parts.length - 1]);
}

function parseShellOutputLineFilter(tokens) {
  const commandName = shellCommandTokenName(tokens[0]);
  if (commandName !== "head" && commandName !== "tail") {
    throw new Error("unsupported shell pipeline command: " + (commandName || "(empty)"));
  }
  let lineCount = 10;
  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (/^-[0-9]+$/.test(token)) {
      lineCount = positiveInteger(token.slice(1), lineCount);
      continue;
    }
    if (token === "-n" || token === "--lines") {
      lineCount = positiveInteger(tokens[++i], lineCount);
      continue;
    }
    if (token.startsWith("--lines=")) {
      lineCount = positiveInteger(token.slice("--lines=".length), lineCount);
      continue;
    }
    if (token.startsWith("-n") && token.length > 2) {
      lineCount = positiveInteger(token.slice(2), lineCount);
      continue;
    }
    if (token.startsWith("-")) throw new Error("unsupported shell pipeline option: " + token);
    throw new Error("shell pipeline " + commandName + " reads command output; file operands are not supported");
  }
  return { command: commandName, lineCount: lineCount };
}

function parseShellPipeline(args) {
  const tokens = parseShellArgs(args, { allowPipe: true });
  const pipeIndex = tokens.indexOf("|");
  if (pipeIndex < 0) return { tokens: tokens, outputFilter: null };
  if (tokens.indexOf("|", pipeIndex + 1) >= 0) throw new Error("shell wrappers support only one output pipe");
  const commandTokens = tokens.slice(0, pipeIndex);
  const pipelineTokens = tokens.slice(pipeIndex + 1);
  if (commandTokens.length === 0) throw new Error("missing shell command before pipe");
  if (pipelineTokens.length === 0) throw new Error("missing shell command after pipe");
  return {
    tokens: commandTokens,
    outputFilter: parseShellOutputLineFilter(pipelineTokens),
  };
}

function setShellOutputFilter(payload, filter) {
  if (!shellOutputFilters || !payload || typeof payload !== "object") return;
  if (filter) shellOutputFilters.set(payload, filter);
  else shellOutputFilters.delete(payload);
}

function getShellOutputFilter(payload) {
  if (!shellOutputFilters || !payload || typeof payload !== "object") return null;
  return shellOutputFilters.get(payload) || null;
}

function clearShellOutputFilter(payload) {
  if (!shellOutputFilters || !payload || typeof payload !== "object") return;
  shellOutputFilters.delete(payload);
}

function applyShellOutputFilter(stdout, filter) {
  const text = stringValue(stdout);
  if (!filter) return text;
  if (filter.lineCount <= 0 || text === "") return "";
  const records = text.match(/[^\n]*\n|[^\n]+$/g) || [];
  const selected = filter.command === "tail" ? records.slice(-filter.lineCount) : records.slice(0, filter.lineCount);
  return selected.join("");
}

function runShellCommand(payload, host, action) {
  clearShellOutputFilter(payload);
  try {
    const result = action(payload, host);
    const filter = getShellOutputFilter(payload);
    clearShellOutputFilter(payload);
    if (!filter || !result || !Object.prototype.hasOwnProperty.call(result, "output")) return result;
    return Object.assign({}, result, {
      output: applyShellOutputFilter(result.output, filter),
    });
  } catch (error) {
    clearShellOutputFilter(payload);
    throw error;
  }
}

function shellTokens(payload, commandNames) {
  const parsed = parseShellPipeline(shellInputArgs(payload));
  let tokens = parsed.tokens;
  setShellOutputFilter(payload, parsed.outputFilter);
  if (Array.isArray(commandNames) && tokens.length > 0) {
    const commandName = shellCommandTokenName(tokens[0]);
    if (commandNames.includes(commandName)) tokens = tokens.slice(1);
  }
  return tokens;
}

function positiveInteger(value, fallback) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function shellEscapeRegExp(value) {
  return stringValue(value).replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function shellGlobRegExpSource(pattern) {
  const source = stringValue(pattern);
  let output = "";
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "*") {
      output += ".*";
      continue;
    }
    if (ch === "?") {
      output += ".";
      continue;
    }
    if (ch === "{") {
      const end = source.indexOf("}", i + 1);
      if (end > i) {
        const alternatives = source.slice(i + 1, end).split(",").map(shellGlobRegExpSource);
        output += "(?:" + alternatives.join("|") + ")";
        i = end;
        continue;
      }
    }
    output += shellEscapeRegExp(ch);
  }
  return output;
}

function shellGlobMatches(value, pattern, ignoreCase) {
  const glob = normalizeString(pattern);
  if (!glob) return true;
  const flags = ignoreCase ? "i" : "";
  return new RegExp("^" + shellGlobRegExpSource(glob) + "$", flags).test(stringValue(value));
}

function shellPathGlobMatches(path, pattern, ignoreCase) {
  const text = stringValue(path);
  if (shellGlobMatches(text, pattern, ignoreCase)) return true;
  if (!text.startsWith("./") && shellGlobMatches("./" + text, pattern, ignoreCase)) return true;
  return false;
}

function shellPathDepth(path) {
  const text = stringValue(path).replace(/[\/\\]+$/, "");
  if (!text || text === ".") return 0;
  return text.split(/[\/\\]+/).filter(Boolean).length;
}

function shellBasename(path) {
  const text = stringValue(path).replace(/[\/\\]+$/, "");
  const parts = text.split(/[\/\\]+/);
  return parts[parts.length - 1] || text;
}

function shellRgTypeGlob(type) {
  switch (normalizeString(type).toLowerCase()) {
    case "c":
      return "*.{c,h}";
    case "cpp":
    case "c++":
      return "*.{cc,cpp,cxx,h,hpp,hxx}";
    case "css":
      return "*.{css,scss,sass,less}";
    case "go":
      return "*.go";
    case "html":
      return "*.{html,htm}";
    case "java":
      return "*.java";
    case "js":
    case "javascript":
      return "*.{js,jsx,mjs,cjs}";
    case "json":
      return "*.json";
    case "md":
    case "markdown":
      return "*.{md,markdown}";
    case "py":
    case "python":
      return "*.{py,pyw}";
    case "rb":
    case "ruby":
      return "*.rb";
    case "rs":
    case "rust":
      return "*.rs";
    case "sh":
    case "shell":
      return "*.{sh,bash,zsh}";
    case "swift":
      return "*.{swift,swiftinterface}";
    case "ts":
    case "typescript":
      return "*.{ts,tsx}";
    case "yaml":
    case "yml":
      return "*.{yaml,yml}";
    default:
      return "";
  }
}

function stripDashDash(tokens) {
  const index = tokens.indexOf("--");
  if (index < 0) return tokens;
  return tokens.slice(0, index).concat(tokens.slice(index + 1));
}

function filesystemValue(action, request, host) {
  const fs = host && host.fs ? host.fs : null;
  if (!fs || typeof fs[action] !== "function") {
    throw new Error("host.fs." + action + " unavailable");
  }
  const response = fs[action](request);
  return unwrapFilesystemResponse(response).value;
}

function shellReadText(path, host, offset, limit) {
  const request = {
    path: path,
    dangerous: true,
    encoding: "utf8",
    output: "json",
  };
  if (Number.isFinite(offset) && offset > 0) request.offset = offset;
  if (Number.isFinite(limit) && limit >= 0) request.limit = limit;
  const result = filesystemValue("read", request, host);
  return stringValue(result && result.content);
}

function shellReadLines(path, host, startLine, endLine) {
  const request = {
    path: path,
    dangerous: true,
    output: "json",
  };
  if (Number.isFinite(startLine) && startLine > 0) request.startLine = startLine;
  if (Number.isFinite(endLine) && endLine > 0) request.endLine = endLine;
  const result = filesystemValue("readLines", request, host);
  return Array.isArray(result && result.lines) ? result.lines : [];
}

function shellLinesText(lines, numbered) {
  if (!Array.isArray(lines) || lines.length === 0) return "";
  return lines.map((line) => {
    const lineNumber = Number(line && (line.number || line.lineNumber));
    const text = stringValue(line && (hasOwn(line, "text") ? line.text : line.line));
    return numbered ? String(lineNumber).padStart(6, " ") + "\t" + text : text;
  }).join("\n") + "\n";
}

function shellInfo(path, host) {
  return filesystemValue("info", { path: path, output: "json" }, host);
}

function shellExistsValue(path, host) {
  const result = filesystemValue("exists", { path: path, output: "json" }, host);
  return result && result.exists === true;
}

function shellCreateFileIfMissing(path, createDirs, host) {
  if (shellExistsValue(path, host)) return;
  filesystemValue("create", {
    path: path,
    type: "file",
    createDirs: createDirs === true,
    output: "json",
  }, host);
}

function writeTextFileContent(path, content, options, host) {
  const createDirs = options && options.createDirs === true;
  const append = options && options.append === true;
  const encoding = normalizeString(options && options.encoding) || "utf8";
  shellCreateFileIfMissing(path, createDirs, host);
  const info = shellInfo(path, host);
  const size = Math.max(0, Number(info && info.size) || 0);
  if (append) {
    if (size <= 0) {
      return filesystemValue("write", {
        path: path,
        mode: "insert",
        content: content,
        encoding: encoding,
        output: "json",
      }, host);
    }
    const anchor = filesystemValue("read", {
      path: path,
      dangerous: true,
      encoding: "utf8",
      offset: size - 1,
      limit: 1,
      output: "json",
    }, host);
    return filesystemValue("write", {
      path: path,
      mode: "insert",
      byteRangeKey: anchor && anchor.byteRangeKey,
      after: true,
      content: content,
      encoding: encoding,
      output: "json",
    }, host);
  }
  if (size <= 0) {
    return filesystemValue("write", {
      path: path,
      mode: "insert",
      content: content,
      encoding: encoding,
      output: "json",
    }, host);
  }
  const existing = filesystemValue("read", {
    path: path,
    dangerous: true,
    encoding: "utf8",
    offset: 0,
    limit: size,
    output: "json",
  }, host);
  return filesystemValue("write", {
    path: path,
    mode: "replace",
    byteRangeKey: existing && existing.byteRangeKey,
    content: content,
    encoding: encoding,
    output: "json",
  }, host);
}

function shellRg(payload, host) {
  let tokens;
  try {
    tokens = stripDashDash(shellTokens(payload, ["rg"]));
  } catch (error) {
    return shellFailure(error.message);
  }
  if (tokens.includes("--files")) return shellRgFilesTokens(tokens, host);
  let pattern = "";
  const paths = [];
  let filter = "";
  let typeGlob = "";
  let limit = 100;
  let ignoreCase = false;
  let fixedStrings = false;
  let filesWithMatches = false;
  let lineNumbers = false;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "--hidden" || token === "--no-ignore" || token === "--no-heading" || token === "--heading" || token === "-H") continue;
    if (token === "--color") {
      i += 1;
      continue;
    }
    if (token.startsWith("--color=")) continue;
    if (token === "-n" || token === "--line-number") {
      lineNumbers = true;
      continue;
    }
    if (token === "-F" || token === "--fixed-strings") {
      fixedStrings = true;
      continue;
    }
    if (token === "-l" || token === "--files-with-matches") {
      filesWithMatches = true;
      continue;
    }
    if (token === "-S" || token === "--smart-case") continue;
    if (token === "-i" || token === "--ignore-case") {
      ignoreCase = true;
      continue;
    }
    if (token === "-t" || token === "--type") {
      const requestedType = tokens[++i];
      typeGlob = shellRgTypeGlob(requestedType);
      if (!typeGlob) return shellFailure("unsupported rg type: " + requestedType);
      continue;
    }
    if (token.startsWith("-t") && token.length > 2) {
      const requestedType = token.slice(2);
      typeGlob = shellRgTypeGlob(requestedType);
      if (!typeGlob) return shellFailure("unsupported rg type: " + requestedType);
      continue;
    }
    if (token.startsWith("--type=")) {
      const requestedType = token.slice("--type=".length);
      typeGlob = shellRgTypeGlob(requestedType);
      if (!typeGlob) return shellFailure("unsupported rg type: " + requestedType);
      continue;
    }
    if (token === "-g" || token === "--glob") {
      filter = normalizeString(tokens[++i]);
      continue;
    }
    if (token.startsWith("--glob=")) {
      filter = normalizeString(token.slice("--glob=".length));
      continue;
    }
    if (token === "-m" || token === "--max-count" || token === "--limit") {
      limit = positiveInteger(tokens[++i], limit);
      continue;
    }
    if (token.startsWith("--max-count=")) {
      limit = positiveInteger(token.slice("--max-count=".length), limit);
      continue;
    }
    if (token.startsWith("--limit=")) {
      limit = positiveInteger(token.slice("--limit=".length), limit);
      continue;
    }
    if (token.startsWith("-")) return shellFailure("unsupported rg option: " + token);
    if (!pattern) pattern = token;
    else paths.push(token);
  }
  if (!pattern) return shellFailure("rg requires a pattern");
  const searchPattern = ignoreCase ? "(?i)" + (fixedStrings ? shellEscapeRegExp(pattern) : pattern) : (fixedStrings ? shellEscapeRegExp(pattern) : pattern);
  const roots = paths.length > 0 ? paths : ["."];
  const allMatches = [];
  let remaining = limit;
  for (const root of roots) {
    const result = filesystemValue("find", {
      path: root,
      pattern: searchPattern,
      filter: filter || typeGlob,
      limit: remaining,
      output: "json",
    }, host);
    const info = shellInfo(root, host);
    for (const match of Array.isArray(result && result.matches) ? result.matches : []) {
      allMatches.push(Object.assign({}, match, {
        path: shellRgDisplayPath(root, match && match.path, info && info.isDir === true),
      }));
      if (limit > 0) {
        remaining = Math.max(0, limit - allMatches.length);
        if (remaining <= 0) break;
      }
    }
    if (limit > 0 && remaining <= 0) break;
  }
  if (filesWithMatches) {
    const seen = new Set();
    const rows = [];
    for (const match of allMatches) {
      const path = stringValue(match && match.path);
      if (!path || seen.has(path)) continue;
      seen.add(path);
      rows.push(path);
    }
    const stdout = rows.join("\n");
    return shellCommandResult(stdout ? stdout + "\n" : "", rows.length > 0 ? 0 : 1);
  }
  const stdout = allMatches.map((match) => {
    const path = stringValue(match && match.path);
    const text = stringValue(match && match.text);
    return lineNumbers ? path + ":" + String(Number(match && match.startLine) || 1) + ":" + text : path + ":" + text;
  }).join("\n");
  return shellCommandResult(stdout ? stdout + "\n" : "", normalizeString(stdout) ? 0 : 1);
}

function shellRgDisplayPath(root, matchPath, isDir) {
  const base = stringValue(root).replace(/[\/\\]+$/, "");
  const entry = stringValue(matchPath).replace(/^[.][\/\\]+/, "");
  if (!base || base === "." || base === "./") return entry;
  if (!isDir) return base;
  if (!entry || entry === ".") return base;
  return base + "/" + entry;
}

function shellRgFilesTokens(tokens, host) {
  const paths = [];
  let pattern = "";
  let typeGlob = "";
  let limit = 1000;
  let maxDepth = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "--files" || token === "--hidden" || token === "--no-ignore") continue;
    if (token === "--color") {
      i += 1;
      continue;
    }
    if (token.startsWith("--color=")) continue;
    if (token === "-t" || token === "--type") {
      const requestedType = tokens[++i];
      typeGlob = shellRgTypeGlob(requestedType);
      if (!typeGlob) return shellFailure("unsupported rg type: " + requestedType);
      continue;
    }
    if (token.startsWith("-t") && token.length > 2) {
      const requestedType = token.slice(2);
      typeGlob = shellRgTypeGlob(requestedType);
      if (!typeGlob) return shellFailure("unsupported rg type: " + requestedType);
      continue;
    }
    if (token.startsWith("--type=")) {
      const requestedType = token.slice("--type=".length);
      typeGlob = shellRgTypeGlob(requestedType);
      if (!typeGlob) return shellFailure("unsupported rg type: " + requestedType);
      continue;
    }
    if (token === "-g" || token === "--glob") {
      pattern = normalizeString(tokens[++i]);
      continue;
    }
    if (token.startsWith("--glob=")) {
      pattern = normalizeString(token.slice("--glob=".length));
      continue;
    }
    if (token === "--max-depth") {
      maxDepth = Math.max(0, Math.floor(Number(tokens[++i]) || 0));
      continue;
    }
    if (token.startsWith("--max-depth=")) {
      maxDepth = Math.max(0, Math.floor(Number(token.slice("--max-depth=".length)) || 0));
      continue;
    }
    if (token === "--limit") {
      limit = positiveInteger(tokens[++i], limit);
      continue;
    }
    if (token.startsWith("--limit=")) {
      limit = positiveInteger(token.slice("--limit=".length), limit);
      continue;
    }
    if (token.startsWith("-")) return shellFailure("unsupported rg --files option: " + token);
    paths.push(token);
  }
  const roots = paths.length > 0 ? paths : ["."];
  const rows = [];
  let remaining = limit;
  for (const root of roots) {
    const result = filesystemValue("list", {
      path: root,
      pattern: pattern || typeGlob,
      maxDepth: maxDepth,
      limit: remaining,
      output: "json",
    }, host);
    for (const entry of Array.isArray(result && result.paths) ? result.paths : []) {
      const entryPath = stringValue(entry && entry.path);
      if (!entryPath || entryPath.endsWith("/")) continue;
      rows.push(shellListedPath(root, entryPath, false));
      if (limit > 0) {
        remaining = Math.max(0, limit - rows.length);
        if (remaining <= 0) break;
      }
    }
    if (limit > 0 && remaining <= 0) break;
  }
  const stdout = rows
    .filter((entry) => entry && !entry.endsWith("/"))
    .join("\n");
  return shellSuccess(stdout ? stdout + "\n" : "");
}

function shellListedPath(root, entryPath, keepDirectorySlash) {
  let entry = stringValue(entryPath);
  const isDirectory = entry.endsWith("/");
  if (isDirectory && keepDirectorySlash !== true) entry = entry.slice(0, -1);
  const base = normalizeString(root);
  if (!base || base === "." || base === "./") return entry;
  const trimmedBase = base.replace(/[\/\\]+$/, "");
  if (!entry) return trimmedBase;
  return trimmedBase + "/" + entry;
}

function shellFormatLocalTime(value) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const numeric = Number(value);
  let date;
  if (Number.isFinite(numeric) && numeric > 0) {
    date = new Date(numeric > 1000000000000 ? numeric : numeric * 1000);
  } else {
    date = new Date(value);
  }
  if (!date || Number.isNaN(date.getTime())) return "Jan  1 00:00";
  const month = months[date.getMonth()] || "Jan";
  const day = String(date.getDate()).padStart(2, " ");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return month + " " + day + " " + hour + ":" + minute;
}

function shellLsLongLine(root, entry, host) {
  const entryPath = stringValue(entry && entry.path);
  const infoPath = shellListedPath(root, entryPath, false);
  let info = null;
  try {
    info = shellInfo(infoPath, host);
  } catch (_error) {
    info = null;
  }
  const permissions = normalizeString(info && info.permissions) || (entryPath.endsWith("/") ? "drwxr-xr-x" : "-rw-r--r--");
  const size = Number(info && info.size);
  const fallbackSize = Number(entry && entry.size);
  const sizeText = String(Number.isFinite(size) ? size : (Number.isFinite(fallbackSize) ? fallbackSize : 0)).padStart(8, " ");
  const modified = shellFormatLocalTime(info && info.lastModified);
  return permissions + " 1 - - " + sizeText + " " + modified + " " + entryPath;
}

function shellLs(payload, host) {
  let tokens;
  try {
    tokens = stripDashDash(shellTokens(payload, ["ls"]));
  } catch (error) {
    return shellFailure(error.message);
  }
  let longFormat = false;
  let recursive = false;
  let path = ".";
  let pathSet = false;
  let limit = 1000;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "-1" || token === "-a" || token === "-A" || token === "-h" || token === "--all" || token === "--almost-all" || token === "--human-readable") continue;
    if (token === "--color") {
      i += 1;
      continue;
    }
    if (token.startsWith("--color=")) continue;
    if (token === "-l") {
      longFormat = true;
      continue;
    }
    if (token === "-R" || token === "--recursive") {
      recursive = true;
      continue;
    }
    if (token === "--limit") {
      limit = positiveInteger(tokens[++i], limit);
      continue;
    }
    if (/^-[1lahAR]+$/.test(token)) {
      longFormat = longFormat || token.includes("l");
      recursive = recursive || token.includes("R");
      continue;
    }
    if (token.startsWith("-")) return shellFailure("unsupported ls option: " + token);
    if (pathSet) return shellFailure("ls wrapper supports one path");
    path = token;
    pathSet = true;
  }
  const result = filesystemValue("list", {
    path: path,
    maxDepth: recursive ? 0 : 1,
    limit: limit,
    output: "json",
  }, host);
  const paths = Array.isArray(result && result.paths) ? result.paths : [];
  const stdout = paths.map((entry) => {
    const entryPath = stringValue(entry && entry.path);
    if (!longFormat) return entryPath;
    return shellLsLongLine(path, entry, host);
  }).filter(Boolean).join("\n");
  return shellSuccess(stdout ? stdout + "\n" : "");
}

function shellFind(payload, host) {
  let tokens;
  try {
    tokens = stripDashDash(shellTokens(payload, ["find"]));
  } catch (error) {
    return shellFailure(error.message);
  }
  let path = ".";
  const namePatterns = [];
  const excludeNamePatterns = [];
  const pathPatterns = [];
  const excludePathPatterns = [];
  let maxDepth = 0;
  let minDepth = 0;
  let type = "";
  let pathSet = false;
  let negateNext = false;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "-print" || token === "-o" || token === "-or" || token === "(" || token === ")") continue;
    if (token === "!" || token === "-not") {
      negateNext = true;
      continue;
    }
    if (token === "-prune") {
      negateNext = false;
      continue;
    }
    if (token === "-maxdepth") {
      maxDepth = Math.max(0, Math.floor(Number(tokens[++i]) || 0));
      negateNext = false;
      continue;
    }
    if (token === "-mindepth") {
      minDepth = Math.max(0, Math.floor(Number(tokens[++i]) || 0));
      negateNext = false;
      continue;
    }
    if (token === "-name" || token === "-iname") {
      const entry = { pattern: normalizeString(tokens[++i]), ignoreCase: token === "-iname" };
      if (negateNext) excludeNamePatterns.push(entry);
      else namePatterns.push(entry);
      negateNext = false;
      continue;
    }
    if (token === "-path") {
      const entry = { pattern: normalizeString(tokens[++i]), ignoreCase: false };
      const pruneFollows = tokens[i + 1] === "-prune";
      if (negateNext || pruneFollows) {
        excludePathPatterns.push(entry);
        if (pruneFollows) excludePathPatterns.push({ pattern: entry.pattern.replace(/[\/\\]+$/, "") + "/*", ignoreCase: false });
      } else {
        pathPatterns.push(entry);
      }
      negateNext = false;
      if (pruneFollows) i += 1;
      continue;
    }
    if (token === "-type") {
      type = normalizeString(tokens[++i]);
      if (type !== "f" && type !== "d") return shellFailure("find wrapper supports -type f or -type d");
      negateNext = false;
      continue;
    }
    if (token.startsWith("-")) return shellFailure("unsupported find option: " + token);
    if (negateNext) return shellFailure("find negation must be used with -name, -iname, or -path");
    if (pathSet) return shellFailure("find wrapper supports one root path");
    path = token;
    pathSet = true;
  }
  if (negateNext) return shellFailure("find negation must be followed by -name, -iname, or -path");
  const result = filesystemValue("list", {
    path: path,
    pattern: "",
    maxDepth: maxDepth,
    limit: 1000,
    output: "json",
  }, host);
  const paths = Array.isArray(result && result.paths) ? result.paths : [];
  const rows = [];
  function includeFindPath(displayPath, isDirectory, depth) {
    if (depth < minDepth) return false;
    if (type === "f" && isDirectory) return false;
    if (type === "d" && !isDirectory) return false;
    const name = shellBasename(displayPath);
    if (namePatterns.length > 0 && !namePatterns.some((entry) => shellGlobMatches(name, entry.pattern, entry.ignoreCase))) return false;
    if (excludeNamePatterns.some((entry) => shellGlobMatches(name, entry.pattern, entry.ignoreCase))) return false;
    if (pathPatterns.length > 0 && !pathPatterns.some((entry) => shellPathGlobMatches(displayPath, entry.pattern, entry.ignoreCase))) return false;
    if (excludePathPatterns.some((entry) => shellPathGlobMatches(displayPath, entry.pattern, entry.ignoreCase))) return false;
    return true;
  }
  const rootPath = path === "." ? "." : path.replace(/[\/\\]+$/, "");
  if (includeFindPath(rootPath, true, 0)) rows.push(rootPath);
  for (const entry of paths) {
    const entryPath = stringValue(entry && entry.path);
    const isDirectory = entryPath.endsWith("/");
    const displayPath = shellListedPath(path, entryPath, false);
    const depth = shellPathDepth(entryPath);
    if (includeFindPath(displayPath, isDirectory, depth)) rows.push(displayPath);
  }
  const stdout = rows.filter(Boolean).join("\n");
  return shellSuccess(stdout ? stdout + "\n" : "");
}

function parseSedRange(expression) {
  const expr = normalizeString(expression);
  const match = expr.match(/^([0-9]+)(?:,([0-9]+|\$))?p$/);
  if (!match) return null;
  const startLine = positiveInteger(match[1], 1);
  const endLine = match[2] === "$" ? 0 : positiveInteger(match[2] || match[1], startLine);
  return { startLine, endLine };
}

function parseSedPrintCommand(tokens) {
  let args = stripDashDash(Array.isArray(tokens) ? tokens : []);
  if (args.length > 0 && shellCommandTokenName(args[0]) === "sed") args = args.slice(1);
  let expression = "";
  let path = "";
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === "-n") continue;
    if (token === "-e" || token === "--expression") {
      expression = normalizeString(args[++i]);
      continue;
    }
    if (token.startsWith("-e") && token.length > 2) {
      expression = normalizeString(token.slice(2));
      continue;
    }
    if (token.startsWith("-")) throw new Error("unsupported sed option: " + token);
    if (!expression) expression = token;
    else if (!path) path = token;
    else throw new Error("sed wrapper supports one file per command");
  }
  const range = parseSedRange(expression);
  if (!range) throw new Error("sed wrapper supports print ranges like -n '100,160p' file");
  if (!path) throw new Error("sed requires a file path");
  return { range: range, path: path };
}

function shellSed(payload, host) {
  const rawArgs = shellInputArgs(payload);
  let split;
  try {
    split = splitShellCommandList(rawArgs);
  } catch (error) {
    return shellFailure(error.message);
  }
  if (split.hadSeparator) {
    const chunks = [];
    for (const segment of split.segments) {
      let command;
      try {
        command = parseSedPrintCommand(parseShellArgs(segment, { allowPipe: false }));
      } catch (error) {
        return shellFailure(error.message);
      }
      chunks.push(shellLinesText(shellReadLines(command.path, host, command.range.startLine, command.range.endLine), false));
    }
    return shellSuccess(chunks.join(""));
  }
  let tokens;
  try {
    tokens = stripDashDash(shellTokens(payload, ["sed"]));
  } catch (error) {
    return shellFailure(error.message);
  }
  let command;
  try {
    command = parseSedPrintCommand(tokens);
  } catch (error) {
    return shellFailure(error.message);
  }
  const lines = shellReadLines(command.path, host, command.range.startLine, command.range.endLine);
  return shellSuccess(shellLinesText(lines, false));
}

function shellNl(payload, host) {
  let tokens;
  try {
    tokens = stripDashDash(shellTokens(payload, ["nl"]));
  } catch (error) {
    return shellFailure(error.message);
  }
  let path = "";
  let pathSet = false;
  let limit = 1000;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "-ba" || token === "-b" || token === "a") continue;
    if (token === "--max-lines") {
      limit = positiveInteger(tokens[++i], limit);
      continue;
    }
    if (token.startsWith("-")) return shellFailure("unsupported nl option: " + token);
    if (pathSet) return shellFailure("nl wrapper supports one file");
    path = token;
    pathSet = true;
  }
  if (!path) return shellFailure("nl requires a file path");
  const lines = shellReadLines(path, host, 1, limit);
  return shellSuccess(shellLinesText(lines, true));
}

function shellCat(payload, host) {
  let tokens;
  try {
    tokens = stripDashDash(shellTokens(payload, ["cat"]));
  } catch (error) {
    return shellFailure(error.message);
  }
  let numbered = false;
  let limit = 1048576;
  let lineLimit = 1000;
  const paths = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "-n") {
      numbered = true;
      continue;
    }
    if (token === "--limit") {
      limit = positiveInteger(tokens[++i], limit);
      lineLimit = positiveInteger(limit, lineLimit);
      continue;
    }
    if (token.startsWith("-")) return shellFailure("unsupported cat option: " + token);
    paths.push(token);
  }
  if (paths.length === 0) return shellFailure("cat requires at least one file path");
  const chunks = paths.map((path) => {
    if (!numbered) return shellReadText(path, host, 0, limit);
    const lines = shellReadLines(path, host, 1, lineLimit);
    return shellLinesText(lines, true);
  });
  return shellSuccess(chunks.join(""));
}

function shellHead(payload, host) {
  let tokens;
  try {
    tokens = stripDashDash(shellTokens(payload, ["head"]));
  } catch (error) {
    return shellFailure(error.message);
  }
  let lineCount = 10;
  let byteCount = 0;
  let path = "";
  let pathSet = false;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (/^-[0-9]+$/.test(token)) {
      lineCount = positiveInteger(token.slice(1), lineCount);
      continue;
    }
    if (token === "-n" || token === "--lines") {
      lineCount = positiveInteger(tokens[++i], lineCount);
      continue;
    }
    if (token.startsWith("--lines=")) {
      lineCount = positiveInteger(token.slice("--lines=".length), lineCount);
      continue;
    }
    if (token.startsWith("-n") && token.length > 2) {
      lineCount = positiveInteger(token.slice(2), lineCount);
      continue;
    }
    if (token === "-c" || token === "--bytes") {
      byteCount = positiveInteger(tokens[++i], byteCount || 10);
      continue;
    }
    if (token.startsWith("--bytes=")) {
      byteCount = positiveInteger(token.slice("--bytes=".length), byteCount || 10);
      continue;
    }
    if (token.startsWith("-c") && token.length > 2) {
      byteCount = positiveInteger(token.slice(2), byteCount || 10);
      continue;
    }
    if (token.startsWith("-")) return shellFailure("unsupported head option: " + token);
    if (pathSet) return shellFailure("head wrapper supports one file");
    path = token;
    pathSet = true;
  }
  if (!path) return shellFailure("head requires a file path");
  if (byteCount > 0) return shellSuccess(shellReadText(path, host, 0, byteCount));
  return shellSuccess(shellLinesText(shellReadLines(path, host, 1, lineCount), false));
}

function shellTail(payload, host) {
  let tokens;
  try {
    tokens = stripDashDash(shellTokens(payload, ["tail"]));
  } catch (error) {
    return shellFailure(error.message);
  }
  let lineCount = 10;
  let byteCount = 0;
  let path = "";
  let pathSet = false;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "-f" || token === "--follow") return shellFailure("tail -f streaming is not supported");
    if (/^-[0-9]+$/.test(token)) {
      lineCount = positiveInteger(token.slice(1), lineCount);
      continue;
    }
    if (token === "-n" || token === "--lines") {
      lineCount = positiveInteger(tokens[++i], lineCount);
      continue;
    }
    if (token.startsWith("--lines=")) {
      lineCount = positiveInteger(token.slice("--lines=".length), lineCount);
      continue;
    }
    if (token.startsWith("-n") && token.length > 2) {
      lineCount = positiveInteger(token.slice(2), lineCount);
      continue;
    }
    if (token === "-c" || token === "--bytes") {
      byteCount = positiveInteger(tokens[++i], byteCount || 10);
      continue;
    }
    if (token.startsWith("--bytes=")) {
      byteCount = positiveInteger(token.slice("--bytes=".length), byteCount || 10);
      continue;
    }
    if (token.startsWith("-c") && token.length > 2) {
      byteCount = positiveInteger(token.slice(2), byteCount || 10);
      continue;
    }
    if (token.startsWith("-")) return shellFailure("unsupported tail option: " + token);
    if (pathSet) return shellFailure("tail wrapper supports one file");
    path = token;
    pathSet = true;
  }
  if (!path) return shellFailure("tail requires a file path");
  if (byteCount > 0) {
    const info = shellInfo(path, host);
    const size = Math.max(0, Number(info && info.size) || 0);
    const offset = Math.max(0, size - byteCount);
    return shellSuccess(shellReadText(path, host, offset, byteCount));
  }
  const count = filesystemValue("countLines", { path: path, output: "json" }, host);
  const total = Math.max(0, Number(count && count.lineCount) || 0);
  const start = Math.max(1, total - lineCount + 1);
  return shellSuccess(shellLinesText(shellReadLines(path, host, start, total), false));
}

function shellWc(payload, host) {
  let tokens;
  try {
    tokens = stripDashDash(shellTokens(payload, ["wc"]));
  } catch (error) {
    return shellFailure(error.message);
  }
  let wantLines = false;
  let wantBytes = false;
  const paths = [];
  for (const token of tokens) {
    if (token === "-l") {
      wantLines = true;
      continue;
    }
    if (token === "-c") {
      wantBytes = true;
      continue;
    }
    if (/^-[lc]+$/.test(token)) {
      wantLines = wantLines || token.includes("l");
      wantBytes = wantBytes || token.includes("c");
      continue;
    }
    if (token.startsWith("-")) return shellFailure("unsupported wc option: " + token);
    paths.push(token);
  }
  if (!wantLines && !wantBytes) {
    wantLines = true;
    wantBytes = true;
  }
  if (paths.length === 0) return shellFailure("wc requires at least one file path");
  const stdout = paths.map((path) => {
    const fields = [];
    if (wantLines) {
      const count = filesystemValue("countLines", { path: path, output: "json" }, host);
      fields.push(String(Number(count && count.lineCount) || 0).padStart(8, " "));
    }
    if (wantBytes) {
      const info = shellInfo(path, host);
      fields.push(String(Number(info && info.size) || 0).padStart(8, " "));
    }
    fields.push(" " + path);
    return fields.join("");
  }).join("\n");
  return shellSuccess(stdout + "\n");
}

function shellStat(payload, host) {
  let tokens;
  try {
    tokens = stripDashDash(shellTokens(payload, ["stat"]));
  } catch (error) {
    return shellFailure(error.message);
  }
  const paths = [];
  for (const token of tokens) {
    if (token.startsWith("-")) return shellFailure("unsupported stat option: " + token);
    paths.push(token);
  }
  if (paths.length === 0) return shellFailure("stat requires at least one path");
  const stdout = paths.map((path) => {
    const info = shellInfo(path, host);
    const mode = stringValue(info && info.mode);
    const permissions = stringValue(info && info.permissions);
    const type = info && info.isDir === true ? "directory" : "regular file";
    return [
      "  File: " + path,
      "  Size: " + (Number(info && info.size) || 0) + "\tFileType: " + type,
      "Access: (" + (mode || "unknown") + "/" + (permissions || "unknown") + ")",
      "Modify: " + shellFormatLocalTime(info && info.lastModified),
    ].join("\n");
  }).join("\n");
  return shellSuccess(stdout + "\n");
}

function shellExists(payload, host) {
  let tokens;
  try {
    tokens = stripDashDash(shellTokens(payload, ["exists"]));
  } catch (error) {
    return shellFailure(error.message);
  }
  const paths = [];
  for (const token of tokens) {
    if (token.startsWith("-")) return shellFailure("unsupported exists option: " + token);
    paths.push(token);
  }
  if (paths.length === 0) return shellFailure("exists requires at least one path");
  const stdout = paths.map((path) => String(shellExistsValue(path, host))).join("\n");
  return shellSuccess(stdout + "\n");
}

function shellMkdir(payload, host) {
  let tokens;
  try {
    tokens = stripDashDash(shellTokens(payload, ["mkdir"]));
  } catch (error) {
    return shellFailure(error.message);
  }
  let createDirs = false;
  let mode = "";
  const paths = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "-p" || token === "--parents") {
      createDirs = true;
      continue;
    }
    if (token === "-m" || token === "--mode") {
      mode = normalizeString(tokens[++i]);
      continue;
    }
    if (token.startsWith("-")) return shellFailure("unsupported mkdir option: " + token);
    paths.push(token);
  }
  if (paths.length === 0) return shellFailure("mkdir requires at least one path");
  for (const path of paths) {
    const request = { path: path, type: "directory", createDirs: createDirs };
    if (mode) request.mode = mode;
    filesystemValue("create", request, host);
  }
  return shellSuccess("");
}

function shellTouch(payload, host) {
  let tokens;
  try {
    tokens = stripDashDash(shellTokens(payload, ["touch"]));
  } catch (error) {
    return shellFailure(error.message);
  }
  let createDirs = false;
  const paths = [];
  for (const token of tokens) {
    if (token === "-p" || token === "--parents") {
      createDirs = true;
      continue;
    }
    if (token.startsWith("-")) return shellFailure("unsupported touch option: " + token);
    paths.push(token);
  }
  if (paths.length === 0) return shellFailure("touch requires at least one path");
  for (const path of paths) shellCreateFileIfMissing(path, createDirs, host);
  return shellSuccess("");
}

function shellRm(payload, host) {
  let tokens;
  try {
    tokens = stripDashDash(shellTokens(payload, ["rm"]));
  } catch (error) {
    return shellFailure(error.message);
  }
  let recursive = false;
  let force = false;
  const paths = [];
  for (const token of tokens) {
    if (token === "-r" || token === "-R" || token === "--recursive") {
      recursive = true;
      continue;
    }
    if (token === "-f" || token === "--force") {
      force = true;
      continue;
    }
    if (/^-[rRf]+$/.test(token)) {
      recursive = token.includes("r") || token.includes("R");
      force = token.includes("f");
      continue;
    }
    if (token.startsWith("-")) return shellFailure("unsupported rm option: " + token);
    paths.push(token);
  }
  if (paths.length === 0) return shellFailure("rm requires at least one path");
  for (const path of paths) {
    if (force && !shellExistsValue(path, host)) continue;
    filesystemValue("delete", { path: path, recursive: recursive }, host);
  }
  return shellSuccess("");
}

function shellCp(payload, host) {
  let tokens;
  try {
    tokens = stripDashDash(shellTokens(payload, ["cp"]));
  } catch (error) {
    return shellFailure(error.message);
  }
  const paths = [];
  for (const token of tokens) {
    if (token === "-r" || token === "-R" || token === "-a" || token === "-p" || token === "-f" || token === "--recursive" || token === "--archive" || token === "--preserve" || token === "--force") continue;
    if (/^-[rRapf]+$/.test(token)) continue;
    if (token.startsWith("-")) return shellFailure("unsupported cp option: " + token);
    paths.push(token);
  }
  if (paths.length !== 2) return shellFailure("cp wrapper requires source and destination");
  filesystemValue("copy", { source: paths[0], destination: paths[1], output: "json" }, host);
  return shellSuccess("");
}

function shellMv(payload, host) {
  let tokens;
  try {
    tokens = stripDashDash(shellTokens(payload, ["mv"]));
  } catch (error) {
    return shellFailure(error.message);
  }
  const paths = [];
  for (const token of tokens) {
    if (token === "-f" || token === "--force") continue;
    if (token.startsWith("-")) return shellFailure("unsupported mv option: " + token);
    paths.push(token);
  }
  if (paths.length !== 2) return shellFailure("mv wrapper requires source and destination");
  filesystemValue("rename", { source: paths[0], destination: paths[1] }, host);
  return shellSuccess("");
}

function shellChmod(payload, host) {
  let tokens;
  try {
    tokens = stripDashDash(shellTokens(payload, ["chmod"]));
  } catch (error) {
    return shellFailure(error.message);
  }
  let mode = "";
  const paths = [];
  for (const token of tokens) {
    if (token.startsWith("-")) return shellFailure("unsupported chmod option: " + token);
    if (!mode) mode = token;
    else paths.push(token);
  }
  if (!mode || paths.length === 0) return shellFailure("chmod requires mode and path");
  for (const path of paths) {
    filesystemValue("chmod", { path: path, mode: mode }, host);
  }
  return shellSuccess("");
}

function shellChown(payload, host) {
  let tokens;
  try {
    tokens = stripDashDash(shellTokens(payload, ["chown"]));
  } catch (error) {
    return shellFailure(error.message);
  }
  let ownerGroup = "";
  const paths = [];
  for (const token of tokens) {
    if (token.startsWith("-")) return shellFailure("unsupported chown option: " + token);
    if (!ownerGroup) ownerGroup = normalizeString(token);
    else paths.push(token);
  }
  if (!ownerGroup || paths.length === 0) return shellFailure("chown requires owner:group and path");
  const parts = ownerGroup.split(":");
  if (!parts[0] || !parts[1]) return shellFailure("chown wrapper requires owner:group");
  const ownerNumber = Number(parts[0]);
  const groupNumber = Number(parts[1]);
  for (const path of paths) {
    const request = { path: path };
    if (Number.isInteger(ownerNumber)) request.uid = ownerNumber;
    else request.user = parts[0];
    if (Number.isInteger(groupNumber)) request.gid = groupNumber;
    else request.group = parts[1];
    filesystemValue("chown", request, host);
  }
  return shellSuccess("");
}

function patchInput(payload) {
  const input = payload && Object.prototype.hasOwnProperty.call(payload, "input") ? payload.input : null;
  if (typeof input !== "string") throw new Error("Patch input must be a string");
  return input.replace(/\r\n/g, "\n");
}

function isPatchOperationHeader(line) {
  return line.startsWith("~Add: ") ||
    line.startsWith("~Delete: ") ||
    line.startsWith("~Update: ") ||
    line.startsWith("~Move: ") ||
    line.startsWith("*** Add File: ") ||
    line.startsWith("*** Delete File: ") ||
    line.startsWith("*** Update File: ");
}

function isPatchBeginMarker(line) {
  return line === "*** Begin Patch";
}

function isPatchEndMarker(line) {
  return line === "*** End Patch";
}

function isPatchBoundaryLine(line) {
  return isPatchOperationHeader(line) || isPatchEndMarker(line);
}

function hasNonEmptyPatchLinesAfter(lines, index) {
  for (let i = index + 1; i < lines.length; i += 1) {
    if (lines[i] !== "") return true;
  }
  return false;
}

function isPatchSectionSeparator(lines, index) {
  if (lines[index] !== "") return false;
  for (let i = index + 1; i < lines.length; i += 1) {
    if (lines[i] === "") continue;
    return isPatchBoundaryLine(lines[i]);
  }
  return true;
}

function normalizePatchPath(path) {
  const text = normalizeString(path);
  if (!text) throw new Error("patch path is required");
  if (text.includes("\n") || text.includes("\r")) throw new Error("patch path must be one line");
  return text;
}

function parsePatchMoveHeader(text) {
  const separator = stringValue(text).indexOf(" -> ");
  if (separator < 0) throw new Error("move header must use ~Move: from -> to");
  return {
    path: normalizePatchPath(text.slice(0, separator)),
    movePath: normalizePatchPath(text.slice(separator + 4)),
  };
}

function parseOpenAIMoveToHeader(line) {
  if (!line.startsWith("*** Move to: ")) return "";
  return normalizePatchPath(line.slice("*** Move to: ".length));
}

function parsePatchOptionalMoveTo(lines, index) {
  if (index >= lines.length) return { movePath: "", index: index };
  return {
    movePath: parseOpenAIMoveToHeader(lines[index]),
    index: lines[index].startsWith("*** Move to: ") ? index + 1 : index,
  };
}

function parsePatchChunks(lines, index, options) {
  const chunks = [];
  let current = [];
  let inChunk = false;
  const allowImplicitFirstChunk = options && options.allowImplicitFirstChunk === true;
  while (index < lines.length && !isPatchOperationHeader(lines[index])) {
    const patchLine = lines[index];
    if (isPatchEndMarker(patchLine)) break;
    if (isPatchSectionSeparator(lines, index)) break;
    if (patchLine.startsWith("@@")) {
      if (current.length > 0) {
        chunks.push(current);
        current = [];
      }
      inChunk = true;
      index += 1;
      continue;
    }
    if (patchLine === "\\ No newline at end of file") {
      index += 1;
      continue;
    }
    const marker = patchLine[0];
    if (marker !== " " && marker !== "-" && marker !== "+") {
      throw new Error("update lines must start with space, -, +, or @@");
    }
    if (!inChunk) {
      if (!allowImplicitFirstChunk) throw new Error("update chunks must start with @@");
      inChunk = true;
    }
    current.push({ type: marker, text: patchLine.slice(1) });
    index += 1;
  }
  if (current.length > 0) chunks.push(current);
  return { chunks: chunks, index: index };
}

function parseAnthoriPatch(text) {
  const lines = stringValue(text).split("\n");
  const operations = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line === "") {
      index += 1;
      continue;
    }
    if (isPatchBeginMarker(line)) {
      if (operations.length > 0) throw new Error("unexpected *** Begin Patch after patch operations");
      index += 1;
      continue;
    }
    if (isPatchEndMarker(line)) {
      if (hasNonEmptyPatchLinesAfter(lines, index)) throw new Error("unexpected patch content after *** End Patch");
      break;
    }
    if (line.startsWith("~Add: ")) {
      const path = normalizePatchPath(line.slice("~Add: ".length));
      index += 1;
      const content = [];
      while (index < lines.length && !isPatchBoundaryLine(lines[index])) {
        const contentLine = lines[index];
        if (isPatchSectionSeparator(lines, index)) break;
        if (!contentLine.startsWith("+")) throw new Error("add file lines must start with +");
        content.push(contentLine.slice(1));
        index += 1;
      }
      if (content.length === 0) throw new Error("add file requires content lines");
      operations.push({ type: "add", path: path, content: content.join("\n") + "\n" });
      continue;
    }
    if (line.startsWith("~Delete: ")) {
      operations.push({
        type: "delete",
        path: normalizePatchPath(line.slice("~Delete: ".length)),
      });
      index += 1;
      continue;
    }
    if (line.startsWith("~Update: ")) {
      const path = normalizePatchPath(line.slice("~Update: ".length));
      index += 1;
      const move = parsePatchOptionalMoveTo(lines, index);
      index = move.index;
      const parsed = parsePatchChunks(lines, index);
      index = parsed.index;
      if (parsed.chunks.length === 0 && !move.movePath) throw new Error("update file requires changes");
      operations.push({ type: "update", path: path, movePath: move.movePath, chunks: parsed.chunks });
      continue;
    }
    if (line.startsWith("~Move: ")) {
      const move = parsePatchMoveHeader(line.slice("~Move: ".length));
      index += 1;
      const parsed = parsePatchChunks(lines, index);
      index = parsed.index;
      operations.push({ type: "update", path: move.path, movePath: move.movePath, chunks: parsed.chunks });
      continue;
    }
    if (line.startsWith("*** Add File: ")) {
      const path = normalizePatchPath(line.slice("*** Add File: ".length));
      index += 1;
      const content = [];
      while (index < lines.length && !isPatchBoundaryLine(lines[index])) {
        const contentLine = lines[index];
        if (isPatchSectionSeparator(lines, index)) break;
        if (!contentLine.startsWith("+")) throw new Error("add file lines must start with +");
        content.push(contentLine.slice(1));
        index += 1;
      }
      if (content.length === 0) throw new Error("add file requires content lines");
      operations.push({ type: "add", path: path, content: content.join("\n") + "\n" });
      continue;
    }
    if (line.startsWith("*** Delete File: ")) {
      operations.push({
        type: "delete",
        path: normalizePatchPath(line.slice("*** Delete File: ".length)),
      });
      index += 1;
      continue;
    }
    if (line.startsWith("*** Update File: ")) {
      const path = normalizePatchPath(line.slice("*** Update File: ".length));
      index += 1;
      const move = parsePatchOptionalMoveTo(lines, index);
      index = move.index;
      const parsed = parsePatchChunks(lines, index, { allowImplicitFirstChunk: true });
      index = parsed.index;
      if (parsed.chunks.length === 0 && !move.movePath) throw new Error("update file requires changes");
      operations.push({ type: "update", path: path, movePath: move.movePath, chunks: parsed.chunks });
      continue;
    }
    if (line.startsWith("*** Move to: ")) {
      throw new Error("*** Move to must follow an update file header");
    }
    throw new Error("invalid patch line: " + line);
  }
  return operations;
}

function splitPatchContent(content) {
  const text = stringValue(content);
  const hadFinalNewline = text.endsWith("\n");
  const body = hadFinalNewline ? text.slice(0, -1) : text;
  return {
    lines: body ? body.split("\n") : [],
    hadFinalNewline: hadFinalNewline,
  };
}

function joinPatchContent(lines, hadFinalNewline) {
  if (!Array.isArray(lines) || lines.length === 0) return hadFinalNewline ? "\n" : "";
  return lines.join("\n") + (hadFinalNewline ? "\n" : "");
}

function findPatchSequenceMatches(lines, sequence, start, limit) {
  const from = Math.max(0, Number(start) || 0);
  const maxMatches = Math.max(1, Number(limit) || 1);
  const matches = [];
  if (!Array.isArray(sequence) || sequence.length === 0) return matches;
  for (let index = from; index <= lines.length - sequence.length; index += 1) {
    let matched = true;
    for (let offset = 0; offset < sequence.length; offset += 1) {
      if (lines[index + offset] !== sequence[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      matches.push(index);
      if (matches.length >= maxMatches) return matches;
    }
  }
  return matches;
}

function patchMismatchExcerpt(chunk) {
  const lines = [];
  for (const entry of chunk) {
    if (entry.type === "+") continue;
    lines.push(entry.type + entry.text);
  }
  const excerpt = lines.slice(0, 20).join("\n");
  return lines.length > 20 ? excerpt + "\n..." : excerpt;
}

function applyPatchChunks(content, chunks, path) {
  const parsed = splitPatchContent(content);
  const lines = parsed.lines.slice();
  let cursor = 0;
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const chunk = chunks[chunkIndex];
    const oldLines = [];
    const newLines = [];
    for (const entry of chunk) {
      if (entry.type !== "+") oldLines.push(entry.text);
      if (entry.type !== "-") newLines.push(entry.text);
    }
    if (oldLines.length === 0) {
      throw new Error(
        "patch context ambiguous in " + path + " at chunk " + (chunkIndex + 1) +
          ". Add unchanged context or removed lines so the chunk matches exactly one location.",
      );
    }
    const matches = findPatchSequenceMatches(lines, oldLines, cursor, 2);
    if (matches.length === 0) {
      const excerpt = patchMismatchExcerpt(chunk);
      throw new Error(
        "patch context mismatch in " + path + " at chunk " + (chunkIndex + 1) +
          " after line " + cursor + ". Expected to find:\n" + excerpt,
      );
    }
    if (matches.length > 1) {
      throw new Error(
        "patch context ambiguous in " + path + " at chunk " + (chunkIndex + 1) +
          " after line " + cursor + ". Context/removal lines matched multiple locations starting at lines " +
          (matches[0] + 1) + " and " + (matches[1] + 1) + ". Add more unchanged context.",
      );
    }
    const index = matches[0];
    lines.splice(index, oldLines.length, ...newLines);
    cursor = index + newLines.length;
  }
  return joinPatchContent(lines, parsed.hadFinalNewline);
}

function callPatch(payload, host) {
  let operations;
  try {
    operations = parseAnthoriPatch(patchInput(payload));
  } catch (error) {
    return shellFailure(error.message);
  }
  if (operations.length === 0) return shellFailure("patch contains no operations");
  for (const operation of operations) {
    if (operation.type === "add") {
      if (shellExistsValue(operation.path, host)) return shellFailure("file already exists: " + operation.path);
      writeTextFileContent(operation.path, operation.content, { createDirs: true, append: false, encoding: "utf8" }, host);
      continue;
    }
    if (operation.type === "delete") {
      filesystemValue("delete", { path: operation.path, recursive: false }, host);
      continue;
    }
    const info = shellInfo(operation.path, host);
    const current = shellReadText(operation.path, host, 0, Math.max(0, Number(info && info.size) || 0));
    let next;
    try {
      next = operation.chunks.length > 0 ? applyPatchChunks(current, operation.chunks, operation.path) : current;
    } catch (error) {
      return shellFailure(error.message);
    }
    const targetPath = operation.movePath || operation.path;
    writeTextFileContent(targetPath, next, { createDirs: true, append: false, encoding: "utf8" }, host);
    if (targetPath !== operation.path) filesystemValue("delete", { path: operation.path, recursive: false }, host);
  }
  return shellSuccess("Done!");
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
  "read-outline": function (payload, host) { return callFilesystem("readOutline", payload, host); },
  "write-lines": function (payload, host) { return callFilesystem("writeLines", payload, host); },
  "count-lines": function (payload, host) { return callFilesystem("countLines", payload, host); },
  "chmod": function (payload, host) { return callFilesystem("chmod", payload, host); },
  "chown": function (payload, host) { return callFilesystem("chown", payload, host); },
  "patch": function (payload, host) { return callPatch(payload, host); },
  "shell-rg": function (payload, host) { return runShellCommand(payload, host, shellRg); },
  "shell-ls": function (payload, host) { return runShellCommand(payload, host, shellLs); },
  "shell-find": function (payload, host) { return runShellCommand(payload, host, shellFind); },
  "shell-sed": function (payload, host) { return runShellCommand(payload, host, shellSed); },
  "shell-nl": function (payload, host) { return runShellCommand(payload, host, shellNl); },
  "shell-cat": function (payload, host) { return runShellCommand(payload, host, shellCat); },
  "shell-head": function (payload, host) { return runShellCommand(payload, host, shellHead); },
  "shell-tail": function (payload, host) { return runShellCommand(payload, host, shellTail); },
  "shell-wc": function (payload, host) { return runShellCommand(payload, host, shellWc); },
  "shell-stat": function (payload, host) { return runShellCommand(payload, host, shellStat); },
  "shell-exists": function (payload, host) { return runShellCommand(payload, host, shellExists); },
  "shell-mkdir": function (payload, host) { return runShellCommand(payload, host, shellMkdir); },
  "shell-touch": function (payload, host) { return runShellCommand(payload, host, shellTouch); },
  "shell-rm": function (payload, host) { return runShellCommand(payload, host, shellRm); },
  "shell-cp": function (payload, host) { return runShellCommand(payload, host, shellCp); },
  "shell-mv": function (payload, host) { return runShellCommand(payload, host, shellMv); },
  "shell-chmod": function (payload, host) { return runShellCommand(payload, host, shellChmod); },
  "shell-chown": function (payload, host) { return runShellCommand(payload, host, shellChown); },
};
