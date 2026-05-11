"use strict";

const KNOWN_GIT_SUBCOMMANDS = [
  "status",
  "diff",
  "log",
  "show",
  "branch",
  "ls-files",
  "blame",
  "add",
  "restore",
  "commit",
  "switch",
  "stash",
  "fetch",
  "pull",
  "push",
];

const GIT_GLOBAL_OPTIONS_WITH_VALUE = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--config-env",
  "--exec-path",
]);

const GIT_GLOBAL_OPTION_PREFIXES_WITH_VALUE = [
  "--git-dir=",
  "--work-tree=",
  "--namespace=",
  "--config-env=",
  "--exec-path=",
];

function stringValue(value) {
  if (value == null) return "";
  return String(value);
}

function normalizeString(value) {
  return stringValue(value).trim();
}

function gitInputArgs(payload) {
  const input = payload && Object.prototype.hasOwnProperty.call(payload, "input") ? payload.input : null;
  if (typeof input === "string") return input;
  if (input && typeof input === "object" && !Array.isArray(input)) return stringValue(input.args);
  return "";
}

function parseShellArgs(args, options) {
  const source = stringValue(args);
  const allowPipe = options && options.allowPipe === true;
  const tokens = [];
  let current = "";
  let quote = "";
  let escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = "";
      else current += ch;
      continue;
    }
    if (ch === "'" || ch === "\"") {
      quote = ch;
      continue;
    }
    if (ch === "|") {
      if (!allowPipe) throw new Error("unsupported shell operator in args");
      if (current !== "") {
        tokens.push(current);
        current = "";
      }
      tokens.push("|");
      continue;
    }
    if (ch === "\n" || ch === "\r" || ch === ";" || ch === "<" || ch === ">" || ch === "&") {
      throw new Error("unsupported shell operator in args");
    }
    if (/\s/.test(ch)) {
      if (current !== "") {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (escaped) current += "\\";
  if (quote) throw new Error("unterminated quote in args");
  if (current !== "") tokens.push(current);
  return tokens;
}

function commandTokenName(token) {
  const value = normalizeString(token);
  if (!value) return "";
  const parts = value.split(/[\/\\]+/);
  return normalizeString(parts[parts.length - 1]);
}

function positiveInteger(value, fallback) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOutputLineFilter(tokens) {
  const commandName = commandTokenName(tokens[0]);
  if (commandName !== "head" && commandName !== "tail") {
    throw new Error("unsupported shell pipeline command: " + (commandName || "(empty)"));
  }
  let lineCount = 10;
  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (/^-[0-9]+$/.test(token)) {
      lineCount = positiveInteger(token.slice(1), lineCount);
      continue;
    }
    if (token === "-n" || token === "--lines") {
      lineCount = positiveInteger(tokens[++i], lineCount);
      continue;
    }
    if (token.startsWith("--lines=")) {
      lineCount = positiveInteger(token.slice("--lines=".length), lineCount);
      continue;
    }
    if (token.startsWith("-n") && token.length > 2) {
      lineCount = positiveInteger(token.slice(2), lineCount);
      continue;
    }
    if (token.startsWith("-")) throw new Error("unsupported shell pipeline option: " + token);
    throw new Error("shell pipeline " + commandName + " reads command output; file operands are not supported");
  }
  return { command: commandName, lineCount: lineCount };
}

function parseShellPipeline(args) {
  const tokens = parseShellArgs(args, { allowPipe: true });
  const pipeIndex = tokens.indexOf("|");
  if (pipeIndex < 0) return { tokens: tokens, outputFilter: null };
  if (tokens.indexOf("|", pipeIndex + 1) >= 0) throw new Error("Git wrappers support only one output pipe");
  const commandTokens = tokens.slice(0, pipeIndex);
  const pipelineTokens = tokens.slice(pipeIndex + 1);
  if (commandTokens.length === 0) throw new Error("missing Git command before pipe");
  if (pipelineTokens.length === 0) throw new Error("missing shell command after pipe");
  return {
    tokens: commandTokens,
    outputFilter: parseOutputLineFilter(pipelineTokens),
  };
}

function applyOutputFilter(stdout, filter) {
  const text = stringValue(stdout);
  if (!filter) return text;
  if (filter.lineCount <= 0 || text === "") return "";
  const records = text.match(/[^\n]*\n|[^\n]+$/g) || [];
  const selected = filter.command === "tail" ? records.slice(-filter.lineCount) : records.slice(0, filter.lineCount);
  return selected.join("");
}

function isKnownGitSubcommand(token) {
  return KNOWN_GIT_SUBCOMMANDS.includes(normalizeString(token));
}

function gitGlobalOptionConsumesValue(token) {
  if (GIT_GLOBAL_OPTIONS_WITH_VALUE.has(token)) return true;
  return false;
}

function isGitGlobalOptionWithInlineValue(token) {
  if (token.startsWith("-c") && token.length > 2) return true;
  return GIT_GLOBAL_OPTION_PREFIXES_WITH_VALUE.some((prefix) => token.startsWith(prefix));
}

function splitGitInvocation(tokens, subcommand) {
  let index = 0;
  const prefix = [];
  const hadGit = commandTokenName(tokens[index]) === "git";
  if (hadGit) index += 1;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === subcommand) {
      index += 1;
      return {
        gitArgs: prefix.concat([subcommand], tokens.slice(index)),
        subcommandArgs: tokens.slice(index),
      };
    }
    if (gitGlobalOptionConsumesValue(token)) {
      prefix.push(token);
      index += 1;
      if (index >= tokens.length) throw new Error("Git option requires a value: " + token);
      prefix.push(tokens[index]);
      index += 1;
      continue;
    }
    if (isGitGlobalOptionWithInlineValue(token) || token === "--no-pager" || token === "--paginate" || token === "--bare" || token === "--literal-pathspecs" || token === "--no-optional-locks") {
      prefix.push(token);
      index += 1;
      continue;
    }
    break;
  }
  if (hadGit && index < tokens.length && isKnownGitSubcommand(tokens[index]) && tokens[index] !== subcommand) {
    throw new Error("expected git " + subcommand + " command, got git " + tokens[index]);
  }
  if (!hadGit && tokens.length > 0 && isKnownGitSubcommand(tokens[0]) && tokens[0] !== subcommand) {
    throw new Error("expected " + subcommand + " args, got " + tokens[0]);
  }
  if (!hadGit && tokens[index] === subcommand) {
    index += 1;
  }
  return {
    gitArgs: prefix.concat([subcommand], tokens.slice(index)),
    subcommandArgs: tokens.slice(index),
  };
}

function parseGitArgs(payload, subcommand) {
  const parsed = parseShellPipeline(gitInputArgs(payload));
  const invocation = splitGitInvocation(parsed.tokens, subcommand);
  return {
    gitArgs: invocation.gitArgs,
    subcommandArgs: invocation.subcommandArgs,
    outputFilter: parsed.outputFilter,
  };
}

function combineExecOutput(stdout, stderr) {
  const out = stringValue(stdout);
  const err = stringValue(stderr);
  if (!out) return err;
  if (!err) return out;
  if (out.endsWith("\n") || err.startsWith("\n")) return out + err;
  return out + "\n" + err;
}

function gitEnv() {
  return {
    GIT_TERMINAL_PROMPT: "0",
    GIT_PAGER: "cat",
    GIT_EDITOR: "true",
  };
}

function validateBranchArgs(args) {
  const forbiddenExact = new Set([
    "-d",
    "-D",
    "-m",
    "-M",
    "-c",
    "-C",
    "-f",
    "--delete",
    "--move",
    "--copy",
    "--force",
    "--edit-description",
    "--set-upstream-to",
    "--unset-upstream",
    "--track",
    "--no-track",
    "--create-reflog",
  ]);
  const forbiddenPrefixes = [
    "--delete=",
    "--move=",
    "--copy=",
    "--set-upstream-to=",
  ];
  let listMode = false;
  let bareArgs = 0;
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === "--") {
      bareArgs += Math.max(0, args.length - i - 1);
      break;
    }
    if (token === "--list" || token === "-l") {
      listMode = true;
      continue;
    }
    if (forbiddenExact.has(token) || forbiddenPrefixes.some((prefix) => token.startsWith(prefix))) {
      throw new Error("git branch mutating option is not supported by the Branch control: " + token);
    }
    if (/^-[^-]/.test(token) && /[dDmMcCfF]/.test(token.slice(1))) {
      throw new Error("git branch mutating option is not supported by the Branch control: " + token);
    }
    if (!token.startsWith("-")) bareArgs += 1;
  }
  if (bareArgs > 0 && !listMode) {
    throw new Error("git branch positional arguments require --list because branch creation is not supported by this control");
  }
}

function runGit(subcommand, payload, host, options) {
  if (!host || !host.system || typeof host.system.call !== "function") {
    throw new Error("host.system.call unavailable");
  }
  let parsed;
  try {
    parsed = parseGitArgs(payload, subcommand);
    if (options && typeof options.validate === "function") options.validate(parsed.subcommandArgs);
  } catch (error) {
    throw new Error(error.message);
  }
  const result = host.system.call("exec", {
    command: "git",
    args: parsed.gitArgs,
    env: gitEnv(),
  }) || {};
  const combined = combineExecOutput(result.stdout, result.stderr);
  if (result.timedOut === true || Number(result.exitCode) !== 0 || normalizeString(result.error)) {
    const message = combineExecOutput(result.error, combined).trim() || ("git " + subcommand + " failed");
    throw new Error(message);
  }
  return { output: applyOutputFilter(combined, parsed.outputFilter) };
}

module.exports = {
  "shell-status": function (payload, host) { return runGit("status", payload, host); },
  "shell-diff": function (payload, host) { return runGit("diff", payload, host); },
  "shell-log": function (payload, host) { return runGit("log", payload, host); },
  "shell-show": function (payload, host) { return runGit("show", payload, host); },
  "shell-branch": function (payload, host) { return runGit("branch", payload, host, { validate: validateBranchArgs }); },
  "shell-ls-files": function (payload, host) { return runGit("ls-files", payload, host); },
  "shell-blame": function (payload, host) { return runGit("blame", payload, host); },
  "shell-add": function (payload, host) { return runGit("add", payload, host); },
  "shell-restore": function (payload, host) { return runGit("restore", payload, host); },
  "shell-commit": function (payload, host) { return runGit("commit", payload, host); },
  "shell-switch": function (payload, host) { return runGit("switch", payload, host); },
  "shell-stash": function (payload, host) { return runGit("stash", payload, host); },
  "shell-fetch": function (payload, host) { return runGit("fetch", payload, host); },
  "shell-pull": function (payload, host) { return runGit("pull", payload, host); },
  "shell-push": function (payload, host) { return runGit("push", payload, host); },
};
