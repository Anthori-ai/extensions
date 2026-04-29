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

function configValue(config, key) {
  if (!config || typeof config !== "object") return undefined;
  return config[key];
}

function configString(config, key) {
  return normalizeString(configValue(config, key));
}

function payloadInputObject(payload, message) {
  return ensureObject(payload && payload.input, message);
}

function resolveNamespace(config, control) {
  return configString(config, "namespace") || normalizeString(control && control.id);
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
  if (allowed.size > 0) {
    return Array.from(allowed);
  }
  return Array.isArray(fallback) ? fallback.slice() : [];
}

function kvAccessForAction(action) {
  switch (action) {
    case "get":
      return "read";
    case "set":
    case "clear":
      return "write";
    case "delete":
      return "delete";
    default:
      return "";
  }
}

function tableAccessForAction(action) {
  switch (action) {
    case "select":
      return "read";
    case "insert":
    case "update":
      return "write";
    case "delete":
      return "delete";
    default:
      return "";
  }
}

function enforceActionAccess(action, access, resolveRequiredAccess, label) {
  const required = normalizeString(resolveRequiredAccess(action)).toLowerCase();
  if (!required) return null;
  if (Array.isArray(access) && access.includes(required)) return null;
  const allowed = Array.isArray(access) && access.length > 0 ? access.join(", ") : "none";
  return wrapError(label + ' access "' + allowed + '" does not allow action "' + action + '"');
}

function parsePositiveInteger(raw, message) {
  if (raw == null || raw === "") return { ok: false, value: 0 };
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (Math.floor(raw) !== raw || raw <= 0) throw new Error(message);
    return { ok: true, value: raw };
  }
  if (typeof raw === "string") {
    const trimmed = normalizeString(raw);
    if (!trimmed) return { ok: false, value: 0 };
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || Math.floor(parsed) !== parsed || parsed <= 0) throw new Error(message);
    return { ok: true, value: parsed };
  }
  throw new Error(message);
}

function resolveEntryTurn(payload, fieldName, label) {
  const entry = payload[fieldName];
  if (entry == null) return { ok: false, value: 0 };
  const entryObject = ensureObject(entry, label + " " + fieldName + " must be an object");
  return parsePositiveInteger(entryObject.turn, label + " " + fieldName + ".turn must be numeric");
}

function resolvePayloadTurn(payload, fieldName, label) {
  const payloadTurn = parsePositiveInteger(payload.turn, label + " turn must be numeric");
  const entryTurn = resolveEntryTurn(payload, fieldName, label);
  if (payloadTurn.ok && entryTurn.ok && payloadTurn.value !== entryTurn.value) {
    throw new Error(label + " turn does not match " + fieldName + ".turn");
  }
  if (payloadTurn.ok) return payloadTurn;
  if (entryTurn.ok) return entryTurn;
  return { ok: false, value: 0 };
}

function invokeProviderControl(providerControlId, request, host, label) {
  const invoked = host.graph.invoke({
    controlId: providerControlId,
    input: request,
  });
  if (!invoked || invoked.ok !== true) {
    throw new Error(normalizeString(invoked && invoked.error && invoked.error.message) || (label + " provider control failed"));
  }
  return wrapValue(invoked.output);
}

function executeKV(providerId, scope, namespace, payload, host) {
  const action = normalizeString(payload.action).toLowerCase();
  if (!action) return wrapError("state storage requires action");
  switch (action) {
    case "get": {
      const key = normalizeString(payload.key);
      if (!key) return wrapError("state storage get requires key");
      return wrapValue(host.storage.kv.get({ providerId, scope, namespace, key }));
    }
    case "set": {
      const key = normalizeString(payload.key);
      if (!key) return wrapError("state storage set requires key");
      if (!Object.prototype.hasOwnProperty.call(payload, "value")) return wrapError("state storage set requires value");
      const request = { providerId, scope, namespace, key, value: clone(payload.value) };
      if (Object.prototype.hasOwnProperty.call(payload, "turn")) request.turn = payload.turn;
      return wrapValue(host.storage.kv.set(request));
    }
    case "delete": {
      const key = normalizeString(payload.key);
      if (!key) return wrapError("state storage delete requires key");
      return wrapValue(host.storage.kv.delete({ providerId, scope, namespace, key }));
    }
    case "clear":
      return wrapValue(host.storage.kv.clear({ providerId, scope, namespace }));
    default:
      return wrapError('state storage: unknown action "' + action + '"');
  }
}

function executeTable(providerId, scope, table, payload, host) {
  const action = normalizeString(payload.action).toLowerCase();
  if (!action) return wrapError("table storage requires action");
  switch (action) {
    case "insert": {
      const row = clone(payload.row);
      ensureObject(row, "table storage insert requires row object");
      return wrapValue(host.storage.table.insert({ providerId, scope, table, row }));
    }
    case "select":
      return wrapValue(host.storage.table.select({
        providerId,
        scope,
        table,
        where: clone(payload.where || {}),
        orderBy: clone(payload.orderBy || []),
        limit: payload.limit,
      }));
    case "update": {
      const where = clone(payload.where || {});
      if (!where || typeof where !== "object" || Array.isArray(where) || Object.keys(where).length === 0) {
        return wrapError("table storage update requires where object");
      }
      const hasRow = Object.prototype.hasOwnProperty.call(payload, "row");
      const hasValues = Object.prototype.hasOwnProperty.call(payload, "values");
      if (hasRow === hasValues) {
        return wrapError("table storage update requires exactly one of row or values");
      }
      if (hasRow) {
        const row = clone(payload.row);
        ensureObject(row, "table storage update requires row object");
        return wrapValue(host.storage.table.update({ providerId, scope, table, where, row }));
      }
      const values = clone(payload.values);
      if (!values || typeof values !== "object" || Array.isArray(values) || Object.keys(values).length === 0) {
        return wrapError("table storage update requires values object");
      }
      return wrapValue(host.storage.table.update({ providerId, scope, table, where, values }));
    }
    case "delete": {
      const where = clone(payload.where || {});
      if (!where || typeof where !== "object" || Array.isArray(where) || Object.keys(where).length === 0) {
        return wrapError("table storage delete requires where object");
      }
      return wrapValue(host.storage.table.delete({ providerId, scope, table, where }));
    }
    default:
      return wrapError('table storage: unknown action "' + action + '"');
  }
}

function kvControl(payload, host) {
  const config = payload.config || {};
  const namespace = resolveNamespace(config, payload.control);
  if (!namespace) return wrapError("state storage requires namespace");
  const scope = resolveScope(config, "session");
  const input = payloadInputObject(payload, "state storage expects object input");
  const action = normalizeString(input.action).toLowerCase();
  const access = normalizeAccessList(config.access, ["read", "write", "delete"]);
  const accessError = enforceActionAccess(action, access, kvAccessForAction, "state storage");
  if (accessError) return accessError;
  if (resolveBackend(config) === "provider") {
    const providerControl = configString(config, "providerControl");
    if (!providerControl) return wrapError("state storage provider backend requires providerControl");
    return invokeProviderControl(providerControl, {
      namespace,
      scope,
      ...clone(input),
    }, host, "state storage");
  }
  return executeKV("", scope, namespace, input, host);
}

function tableControl(payload, host) {
  const config = payload.config || {};
  const scope = resolveScope(config, "session");
  const table = configString(config, "table") || normalizeString(payload.control && payload.control.id);
  if (!table) return wrapError("table storage requires table");
  const input = payloadInputObject(payload, "table storage expects object input");
  const action = normalizeString(input.action).toLowerCase();
  const access = normalizeAccessList(config.access, ["read", "write", "delete"]);
  const accessError = enforceActionAccess(action, access, tableAccessForAction, "table storage");
  if (accessError) return accessError;
  if (resolveBackend(config) === "provider") {
    const providerControl = configString(config, "providerControl");
    if (!providerControl) return wrapError("table storage provider backend requires providerControl");
    return invokeProviderControl(providerControl, {
      scope,
      table,
      ...clone(input),
    }, host, "table storage");
  }
  return executeTable("", scope, table, input, host);
}

function providerControl(payload, host) {
  const config = payload.config || {};
  const providerRef = configString(config, "providerRef");
  if (!providerRef) return wrapError("storage provider requires providerRef");
  const input = ensureObject(payload.input, "storage provider expects object input");
  const namespace = normalizeString(input.namespace);
  const scope = normalizeString(input.scope) || "session";
  const table = normalizeString(input.table);
  const action = normalizeString(input.action).toLowerCase();
  if (!action) return wrapError("storage provider requires input.action");
  if (action === "insert" || action === "select" || action === "update" || action === "delete") {
    if (!table) return wrapError("storage provider requires table for table actions");
    return executeTable(providerRef, scope, table, input, host);
  }
  if (!namespace) return wrapError("storage provider requires namespace");
  return executeKV(providerRef, scope, namespace, input, host);
}

module.exports = {
  "kv-control": kvControl,
  "table-control": tableControl,
  "provider-control": providerControl,
};
