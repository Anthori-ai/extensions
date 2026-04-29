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

function callDisplay(action, payload, host) {
  const display = host && host.display ? host.display : null;
  if (!display || typeof display.call !== "function") {
    throw new Error("host.display.call unavailable");
  }
  return { output: display.call(action, inputValue(payload)) };
}

module.exports = {
  "list": function (payload, host) { return callDisplay("list", payload, host); },
  "screenshot": function (payload, host) { return callDisplay("screenshot", payload, host); },
  "type": function (payload, host) { return callDisplay("type", payload, host); },
  "keycodes": function (payload, host) { return callDisplay("keycodes", payload, host); },
  "key-down": function (payload, host) { return callDisplay("keyDown", payload, host); },
  "key-up": function (payload, host) { return callDisplay("keyUp", payload, host); },
  "key-chord": function (payload, host) { return callDisplay("keyChord", payload, host); },
  "mouse-move": function (payload, host) { return callDisplay("mouseMove", payload, host); },
  "mouse-click": function (payload, host) { return callDisplay("mouseClick", payload, host); },
  "mouse-drag": function (payload, host) { return callDisplay("mouseDrag", payload, host); },
  "mouse-scroll": function (payload, host) { return callDisplay("mouseScroll", payload, host); },
};
