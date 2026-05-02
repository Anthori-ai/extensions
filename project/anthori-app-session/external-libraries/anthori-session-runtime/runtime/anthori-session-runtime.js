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

function callSession(method, payload, host) {
  const session = host && host.session ? host.session : null;
  if (!session || typeof session[method] !== "function") {
    throw new Error("host.session." + method + " unavailable");
  }
  return { output: session[method](inputValue(payload)) };
}

module.exports = {
  "start": function (payload, host) { return callSession("start", payload, host); },
  "stop": function (payload, host) { return callSession("stop", payload, host); },
  "list": function (payload, host) { return callSession("list", payload, host); },
  "create": function (payload, host) { return callSession("create", payload, host); },
  "delete": function (payload, host) { return callSession("delete", payload, host); },
};
