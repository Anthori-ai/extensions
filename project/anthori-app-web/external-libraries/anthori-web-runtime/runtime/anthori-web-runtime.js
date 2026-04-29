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

function callWeb(action, payload, host) {
  const web = host && host.web ? host.web : null;
  if (!web || typeof web.call !== "function") {
    throw new Error("host.web.call unavailable");
  }
  return { output: web.call(action, inputValue(payload)) };
}

module.exports = {
  "assistant": function (payload, host) { return callWeb("assistant", payload, host); },
  "back": function (payload, host) { return callWeb("back", payload, host); },
  "click": function (payload, host) { return callWeb("click", payload, host); },
  "close": function (payload, host) { return callWeb("close", payload, host); },
  "download": function (payload, host) { return callWeb("download", payload, host); },
  "eval": function (payload, host) { return callWeb("eval", payload, host); },
  "find": function (payload, host) { return callWeb("find", payload, host); },
  "focus": function (payload, host) { return callWeb("focus", payload, host); },
  "forward": function (payload, host) { return callWeb("forward", payload, host); },
  "html": function (payload, host) { return callWeb("html", payload, host); },
  "keys": function (payload, host) { return callWeb("keys", payload, host); },
  "layout": function (payload, host) { return callWeb("layout", payload, host); },
  "list": function (payload, host) { return callWeb("list", payload, host); },
  "load": function (payload, host) { return callWeb("load", payload, host); },
  "element": function (payload, host) { return callWeb("element", payload, host); },
  "open": function (payload, host) { return callWeb("open", payload, host); },
  "refresh": function (payload, host) { return callWeb("refresh", payload, host); },
  "scroll": function (payload, host) { return callWeb("scroll", payload, host); },
  "search": function (payload, host) { return callWeb("search", payload, host); },
  "select": function (payload, host) { return callWeb("select", payload, host); },
  "snapshot": function (payload, host) { return callWeb("snapshot", payload, host); },
  "tab": function (payload, host) { return callWeb("tab", payload, host); },
  "text": function (payload, host) { return callWeb("text", payload, host); },
  "tree": function (payload, host) { return callWeb("tree", payload, host); },
  "type": function (payload, host) { return callWeb("type", payload, host); },
  "wait": function (payload, host) { return callWeb("wait", payload, host); },
};
