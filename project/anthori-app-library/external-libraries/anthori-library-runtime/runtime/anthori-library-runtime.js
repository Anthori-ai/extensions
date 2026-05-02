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

function callLibrary(method, payload, host) {
  const library = host && host.library ? host.library : null;
  if (!library || typeof library[method] !== "function") {
    throw new Error("host.library." + method + " unavailable");
  }
  return { output: library[method](inputValue(payload)) };
}

module.exports = {
  "list": function (payload, host) { return callLibrary("listControls", payload, host); },
  "info": function (payload, host) { return callLibrary("info", payload, host); },
};
