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

function callSystem(action, payload, host) {
  const system = host && host.system ? host.system : null;
  if (!system || typeof system.call !== "function") {
    throw new Error("host.system.call unavailable");
  }
  return { output: system.call(action, inputValue(payload)) };
}

module.exports = {
  "send": function(payload, host) { return callSystem("notification.send", payload, host); },
};
