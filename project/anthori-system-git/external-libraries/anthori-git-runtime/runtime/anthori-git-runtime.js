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

function inputObject(payload, label) {
  const input = payload && Object.prototype.hasOwnProperty.call(payload, "input") ? payload.input : {};
  if (input == null) return {};
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(label + " input must be an object");
  }
  return input;
}

function booleanValue(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "boolean") return value;
  return fallback;
}

function positiveIntValue(value, fallback, fieldName) {
  if (value == null || value === "") return fallback;
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(fieldName + " must be a positive number");
  }
  return parsed;
}

function stringList(value, fieldName, options) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(fieldName + " must be an array of strings");
  const allowEmpty = options && options.allowEmpty === true;
  const items = [];
  for (let i = 0; i < value.length; i += 1) {
    const text = normalizeString(value[i]);
    if (!text && !allowEmpty) throw new Error(fieldName + "[" + i + "] is required");
    items.push(text);
  }
  return items;
}

function requireString(value, fieldName) {
  const text = normalizeString(value);
  if (!text) throw new Error(fieldName + " is required");
  return text;
}

function pathspecArgs(paths) {
  const list = stringList(paths, "paths");
  return list.length > 0 ? ["--"].concat(list) : [];
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

function runGitRaw(host, args, options) {
  if (!host || !host.system || typeof host.system.call !== "function") {
    throw new Error("host.system.call unavailable");
  }
  const result = host.system.call("exec", {
    command: "git",
    args: args,
    env: gitEnv(),
  }) || {};
  const combined = combineExecOutput(result.stdout, result.stderr);
  const exitCode = Number(result.exitCode);
  const allowExitCodes = options && Array.isArray(options.allowExitCodes) ? options.allowExitCodes : [0];
  if (result.timedOut === true || !allowExitCodes.includes(exitCode) || normalizeString(result.error)) {
    const message = combineExecOutput(result.error, combined).trim() || ("git " + String(args[0] || "command") + " failed");
    throw new Error(message);
  }
  return combined;
}

function runGitOutput(host, subcommand, args, options) {
  return runGitRaw(host, [subcommand].concat(args || []), options);
}

function classifyStatus(indexStatus, worktreeStatus, fallback) {
  const combined = String(indexStatus || "") + String(worktreeStatus || "");
  if (fallback) return fallback;
  if (combined.includes("U")) return "conflicted";
  if (combined.includes("R")) return "renamed";
  if (combined.includes("C")) return "copied";
  if (combined.includes("A")) return "added";
  if (combined.includes("D")) return "deleted";
  if (combined.includes("M") || combined.includes("T")) return "modified";
  return "changed";
}

function parseStatusOutput(text) {
  const output = {
    branch: "",
    detached: false,
    upstream: "",
    ahead: 0,
    behind: 0,
    commit: "",
    clean: true,
    files: [],
  };
  const lines = stringValue(text).split(/\r?\n/);
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith("# branch.oid ")) {
      output.commit = normalizeString(line.slice("# branch.oid ".length));
      continue;
    }
    if (line.startsWith("# branch.head ")) {
      const branch = normalizeString(line.slice("# branch.head ".length));
      output.detached = branch === "(detached)";
      output.branch = output.detached ? "" : branch;
      continue;
    }
    if (line.startsWith("# branch.upstream ")) {
      output.upstream = normalizeString(line.slice("# branch.upstream ".length));
      continue;
    }
    if (line.startsWith("# branch.ab ")) {
      const match = /# branch\.ab \+(-?\d+) -(-?\d+)/.exec(line);
      if (match) {
        output.ahead = Number(match[1]);
        output.behind = Number(match[2]);
      }
      continue;
    }
    if (line.startsWith("? ")) {
      output.files.push({ path: line.slice(2), status: "untracked", indexStatus: "?", worktreeStatus: "?" });
      continue;
    }
    if (line.startsWith("! ")) {
      output.files.push({ path: line.slice(2), status: "ignored", indexStatus: "!", worktreeStatus: "!" });
      continue;
    }
    if (line.startsWith("1 ")) {
      const parts = line.split(" ");
      const xy = parts[1] || "";
      const path = parts.slice(8).join(" ");
      output.files.push({
        path: path,
        status: classifyStatus(xy[0], xy[1], ""),
        indexStatus: xy[0] || "",
        worktreeStatus: xy[1] || "",
      });
      continue;
    }
    if (line.startsWith("2 ")) {
      const tabIndex = line.indexOf("\t");
      const left = tabIndex >= 0 ? line.slice(0, tabIndex) : line;
      const right = tabIndex >= 0 ? line.slice(tabIndex + 1) : "";
      const parts = left.split(" ");
      const xy = parts[1] || "";
      const path = parts.slice(9).join(" ");
      output.files.push({
        path: path,
        originalPath: right,
        status: classifyStatus(xy[0], xy[1], "renamed"),
        indexStatus: xy[0] || "",
        worktreeStatus: xy[1] || "",
      });
      continue;
    }
    if (line.startsWith("u ")) {
      const parts = line.split(" ");
      const xy = parts[1] || "";
      const path = parts.slice(10).join(" ");
      output.files.push({
        path: path,
        status: "conflicted",
        indexStatus: xy[0] || "",
        worktreeStatus: xy[1] || "",
      });
    }
  }
  output.clean = output.files.length === 0;
  return output;
}

function runStatus(payload, host) {
  const input = inputObject(payload, "Status");
  const includeUntracked = booleanValue(input.includeUntracked, true);
  const args = ["--porcelain=2", "--branch", includeUntracked ? "--untracked-files=all" : "--untracked-files=no"];
  const path = normalizeString(input.path);
  if (path) args.push("--", path);
  return { output: parseStatusOutput(runGitOutput(host, "status", args)) };
}

function runDiff(payload, host) {
  const input = inputObject(payload, "Diff");
  const mode = normalizeString(input.mode || "patch").toLowerCase();
  if (mode !== "patch" && mode !== "stat" && mode !== "name-only") {
    throw new Error("Diff mode must be patch, stat, or name-only");
  }
  const staged = booleanValue(input.staged, false);
  const base = normalizeString(input.base);
  const target = normalizeString(input.target);
  if (staged && (base || target)) throw new Error("Diff staged cannot be combined with base or target");
  const args = ["--no-color"];
  if (mode === "stat") args.push("--stat");
  else if (mode === "name-only") args.push("--name-only");
  else args.push("--patch");
  const contextLines = positiveIntValue(input.contextLines, 0, "contextLines");
  if (contextLines > 0) args.push("-U" + contextLines);
  if (staged) args.push("--cached");
  if (base && target) args.push(base, target);
  else if (base) args.push(base);
  else if (target) args.push(target);
  args.push.apply(args, pathspecArgs(input.paths));
  const text = runGitOutput(host, "diff", args);
  if (mode === "name-only") {
    return { output: { mode: mode, files: text.split(/\r?\n/).map(normalizeString).filter(Boolean) } };
  }
  if (mode === "stat") return { output: { mode: mode, stat: text } };
  return { output: { mode: mode, patch: text } };
}

function parseLogOutput(text) {
  const commits = [];
  const records = stringValue(text).split("\x1e");
  for (const record of records) {
    if (!record.trim()) continue;
    const fields = record.replace(/^\r?\n/, "").split("\x1f");
    commits.push({
      hash: fields[0] || "",
      shortHash: fields[1] || "",
      authorName: fields[2] || "",
      authorEmail: fields[3] || "",
      authoredAt: fields[4] || "",
      subject: fields[5] || "",
      body: fields.slice(6).join("\x1f").trim(),
    });
  }
  return commits;
}

function runLog(payload, host) {
  const input = inputObject(payload, "Log");
  const maxCount = positiveIntValue(input.maxCount, 20, "maxCount");
  const args = ["--format=%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%b%x1e", "-n", String(maxCount)];
  const ref = normalizeString(input.ref);
  if (ref) args.push(ref);
  args.push.apply(args, pathspecArgs(input.paths));
  return { output: { commits: parseLogOutput(runGitOutput(host, "log", args)) } };
}

function runShow(payload, host) {
  const input = inputObject(payload, "Show");
  const ref = requireString(input.ref, "ref");
  const path = normalizeString(input.path);
  if (path) {
    return { output: { ref: ref, path: path, content: runGitOutput(host, "show", [ref + ":" + path]) } };
  }
  const args = ["--no-color"];
  if (booleanValue(input.stat, false)) args.push("--stat");
  args.push(ref);
  return { output: { ref: ref, text: runGitOutput(host, "show", args) } };
}

function parseBranchList(text, current) {
  return stringValue(text).split(/\r?\n/).filter(Boolean).map((line) => {
    const parts = line.split("\t");
    const name = parts[0] || "";
    return {
      name: name,
      current: name === current,
      commit: parts[1] || "",
      upstream: parts[2] || "",
      remote: name.startsWith("remotes/"),
    };
  });
}

function runBranch(payload, host) {
  const input = inputObject(payload, "Branch");
  const mode = normalizeString(input.mode || "list").toLowerCase();
  if (mode === "current") {
    const branch = normalizeString(runGitOutput(host, "branch", ["--show-current"]));
    return { output: { mode: mode, branch: branch, detached: branch === "" } };
  }
  if (mode === "create") {
    const name = requireString(input.name, "name");
    const args = [name];
    const startPoint = normalizeString(input.startPoint);
    if (startPoint) args.push(startPoint);
    return { output: { mode: mode, branch: name, output: runGitOutput(host, "branch", args) } };
  }
  if (mode !== "list") throw new Error("Branch mode must be list, current, or create");
  const current = normalizeString(runGitOutput(host, "branch", ["--show-current"]));
  const args = ["--format=%(refname:short)%09%(objectname:short)%09%(upstream:short)"];
  if (booleanValue(input.all, false)) args.push("--all");
  return { output: { mode: mode, current: current, branches: parseBranchList(runGitOutput(host, "branch", args), current) } };
}

function runFiles(payload, host) {
  const input = inputObject(payload, "Files");
  const tracked = booleanValue(input.tracked, true);
  const untracked = booleanValue(input.untracked, false);
  const modified = booleanValue(input.modified, false);
  const deleted = booleanValue(input.deleted, false);
  const args = [];
  if (tracked) args.push("--cached");
  if (untracked) args.push("--others", "--exclude-standard");
  if (modified) args.push("--modified");
  if (deleted) args.push("--deleted");
  if (args.length === 0) args.push("--cached");
  args.push.apply(args, pathspecArgs(input.paths));
  const files = runGitOutput(host, "ls-files", args).split(/\r?\n/).map(normalizeString).filter(Boolean);
  return { output: { files: files } };
}

function parseBlameOutput(text, path) {
  const rows = [];
  let current = null;
  for (const line of stringValue(text).split(/\r?\n/)) {
    const header = /^([0-9a-f]{40}) \d+ (\d+)/.exec(line);
    if (header) {
      current = { commit: header[1], line: Number(header[2]), path: path, authorName: "", authorEmail: "", summary: "", text: "" };
      rows.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("author ")) current.authorName = line.slice("author ".length);
    else if (line.startsWith("author-mail ")) current.authorEmail = line.slice("author-mail ".length).replace(/^<|>$/g, "");
    else if (line.startsWith("summary ")) current.summary = line.slice("summary ".length);
    else if (line.startsWith("filename ")) current.path = line.slice("filename ".length);
    else if (line.startsWith("\t")) current.text = line.slice(1);
  }
  return rows;
}

function runBlame(payload, host) {
  const input = inputObject(payload, "Blame");
  const path = requireString(input.path, "path");
  const args = ["--line-porcelain"];
  const startLine = positiveIntValue(input.startLine, 0, "startLine");
  const endLine = positiveIntValue(input.endLine, 0, "endLine");
  if (startLine > 0 || endLine > 0) {
    const start = startLine > 0 ? startLine : 1;
    const end = endLine > 0 ? endLine : start;
    args.push("-L", String(start) + "," + String(end));
  }
  const ref = normalizeString(input.ref);
  if (ref) args.push(ref);
  args.push("--", path);
  return { output: { path: path, lines: parseBlameOutput(runGitOutput(host, "blame", args), path) } };
}

function runAdd(payload, host) {
  const input = inputObject(payload, "Add");
  const paths = stringList(input.paths, "paths");
  if (paths.length === 0) throw new Error("paths is required");
  return { output: { paths: paths, output: runGitOutput(host, "add", ["--"].concat(paths)) } };
}

function runRestore(payload, host) {
  const input = inputObject(payload, "Restore");
  const paths = stringList(input.paths, "paths");
  if (paths.length === 0) throw new Error("paths is required");
  const staged = booleanValue(input.staged, false);
  const worktree = booleanValue(input.worktree, !staged);
  const args = [];
  const source = normalizeString(input.source);
  if (source) args.push("--source", source);
  if (staged) args.push("--staged");
  if (worktree) args.push("--worktree");
  args.push("--");
  args.push.apply(args, paths);
  return { output: { paths: paths, staged: staged, worktree: worktree, output: runGitOutput(host, "restore", args) } };
}

function parseCommitSummary(text) {
  const summary = { output: text };
  const match = /^\[[^\]]+\s+([0-9a-f]+)\]\s+(.+)$/m.exec(stringValue(text));
  if (match) {
    summary.shortHash = match[1];
    summary.subject = match[2];
  }
  return summary;
}

function runCommit(payload, host) {
  const input = inputObject(payload, "Commit");
  const message = requireString(input.message, "message");
  const paths = stringList(input.paths, "paths");
  const all = booleanValue(input.all, false);
  if (paths.length > 0 && all) throw new Error("Commit input cannot include both paths and all");
  if (paths.length > 0) runGitOutput(host, "add", ["--"].concat(paths));
  const args = [];
  if (all) args.push("--all");
  args.push("-m", message);
  const description = normalizeString(input.description);
  if (description) args.push("-m", description);
  const summary = parseCommitSummary(runGitOutput(host, "commit", args));
  summary.paths = paths;
  return { output: summary };
}

function runSwitch(payload, host) {
  const input = inputObject(payload, "Switch");
  const branch = requireString(input.branch, "branch");
  const args = [];
  if (booleanValue(input.create, false)) args.push("-c");
  args.push(branch);
  const startPoint = normalizeString(input.startPoint);
  if (startPoint) args.push(startPoint);
  return { output: { branch: branch, output: runGitOutput(host, "switch", args) } };
}

function parseStashList(text) {
  return stringValue(text).split(/\r?\n/).filter(Boolean).map((line) => {
    const parts = line.split("\t");
    return { ref: parts[0] || "", hash: parts[1] || "", message: parts.slice(2).join("\t") };
  });
}

function runStash(payload, host) {
  const input = inputObject(payload, "Stash");
  const mode = normalizeString(input.mode || "list").toLowerCase();
  if (mode === "list") {
    return { output: { mode: mode, stashes: parseStashList(runGitOutput(host, "stash", ["list", "--format=%gd%x09%H%x09%s"])) } };
  }
  if (mode === "push") {
    const args = ["push"];
    if (booleanValue(input.includeUntracked, false)) args.push("--include-untracked");
    const message = normalizeString(input.message);
    if (message) args.push("-m", message);
    args.push.apply(args, pathspecArgs(input.paths));
    return { output: { mode: mode, output: runGitOutput(host, "stash", args) } };
  }
  if (mode === "pop" || mode === "apply" || mode === "drop") {
    const args = [mode];
    const ref = normalizeString(input.ref);
    if (ref) args.push(ref);
    return { output: { mode: mode, ref: ref, output: runGitOutput(host, "stash", args) } };
  }
  throw new Error("Stash mode must be list, push, pop, apply, or drop");
}

function runFetchSemantic(payload, host) {
  const input = inputObject(payload, "Fetch");
  const args = [];
  if (booleanValue(input.all, false)) args.push("--all");
  if (booleanValue(input.prune, true)) args.push("--prune");
  const remote = normalizeString(input.remote);
  if (remote) args.push(remote);
  return { output: { output: runGitOutput(host, "fetch", args) } };
}

function runPullSemantic(payload, host) {
  const input = inputObject(payload, "Pull");
  const args = [];
  if (booleanValue(input.ffOnly, true)) args.push("--ff-only");
  if (booleanValue(input.rebase, false)) args.push("--rebase");
  const remote = normalizeString(input.remote);
  const branch = normalizeString(input.branch);
  if (remote) args.push(remote);
  if (branch) args.push(branch);
  return { output: { output: runGitOutput(host, "pull", args) } };
}

function runPushSemantic(payload, host) {
  const input = inputObject(payload, "Push");
  const args = [];
  if (booleanValue(input.setUpstream, false)) args.push("--set-upstream");
  if (booleanValue(input.tags, false)) args.push("--tags");
  if (booleanValue(input.forceWithLease, false)) args.push("--force-with-lease");
  const remote = normalizeString(input.remote);
  const branch = normalizeString(input.branch);
  if (remote) args.push(remote);
  if (branch) args.push(branch);
  return { output: { output: runGitOutput(host, "push", args) } };
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
  "status": runStatus,
  "diff": runDiff,
  "log": runLog,
  "show": runShow,
  "branch": runBranch,
  "files": runFiles,
  "blame": runBlame,
  "add": runAdd,
  "restore": runRestore,
  "commit": runCommit,
  "switch": runSwitch,
  "stash": runStash,
  "fetch": runFetchSemantic,
  "pull": runPullSemantic,
  "push": runPushSemantic,
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
