"use strict";

function normalizeString(value) {
  return String(value == null ? "" : value).trim();
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    const next = {};
    for (const [key, entry] of Object.entries(value)) next[key] = clone(entry);
    return next;
  }
  return value;
}

function ensureObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value;
}

function wrapValue(value) {
  return { output: clone(value) };
}

function wrapError(message) {
  return { output: { error: { message: normalizeString(message) } } };
}

function payloadInputObject(payload, message) {
  return ensureObject(payload && payload.input, message);
}

function configValue(config, key) {
  if (!config || typeof config !== "object") return undefined;
  return config[key];
}

function configString(config, key) {
  return normalizeString(configValue(config, key));
}

function resolveScope(config, fallback) {
  return configString(config, "scope") || normalizeString(fallback);
}

function resolveBackend(config) {
  return configString(config, "backend").toLowerCase() === "provider" ? "provider" : "internal";
}

function normalizeAccessList(raw, fallback) {
  const values = Array.isArray(raw) ? raw : [];
  const allowed = new Set();
  values.forEach((entry) => {
    const normalized = normalizeString(entry).toLowerCase();
    if (normalized === "read" || normalized === "write" || normalized === "delete") {
      allowed.add(normalized);
    }
  });
  if (allowed.size > 0) return Array.from(allowed);
  return Array.isArray(fallback) ? fallback.slice() : [];
}

function tableAccessForAction(action) {
  switch (action) {
    case "select":
      return "read";
    case "insert":
    case "insertall":
    case "update":
    case "writestream":
      return "write";
    case "delete":
      return "delete";
    default:
      return "";
  }
}

function enforceActionAccess(action, access, label) {
  const required = normalizeString(tableAccessForAction(action)).toLowerCase();
  if (!required) return null;
  if (Array.isArray(access) && access.includes(required)) return null;
  const allowed = Array.isArray(access) && access.length > 0 ? access.join(", ") : "none";
  return wrapError(label + ' access "' + allowed + '" does not allow action "' + action + '"');
}

function invokeProviderControl(providerControlId, request, host, label) {
  const invoked = host.graph.invoke({
    controlId: providerControlId,
    input: request,
  });
  if (!invoked || invoked.ok !== true) {
    throw new Error(normalizeString(invoked && invoked.error && invoked.error.message) || (label + " provider control failed"));
  }
  return clone(invoked.output);
}

function providerControlId(config) {
  return configString(config, "providerControl");
}

function resolveTable(config, control) {
  return configString(config, "table") || normalizeString(control && control.id);
}

function streamNamespace(table) {
  return table + "__agent_stream";
}

function stripReplaceFlag(message) {
  const next = clone(message);
  if (next && typeof next === "object" && !Array.isArray(next)) {
    delete next.replace;
  }
  return next;
}

function stripStoredToolCallUiFields(toolCall) {
  const next = clone(toolCall);
  if (!next || typeof next !== "object" || Array.isArray(next)) {
    return next;
  }
  delete next.title;
  delete next.status;
  delete next.details;
  delete next.detailsRef;
  return next;
}

function stripStoredReservedMetadata(message) {
  const next = clone(message);
  if (!next || typeof next !== "object" || Array.isArray(next)) {
    return next;
  }
  // Table storage owns envelope metadata such as id/created/updated/turn. Agent
  // history rows may originate from chat/runtime message objects that still carry
  // turn, so normalize that away here instead of letting table storage reject the
  // append path with a reserved-metadata error.
  delete next.id;
  delete next.created;
  delete next.updated;
  delete next.turn;
  return next;
}

function normalizeStoredMessageForPersistence(message, options = {}) {
  const next = stripStoredReservedMetadata(message);
  if (!next || typeof next !== "object" || Array.isArray(next)) {
    throw new Error("agent storage message must be an object");
  }
  if (options.stripReplace === true) {
    delete next.replace;
  }
  if (Array.isArray(next.toolCalls)) {
    next.toolCalls = next.toolCalls.map((entry) => stripStoredToolCallUiFields(entry));
  }
  if (Array.isArray(next.parts)) {
    next.parts = next.parts.map((part) => {
      const clonedPart = clone(part);
      if (
        clonedPart &&
        typeof clonedPart === "object" &&
        !Array.isArray(clonedPart) &&
        clonedPart.toolCall &&
        typeof clonedPart.toolCall === "object" &&
        !Array.isArray(clonedPart.toolCall)
      ) {
        clonedPart.toolCall = stripStoredToolCallUiFields(clonedPart.toolCall);
      }
      return clonedPart;
    });
  }
  return next;
}

function normalizeStoredMessagePatch(values) {
  const next = stripStoredReservedMetadata(values);
  if (!next || typeof next !== "object" || Array.isArray(next)) {
    throw new Error("agent storage update requires values object");
  }
  if (Array.isArray(next.toolCalls)) {
    next.toolCalls = next.toolCalls.map((entry) => stripStoredToolCallUiFields(entry));
  }
  if (Array.isArray(next.parts)) {
    next.parts = next.parts.map((part) => {
      const clonedPart = clone(part);
      if (
        clonedPart &&
        typeof clonedPart === "object" &&
        !Array.isArray(clonedPart) &&
        clonedPart.toolCall &&
        typeof clonedPart.toolCall === "object" &&
        !Array.isArray(clonedPart.toolCall)
      ) {
        clonedPart.toolCall = stripStoredToolCallUiFields(clonedPart.toolCall);
      }
      return clonedPart;
    });
  }
  return next;
}


function normalizeContextToolCall(toolCall) {
  const next = clone(toolCall);
  if (!next || typeof next !== "object" || Array.isArray(next)) {
    return null;
  }
  delete next.title;
  delete next.status;
  delete next.details;
  delete next.detailsRef;
  if (!normalizeString(next.name)) {
    return null;
  }
  return next;
}

function normalizeContextPart(part) {
  const next = clone(part);
  if (!next || typeof next !== "object" || Array.isArray(next)) {
    return null;
  }
  if (normalizeString(next.kind).toLowerCase() === "tool_call") {
    const toolCall = normalizeContextToolCall(next.toolCall);
    return toolCall ? { kind: "tool_call", toolCall: toolCall } : null;
  }
  return next;
}

function toolCallsFromContextParts(parts) {
  const toolCalls = [];
  for (const part of Array.isArray(parts) ? parts : []) {
    if (!part || typeof part !== "object" || Array.isArray(part)) continue;
    if (normalizeString(part.kind).toLowerCase() !== "tool_call") continue;
    const toolCall = normalizeContextToolCall(part.toolCall);
    if (toolCall) toolCalls.push(toolCall);
  }
  return toolCalls;
}

function normalizeStoredMessageForContext(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return null;
  }
  let role = normalizeString(message.role).toLowerCase();
  if (role === "assistant") role = "agent";
  if (role !== "system" && role !== "user" && role !== "agent" && role !== "tool") {
    role = "user";
  }
  let parts = Array.isArray(message.parts)
    ? message.parts.map((part) => normalizeContextPart(part)).filter(Boolean)
    : [];
  const toolCalls = toolCallsFromContextParts(parts);
  if (Array.isArray(message.toolCalls)) {
    for (const toolCall of message.toolCalls) {
      const normalized = normalizeContextToolCall(toolCall);
      if (normalized) toolCalls.push(normalized);
    }
  }
  parts = parts.filter((part) => normalizeString(part && part.kind).toLowerCase() !== "tool_call");
  const attachments = Array.isArray(message.attachments) ? clone(message.attachments) : [];
  const toolCallId = normalizeString(message.toolCallId);
  if (parts.length === 0 && attachments.length === 0 && toolCalls.length === 0 && !toolCallId) {
    return null;
  }
  const next = { role: role };
  if (parts.length > 0) next.parts = parts;
  if (attachments.length > 0) next.attachments = attachments;
  if (role === "tool") {
    if (toolCallId) next.toolCallId = toolCallId;
    if (message.name) next.name = normalizeString(message.name);
  }
  if (role === "agent" && toolCalls.length > 0) next.toolCalls = toolCalls;
  return next;
}
function normalizeStoredRowEnvelope(entry) {
  const next = clone(entry);
  if (!next || typeof next !== "object" || Array.isArray(next)) {
    return next;
  }
  if (next.row && typeof next.row === "object" && !Array.isArray(next.row)) {
    next.row = normalizeStoredMessageForPersistence(next.row);
  }
  return next;
}

function storedToolCallPartID(part) {
  const kind = normalizeString(part && part.kind).toLowerCase();
  if (kind !== "tool_call" || !part || typeof part !== "object" || Array.isArray(part)) return "";
  const toolCall = part.toolCall && typeof part.toolCall === "object" && !Array.isArray(part.toolCall)
    ? part.toolCall
    : null;
  return normalizeString(toolCall && toolCall.id);
}

function mergeStoredObject(base, update) {
  return {
    ...(base && typeof base === "object" && !Array.isArray(base) ? clone(base) : {}),
    ...(update && typeof update === "object" && !Array.isArray(update) ? clone(update) : {}),
  };
}

function mergeStoredToolCallPart(current, update) {
  const next = current && typeof current === "object" && !Array.isArray(current) ? clone(current) : {};
  if (normalizeString(update && update.kind)) next.kind = normalizeString(update.kind).toLowerCase();
  if (typeof (update && update.text) === "string" && update.text) next.text = update.text;
  if (update && update.metadata && typeof update.metadata === "object" && !Array.isArray(update.metadata)) {
    next.metadata = mergeStoredObject(next.metadata, update.metadata);
  }
  if (update && update.toolCall && typeof update.toolCall === "object" && !Array.isArray(update.toolCall)) {
    next.toolCall = mergeStoredObject(next.toolCall, update.toolCall);
  }
  if (update && update.attachment && typeof update.attachment === "object" && !Array.isArray(update.attachment)) {
    next.attachment = mergeStoredObject(next.attachment, update.attachment);
  }
  if (update && update.error && typeof update.error === "object" && !Array.isArray(update.error)) {
    next.error = mergeStoredObject(next.error, update.error);
  }
  return next;
}

function appendStoredMessageParts(currentParts, nextParts) {
  const merged = Array.isArray(currentParts) ? currentParts.map(clone) : [];
  for (const part of Array.isArray(nextParts) ? nextParts : []) {
    const toolCallId = storedToolCallPartID(part);
    if (toolCallId) {
      const existingIndex = merged.findIndex((item) => storedToolCallPartID(item) === toolCallId);
      if (existingIndex >= 0) {
        merged[existingIndex] = mergeStoredToolCallPart(merged[existingIndex], part);
        continue;
      }
    }
    merged.push(clone(part));
  }
  return merged;
}

function mergeStreamContent(current, content) {
  const nextContent = normalizeStoredMessageForPersistence(
    stripReplaceFlag(ensureObject(content, "agent storage writeStream content must be an object")),
    { stripReplace: false },
  );
  if (!current) {
    return nextContent;
  }
  const merged = clone(current);
  for (const [key, value] of Object.entries(nextContent)) {
    if (key === "parts") continue;
    merged[key] = clone(value);
  }
  const currentParts = Array.isArray(merged.parts) ? merged.parts.map(clone) : [];
  const nextParts = Array.isArray(nextContent.parts) ? nextContent.parts.map(clone) : [];
  if (nextParts.length > 0 || currentParts.length > 0) {
    merged.parts = appendStoredMessageParts(currentParts, nextParts);
  }
  return merged;
}

function internalKVGet(scope, namespace, key, host) {
  return host.storage.kv.get({ scope: scope, namespace: namespace, key: key });
}

function internalKVSet(scope, namespace, key, value, host) {
  return host.storage.kv.set({ scope: scope, namespace: namespace, key: key, value: clone(value) });
}

function internalKVDelete(scope, namespace, key, host) {
  return host.storage.kv.delete({ scope: scope, namespace: namespace, key: key });
}

function internalTableInsert(scope, table, row, host) {
  return host.storage.table.insert({ scope: scope, table: table, row: clone(row) });
}

function internalTableSelect(scope, table, payload, host) {
  return host.storage.table.select({
    scope: scope,
    table: table,
    where: clone(payload.where || {}),
    orderBy: clone(payload.orderBy || []),
    limit: payload.limit,
  });
}

function internalTableUpdate(scope, table, payload, host) {
  const request = {
    scope: scope,
    table: table,
    where: clone(payload.where || {}),
  };
  if (Object.prototype.hasOwnProperty.call(payload, "row")) {
    request.row = clone(payload.row);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "values")) {
    request.values = clone(payload.values);
  }
  return host.storage.table.update(request);
}

function internalTableDelete(scope, table, payload, host) {
  return host.storage.table.delete({
    scope: scope,
    table: table,
    where: clone(payload.where || {}),
  });
}

function storageDispatch(config, control, host) {
  const scope = resolveScope(config, "session");
  const table = resolveTable(config, control);
  if (!table) throw new Error("agent storage requires table");
  if (resolveBackend(config) !== "provider") {
    return {
      scope: scope,
      table: table,
      kvGet: function (namespace, key) {
        return internalKVGet(scope, namespace, key, host);
      },
      kvSet: function (namespace, key, value) {
        return internalKVSet(scope, namespace, key, value, host);
      },
      kvDelete: function (namespace, key) {
        return internalKVDelete(scope, namespace, key, host);
      },
      tableInsert: function (payload) {
        return internalTableInsert(scope, table, payload.row, host);
      },
      tableSelect: function (payload) {
        return internalTableSelect(scope, table, payload, host);
      },
      tableUpdate: function (payload) {
        return internalTableUpdate(scope, table, payload, host);
      },
      tableDelete: function (payload) {
        return internalTableDelete(scope, table, payload, host);
      },
    };
  }
  const providerControl = providerControlId(config);
  if (!providerControl) throw new Error("agent storage provider backend requires providerControl");
  return {
    scope: scope,
    table: table,
    kvGet: function (namespace, key) {
      return invokeProviderControl(providerControl, {
        action: "get",
        scope: scope,
        namespace: namespace,
        key: key,
      }, host, "agent storage");
    },
    kvSet: function (namespace, key, value) {
      return invokeProviderControl(providerControl, {
        action: "set",
        scope: scope,
        namespace: namespace,
        key: key,
        value: clone(value),
      }, host, "agent storage");
    },
    kvDelete: function (namespace, key) {
      return invokeProviderControl(providerControl, {
        action: "delete",
        scope: scope,
        namespace: namespace,
        key: key,
      }, host, "agent storage");
    },
    tableInsert: function (payload) {
      return invokeProviderControl(providerControl, {
        action: "insert",
        scope: scope,
        table: table,
        row: clone(payload.row),
      }, host, "agent storage");
    },
    tableSelect: function (payload) {
      return invokeProviderControl(providerControl, {
        action: "select",
        scope: scope,
        table: table,
        where: clone(payload.where || {}),
        orderBy: clone(payload.orderBy || []),
        limit: payload.limit,
      }, host, "agent storage");
    },
    tableUpdate: function (payload) {
      const request = {
        action: "update",
        scope: scope,
        table: table,
        where: clone(payload.where || {}),
      };
      if (Object.prototype.hasOwnProperty.call(payload, "row")) request.row = clone(payload.row);
      if (Object.prototype.hasOwnProperty.call(payload, "values")) request.values = clone(payload.values);
      return invokeProviderControl(providerControl, request, host, "agent storage");
    },
    tableDelete: function (payload) {
      return invokeProviderControl(providerControl, {
        action: "delete",
        scope: scope,
        table: table,
        where: clone(payload.where || {}),
      }, host, "agent storage");
    },
  };
}

function validateWhereObject(where, label) {
  const value = clone(where || {});
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length === 0) {
    throw new Error(label);
  }
  return value;
}

function executeInsert(payload, storage) {
  const row = normalizeStoredMessageForPersistence(payload.row);
  return storage.tableInsert({ row: row });
}

function executeInsertAll(payload, storage) {
  const rows = Array.isArray(payload.rows) ? payload.rows : null;
  if (!rows || rows.length === 0) {
    throw new Error("agent storage insertAll requires non-empty rows array");
  }
  const ids = rows.map((entry) => {
    const row = normalizeStoredMessageForPersistence(entry);
    const inserted = storage.tableInsert({ row: row });
    const insertedID = Number(inserted && inserted.id);
    if (!Number.isFinite(insertedID) || insertedID <= 0) {
      throw new Error("agent storage insertAll insert did not return id");
    }
    return insertedID;
  });
  return { ok: true, ids: ids };
}

function trimSelectedRowsByMaxChars(rows, maxChars) {
  const limit = Number(maxChars);
  if (!Number.isFinite(limit) || limit <= 0 || !Array.isArray(rows)) {
    return rows;
  }
  const working = rows.map((row, index) => ({
    row: clone(row),
    index: index,
  }));
  const serializedLength = () => JSON.stringify(working.map((entry) => entry.row)).length;
  while (working.length > 0 && serializedLength() > limit) {
    let removeIndex = 0;
    let oldestID = Number.POSITIVE_INFINITY;
    let foundFiniteID = false;
    for (let index = 0; index < working.length; index += 1) {
      const candidateID = Number(working[index] && working[index].row && working[index].row.id);
      if (!Number.isFinite(candidateID)) continue;
      if (!foundFiniteID || candidateID < oldestID) {
        oldestID = candidateID;
        removeIndex = index;
        foundFiniteID = true;
      }
    }
    if (!foundFiniteID) {
      removeIndex = 0;
    }
    working.splice(removeIndex, 1);
  }
  return working
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.row);
}

function executeSelect(payload, storage) {
  const rows = storage.tableSelect(payload).map((entry) => normalizeStoredRowEnvelope(entry));
  return trimSelectedRowsByMaxChars(rows, payload.maxChars);
}

function executeSelectContext(payload, storage) {
  const messages = storage.tableSelect(payload)
    .map((entry) => normalizeStoredRowEnvelope(entry))
    .map((entry) => normalizeStoredMessageForContext(entry && entry.row))
    .filter(Boolean);
  return trimSelectedRowsByMaxChars(messages, payload.maxChars);
}

function normalizeStoredContextRowEnvelope(entry) {
  const envelope = normalizeStoredRowEnvelope(entry);
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    return null;
  }
  const message = normalizeStoredMessageForContext(envelope.row);
  if (!message) {
    return null;
  }
  const next = {
    id: clone(envelope.id),
    created: clone(envelope.created),
    updated: clone(envelope.updated),
    row: message,
  };
  if (Object.prototype.hasOwnProperty.call(envelope, "turn")) {
    next.turn = clone(envelope.turn);
  }
  return next;
}

function executeSelectContextRows(payload, storage) {
  const rows = storage.tableSelect(payload)
    .map((entry) => normalizeStoredContextRowEnvelope(entry))
    .filter(Boolean);
  return trimSelectedRowsByMaxChars(rows, payload.maxChars);
}

function executeUpdate(payload, storage) {
  const where = validateWhereObject(payload.where, "agent storage update requires where object");
  const hasRow = Object.prototype.hasOwnProperty.call(payload, "row");
  const hasValues = Object.prototype.hasOwnProperty.call(payload, "values");
  if (hasRow === hasValues) {
    throw new Error("agent storage update requires exactly one of row or values");
  }
  if (hasRow) {
    const row = normalizeStoredMessageForPersistence(payload.row);
    return storage.tableUpdate({ where: where, row: row });
  }
  const values = normalizeStoredMessagePatch(payload.values);
  if (Object.keys(values).length === 0) {
    throw new Error("agent storage update requires values object");
  }
  return storage.tableUpdate({ where: where, values: values });
}

function executeDelete(payload, storage) {
  const where = validateWhereObject(payload.where, "agent storage delete requires where object");
  return storage.tableDelete({ where: where });
}

function executeWriteStream(payload, storage) {
  const event = ensureObject(payload.event, "agent storage writeStream requires event object");
  const sessionId = normalizeString(event.id);
  if (!sessionId) {
    throw new Error("agent storage writeStream event requires id");
  }
  const phase = normalizeString(event.phase).toLowerCase();
  if (!phase) {
    throw new Error("agent storage writeStream event requires phase");
  }
  const namespace = streamNamespace(storage.table);
  const stored = storage.kvGet(namespace, sessionId);
  const state = stored && typeof stored === "object" && !Array.isArray(stored) ? clone(stored) : {};
  const content = Object.prototype.hasOwnProperty.call(event, "content") ? event.content : undefined;
  const isTerminalFailure = phase === "error" || phase === "cancel";
  if (isTerminalFailure && content != null) {
    throw new Error("agent storage writeStream terminal events do not support content");
  }
  const canPersistContent = content && typeof content === "object" && !Array.isArray(content);
  if (canPersistContent) {
    const reply = mergeStreamContent(state.reply, content);
    state.reply = reply;
    if (!(typeof state.id === "number" && Number.isFinite(state.id))) {
      const inserted = storage.tableInsert({ row: reply });
      const insertedID = Number(inserted && inserted.id);
      if (!Number.isFinite(insertedID) || insertedID <= 0) {
        throw new Error("agent storage writeStream insert did not return id");
      }
      state.id = insertedID;
    } else {
      const updated = storage.tableUpdate({
        where: { id: state.id },
        row: reply,
      });
      if (!updated || updated.ok !== true) {
        throw new Error("agent storage writeStream update failed");
      }
      if (Number(updated.rowsAffected) <= 0) {
        const inserted = storage.tableInsert({ row: reply });
        const insertedID = Number(inserted && inserted.id);
        if (!Number.isFinite(insertedID) || insertedID <= 0) {
          throw new Error("agent storage writeStream insert did not return id");
        }
        state.id = insertedID;
      }
    }
    storage.kvSet(namespace, sessionId, state);
  } else if (content != null) {
    throw new Error("agent storage writeStream content must be an object");
  }
  if (phase === "end" || phase === "error" || phase === "cancel") {
    storage.kvDelete(namespace, sessionId);
  }
  const output = { ok: true };
  if (typeof state.id === "number" && Number.isFinite(state.id)) {
    output.id = state.id;
  }
  return output;
}

function agentStorageControl(payload, host) {
  const config = payload.config || {};
  const rawInput = payload && Object.prototype.hasOwnProperty.call(payload, "input") ? payload.input : undefined;
  // Agent now appends round-boundary messages directly. Accepting a plain message
  // array here removes the old need for wrapper script controls that translated
  // message arrays into { action:"insertAll", rows:[...] }.
  const input = Array.isArray(rawInput)
    ? { action: "insertAll", rows: rawInput }
    : payloadInputObject(payload, "agent storage expects object input");
  const action = normalizeString(input.action).toLowerCase();
  if (!action) return wrapError("agent storage requires action");
  const access = normalizeAccessList(config.access, ["read", "write", "delete"]);
  const accessError = enforceActionAccess(action, access, "agent storage");
  if (accessError) return accessError;
  try {
    const storage = storageDispatch(config, payload.control, host);
    switch (action) {
      case "insert":
        return wrapValue(executeInsert(input, storage));
      case "insertall":
        return wrapValue(executeInsertAll(input, storage));
      case "select": {
        const kind = normalizeString(input.kind).toLowerCase();
        if (kind === "raw") return wrapValue(executeSelect(input, storage));
        if (kind === "context") return wrapValue(executeSelectContext(input, storage));
        if (kind === "contextrows") return wrapValue(executeSelectContextRows(input, storage));
        return wrapError('agent storage select requires kind "raw", "context", or "contextRows"');
      }
      case "update":
        return wrapValue(executeUpdate(input, storage));
      case "delete":
        return wrapValue(executeDelete(input, storage));
      case "writestream":
        return wrapValue(executeWriteStream(input, storage));
      default:
        return wrapError('agent storage: unknown action "' + action + '"');
    }
  } catch (error) {
    return wrapError(normalizeString(error && error.message) || String(error));
  }
}

function configNumber(config, key, fallback) {
  const value = Number(configValue(config, key));
  return Number.isFinite(value) ? value : fallback;
}

function configBoolean(config, key, fallback) {
  const value = configValue(config, key);
  if (typeof value === "boolean") return value;
  if (value == null) return fallback;
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function rawString(value) {
  return String(value == null ? "" : value);
}

function configuredControlId(config, key) {
  return configString(config, key);
}

function invokeConfiguredControl(config, key, input, host, label, options = {}) {
  const controlId = configuredControlId(config, key);
  if (!controlId) {
    if (options.optional === true) return null;
    throw new Error(label + " control is not configured");
  }
  const request = {
    controlId: controlId,
    input: clone(input),
  };
  if (options.quiet === true) request.quiet = true;
  const invoked = host.graph.invoke(request);
  if (!invoked || invoked.ok !== true) {
    throw new Error(normalizeString(invoked && invoked.error && invoked.error.message) || (label + " control failed"));
  }
  const output = clone(invoked.output);
  if (isObject(output) && isObject(output.error)) {
    throw new Error(normalizeString(output.error.message) || (label + " control failed"));
  }
  return output;
}

function agentContextControl(payload, host) {
  const config = payload.config || {};
  const input = payloadInputObject(payload, "agent context expects object input");
  const memoryMetadataKey = "anthoriContext";
  const memoryKind = "session_memory";
  const previousSummaryKind = "context_compact_summary";
  const maxRows = Math.max(1, Math.floor(configNumber(config, "maxRows", 2000)));
  const maxMemoryRows = Math.max(1, Math.floor(configNumber(config, "maxMemoryRows", 50)));
  const maxChars = Number(input.maxChars);
  const forceCompact = input.forceCompact === true;
  const contextBudget = Number.isFinite(maxChars) && maxChars > 0 ? maxChars : 0;
  const compactThreshold = contextBudget > 0 ? Math.floor(contextBudget * 0.9) : 0;
  const minTailChars = contextBudget > 0 ? Math.min(Math.max(2000, Math.floor(contextBudget * 0.12)), Math.floor(contextBudget * 0.45), 24000) : 0;
  const targetTailChars = contextBudget > 0 ? Math.min(Math.max(minTailChars, Math.floor(contextBudget * 0.35), 8000), Math.floor(contextBudget * 0.6)) : 0;
  const maxTailChars = contextBudget > 0 ? Math.max(targetTailChars, Math.floor(contextBudget * 0.55)) : 0;
  const minTailTextMessages = 6;
  const summaryInputBudget = contextBudget > 0 ? Math.max(8000, Math.floor(contextBudget * 0.6)) : 120000;
  const restoreRecentReads = configBoolean(config, "restoreRecentReads", true);
  const maxRestoredFiles = Math.max(0, Math.floor(configNumber(config, "maxRestoredFiles", 5)));
  const restoredFileBudget = contextBudget > 0 ? Math.min(50000, Math.max(8000, Math.floor(contextBudget * 0.18))) : 50000;
  const restoredFilePerFileChars = maxRestoredFiles > 0 ? Math.min(20000, Math.max(4000, Math.floor(restoredFileBudget / maxRestoredFiles))) : 0;

  function rowId(entry) {
    const id = Number(entry && entry.id);
    return Number.isFinite(id) ? id : 0;
  }

  function rowMessage(entry) {
    return isObject(entry && entry.row) ? entry.row : null;
  }

  function contextMetadataFromMessage(message) {
    const metadata = isObject(message && message.metadata) ? message.metadata[memoryMetadataKey] : null;
    return isObject(metadata) ? metadata : null;
  }

  function contextMetadata(entry) {
    return contextMetadataFromMessage(rowMessage(entry));
  }

  function isSessionMemoryRow(entry) {
    const metadata = contextMetadata(entry);
    return metadata && metadata.kind === memoryKind;
  }

  function isContextMemoryRow(entry) {
    const metadata = contextMetadata(entry);
    const kind = metadata && metadata.kind;
    return kind === memoryKind || kind === previousSummaryKind;
  }

  function normalizeRowsForContext(rows) {
    return asArray(rows).map((entry) => normalizeStoredMessageForContext(rowMessage(entry))).filter(Boolean);
  }

  function contextChars(messages) {
    return JSON.stringify(asArray(messages)).length;
  }

  function responseRows(response) {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response && response.rows)) return response.rows;
    return [];
  }

  function selectedRowsFrom(configKey, kind, limit, required) {
    const output = invokeConfiguredControl(config, configKey, {
      action: "select",
      kind: kind,
      orderBy: [{ field: "id", direction: "asc" }],
      where: {},
      limit: limit,
    }, host, configKey, { optional: required !== true });
    return responseRows(output).slice().sort((left, right) => rowId(left) - rowId(right));
  }

  function selectedHistoryRows() {
    const rows = selectedRowsFrom("historyControl", "contextRows", maxRows, true);
    return rows.filter((entry) => !isContextMemoryRow(entry));
  }

  function selectedMemoryRows() {
    if (!configuredControlId(config, "memoryControl")) return [];
    return selectedRowsFrom("memoryControl", "raw", maxMemoryRows, false).filter(isSessionMemoryRow);
  }

  function memoryCompactedThroughId(memoryRow) {
    const metadata = contextMetadata(memoryRow);
    const id = Number(metadata && metadata.compactedThroughId);
    return Number.isFinite(id) && id > 0 ? id : 0;
  }

  function latestSessionMemoryRow() {
    const rows = selectedMemoryRows();
    rows.sort((left, right) => {
      const leftThrough = memoryCompactedThroughId(left);
      const rightThrough = memoryCompactedThroughId(right);
      if (leftThrough !== rightThrough) return leftThrough - rightThrough;
      return rowId(left) - rowId(right);
    });
    return rows.length > 0 ? rows[rows.length - 1] : null;
  }

  function toolCallIds(message) {
    const ids = [];
    for (const toolCall of asArray(message && message.toolCalls)) {
      const id = normalizeString(toolCall && toolCall.id);
      if (id) ids.push(id);
    }
    for (const part of asArray(message && message.parts)) {
      if (normalizeString(part && part.kind).toLowerCase() !== "tool_call") continue;
      const id = normalizeString(part && part.toolCall && part.toolCall.id);
      if (id) ids.push(id);
    }
    return ids;
  }

  function toolResultIds(message) {
    const role = normalizeString(message && message.role).toLowerCase();
    const id = normalizeString(message && message.toolCallId);
    return role === "tool" && id ? [id] : [];
  }

  function messageText(message) {
    return asArray(message && message.parts)
      .map((part) => normalizeString(part && part.text))
      .filter(Boolean)
      .join("\n");
  }

  function toolCallsForMessage(message) {
    const toolCalls = [];
    for (const toolCall of asArray(message && message.toolCalls)) {
      if (isObject(toolCall)) toolCalls.push(toolCall);
    }
    for (const part of asArray(message && message.parts)) {
      if (normalizeString(part && part.kind).toLowerCase() !== "tool_call") continue;
      if (isObject(part && part.toolCall)) toolCalls.push(part.toolCall);
    }
    return toolCalls;
  }

  function adjustTailStartForToolPairs(rows, startIndex) {
    let adjusted = Math.max(0, startIndex);
    for (;;) {
      const tailMessages = normalizeRowsForContext(rows.slice(adjusted));
      const tailToolCalls = new Set(tailMessages.flatMap(toolCallIds));
      const needed = new Set(tailMessages.flatMap(toolResultIds).filter((id) => !tailToolCalls.has(id)));
      if (needed.size === 0 || adjusted === 0) return adjusted;
      let moved = false;
      for (let index = adjusted - 1; index >= 0; index -= 1) {
        const message = normalizeStoredMessageForContext(rowMessage(rows[index]));
        if (!message) continue;
        if (toolCallIds(message).some((id) => needed.has(id))) {
          adjusted = index;
          moved = true;
          break;
        }
      }
      if (!moved) return adjusted;
    }
  }

  function chooseTailStart(rows) {
    if (targetTailChars <= 0 || rows.length <= 1) return 0;
    let start = rows.length - 1;
    let lastUserIndex = -1;
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const message = normalizeStoredMessageForContext(rowMessage(rows[index]));
      if (message && message.role === "user" && messageText(message)) {
        lastUserIndex = index;
        break;
      }
    }
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const messages = normalizeRowsForContext(rows.slice(index));
      const chars = contextChars(messages);
      const textMessages = messages.filter((message) => messageText(message)).length;
      const includesLastUser = lastUserIndex < 0 || index <= lastUserIndex;
      start = index;
      if (chars >= minTailChars && textMessages >= minTailTextMessages && includesLastUser) {
        if (chars >= targetTailChars || chars >= maxTailChars) break;
      }
    }
    return adjustTailStartForToolPairs(rows, start);
  }

  const defaultCompactPrompt = [
    "Summarize the earlier part of this coding-agent conversation so a future assistant can continue without losing important state.",
    "",
    "Preserve concrete facts: user goals, decisions, constraints, file paths, code locations, commands, tool results, errors, offsets, current hypotheses, and unfinished next steps.",
    "Do not include generic filler. Do not invent details. If a detail may matter later, keep it.",
  ].join("\n");

  function compactPrompt(transcript) {
    const configuredPrompt = normalizeString(config && config.compactPrompt) || defaultCompactPrompt;
    if (configuredPrompt.includes("{{transcript}}")) {
      return configuredPrompt.replace(/\{\{\s*transcript\s*\}\}/g, transcript);
    }
    return [configuredPrompt, "", "Transcript to summarize:", transcript].join("\n");
  }

  function parseToolArguments(toolCall) {
    const raw = toolCall && (toolCall.arguments != null ? toolCall.arguments : toolCall.args != null ? toolCall.args : toolCall.input != null ? toolCall.input : toolCall.parameters);
    if (isObject(raw)) return raw;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return isObject(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }
    return {};
  }

  function shortValue(value) {
    let text = "";
    if (Array.isArray(value)) {
      text = value.map(shortValue).filter(Boolean).join(", ");
    } else if (isObject(value)) {
      text = JSON.stringify(value);
    } else {
      text = normalizeString(value);
    }
    text = text.replace(/\s+/g, " ").trim();
    return text.length > 220 ? text.slice(0, 217) + "..." : text;
  }

  function firstArgument(args, keys) {
    for (const key of keys) {
      const value = args[key];
      const text = shortValue(value);
      if (text) return text;
    }
    return "";
  }

  function numberArgument(args, keys) {
    for (const key of keys) {
      const value = Number(args[key]);
      if (Number.isFinite(value) && value > 0) return value;
    }
    return 0;
  }

  function formatToolCallForTranscript(toolCall) {
    const id = normalizeString(toolCall && toolCall.id);
    const name = normalizeString(toolCall && toolCall.name) || "tool";
    const args = parseToolArguments(toolCall);
    const argsText = Object.keys(args).length > 0 ? " " + shortValue(args) : "";
    const idText = id ? id + " " : "";
    return (idText + name + argsText).trim();
  }

  function transcriptLine(message, index) {
    const lines = ["[" + (index + 1) + "] " + message.role];
    const text = messageText(message);
    if (text) lines.push(text);
    const calls = toolCallsForMessage(message);
    if (calls.length > 0) {
      lines.push("tool_calls:");
      for (const toolCall of calls.slice(0, 20)) {
        lines.push("- " + formatToolCallForTranscript(toolCall));
      }
      if (calls.length > 20) lines.push("- ... " + (calls.length - 20) + " more tool call(s)");
    }
    if (message.role === "tool") {
      lines.push(("tool_result_for: " + (message.toolCallId || "") + " " + (message.name || "")).trim());
    }
    return lines.join("\n");
  }

  function describeToolCallForRestore(toolCall) {
    const name = normalizeString(toolCall && toolCall.name).toLowerCase();
    const args = parseToolArguments(toolCall);
    const path = firstArgument(args, ["path", "file", "filePath", "file_path", "dir", "directory"]);
    const query = firstArgument(args, ["query", "pattern", "text", "glob"]);
    const range = firstArgument(args, ["offset", "line", "startLine", "endLine", "limit", "lines"]);
    if (["read", "read_file", "read-file", "read_lines", "read-lines"].includes(name)) {
      const suffix = range ? " (" + range + ")" : "";
      return path ? { section: "Recent file reads", text: path + suffix } : null;
    }
    if (["find", "search", "grep", "rg"].includes(name)) {
      const target = path ? path + ": " : "";
      const text = query || shortValue(args);
      return text ? { section: "Recent searches", text: target + text } : null;
    }
    if (["list", "ls"].includes(name)) {
      return path ? { section: "Recent directory lists", text: path } : null;
    }
    if (["load_tools", "load-tools", "loadtools"].includes(name)) {
      const tools = firstArgument(args, ["tools", "toolIds", "ids", "names", "loadIds"]) || shortValue(args);
      return tools ? { section: "Loaded tool(s)", text: tools } : null;
    }
    return null;
  }

  function readDescriptorFromToolCall(toolCall) {
    const name = normalizeString(toolCall && toolCall.name).toLowerCase();
    if (!["read", "read_file", "read-file", "read_lines", "read-lines"].includes(name)) return null;
    const args = parseToolArguments(toolCall);
    const path = firstArgument(args, ["path", "file", "filePath", "file_path"]);
    if (!path) return null;
    const startLine = numberArgument(args, ["startLine", "start_line", "line"]);
    const endLine = numberArgument(args, ["endLine", "end_line"]);
    const offset = numberArgument(args, ["offset", "startOffset", "start_offset"]);
    const limit = numberArgument(args, ["limit", "bytes", "maxBytes", "max_bytes"]);
    const kind = name.includes("line") || startLine > 0 || endLine > 0 ? "lines" : "file";
    return {
      kind: kind,
      path: path,
      startLine: startLine,
      endLine: endLine,
      offset: offset,
      limit: limit,
    };
  }

  function descriptorKey(descriptor) {
    return [
      normalizeString(descriptor && descriptor.kind).toLowerCase(),
      normalizeString(descriptor && descriptor.path).toLowerCase(),
      Number(descriptor && descriptor.startLine) || 0,
      Number(descriptor && descriptor.endLine) || 0,
      Number(descriptor && descriptor.offset) || 0,
      Number(descriptor && descriptor.limit) || 0,
    ].join(":");
  }

  function readPathsFromMessages(messages) {
    const paths = new Set();
    for (const message of asArray(messages)) {
      for (const toolCall of toolCallsForMessage(message)) {
        const descriptor = readDescriptorFromToolCall(toolCall);
        if (!descriptor) continue;
        paths.add(normalizeString(descriptor.path).toLowerCase());
      }
    }
    return paths;
  }

  function recentReadDescriptors(rows, preservedRows, limit) {
    if (!restoreRecentReads || limit <= 0) return [];
    const preservedPaths = readPathsFromMessages(normalizeRowsForContext(preservedRows));
    const descriptors = [];
    const seen = new Set();
    const messages = normalizeRowsForContext(rows);
    for (let index = messages.length - 1; index >= 0 && descriptors.length < limit; index -= 1) {
      for (const toolCall of toolCallsForMessage(messages[index])) {
        const descriptor = readDescriptorFromToolCall(toolCall);
        if (!descriptor) continue;
        if (preservedPaths.has(normalizeString(descriptor.path).toLowerCase())) continue;
        const key = descriptorKey(descriptor);
        if (seen.has(key)) continue;
        seen.add(key);
        descriptors.unshift(descriptor);
        if (descriptors.length >= limit) break;
      }
    }
    return descriptors;
  }

  function readOutputText(value) {
    if (typeof value === "string") return value;
    if (isObject(value && value.output)) return readOutputText(value.output);
    if (typeof (value && value.output) === "string") return value.output;
    if (typeof (value && value.content) === "string") return value.content;
    if (Array.isArray(value && value.lines)) {
      return value.lines.map((line) => rawString(line.number) + ":" + rawString(line.text)).join("\n");
    }
    return normalizeString(value);
  }

  function readRestoredFile(descriptor, remainingChars) {
    const path = normalizeString(descriptor && descriptor.path);
    if (!path || remainingChars <= 0 || !restoreRecentReads) return null;
    try {
      const fs = host && host.fs ? host.fs : null;
      const maxChars = Math.min(restoredFilePerFileChars, remainingChars);
      let output = "";
      if (descriptor.kind === "lines" && fs && typeof fs.readLines === "function") {
        const request = {
          path: path,
          dangerous: true,
          format: "{{#lines}}{{lineNumber}}:{{line}}\n{{/lines}}",
        };
        if (descriptor.startLine > 0) request.startLine = descriptor.startLine;
        if (descriptor.endLine > 0) request.endLine = descriptor.endLine;
        output = readOutputText(fs.readLines(request));
      } else if (fs && typeof fs.read === "function") {
        const request = {
          path: path,
          dangerous: true,
          encoding: "utf8",
          limit: Math.max(1, Math.floor(maxChars)),
          format: "{{content}}",
        };
        if (descriptor.offset > 0) request.offset = descriptor.offset;
        if (descriptor.limit > 0) request.limit = Math.min(request.limit, descriptor.limit);
        output = readOutputText(fs.read(request));
      } else {
        return null;
      }
      let content = rawString(output);
      const truncated = content.length > maxChars;
      if (truncated) content = content.slice(0, maxChars) + "\n[... restored file content truncated for context budget ...]";
      return {
        path: path,
        descriptor: clone(descriptor),
        content: content,
        chars: content.length,
        truncated: truncated,
      };
    } catch (error) {
      return {
        path: path,
        descriptor: clone(descriptor),
        content: "[restore failed: " + (normalizeString(error && error.message) || String(error)) + "]",
        chars: 0,
        truncated: false,
        error: true,
      };
    }
  }

  function restoredFileContentMessage(memoryMessage, preservedMessages) {
    if (!restoreRecentReads || maxRestoredFiles <= 0) return null;
    const metadata = contextMetadataFromMessage(memoryMessage);
    const descriptors = asArray(metadata && metadata.restoredFiles).filter(isObject);
    if (descriptors.length === 0) return null;
    const preservedPaths = readPathsFromMessages(preservedMessages);
    const restored = [];
    let usedChars = 0;
    for (const descriptor of descriptors.slice(-maxRestoredFiles)) {
      if (preservedPaths.has(normalizeString(descriptor.path).toLowerCase())) continue;
      const result = readRestoredFile(descriptor, restoredFileBudget - usedChars);
      if (!result) continue;
      restored.push(result);
      usedChars += result.content.length;
      if (usedChars >= restoredFileBudget) break;
    }
    if (restored.length === 0) return null;
    const lines = [
      "Post-compact restored file content. These are fresh bounded reads of files that were important before compaction.",
    ];
    for (const file of restored) {
      const range = file.descriptor.kind === "lines"
        ? " lines " + (file.descriptor.startLine || 1) + "-" + (file.descriptor.endLine || "end")
        : "";
      lines.push("", "### " + file.path + range, "```", file.content, "```");
    }
    return {
      role: "user",
      parts: [{ kind: "text", text: lines.join("\n") }],
    };
  }

  function withRestoredFileContent(messages, memorySourceMessage) {
    const working = asArray(messages).filter(Boolean);
    if (working.length === 0) return working;
    const first = working[0];
    const source = memorySourceMessage || first;
    const metadata = contextMetadataFromMessage(source);
    if (!metadata || metadata.kind !== memoryKind) return working;
    const restoreMessage = restoredFileContentMessage(source, working.slice(1));
    return restoreMessage ? [first, restoreMessage].concat(working.slice(1)) : working;
  }

  function uniqueRecent(values, limit) {
    const seen = new Set();
    const result = [];
    for (let index = values.length - 1; index >= 0 && result.length < limit; index -= 1) {
      const value = normalizeString(values[index]);
      const key = value.toLowerCase();
      if (!value || seen.has(key)) continue;
      seen.add(key);
      result.unshift(value);
    }
    return result;
  }

  function restoredContextForRows(rows) {
    const sections = new Map([
      ["Recent file reads", []],
      ["Recent searches", []],
      ["Recent directory lists", []],
      ["Loaded tool(s)", []],
    ]);
    for (const message of normalizeRowsForContext(rows)) {
      for (const toolCall of toolCallsForMessage(message)) {
        const detail = describeToolCallForRestore(toolCall);
        if (!detail) continue;
        const section = sections.get(detail.section);
        if (section) section.push(detail.text);
      }
    }
    const lines = [];
    for (const [section, values] of sections) {
      const recent = uniqueRecent(values, 8);
      if (recent.length === 0) continue;
      lines.push(section + ":");
      for (const value of recent) {
        lines.push("- " + value);
      }
    }
    return lines.join("\n");
  }

  function clampTranscript(text, limit) {
    if (!Number.isFinite(limit) || limit <= 0 || text.length <= limit) return text;
    const marker = "\n\n[... middle of compacted transcript omitted to fit the summarizer context budget ...]\n\n";
    const side = Math.max(1000, Math.floor((limit - marker.length) / 2));
    return text.slice(0, side) + marker + text.slice(text.length - side);
  }

  function transcriptForRows(rows) {
    const messages = normalizeRowsForContext(rows);
    const transcript = messages.map(transcriptLine).join("\n\n");
    return clampTranscript(transcript, summaryInputBudget);
  }

  function providerText(response) {
    const direct = normalizeString((response && response.text) || (response && response.reply) || (response && response.output) || (response && response.content));
    if (direct) return direct;
    return asArray(response && response.parts)
      .map((part) => normalizeString(part && part.text))
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  function summarizeRows(rows) {
    const prompt = compactPrompt(transcriptForRows(rows));
    const response = invokeConfiguredControl(config, "providerControl", {
      input: {
        messages: [
          {
            role: "user",
            parts: [{ kind: "text", text: prompt }],
          },
        ],
      },
      reasoning: "none",
    }, host, "providerControl");
    const summary = providerText(response);
    if (!summary) throw new Error("context compaction provider returned no summary text");
    return summary;
  }

  function compactSummaryMessage(summary, restoreText, throughId, summarizedCount, preservedFromId, metadata) {
    const text = [
      "This session is being continued from compacted context. The memory below covers the earlier portion of the conversation.",
      "",
      "Summary:",
      summary,
    ];
    if (restoreText) {
      text.push("", "Restored context:", restoreText);
    }
    text.push("", "Recent messages are preserved verbatim.");
    const contextMetadataValue = {
      kind: memoryKind,
      version: 2,
      compactedThroughId: throughId,
      summarizedMessages: summarizedCount,
      preservedFromId: preservedFromId,
      createdAt: new Date().toISOString(),
    };
    for (const [key, value] of Object.entries(metadata || {})) {
      contextMetadataValue[key] = clone(value);
    }
    return {
      role: "user",
      parts: [
        {
          kind: "text",
          text: text.join("\n"),
        },
      ],
      metadata: {
        [memoryMetadataKey]: contextMetadataValue,
      },
    };
  }

  function insertMemoryMessage(message) {
    if (!configuredControlId(config, "memoryControl")) {
      throw new Error("memoryControl is required when compaction writes session memory");
    }
    return invokeConfiguredControl(config, "memoryControl", { action: "insert", row: message }, host, "memoryControl");
  }

  function repairToolPairs(messages) {
    const results = new Set(asArray(messages).flatMap(toolResultIds));
    const calls = new Set(asArray(messages).flatMap(toolCallIds));
    const repaired = [];
    for (const message of asArray(messages)) {
      if (!isObject(message)) continue;
      if (message.role === "tool") {
        const id = normalizeString(message.toolCallId);
        if (id && !calls.has(id)) continue;
        repaired.push(message);
        continue;
      }
      if (message.role === "agent" && asArray(message.toolCalls).length > 0) {
        const next = clone(message);
        next.toolCalls = asArray(next.toolCalls).filter((toolCall) => {
          const id = normalizeString(toolCall && toolCall.id);
          return !id || results.has(id);
        });
        if (next.toolCalls.length === 0) {
          delete next.toolCalls;
        }
        if (asArray(next.parts).length === 0 && asArray(next.attachments).length === 0 && asArray(next.toolCalls).length === 0) continue;
        repaired.push(next);
        continue;
      }
      repaired.push(message);
    }
    return repaired;
  }

  function trimToBudget(messages) {
    let working = repairToolPairs(messages);
    if (contextBudget <= 0 || contextChars(working) <= contextBudget) return working;
    const first = working[0];
    const keepFirst = normalizeString(first && first.parts && first.parts[0] && first.parts[0].text).startsWith("This session is being continued from compacted context");
    while (working.length > (keepFirst ? 2 : 1) && contextChars(working) > contextBudget) {
      working.splice(keepFirst ? 1 : 0, 1);
      working = repairToolPairs(working);
    }
    return working;
  }

  try {
    const latestMemory = latestSessionMemoryRow();
    const previousThroughId = memoryCompactedThroughId(latestMemory);
    const historyRows = selectedHistoryRows();
    const liveRows = historyRows.filter((entry) => rowId(entry) > previousThroughId);
    const memoryMessage = latestMemory ? normalizeStoredMessageForContext(rowMessage(latestMemory)) : null;
    const activeMessages = [memoryMessage].concat(normalizeRowsForContext(liveRows)).filter(Boolean);
    const activeContext = withRestoredFileContent(activeMessages, latestMemory ? rowMessage(latestMemory) : null);

    if (!forceCompact && (compactThreshold <= 0 || contextChars(activeContext) <= compactThreshold || liveRows.length <= 2)) {
      return wrapValue(trimToBudget(activeContext));
    }

    const tailStart = chooseTailStart(liveRows);
    const rowsToSummarize = liveRows.slice(0, tailStart);
    const tailRows = liveRows.slice(tailStart);

    if (rowsToSummarize.length === 0) {
      return wrapValue(trimToBudget(activeContext));
    }

    const throughId = rowsToSummarize.reduce((max, entry) => Math.max(max, rowId(entry)), previousThroughId);
    const preservedFromId = tailRows.length > 0 ? rowId(tailRows[0]) : 0;
    const preservedThroughId = tailRows.length > 0 ? rowId(tailRows[tailRows.length - 1]) : 0;
    const rowsForSummary = latestMemory ? [latestMemory].concat(rowsToSummarize) : rowsToSummarize;
    const restoredFiles = recentReadDescriptors(rowsToSummarize, tailRows, maxRestoredFiles);
    const restoreText = restoredContextForRows(rowsToSummarize);
    const summary = summarizeRows(rowsForSummary);
    const summaryMessage = compactSummaryMessage(summary, restoreText, throughId, rowsToSummarize.length, preservedFromId, {
      previousCompactedThroughId: previousThroughId,
      summarizedFromId: rowsToSummarize.length > 0 ? rowId(rowsToSummarize[0]) : 0,
      summarizedThroughId: throughId,
      preservedThroughId: preservedThroughId,
      preservedSegment: {
        headRowId: preservedFromId,
        tailRowId: preservedThroughId,
        anchorKind: memoryKind,
        model: "row-id",
      },
      contextBudget: contextBudget,
      compactThreshold: compactThreshold,
      forceCompact: forceCompact,
      reason: normalizeString(input.reason),
      summaryInputChars: contextChars(normalizeRowsForContext(rowsForSummary)),
      summaryOutputChars: summary.length,
      restoredFiles: restoredFiles,
      restoreBudgetChars: restoredFileBudget,
    });

    insertMemoryMessage(summaryMessage);

    const compactedContext = withRestoredFileContent([normalizeStoredMessageForContext(summaryMessage)].concat(normalizeRowsForContext(tailRows)).filter(Boolean), summaryMessage);
    return wrapValue(trimToBudget(compactedContext));
  } catch (error) {
    return wrapError(normalizeString(error && error.message) || String(error));
  }
}

module.exports = {
  "agent-storage-control": agentStorageControl,
  "agent-context-control": agentContextControl,
};
