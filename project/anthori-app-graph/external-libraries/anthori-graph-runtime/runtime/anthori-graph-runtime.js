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

function callGraph(method, payload, host) {
  const graph = host && host.graph ? host.graph : null;
  if (!graph || typeof graph[method] !== "function") {
    throw new Error("host.graph." + method + " unavailable");
  }
  return { output: graph[method](inputValue(payload)) };
}

function graphInput(payload) {
  const input = inputValue(payload);
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const next = clone(input);
  return next;
}

function graphOutput(value) {
  return value;
}

function callGraphControl(method, payload, host) {
  const graph = host && host.graph ? host.graph : null;
  if (!graph || typeof graph[method] !== "function") {
    throw new Error("host.graph." + method + " unavailable");
  }
  return { output: graphOutput(graph[method](graphInput(payload))) };
}

module.exports = {
  "create-control": function (payload, host) { return callGraphControl("createControl", payload, host); },
  "delete-control": function (payload, host) { return callGraphControl("deleteControl", payload, host); },
  "list-controls": function (payload, host) { return callGraphControl("listControls", payload, host); },
  "update-control": function (payload, host) { return callGraphControl("updateControl", payload, host); },
  "list-control-fields": function (payload, host) { return callGraphControl("listControlFields", payload, host); },
  "create-control-field": function (payload, host) { return callGraphControl("createControlField", payload, host); },
  "update-control-field": function (payload, host) { return callGraphControl("updateControlField", payload, host); },
  "delete-control-field": function (payload, host) { return callGraphControl("deleteControlField", payload, host); },
  "create-conduit": function (payload, host) { return callGraph("createConduit", payload, host); },
  "delete-conduit": function (payload, host) { return callGraph("deleteConduit", payload, host); },
  "list-conduits": function (payload, host) { return callGraph("listConduits", payload, host); },
  "update-conduit": function (payload, host) { return callGraph("updateConduit", payload, host); },
  "create-conduit-color": function (payload, host) { return callGraph("createConduitColor", payload, host); },
  "delete-conduit-color": function (payload, host) { return callGraph("deleteConduitColor", payload, host); },
  "list-conduit-colors": function (payload, host) { return callGraph("listConduitColors", payload, host); },
  "read-layout": function (payload, host) { return callGraph("readLayout", payload, host); },
  "write-layout": function (payload, host) { return callGraph("writeLayout", payload, host); },
  "move-control": function (payload, host) { return callGraphControl("moveControl", payload, host); },
  "list-history": function (payload, host) { return callGraph("listHistory", payload, host); },
  "history-info": function (payload, host) { return callGraph("historyInfo", payload, host); },
  "revert": function (payload, host) { return callGraph("revert", payload, host); },
};
