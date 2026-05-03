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
        return wrapError('agent storage select requires kind "raw" or "context"');
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

module.exports = {
  "agent-storage-control": agentStorageControl,
};
