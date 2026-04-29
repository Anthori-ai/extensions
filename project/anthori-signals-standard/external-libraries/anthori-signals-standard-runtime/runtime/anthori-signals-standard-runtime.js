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

function callSignal(action, payload, host) {
  const signal = host && host.signal ? host.signal : null;
  if (!signal || typeof signal.call !== "function") {
    throw new Error("host.signal.call unavailable");
  }
  return { output: signal.call(action, inputValue(payload)) };
}

module.exports = {
  "alarm-control": function (payload, host) { return callSignal("alarm", payload, host); },
  "timer-control": function (payload, host) { return callSignal("timer", payload, host); },
  "shutdown-control": function (payload, host) { return callSignal("shutdown", payload, host); },
};
