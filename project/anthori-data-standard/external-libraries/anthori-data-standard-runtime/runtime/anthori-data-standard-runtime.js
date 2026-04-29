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

function callData(action, payload, host) {
  const data = host && host.data ? host.data : null;
  if (!data || typeof data.call !== "function") {
    throw new Error("host.data.call unavailable");
  }
  return { output: data.call(action, inputValue(payload)) };
}

module.exports = {
  "collection-control": function (payload, host) { return callData("collection", payload, host); },
  "config-control": function (payload, host) { return callData("config", payload, host); },
};
