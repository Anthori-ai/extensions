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

function graphActionsInput(payload) {
  const input = inputValue(payload);
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const next = clone(input);
  if (!Array.isArray(next.actions)) return next;
  next.actions = next.actions.map(function (action) {
    if (!action || typeof action !== "object" || Array.isArray(action)) return action;
    const normalized = clone(action);
    return normalized;
  });
  return next;
}

function graphActionsOutput(value) {
  return value;
}

function callGraphActions(payload, host) {
  const graph = host && host.graph ? host.graph : null;
  if (!graph || typeof graph.controlActions !== "function") {
    throw new Error("host.graph.controlActions unavailable");
  }
  return { output: graphActionsOutput(graph.controlActions(graphActionsInput(payload))) };
}

function callGraphControl(method, payload, host) {
  const graph = host && host.graph ? host.graph : null;
  if (!graph || typeof graph[method] !== "function") {
    throw new Error("host.graph." + method + " unavailable");
  }
  return { output: graphOutput(graph[method](graphInput(payload))) };
}

module.exports = {
  "actions": function (payload, host) { return callGraphActions(payload, host); },
  "create-control": function (payload, host) { return callGraphControl("createControl", payload, host); },
  "delete-control": function (payload, host) { return callGraphControl("deleteControl", payload, host); },
  "list-controls": function (payload, host) { return callGraphControl("listControls", payload, host); },
  "create-conduit": function (payload, host) { return callGraph("createConduit", payload, host); },
  "delete-conduit": function (payload, host) { return callGraph("deleteConduit", payload, host); },
  "list-conduits": function (payload, host) { return callGraph("listConduits", payload, host); },
  "move-control": function (payload, host) { return callGraphControl("moveControl", payload, host); },
};
