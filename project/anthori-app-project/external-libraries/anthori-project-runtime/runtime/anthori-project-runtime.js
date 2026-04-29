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

function callProject(method, payload, host) {
  const project = host && host.project ? host.project : null;
  if (!project || typeof project[method] !== "function") {
    throw new Error("host.project." + method + " unavailable");
  }
  return { output: project[method](inputValue(payload)) };
}

module.exports = {
  "create": function (payload, host) { return callProject("create", payload, host); },
  "copy": function (payload, host) { return callProject("copy", payload, host); },
  "delete": function (payload, host) { return callProject("delete", payload, host); },
  "export": function (payload, host) { return callProject("export", payload, host); },
  "import": function (payload, host) { return callProject("import", payload, host); },
  "list": function (payload, host) { return callProject("list", payload, host); },
  "rename": function (payload, host) { return callProject("rename", payload, host); },
  "workspace": function (payload, host) { return callProject("workspace", payload, host); },
  "settings": function (payload, host) { return callProject("settings", payload, host); },
};
