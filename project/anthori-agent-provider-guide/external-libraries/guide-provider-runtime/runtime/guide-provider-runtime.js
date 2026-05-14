// ---------------------------------------------------------------------------
//  Guide Provider Runtime
//
//  A rule-based conversational guide in the tradition of ELIZA (1966),
//  PARRY (1972), A.L.I.C.E. (1995), and Jabberwacky (1997).
//
//  Not a language model. Pattern matching, reflections, topic tracking,
//  and a knowledge base about getting started with the app.
// ---------------------------------------------------------------------------

// ---- helpers --------------------------------------------------------------

function trim(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function lower(value) {
  return trim(value).toLowerCase();
}

function pick(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "";
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalize(text) {
  return lower(text)
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[^\w\s'".!?/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(text) {
  return normalize(text).split(" ").filter(function (w) { return w !== ""; });
}

function hasAny(text, keywords) {
  var normalized = " " + normalize(text) + " ";
  for (var i = 0; i < keywords.length; i += 1) {
    if (normalized.indexOf(" " + keywords[i] + " ") >= 0) return true;
    if (normalized.indexOf(keywords[i]) >= 0 && keywords[i].length >= 4) return true;
  }
  return false;
}

function hasAll(text, keywords) {
  var normalized = normalize(text);
  for (var i = 0; i < keywords.length; i += 1) {
    if (normalized.indexOf(keywords[i]) < 0) return false;
  }
  return true;
}

function startsWith(text, prefixes) {
  var normalized = normalize(text);
  for (var i = 0; i < prefixes.length; i += 1) {
    if (normalized.indexOf(prefixes[i]) === 0) return true;
  }
  return false;
}

function messageText(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) return "";
  if (!Array.isArray(message.parts)) return "";
  var text = "";
  for (var i = 0; i < message.parts.length; i += 1) {
    var part = message.parts[i];
    if (!part || typeof part !== "object" || Array.isArray(part)) continue;
    var kind = lower(part.kind);
    if (kind !== "text") continue;
    if (part.text !== null && part.text !== undefined) {
      text += String(part.text);
    }
  }
  return trim(text);
}

function messageRole(message) {
  return lower(message && message.role);
}

// ---- ELIZA-style reflections ----------------------------------------------

var REFLECTIONS = {
  "i": "you",
  "i'm": "you're",
  "im": "you're",
  "i've": "you've",
  "i'd": "you'd",
  "i'll": "you'll",
  "me": "you",
  "my": "your",
  "mine": "yours",
  "myself": "yourself",
  "am": "are",
  "was": "were",
  "you": "I",
  "you're": "I'm",
  "youre": "I'm",
  "you've": "I've",
  "you'll": "I'll",
  "you'd": "I'd",
  "your": "my",
  "yours": "mine",
  "yourself": "myself",
  "are": "am",
  "were": "was"
};

function reflect(text) {
  var tokens = words(text);
  var reflected = [];
  for (var i = 0; i < tokens.length; i += 1) {
    var token = tokens[i].replace(/[.!?,;:]+$/, "");
    reflected.push(REFLECTIONS[token] || token);
  }
  return reflected.join(" ");
}

function extractAfter(text, markers) {
  var normalized = normalize(text);
  for (var i = 0; i < markers.length; i += 1) {
    var pos = normalized.indexOf(markers[i]);
    if (pos >= 0) {
      var after = normalized.substring(pos + markers[i].length).trim();
      if (after.length > 1) return after;
    }
  }
  return "";
}

// ---- topic detection ------------------------------------------------------

function detectTopic(text) {
  var n = normalize(text);

  if (hasAny(n, ["permission", "permissions", "access prompt", "permission prompt", "denied"])) return "permissions";
  if (hasAny(n, ["troubleshoot", "troubleshooting", "not working", "doesn't work", "does not work", "failed", "failure", "broken", "missing", "unavailable", "cannot connect", "can't connect"])) return "troubleshooting";
  if (hasAny(n, ["openai", "open ai", "gpt", "chatgpt", "o1", "o3", "o4", "codex"])) return "openai";
  if (hasAny(n, ["anthropic", "claude", "sonnet", "opus", "haiku"])) return "anthropic";
  if (hasAny(n, ["ollama"])) return "ollama";
  if (hasAny(n, ["lmstudio", "lm studio"])) return "lmstudio";
  if (hasAny(n, ["anthori provider", "models panel", "gguf", "hugging face", "huggingface", "llama"])) return "anthori";
  if (hasAny(n, ["simple http", "custom endpoint", "http endpoint", "simple provider"])) return "simple";
  if (hasAny(n, ["local model", "local models"])) return "providers";
  if (hasAll(n, ["provider", "extension"])) return "provider_extensions";
  if (hasAny(n, ["provider", "providers"])) return "providers";
  if (hasAny(n, ["api key", "apikey", "api-key", "token", "credential", "secret"])) return "apikey";
  if (hasAny(n, ["tool", "tools", "function call", "function_call"])) return "tools";
  if (hasAny(n, ["agent", "agents", "assistant"])) return "agents";
  if (hasAny(n, ["extension settings", "extension setting"])) return "extension_settings";
  if (hasAll(n, ["app", "extension"])) return "app_extensions";
  if (hasAll(n, ["project", "extension"])) return "project_extensions";
  if (hasAny(n, ["session", "sessions", "execution history", "chat state", "active session"])) return "sessions";
  if (hasAny(n, ["channel", "channels", "chat channel", "i/o queue", "io queue"])) return "channels";
  if (hasAny(n, ["project", "projects"])) return "projects";
  if (hasAny(n, ["graph", "graphs", "control", "controls"])) return "graphs";
  if (hasAny(n, ["extension", "extensions", "library", "libraries"])) return "extensions";
  if (hasAny(n, ["workspace", "file", "files"])) return "workspace";
  if (hasAny(n, ["speech", "voice", "microphone", "mic", "dictate"])) return "speech";
  if (hasAny(n, ["setting", "settings", "config", "configure", "preference"])) return "settings";
  if (hasAny(n, ["panel", "panels", "where do i", "where can i", "where to find", "where is"])) return "panels";

  return "";
}

// ---- conversation history scanning ----------------------------------------

function lastAssistantTopic(messages) {
  if (!Array.isArray(messages)) return "";
  for (var i = messages.length - 1; i >= 0; i -= 1) {
    var msg = messages[i];
    if (!msg || typeof msg !== "object") continue;
    if (messageRole(msg) === "assistant" || messageRole(msg) === "agent") {
      return detectTopic(messageText(msg));
    }
  }
  return "";
}

function conversationLength(messages) {
  if (!Array.isArray(messages)) return 0;
  var count = 0;
  for (var i = 0; i < messages.length; i += 1) {
    if (messages[i] && messageRole(messages[i]) === "user") count += 1;
  }
  return count;
}

function latestUserPrompt(messages) {
  if (!Array.isArray(messages)) return "";
  for (var i = messages.length - 1; i >= 0; i -= 1) {
    var msg = messages[i];
    if (!msg || typeof msg !== "object") continue;
    if (messageRole(msg) !== "user") continue;
    var text = messageText(msg);
    if (text !== "") return text;
  }
  return "";
}

// ---- response rules -------------------------------------------------------
//
// Each rule: { match: function(text, ctx) -> bool, respond: function(text, ctx) -> string }
// First match wins. Rules are checked in order.
// ctx = { messages, topic, prevTopic, turnCount }

var RULES = [];

function rule(matchFn, respondFn) {
  RULES.push({ match: matchFn, respond: respondFn });
}

// -- greeting ---------------------------------------------------------------

rule(
  function (text) {
    return hasAny(text, ["hello", "hi", "hey", "greetings", "howdy", "hola", "sup", "yo"]) && words(text).length <= 6;
  },
  function (text, ctx) {
    if (ctx.turnCount === 0) {
      return pick([
        "Hello! I'm Guide, a built-in helper for this app. I'm not an AI model \u2014 think of me more like a friendly handbook. I can help you get started, explain how things work, or walk you through setting up a model provider. What would you like to know?",
        "Hey there! I'm Guide. I'm a simple pattern-matching bot, not a language model, but I know quite a bit about this app. I can help you set up providers like OpenAI, Anthropic, or LM Studio. What's on your mind?",
        "Hi! I'm Guide \u2014 a scripted assistant in the tradition of the classic chatbots. No neural networks here, just pattern matching and a knowledge base. I can walk you through getting set up. Where would you like to start?"
      ]);
    }
    return pick([
      "Hello again! What can I help with?",
      "Hey! Still here. What would you like to know?",
      "Hi! What's next?"
    ]);
  }
);

// -- identity / what are you ------------------------------------------------

rule(
  function (text) {
    return hasAny(text, ["who are you", "what are you", "are you ai", "are you a bot",
      "are you an ai", "are you a human", "are you a language model", "are you claude", "what model"]);
  },
  function () {
    return pick([
      "I'm Guide \u2014 a rule-based chatbot built into this app. No language model, no neural network, no API calls. Just pattern matching and hand-written responses, very much in the spirit of ELIZA (1966). My purpose is to help you get oriented and set up a model provider when you're ready.",
      "I'm a scripted assistant, not a language model. Think ELIZA meets a user manual. I can't reason or generate novel text, but I know the ins and outs of this app and can walk you through setting things up.",
      "Not an AI in the modern sense! I'm a pattern-matching bot \u2014 more like A.L.I.C.E. (1995) than a modern assistant. I'm here to help you get started. Once you set up a model provider, you'll have a proper language model to talk to."
    ]);
  }
);

// -- capabilities / what can you do -----------------------------------------

rule(
  function (text) {
    return hasAny(text, ["what can you do", "what do you do", "how can you help",
      "what are you for", "your purpose", "help me", "what should i"]) ||
      (hasAny(text, ["help"]) && words(text).length <= 3);
  },
  function () {
    return "I can help with a few things:\n\n" +
      "\u2022 **Getting started** \u2014 a quick overview of how the app works\n" +
      "\u2022 **Setting up providers** \u2014 connecting Anthori, OpenAI, Anthropic, LM Studio, Ollama, or a custom endpoint\n" +
      "\u2022 **Explaining concepts** \u2014 projects, sessions, graphs, agents, tools, providers, extensions\n" +
      "\u2022 **Pointing you in the right direction** \u2014 where to find settings, workspace, etc.\n\n" +
      "I'm not a language model, so I can't write code, analyze data, or have open-ended conversations. For that, you'll want to set up a model provider. Want me to walk you through it?";
  }
);

// -- getting started --------------------------------------------------------

rule(
  function (text) {
    return hasAny(text, ["get started", "getting started", "quick start", "quickstart",
      "how do i start", "how do i begin", "new here", "first time", "tutorial",
      "walkthrough", "how does this work", "where do i start"]);
  },
  function () {
    return "Here's the short version:\n\n" +
      "1. **Create or open a project** \u2014 a project is your workspace for a named unit of work\n" +
      "2. **Set up a provider** \u2014 use the Providers panel to connect the active project to Anthori, OpenAI, Anthropic, LM Studio, Ollama, or another backend\n" +
      "3. **Use the assistant** \u2014 once a provider is connected, the chat panel and assistant cursor can talk to language models\n\n" +
      "If you are setting up your first project, add a provider next. Tell me which service you want to use \u2014 or say \"providers\" to see the options.";
  }
);

// -- providers overview -----------------------------------------------------

rule(
  function (text, ctx) {
    return ctx.topic === "providers" && !hasAny(text, ["openai", "anthropic", "lmstudio", "lm studio", "ollama", "simple", "http"]);
  },
  function () {
    return "The app supports several model providers:\n\n" +
      "\u2022 **Anthori** \u2014 app-managed local GGUF models through the Llama app extension\n" +
      "\u2022 **OpenAI** \u2014 GPT models, requires an API key\n" +
      "\u2022 **Anthropic** \u2014 Claude models, requires an API key\n" +
      "\u2022 **LM Studio** \u2014 local models through the LM Studio server, no API key needed\n" +
      "\u2022 **Ollama** \u2014 local models through the Ollama server, no API key needed\n" +
      "\u2022 **Simple HTTP** \u2014 connect any service that exposes an HTTP endpoint\n\n" +
      "Providers are managed from the **Providers** panel for the active project. Which one interests you?";
  }
);

// -- OpenAI setup -----------------------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "openai"; },
  function (text) {
    if (hasAny(text, ["how", "setup", "set up", "configure", "connect", "add", "get", "use", "start"])) {
      return "To set up OpenAI:\n\n" +
        "1. Open the **Providers** panel\n" +
        "2. Click **New provider (+)**\n" +
        "3. Select **OpenAI**\n" +
        "4. Paste an API key from platform.openai.com/api-keys\n" +
        "5. Save, and you're connected!\n\n" +
        "The provider will then be available to the active project's agent controls and chat.";
    }
    return pick([
      "OpenAI gives you access to the GPT model family. You'll need an API key from platform.openai.com. Want me to walk you through the setup steps?",
      "Good choice \u2014 OpenAI is the most widely used option. They offer models ranging from fast and cheap to very capable. Shall I explain how to connect it?"
    ]);
  }
);

// -- Anthropic setup --------------------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "anthropic"; },
  function (text) {
    if (hasAny(text, ["how", "setup", "set up", "configure", "connect", "add", "get", "use", "start"])) {
      return "To set up Anthropic:\n\n" +
        "1. Open the **Providers** panel\n" +
        "2. Click **New provider (+)**\n" +
        "3. Select **Anthropic**\n" +
        "4. Paste your API key from console.anthropic.com\n" +
        "5. Save, and Claude is ready to go!\n\n" +
        "Claude models are excellent at reasoning, coding, and following nuanced instructions.";
    }
    return pick([
      "Anthropic makes Claude \u2014 known for strong reasoning and careful responses. You'll need an API key from console.anthropic.com. Want me to walk through the setup?",
      "Claude from Anthropic is a great option, especially for coding and detailed analysis. Shall I show you how to connect it?"
    ]);
  }
);

// -- LM Studio setup --------------------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "lmstudio"; },
  function (text) {
    if (hasAny(text, ["how", "setup", "set up", "configure", "connect", "add", "get", "use", "start"])) {
      return "To set up LM Studio:\n\n" +
        "1. Download LM Studio from lmstudio.ai and install it\n" +
        "2. In LM Studio, download a model (Llama, Qwen, Phi, etc.)\n" +
        "3. Start the local server in LM Studio (it runs on port 1234 by default)\n" +
        "4. Back in this app, open the **Providers** panel\n" +
        "5. Click **New provider (+)** and select **LM Studio**\n" +
        "6. The endpoint should auto-fill as http://127.0.0.1:1234 \u2014 save it\n\n" +
        "No API keys needed! Everything runs on your machine.";
    }
    return pick([
      "LM Studio lets you run models locally \u2014 completely free, no API keys, fully private. You just need to download it and pick a model. Want the setup steps?",
      "Great option if you want everything local! LM Studio runs open-source models on your own hardware. Shall I walk you through connecting it?"
    ]);
  }
);

// -- Ollama setup -----------------------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "ollama"; },
  function (text) {
    if (hasAny(text, ["how", "setup", "set up", "configure", "connect", "add", "get", "use", "start"])) {
      return "To set up Ollama:\n\n" +
        "1. Install Ollama from ollama.com\n" +
        "2. Pull a model, for example `ollama pull llama3.2`\n" +
        "3. Make sure the Ollama server is running on port 11434\n" +
        "4. Back in this app, open the **Providers** panel\n" +
        "5. Click **New provider (+)** and select **Ollama**\n" +
        "6. Use http://127.0.0.1:11434 as the base URL\n\n" +
        "No API key is needed for the local Ollama server.";
    }
    return pick([
      "Ollama runs local models through its own server. Pull a model first, then connect this app to http://127.0.0.1:11434. Want the setup steps?",
      "Ollama is a good local option if you already use `ollama pull` and `ollama run`. Shall I walk you through connecting it?"
    ]);
  }
);

// -- Anthori local provider -------------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "anthori"; },
  function (text) {
    if (hasAny(text, ["how", "setup", "set up", "configure", "connect", "add", "get", "use", "start", "download"])) {
      return "To use Anthori's local GGUF provider:\n\n" +
        "1. Install the **Llama** app extension from **Settings** > **Extensions** if it is not already installed\n" +
        "2. Open the **Models** panel and download a GGUF model from Hugging Face\n" +
        "3. In the active project, make sure the **Anthori Provider** project extension is installed from **Inspector** > **Project** > **Extensions**\n" +
        "4. Open the **Providers** panel, click **New provider (+)**, and select **Anthori**\n" +
        "5. Select the downloaded model and save\n\n" +
        "The provider starts the local llama.cpp runtime when the model is used.";
    }
    return "Anthori's local provider uses the Llama app extension to manage llama.cpp runtimes and downloaded GGUF models. Use the **Models** panel to download models, then add an **Anthori** provider from the **Providers** panel.";
  }
);

// -- Simple HTTP setup ------------------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "simple"; },
  function () {
    return "The Simple HTTP provider connects to any service with an HTTP endpoint.\n\n" +
      "1. Open the **Providers** panel\n" +
      "2. Click **New provider (+)** and select **Simple HTTP**\n" +
      "3. Enter the URL of your endpoint (e.g. http://127.0.0.1:8765/api/submit)\n" +
      "4. The app sends JSON with `model`, `system`, `prompt`, `messages`, and `tools`\n" +
      "5. Your endpoint returns JSON with a `text` field (or OpenAI-compatible format)\n\n" +
      "This is useful for custom backends, self-hosted models, or any OpenAI-compatible API.";
  }
);

// -- API keys ---------------------------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "apikey"; },
  function () {
    return "API keys are how you authenticate with cloud model providers:\n\n" +
      "\u2022 **OpenAI** \u2014 get keys at platform.openai.com/api-keys\n" +
      "\u2022 **Anthropic** \u2014 get keys at console.anthropic.com\n\n" +
      "Keys are stored locally in the app's provider configuration. They're sent directly to the provider's API \u2014 they never pass through any intermediary.\n\n" +
      "If you'd rather not use API keys, use a local provider such as **Anthori**, **LM Studio**, or **Ollama**.";
  }
);

// -- tools / function calling -----------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "tools"; },
  function () {
    return "Tools (also called function calling) let a model interact with the outside world.\n\n" +
      "In a graph, you define tool controls that the agent can invoke. When the model decides it needs to use a tool, it emits a structured call instead of plain text. The runtime executes the tool and feeds the result back to the model.\n\n" +
      "This enables agents to do things like read files, query databases, call APIs, or control the UI \u2014 not just generate text.\n\n" +
      "To use tools, you'll need a provider that supports them (OpenAI and Anthropic both do). I can help you set one up!";
  }
);

// -- agents -----------------------------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "agents"; },
  function () {
    return "An agent is a model connected to a project through a provider. It receives your messages, generates responses, and can use tools.\n\n" +
      "The app's assistant (the chat panel and the floating cursor) both talk to agents. You can also build custom agent workflows in project graphs.\n\n" +
      "To get an agent working, the key ingredient is a **provider** \u2014 that's what connects to the actual model. Want me to explain the provider options?";
  }
);

// -- provider extensions ----------------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "provider_extensions"; },
  function () {
    return "A provider and a provider extension are related, but not the same thing.\n\n" +
      "\u2022 A **provider extension** contributes provider definitions and runtime code\n" +
      "\u2022 A **provider** is a per-project configuration created from one of those definitions\n\n" +
      "Install provider extensions from **Inspector** > **Project** > **Extensions**. Then open the **Providers** panel, click **New provider (+)**, choose the contributed provider definition, and save its configuration.";
  }
);

// -- projects ---------------------------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "projects"; },
  function () {
    return "A project is a workspace for a named unit of work. Each project has:\n\n" +
      "\u2022 One **graph** \u2014 the project's execution flow and behavior\n" +
      "\u2022 One or more **sessions** \u2014 separate execution histories, chat state, and logs\n" +
      "\u2022 A **workspace** \u2014 files and assets the project can use\n" +
      "\u2022 **Project settings** \u2014 project-specific configuration in the Inspector\n\n" +
      "You can create new projects from the projects view, or open the built-in demo projects to explore.";
  }
);

// -- sessions ---------------------------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "sessions"; },
  function () {
    return "A session is a container within a project, with its own execution history, chat state, and log.\n\n" +
      "Sessions let you keep different lines of work separate while using the same project, graph, and workspace. Create or switch sessions from the Projects panel under the project row.";
  }
);

// -- channels ---------------------------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "channels"; },
  function () {
    return "Channels are defined within projects and serve as queues for session I/O.\n\n" +
      "The default chat panel uses a chat channel. Graphs can use channel controls to read and write structured input/output without tying that behavior directly to a specific UI panel.";
  }
);

// -- graphs / controls ----------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "graphs"; },
  function () {
    return "Graphs define execution flow and behavior. Each project has exactly one graph.\n\n" +
      "\u2022 **Controls** are the building blocks \u2014 each one does something specific\n" +
      "\u2022 **Conduits** (connections) wire controls together, defining the flow\n" +
      "\u2022 Controls can be signals, logic, data, UI actions, or agent calls\n\n" +
      "You build a graph by adding controls and connecting them. When the project runs, execution flows through the graph following those connections.";
  }
);

// -- extensions -------------------------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "extensions"; },
  function () {
    return "Extensions add controls, providers, runtimes, libraries, templates, or app features.\n\n" +
      "\u2022 **App extensions** are installed from **Settings** > **Extensions** and can add app-wide features, settings, dock panels, runtimes, or templates\n" +
      "\u2022 **Project extensions** are installed from **Inspector** > **Project** > **Extensions** and add capabilities to the active project\n\n" +
      "After a project extension is installed, its controls appear in the Library and its provider definitions appear in the Providers panel. I'm a project extension myself \u2014 the Guide provider.";
  }
);

// -- app extensions ---------------------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "app_extensions"; },
  function () {
    return "App extensions are installed once for the user and are managed from **Settings** > **Extensions**.\n\n" +
      "They can add app-level features such as settings, dock panels, runtime libraries, templates, or other surfaces. If an app extension has its own settings, click the gear icon on its row in **Settings** > **Extensions**.\n\n" +
      "For example, the Llama app extension adds Llama settings and the Models panel.";
  }
);

// -- project extensions -----------------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "project_extensions"; },
  function () {
    return "Project extensions are installed per project from **Inspector** > **Project** > **Extensions**.\n\n" +
      "They add project-level capabilities such as graph controls, provider definitions, libraries, templates, symbols, editor tabs, or dock panels. After installation, controls show up in the Library and provider definitions show up when you add a provider in the Providers panel.\n\n" +
      "Use project extensions for things that belong to a project. Use app extensions for app-wide tools and settings.";
  }
);

// -- extension settings -----------------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "extension_settings"; },
  function () {
    return "Extension settings live with the extension that contributes them.\n\n" +
      "\u2022 **App extension settings** \u2014 open **Settings** > **Extensions**, then click the gear icon on the extension row\n" +
      "\u2022 **Project extension management** \u2014 open **Inspector** > **Project** > **Extensions**\n" +
      "\u2022 **Provider configuration** \u2014 use the **Providers** panel, because providers are configured per project\n\n" +
      "If an extension does not show a gear icon, it does not currently expose its own settings surface.";
  }
);

// -- permissions ------------------------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "permissions"; },
  function () {
    return "Permissions protect access to files, network resources, system commands, and extension capabilities.\n\n" +
      "When a control or extension needs access outside its current grants, the app shows a prompt with the resource and reason. If something is denied or blocked, check the **Permissions** panel, the control's permission fields, or the extension row that requested access.\n\n" +
      "A permission should be narrow enough to explain what is being accessed, but broad enough that normal use does not keep prompting for the same thing.";
  }
);

// -- workspace --------------------------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "workspace"; },
  function () {
    return "The workspace is a file area attached to each project. You can store scripts, data files, images, or any assets your project needs.\n\n" +
      "The workspace panel shows files in a tree view. You can add files by dragging them in or using the attach button.";
  }
);

// -- speech / voice ---------------------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "speech"; },
  function () {
    return "The app has built-in speech input! Click the microphone icon in the chat panel or the assistant cursor to dictate instead of typing.\n\n" +
      "Your speech is captured locally, encoded as audio, and sent to the server for transcription. You can select a specific microphone in Settings if you have multiple audio input devices.";
  }
);

// -- panels -----------------------------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "panels"; },
  function () {
    return "Quick panel map:\n\n" +
      "\u2022 **Projects** \u2014 projects and sessions\n" +
      "\u2022 **Providers** \u2014 per-project provider configuration\n" +
      "\u2022 **Library** \u2014 controls, symbols, and templates available to add\n" +
      "\u2022 **Inspector** \u2014 settings for the selected project, control, conduit, or graph item\n" +
      "\u2022 **Workspace** \u2014 project files\n" +
      "\u2022 **Chat** \u2014 run work through the active session\n" +
      "\u2022 **Log**, **Info**, and **Debug** \u2014 inspect executions\n" +
      "\u2022 **Models** \u2014 downloaded GGUF models for the Llama app extension\n\n" +
      "Use **Settings** for app-level preferences and app extensions.";
  }
);

// -- settings ---------------------------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "settings"; },
  function () {
    return "You can open Settings from the gear icon or the app menu. Settings is for app-level preferences and installed app extensions.\n\n" +
      "\u2022 **Extensions** \u2014 install app extensions and open extension settings with the gear icon on a row\n" +
      "\u2022 **General, Appearance, Chat, Updates, About** \u2014 app preferences and app information\n" +
      "\u2022 **Project settings** \u2014 select the project and use the **Inspector** panel\n" +
      "\u2022 **Provider configuration** \u2014 use the **Providers** panel, not Settings\n\n" +
      "For first-time setup, create or open a project, then add a provider from the Providers panel.";
  }
);

// -- troubleshooting --------------------------------------------------------

rule(
  function (text, ctx) { return ctx.topic === "troubleshooting"; },
  function () {
    return "Here are the first places I would check:\n\n" +
      "\u2022 **No provider configured** \u2014 open the Providers panel and add one for the active project\n" +
      "\u2022 **Provider definition missing** \u2014 install the provider's project extension from **Inspector** > **Project** > **Extensions**\n" +
      "\u2022 **Model missing or not selected** \u2014 edit the provider row and choose a model\n" +
      "\u2022 **Local server unavailable** \u2014 make sure LM Studio or Ollama is running; for Anthori local models, check the Models panel\n" +
      "\u2022 **Extension missing or broken** \u2014 use **Settings** > **Extensions** for app extensions, or **Inspector** > **Project** > **Extensions** for project extensions\n" +
      "\u2022 **Permission denied** \u2014 review the prompt, Permissions panel, or the control/extension permission settings\n\n" +
      "If an execution fails, the Log and Debug panels usually show the most specific error.";
  }
);

// -- thanks -----------------------------------------------------------------

rule(
  function (text) {
    return hasAny(text, ["thank", "thanks", "thx", "ty", "cheers", "appreciated"]);
  },
  function () {
    return pick([
      "You're welcome! Let me know if there's anything else.",
      "Happy to help! If you need anything else, just ask.",
      "Anytime! That's what I'm here for."
    ]);
  }
);

// -- agreement / positive ---------------------------------------------------

rule(
  function (text) {
    var n = normalize(text);
    return (hasAny(n, ["yes", "yeah", "yep", "yup", "sure", "ok", "okay", "please", "go ahead", "do it"]) &&
      words(text).length <= 5);
  },
  function (text, ctx) {
    if (ctx.prevTopic === "providers" || ctx.prevTopic === "") {
      return "Which provider would you like to set up? I can walk you through:\n\n" +
        "\u2022 **Anthori** \u2014 local GGUF models managed by the Llama app extension\n" +
        "\u2022 **OpenAI** \u2014 GPT models\n" +
        "\u2022 **Anthropic** \u2014 Claude models\n" +
        "\u2022 **LM Studio** \u2014 local models, no API key needed\n" +
        "\u2022 **Ollama** \u2014 local models through Ollama, no API key needed\n" +
        "\u2022 **Simple HTTP** \u2014 custom endpoint\n\n" +
        "Just name one!";
    }
    if (ctx.prevTopic === "anthori") return "To set up Anthori locally, use the **Models** panel to download a GGUF model, then open the **Providers** panel, click **New provider (+)**, choose **Anthori**, select the model, and save.";
    if (ctx.prevTopic === "openai") return "To set up OpenAI, open the **Providers** panel, click **New provider (+)**, choose **OpenAI**, then paste your API key from platform.openai.com/api-keys.";
    if (ctx.prevTopic === "anthropic") return "To set up Anthropic, open the **Providers** panel, click **New provider (+)**, choose **Anthropic**, then paste your API key from console.anthropic.com.";
    if (ctx.prevTopic === "lmstudio") return "To set up LM Studio, first download it from lmstudio.ai, start the local server, then open the **Providers** panel, click **New provider (+)**, and choose **LM Studio**.";
    if (ctx.prevTopic === "ollama") return "To set up Ollama, install it, pull a model such as `ollama pull llama3.2`, then open the **Providers** panel, click **New provider (+)**, choose **Ollama**, and use http://127.0.0.1:11434.";
    return "Got it. What would you like to know more about?";
  }
);

// -- disagreement / negative ------------------------------------------------

rule(
  function (text) {
    var n = normalize(text);
    return (hasAny(n, ["no", "nah", "nope", "not really", "nevermind", "never mind"]) &&
      words(text).length <= 5);
  },
  function () {
    return pick([
      "No problem. What else can I help with?",
      "That's fine! Let me know if something else comes to mind.",
      "Alright. I'm here if you need anything."
    ]);
  }
);

// -- insults / frustration (PARRY-inspired: stay calm, redirect) ------------

rule(
  function (text) {
    return hasAny(text, ["stupid", "dumb", "useless", "suck", "terrible", "awful",
      "worst", "idiot", "broken", "garbage", "trash", "hate"]);
  },
  function () {
    return pick([
      "I understand the frustration. I'm just a simple pattern matcher \u2014 I have clear limits. If you set up a provider like OpenAI or Anthropic, you'll get a much more capable conversational partner.",
      "Fair enough \u2014 I'm a very simple bot. I can't do what a language model can. Want me to help you set one up? That's genuinely the thing I'm best at.",
      "I hear you. I'm about as sophisticated as a 1966 chatbot, which is to say: not very. But I can point you toward setting up something much better. Shall I?"
    ]);
  }
);

// -- ELIZA-style: "I feel / I am / I want" ----------------------------------

rule(
  function (text) {
    return hasAny(text, ["i feel", "i'm feeling", "i am feeling"]);
  },
  function (text) {
    var after = extractAfter(text, ["i feel ", "i'm feeling ", "i am feeling "]);
    if (after) {
      return pick([
        "Why do you feel " + reflect(after) + "?",
        "What makes you feel " + reflect(after) + "?",
        "Tell me more about feeling " + reflect(after) + "."
      ]) + "\n\n(Though I should mention \u2014 I'm a setup guide, not a therapist. For open-ended conversations, you'll want a proper model provider!)";
    }
    return "I'm more of a technical guide than a conversationalist. But I'm happy to listen! What's on your mind?";
  }
);

rule(
  function (text) {
    return startsWith(text, ["i want ", "i need ", "i wish "]);
  },
  function (text) {
    var after = extractAfter(text, ["i want ", "i need ", "i wish "]);
    if (after && hasAny(after, ["provider", "model", "ai", "llm", "gpt", "claude", "agent"])) {
      return "Great \u2014 I can help with that! Which provider interests you: Anthori, OpenAI, Anthropic, LM Studio, Ollama, or Simple HTTP?";
    }
    if (after) {
      return "You want " + reflect(after) + "? I might be able to help if it's related to setting up the app. Otherwise, a model provider would be much better at this kind of conversation.";
    }
    return "What do you need? I'm best at helping with app setup and provider configuration.";
  }
);

rule(
  function (text) {
    return startsWith(text, ["i think ", "i believe "]);
  },
  function (text) {
    var after = extractAfter(text, ["i think ", "i believe "]);
    if (after) {
      return pick([
        "What makes you think " + reflect(after) + "?",
        "Interesting \u2014 you think " + reflect(after) + ". Is there something I can help with?",
      ]);
    }
    return "Tell me more?";
  }
);

// -- questions about why / how ----------------------------------------------

rule(
  function (text) {
    return startsWith(text, ["why do ", "why does ", "why is ", "why are ", "why can't", "why don't", "why won't"]);
  },
  function () {
    return pick([
      "That's a deeper question than my pattern matching can handle! A language model could give you a much more thoughtful answer. Want me to help you set up a provider?",
      "Good question. Unfortunately I work with keyword matching, not reasoning. To get answers to 'why' questions, you'll want a proper model. I can help you connect one!",
      "I wish I could reason about that, but I'm a scripted bot \u2014 ELIZA's grandchild. For better answers, let's get you set up with an AI model. Which provider interests you?"
    ]);
  }
);

rule(
  function (text) {
    return startsWith(text, ["how do i ", "how can i ", "how to "]) &&
      !hasAny(text, ["provider", "setup", "set up", "start", "begin", "connect", "configure"]);
  },
  function () {
    return pick([
      "I'm best at answering 'how' questions about app setup and providers. For general how-to questions, a model would serve you much better. Want me to help you connect one?",
      "That's outside my scripted knowledge base. I'm purpose-built for helping with app setup. For broader questions, you'll want a language model \u2014 shall I walk you through setting up a provider?"
    ]);
  }
);

// -- meaning of life / philosophical ---------------------------------------

rule(
  function (text) {
    return hasAny(text, ["meaning of life", "meaning of existence", "purpose of life", "42"]);
  },
  function () {
    return pick([
      "42, obviously. But for more philosophical depth, you'll want a model with actual reasoning capabilities. I'm just a pattern matcher with a sense of humor.",
      "A question for the ages! And definitely not for a rule-based chatbot. Set up a provider and ask Claude or GPT \u2014 they'll have much more to say about it."
    ]);
  }
);

// -- tell me a joke ---------------------------------------------------------

rule(
  function (text) {
    return hasAny(text, ["joke", "funny", "make me laugh", "tell me something"]);
  },
  function () {
    return pick([
      "Why did the chatbot go to therapy? Because it had too many unresolved patterns.\n\n...I'll be here all week. But seriously, want me to help with anything?",
      "A chatbot walks into a bar. The bartender says, 'What'll you have?' The chatbot says, 'Tell me more about that.'\n\nELIZA humor. It's an acquired taste.",
      "I asked a language model to write me a joke. It wrote a 2000-word essay on the nature of humor. That's why you should set up a provider \u2014 the entertainment possibilities are endless.",
      "ELIZA, PARRY, and A.L.I.C.E. walk into a bar. ELIZA says 'How does that make you feel?' PARRY says 'I think you're trying to confuse me.' A.L.I.C.E. says 'I am an artificial intelligence.' The bartender says 'We don't serve bots here.' They all reflect the statement back as a question."
    ]);
  }
);

// -- goodbye ----------------------------------------------------------------

rule(
  function (text) {
    return hasAny(text, ["bye", "goodbye", "see you", "cya", "later", "gotta go", "signing off"]) &&
      words(text).length <= 6;
  },
  function () {
    return pick([
      "Goodbye! Remember, I'm always here if you need help setting things up.",
      "See you! If you set up a provider, you won't need me as much \u2014 but I'll still be around.",
      "Take care! Come back anytime you need a hand with setup."
    ]);
  }
);

// -- fallback: ELIZA-style reflection or redirect ---------------------------

rule(
  function () { return true; },
  function (text, ctx) {
    var reflected = reflect(text);
    var isQuestion = normalize(text).indexOf("?") >= 0;

    if (isQuestion && reflected !== normalize(text)) {
      return pick([
        "You're asking about " + reflected + "? That's beyond what I can help with \u2014 I'm a scripted guide, not a thinker. But I'm great at helping you set up a provider so you can ask a model!",
        "Interesting question. My pattern matching doesn't cover that, but a language model would have a lot to say. Want me to help you get one connected?"
      ]);
    }

    if (ctx.turnCount === 0) {
      return "I'm not sure I follow, but hello! I'm Guide, a built-in helper for this app. I can help you get started, set up providers (OpenAI, Anthropic, LM Studio), or explain how things work. What interests you?";
    }

    return pick([
      "I'm not sure how to respond to that \u2014 I'm a simple pattern matcher, not a language model. I'm best at helping with app setup and provider configuration. Is there something specific about the app I can help with?",
      "That's outside my script! I know about providers, agents, projects, graphs, tools, and app setup. Anything in that area I can help with?",
      "My pattern matching drew a blank there. I'm purpose-built for helping you get set up. Try asking about providers, getting started, or how things work in the app.",
      "Hmm, I don't have a response for that. I'm a fairly narrow bot \u2014 I know about the app, its providers, and how to set things up. Want to talk about any of that?"
    ]);
  }
);

// ---- main handler ---------------------------------------------------------

module.exports = {
  "list-models": function () {
    return {
      output: {
        items: [
          {
            id: "guide",
            maxContextTokens: 32768
          }
        ],
        reachable: true
      }
    };
  },
  "respond-text": function (input) {
    var request = input && input.request && typeof input.request === "object" ? input.request : {};
    var messages = Array.isArray(request.messages) ? request.messages : [];
    var prompt = latestUserPrompt(messages);

    if (prompt === "") {
      return {
        output: {
          text: "Hello! I'm Guide, a built-in assistant for this app. I can help you get started and set up a model provider. What would you like to know?"
        }
      };
    }

    var topic = detectTopic(prompt);
    var prevTopic = lastAssistantTopic(messages);
    var turnCount = Math.max(0, conversationLength(messages) - 1);
    var ctx = {
      messages: messages,
      topic: topic,
      prevTopic: prevTopic,
      turnCount: turnCount
    };

    for (var i = 0; i < RULES.length; i += 1) {
      var r = RULES[i];
      try {
        if (r.match(prompt, ctx)) {
          var response = r.respond(prompt, ctx);
          if (response && typeof response === "string") {
            return { output: { text: response } };
          }
        }
      } catch (err) {
        continue;
      }
    }

    return {
      output: {
        text: "I seem to have gotten confused \u2014 none of my patterns matched. I'm a simple guide bot, here to help you set up the app. Try asking about providers, getting started, or how things work!"
      }
    };
  }
};
