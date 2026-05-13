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

module.exports = {
  "read-diagram-layout": function (payload, host) { return callGraph("readDiagramLayout", payload, host); },
  "set-diagram-layout": function (payload, host) { return callGraph("setDiagramLayout", payload, host); },
  "list-diagrams": function (payload, host) { return callGraph("listDiagrams", payload, host); },
  "read-diagram": function (payload, host) { return callGraph("readDiagram", payload, host); },
  "review-diagram": function (payload, host) { return callGraph("reviewDiagram", payload, host); },
  "validate-diagram": function (payload, host) { return callGraph("validateDiagram", payload, host); },
  "propose-diagram-changes": function (payload, host) { return callGraph("proposeDiagramChanges", payload, host); },
  "create-diagram": function (payload, host) { return callGraph("createDiagram", payload, host); },
  "update-diagram": function (payload, host) { return callGraph("updateDiagram", payload, host); },
  "create-diagram-control": function (payload, host) { return callGraph("createDiagramControl", payload, host); },
  "update-diagram-control": function (payload, host) { return callGraph("updateDiagramControl", payload, host); },
  "delete-diagram-control": function (payload, host) { return callGraph("deleteDiagramControl", payload, host); },
  "create-diagram-conduit": function (payload, host) { return callGraph("createDiagramConduit", payload, host); },
  "update-diagram-conduit": function (payload, host) { return callGraph("updateDiagramConduit", payload, host); },
  "delete-diagram-conduit": function (payload, host) { return callGraph("deleteDiagramConduit", payload, host); },
};
