"use strict";

const DEFAULT_GUIDE_PATHS = [
  "client/src/webui/help.html",
  "docs/index.html",
  "docs/architecture.html",
];

const FALLBACK_GUIDE = [
  "Anthori Guide",
  "",
  "Bundled docs are not available in this runtime yet, so this is a fallback summary.",
  "",
  "Anthori is a local-first control-graph execution environment for building assistants, tools, and automations.",
  "Projects hold graphs and related state. Sessions are isolated execution contexts inside a project.",
  "The main panels to know are Projects, Library, Inspector, Chat, Log, Debug, Providers, and Workspace.",
  "Use Library to add controls, Inspector to configure the selected control, Chat for normal conversation output, Log to inspect traversal, and Debug to inspect paused runtime state.",
  "Most assistant-style graphs use Provider-backed Agent controls plus Output or Stream controls.",
].join("\n");

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    const next = {};
    for (const [key, entry] of Object.entries(value)) next[key] = clone(entry);
    return next;
  }
  return value;
}

function hasOwn(object, key) {
  return !!object && typeof object === "object" && Object.prototype.hasOwnProperty.call(object, key);
}

function stringValue(value) {
  return String(value == null ? "" : value).trim();
}

function inputValue(payload) {
  if (!payload || typeof payload !== "object" || !hasOwn(payload, "input")) return null;
  return clone(payload.input);
}

function callSession(method, payload, host) {
  const session = host?.session;
  if (!session || typeof session[method] !== "function") {
    throw new Error("host.session." + method + " unavailable");
  }
  return { output: session[method](inputValue(payload)) };
}

function callUI(action, payload, host) {
  const ui = host?.ui;
  if (!ui || typeof ui.call !== "function") {
    throw new Error("host.ui.call unavailable");
  }
  return { output: ui.call(action, inputValue(payload)) };
}

function docsHost(host) {
  const docs = host?.docs;
  if (!docs) {
    throw new Error("host.docs unavailable");
  }
  if (typeof docs.list !== "function" || typeof docs.read !== "function" || typeof docs.search !== "function") {
    throw new Error("host.docs.list/read/search unavailable");
  }
  return docs;
}

function topicValue(payload) {
  const input = inputValue(payload);
  if (typeof input === "string") return stringValue(input);
  if (!input || typeof input !== "object") return "";
  return stringValue(input.topic || input.query || input.question);
}

function normalizeItems(result) {
  if (!result || typeof result !== "object" || !Array.isArray(result.items)) return [];
  return result.items.filter((entry) => entry && typeof entry === "object");
}

function truncateText(text, maxChars) {
  const value = stringValue(text);
  if (!value || maxChars <= 0) return "";
  const chars = Array.from(value);
  if (chars.length <= maxChars) return value;
  return chars.slice(0, maxChars).join("") + "...";
}

function formatDocLabel(item) {
  const title = stringValue(item.title) || "Document";
  const path = stringValue(item.path);
  if (!path) return title;
  return title + " [" + path + "]";
}

function buildGuideSummary(docs) {
  const listed = normalizeItems(docs.list({}));
  const lines = [
    "Anthori Guide",
    "",
    "This response is sourced from bundled Anthori docs exposed through host.docs.list/read/search.",
    "",
    "Available bundled docs:",
  ];

  for (const item of listed) {
    lines.push("- " + formatDocLabel(item));
  }

  for (const path of DEFAULT_GUIDE_PATHS) {
    const doc = docs.read({ path });
    if (!doc || typeof doc !== "object") continue;
    lines.push("");
    lines.push("## " + formatDocLabel(doc));
    lines.push(truncateText(doc.text, 1800));
  }

  return lines.join("\n");
}

function buildGuideSearch(docs, topic) {
  const results = normalizeItems(docs.search({
    query: topic,
    limit: 6,
  }));

  const lines = [
    "Anthori Guide",
    "",
    'Focused topic: "' + topic + '"',
    "",
  ];

  if (results.length === 0) {
    lines.push("No bundled docs matched that topic. Returning the default guide instead.");
    lines.push("");
    lines.push(buildGuideSummary(docs));
    return lines.join("\n");
  }

  lines.push("Top matching bundled docs and snippets:");
  for (const item of results) {
    lines.push("");
    lines.push("## " + formatDocLabel(item));
    lines.push(truncateText(item.snippet, 900));
  }
  return lines.join("\n");
}

function buildAnthoriGuide(payload, host) {
  let docs = null;
  try {
    docs = docsHost(host);
  } catch (_error) {
    return FALLBACK_GUIDE;
  }
  const topic = topicValue(payload);
  if (!topic) {
    return buildGuideSummary(docs);
  }
  return buildGuideSearch(docs, topic);
}

const actions = [
  "anthoriGuide",
  "showBubble",
  "setAssistantActive",
  "setAssistantEmotion",
  "setAssistantTalking",
  "worldOverview",
  "windowInspect",
  "targetInspect",
  "regionInspect",
  "focusWindow",
  "moveToWindow",
  "pointerState",
  "pointerMove",
  "pointerClick",
  "pointerDrag",
  "pointerScroll",
  "typeText",
  "pressKey",
  "pressKeyChord",
  "watchCreate",
  "watchRead",
  "watchWait",
  "watchDispose",
  "runSteps"
];

const api = {
  askQuestion: function (payload, host) {
    return callSession("ask", payload, host);
  },
  anthoriGuide: function (payload, host) {
    return { output: buildAnthoriGuide(payload, host) };
  },
};

for (const action of actions) {
  if (action === "anthoriGuide") continue;
  api[action] = function (payload, host) {
    return callUI(action, payload, host);
  };
}

module.exports = api;
