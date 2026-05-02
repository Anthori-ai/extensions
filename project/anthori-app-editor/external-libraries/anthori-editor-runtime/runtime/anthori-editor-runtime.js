"use strict";

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    const next = {};
    for (const [key, entry] of Object.entries(value)) next[key] = clone(entry);
    return next;
  }
  return value;
}

function inputValue(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (!Object.prototype.hasOwnProperty.call(payload, "input")) return null;
  return clone(payload.input);
}

function callEditor(method, payload, host) {
  const editor = host && host.editor ? host.editor : null;
  if (!editor || typeof editor[method] !== "function") {
    throw new Error("host.editor." + method + " unavailable");
  }
  return { output: editor[method](inputValue(payload)) };
}

module.exports = {
  "list-scripts": function (payload, host) { return callEditor("listScripts", payload, host); },
  "create-script": function (payload, host) { return callEditor("createScript", payload, host); },
  "update-script": function (payload, host) { return callEditor("updateScript", payload, host); },
  "delete-script": function (payload, host) { return callEditor("deleteScript", payload, host); },
};
