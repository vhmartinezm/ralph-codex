const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const yaml = require("js-yaml");
const { Confirm, Select } = require("enquirer");

const root = process.cwd();
const agentDir = path.join(root, ".ralph");
const repoName = path.basename(root);

const argv = process.argv.slice(2);
let maxIterations = 15;
let quiet = false;
let tasksPath = "tasks.md";
let noSandbox = false;
let sandbox = null;
let fullAuto = false;
let askForApproval = null;
let model = null;
let profile = null;
let completionPromise = "LOOP_COMPLETE";
let stopOnError = false;
let streamLog = true;
let configPath = null;
let modelReasoningEffort = null;
let activeDockerConfig = null;
let streamScratchpad = false;
let reasoningChoice;

for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--max-iterations") {
    maxIterations = Number(argv[i + 1] || 0) || maxIterations;
    i += 1;
    continue;
  }
  if (arg === "--tasks") {
    tasksPath = argv[i + 1];
    i += 1;
    continue;
  }
  if (arg === "--input") {
    tasksPath = argv[i + 1];
    i += 1;
    continue;
  }
  if (arg === "--quiet" || arg === "-q") {
    quiet = true;
    continue;
  }
  if (arg === "--no-sandbox") {
    noSandbox = true;
    continue;
  }
  if (arg === "--sandbox") {
    sandbox = argv[i + 1];
    i += 1;
    continue;
  }
  if (arg === "--full-auto") {
    fullAuto = true;
    continue;
  }
  if (arg === "--ask-for-approval") {
    askForApproval = argv[i + 1];
    i += 1;
    continue;
  }
  if (arg === "--model" || arg === "-m") {
    model = argv[i + 1];
    i += 1;
    continue;
  }
  if (arg === "--profile" || arg === "-p") {
    profile = argv[i + 1];
    i += 1;
    continue;
  }
  if (arg === "--reasoning") {
    const next = argv[i + 1];
    if (next && !next.startsWith("-")) {
      reasoningChoice = next;
      i += 1;
    } else {
      reasoningChoice = "__prompt__";
    }
    continue;
  }
  if (arg === "--config") {
    configPath = argv[i + 1];
    i += 1;
    continue;
  }
  if (arg === "--completion-promise") {
    completionPromise = argv[i + 1] || completionPromise;
    i += 1;
    continue;
  }
  if (arg === "--stop-on-error") {
    stopOnError = true;
    continue;
  }
  if (arg === "--no-log-stream") {
    streamLog = false;
    continue;
  }
  if (arg === "--tail-log") {
    streamLog = true;
    continue;
  }
  if (arg === "--tail-scratchpad") {
    streamScratchpad = true;
    continue;
  }
  if (arg === "--no-tail") {
    streamLog = false;
    streamScratchpad = false;
    continue;
  }
}

function loadConfig(configFilePath) {
  if (!configFilePath) return {};
  if (!fs.existsSync(configFilePath)) return {};
  try {
    const content = fs.readFileSync(configFilePath, "utf8");
    return yaml.load(content) || {};
  } catch (error) {
    console.error(
      `Failed to read config at ${configFilePath}: ${error?.message || error}`
    );
    process.exit(1);
  }
}

function normalizeReasoningEffort(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (["null", "unset", "none", "default"].includes(lowered)) return null;
  return trimmed;
}

async function promptReasoningEffort(currentValue) {
  const choices = [
    { name: "unset", message: "unset (null; use Codex default)", value: null },
    { name: "low", message: "low", value: "low" },
    { name: "medium", message: "medium", value: "medium" },
    { name: "high", message: "high", value: "high" },
    { name: "extra-high", message: "extra-high", value: "extra-high" },
  ];
  const normalized = normalizeReasoningEffort(currentValue) || "medium";
  const initial = Math.max(
    0,
    choices.findIndex((choice) => choice.value === normalized)
  );
  const prompt = new Select({
    name: "reasoning",
    message: "Select model reasoning effort:",
    choices,
    initial,
  });
  return prompt.run();
}

function createLogStyler() {
  const enabled = process.stdout.isTTY && !process.env.NO_COLOR;
  const ansi = {
    reset: "\u001b[0m",
    dim: "\u001b[2m",
    red: "\u001b[31m",
    green: "\u001b[32m",
    yellow: "\u001b[33m",
    blue: "\u001b[34m",
    magenta: "\u001b[35m",
    cyan: "\u001b[36m",
    gray: "\u001b[90m",
  };
  const color = (code, text) => (enabled ? `${code}${text}${ansi.reset}` : text);
  const pathRegex =
    /(^|\s)(\.{0,2}\/[A-Za-z0-9._/-]+|[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+|[A-Za-z0-9._-]+\.(?:js|ts|tsx|jsx|md|yml|yaml|json|toml|go|py|rs|java|kt|sh|bash|zsh|sql|css|scss|html|txt))(?!\w)/g;

  let inCodeBlock = false;
  let inHeader = false;
  let inDiffHunk = false;

  const highlightInline = (line) =>
    line.replace(/`([^`]+)`/g, (match) => color(ansi.blue, match));
  const highlightPaths = (line) =>
    line.replace(pathRegex, (match, prefix, pathPart) => {
      return `${prefix}${color(ansi.magenta, pathPart)}`;
    });

  const formatLine = (line) => {
    if (!enabled || line === "") return line;
    const trimmed = line.trim();
    if (trimmed === "--------") {
      inHeader = !inHeader;
      return color(ansi.gray, line);
    }
    if (inHeader) return color(ansi.gray, line);
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      return color(ansi.gray, line);
    }
    if (inCodeBlock) return color(ansi.gray, line);

    if (/^diff --|^index |^\+\+\+|^---/.test(trimmed)) {
      inDiffHunk = false;
      return color(ansi.magenta, line);
    }
    if (/^@@/.test(trimmed)) {
      inDiffHunk = true;
      return color(ansi.magenta, line);
    }

    const looksLikeList = /^[-+]\s+/.test(trimmed);
    if (inDiffHunk && /^\+\s?/.test(trimmed) && !/^\+\+\+/.test(trimmed) && !looksLikeList) {
      return color(ansi.green, line);
    }
    if (inDiffHunk && /^-\s?/.test(trimmed) && !/^---/.test(trimmed) && !looksLikeList) {
      return color(ansi.red, line);
    }
    if (/^-\s+\[[xX]\]/.test(trimmed)) return color(ansi.green, line);
    if (/^-\s+\[~\]/.test(trimmed)) return color(ansi.yellow, line);
    if (/^-\s+\[\s\]/.test(trimmed)) return color(ansi.gray, line);

    if (/\b(error|failed|exception|traceback|fatal)\b/i.test(trimmed)) {
      return color(ansi.red, line);
    }
    if (/\b(warn|warning|deprecated)\b/i.test(trimmed)) {
      return color(ansi.yellow, line);
    }
    if (/\b(success|succeeded|done|complete|completed)\b/i.test(trimmed)) {
      return color(ansi.green, line);
    }
    if (/^#{1,6}\s+/.test(trimmed)) return color(ansi.cyan, line);
    if (trimmed.endsWith("?")) return color(ansi.yellow, line);
    if (/^\$\s+/.test(trimmed) || /^>\s+/.test(trimmed)) {
      return color(ansi.blue, line);
    }

    let styled = highlightInline(line);
    if (!styled.includes("`")) {
      styled = highlightPaths(styled);
    }
    if (trimmed.length >= 140) return color(ansi.dim, styled);
    return styled;
  };

  return { formatLine };
}

function resolveDockerConfig(config) {
  const dockerConfig = config?.docker || {};
  return {
    enabled: Boolean(dockerConfig.enabled),
    dockerfile: dockerConfig.dockerfile || "Dockerfile.ralph",
    image: dockerConfig.image || "ralph-runner",
    baseImage: dockerConfig.base_image || "node:20-bullseye",
    workdir: dockerConfig.workdir || "/workspace",
    codexInstall: dockerConfig.codex_install || "",
    codexHome: dockerConfig.codex_home || ".ralph/codex",
    mountCodexConfig: dockerConfig.mount_codex_config !== false,
    passEnv: Array.isArray(dockerConfig.pass_env) ? dockerConfig.pass_env : [],
    aptPackages: Array.isArray(dockerConfig.apt_packages)
      ? dockerConfig.apt_packages
      : [],
    npmGlobals: Array.isArray(dockerConfig.npm_globals)
      ? dockerConfig.npm_globals
      : [],
    pipPackages: Array.isArray(dockerConfig.pip_packages)
      ? dockerConfig.pip_packages
      : [],
    useForPlan: Boolean(dockerConfig.use_for_plan),
    autoFix: dockerConfig.auto_fix !== false,
    fixAttempts: Number(dockerConfig.fix_attempts || 2),
    fixUseHost: dockerConfig.fix_use_host !== false,
    fixLog: dockerConfig.fix_log || ".ralph/docker-build.log",
    tty: dockerConfig.tty ?? "auto",
    cleanup: dockerConfig.cleanup || "none",
  };
}

function ensureDockerfile(dockerConfig) {
  if (!dockerConfig.enabled) return;
  const dockerfilePath = path.join(root, dockerConfig.dockerfile);
  const lines = [
    "# Generated by ralph-codex plan",
    `FROM ${dockerConfig.baseImage}`,
    "RUN apt-get update && apt-get install -y git python3 && rm -rf /var/lib/apt/lists/*",
    `WORKDIR ${dockerConfig.workdir}`,
  ];

  if (dockerConfig.codexInstall) {
    lines.push(`RUN ${dockerConfig.codexInstall}`);
  } else {
    lines.push("# TODO: set docker.codex_install in ralph.config.yml");
  }

  fs.writeFileSync(dockerfilePath, `${lines.join("\n")}\n`, "utf8");
}

let dockerBuilt = false;

function ensureDockerImage(dockerConfig) {
  if (!dockerConfig.enabled || dockerBuilt) return;
  const dockerfilePath = path.join(root, dockerConfig.dockerfile);
  if (!fs.existsSync(dockerfilePath)) {
    console.error(
      `Missing ${dockerConfig.dockerfile}. Run ralph:plan to generate it.`
    );
    process.exit(1);
  }

  let attempt = 0;
  while (attempt <= dockerConfig.fixAttempts) {
    const result = buildDockerImage(dockerConfig);
    if (result.notRunning) {
      const red = "\u001b[31m";
      const reset = "\u001b[0m";
      const msg =
        result.output ||
        "Docker is not running. Start Docker Desktop or Colima and retry.";
      process.stderr.write(`\n${red}${msg}${reset}\n`);
      process.exit(result.status ?? 1);
    }
    if (detectDockerStorageIssue(result.output)) {
      printDockerStorageHint(result.output);
      process.exit(result.status ?? 1);
    }
    if (result.status === 0) {
      dockerBuilt = true;
      return;
    }

    const logPath = path.join(root, dockerConfig.fixLog);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, result.output, "utf8");

    if (!dockerConfig.autoFix || attempt >= dockerConfig.fixAttempts) {
      console.error(
        `Docker build failed. See ${dockerConfig.fixLog} for details.`
      );
      process.exit(result.status ?? 1);
    }

    const before = fs.readFileSync(dockerfilePath, "utf8");
    const prompt = `Docker build failed. Fix the Dockerfile only.

Dockerfile:
${before}

Build error:
${result.output}

Constraints:
- Only edit ${dockerConfig.dockerfile}
- Do not change other files
- Do not ask questions
- Output exactly: LOOP_COMPLETE
`;
    process.stdout.write(
      `\nAttempting Dockerfile auto-fix (${attempt + 1}/${
        dockerConfig.fixAttempts
      })...\n`
    );

    if (!dockerConfig.fixUseHost) {
      console.error("docker.fix_use_host must be true for auto-fix.");
      process.exit(1);
    }

    runCodexHost(prompt);
    const after = fs.readFileSync(dockerfilePath, "utf8");
    if (after === before) {
      console.error("Auto-fix did not change the Dockerfile.");
      process.exit(1);
    }

    attempt += 1;
  }
}

function buildDockerRunArgs(dockerConfig) {
  const args = ["run", "--rm", "-i"];
  const wantsTty =
    dockerConfig.tty === true ||
    dockerConfig.tty === "true" ||
    (dockerConfig.tty === "auto" && process.stdin.isTTY);
  if (wantsTty) args.push("-t");
  args.push("-v", `${root}:${dockerConfig.workdir}`, "-w", dockerConfig.workdir);
  const codexHome = path.isAbsolute(dockerConfig.codexHome)
    ? dockerConfig.codexHome
    : path.join(root, dockerConfig.codexHome);
  fs.mkdirSync(codexHome, { recursive: true });
  if (dockerConfig.mountCodexConfig) {
    const hostCodex = path.join(os.homedir(), ".codex");
    if (fs.existsSync(hostCodex)) {
      const existing = fs.readdirSync(codexHome);
      if (existing.length === 0) {
        fs.cpSync(hostCodex, codexHome, { recursive: true });
      }
    }
  }
  args.push("-v", `${codexHome}:/root/.codex`, "-e", "HOME=/root");

  for (const envName of dockerConfig.passEnv) {
    const value = process.env[envName];
    if (value) args.push("-e", `${envName}=${value}`);
  }

  return args;
}

function cleanupDockerImage(dockerConfig) {
  if (!dockerConfig.enabled) return;
  if (dockerConfig.cleanup !== "image" && dockerConfig.cleanup !== "all") return;

  const result = spawnSync(
    "docker",
    ["rmi", "-f", dockerConfig.image],
    { encoding: "utf8" }
  );

  if (result.status !== 0) {
    const message = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    if (message) {
      process.stderr.write(`\nDocker cleanup warning: ${message}\n`);
    }
  }

  if (dockerConfig.cleanup === "all") {
    spawnSync("docker", ["system", "prune", "-f"], { stdio: "ignore" });
  }
}

function runCodexHost(prompt) {
  const args = ["exec"];
  if (model) args.push("--model", model);
  if (profile) args.push("--profile", profile);
  if (fullAuto) args.push("--full-auto");
  if (askForApproval) {
    args.push("--config", `ask_for_approval=${askForApproval}`);
  }
  if (modelReasoningEffort) {
    args.push("--config", `model_reasoning_effort=${modelReasoningEffort}`);
  }
  if (resolvedSandbox) args.push("--sandbox", resolvedSandbox);
  args.push("-");

  const result = spawnSync("codex", args, {
    input: prompt,
    encoding: "utf8",
    cwd: root,
    env: process.env,
  });

  const combined = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  if (combined) process.stdout.write(`${combined}\n`);
  return { status: result.status ?? 0, output: combined };
}

function buildDockerImage(dockerConfig) {
  const dockerfilePath = path.join(root, dockerConfig.dockerfile);
  const probe = spawnSync("docker", ["info"], { encoding: "utf8" });
  if (probe.status !== 0) {
    return {
      status: probe.status ?? 1,
      output: `${probe.stdout || ""}\n${probe.stderr || ""}`.trim(),
      notRunning: true,
    };
  }
  const result = spawnSync(
    "docker",
    ["build", "-f", dockerfilePath, "-t", dockerConfig.image, "."],
    { cwd: root, encoding: "utf8" }
  );
  const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  if (output) process.stdout.write(`${output}\n`);
  return { status: result.status ?? 1, output };
}

const resolvedConfigPath = configPath || path.join(root, "ralph.config.yml");
const config = loadConfig(resolvedConfigPath);
const codexConfig = config?.codex || {};
const runConfig = config?.run || {};
const dockerConfig = resolveDockerConfig(config);
activeDockerConfig = dockerConfig;
const requiredCommands = Array.isArray(runConfig.required_commands)
  ? runConfig.required_commands.filter(Boolean)
  : [];
const requiredCommandsSection = requiredCommands.length > 0
  ? requiredCommands.map((cmd) => `- Run \`${cmd}\`.`).join("\n")
  : "- None.";

if (!model && codexConfig.model) model = codexConfig.model;
if (!profile && codexConfig.profile) profile = codexConfig.profile;
if (!sandbox && codexConfig.sandbox) sandbox = codexConfig.sandbox;
if (!askForApproval && codexConfig.ask_for_approval) {
  askForApproval = codexConfig.ask_for_approval;
}
if (!fullAuto && codexConfig.full_auto) fullAuto = true;
if (!modelReasoningEffort && codexConfig.model_reasoning_effort) {
  modelReasoningEffort = codexConfig.model_reasoning_effort;
}
if (tasksPath === "tasks.md" && runConfig.tasks_path) {
  tasksPath = runConfig.tasks_path;
}
if (maxIterations === 15 && runConfig.max_iterations) {
  maxIterations = runConfig.max_iterations;
}
if (completionPromise === "LOOP_COMPLETE" && runConfig.completion_promise) {
  completionPromise = runConfig.completion_promise;
}
if (typeof runConfig.tail_log === "boolean") {
  streamLog = runConfig.tail_log;
}
if (typeof runConfig.tail_scratchpad === "boolean") {
  streamScratchpad = runConfig.tail_scratchpad;
}

  const tasksFile = path.join(root, tasksPath);

  if (!fs.existsSync(tasksFile)) {
    console.error(`Missing ${tasksPath}. Run ralph:plan or create it first.`);
    process.exit(1);
  }

  if (activeDockerConfig?.enabled) {
    const probe = spawnSync("docker", ["info"], { encoding: "utf8" });
    if (probe.status !== 0) {
      const red = "\u001b[31m";
      const reset = "\u001b[0m";
      const msg =
        `${probe.stdout || ""}\n${probe.stderr || ""}`.trim() ||
        "Docker is not running. Start Docker Desktop or Colima and retry.";
      process.stderr.write(`\n${red}${msg}${reset}\n`);
      process.exit(probe.status ?? 1);
    }
  }

fs.mkdirSync(agentDir, { recursive: true });

const promptPath = path.join(agentDir, "ralph-run-prompt.md");
const scratchpadPath = path.join(agentDir, "summary.md");
const logPath = path.join(agentDir, "loop-log.md");

if (!fs.existsSync(logPath)) {
  fs.writeFileSync(logPath, "", "utf8");
}
if (!fs.existsSync(scratchpadPath)) {
  fs.writeFileSync(scratchpadPath, "", "utf8");
}

let promptBase = "";

function buildPromptBase() {
  const dockerNotes = activeDockerConfig?.enabled
    ? `\nDocker environment:\n- You are running inside Docker with the repo mounted at ${activeDockerConfig.workdir}.\n- HOME is /root and Codex data lives in /root/.codex (mounted from ${activeDockerConfig.codexHome}).\n- Python and pip use a venv at /opt/venv (PATH already includes /opt/venv/bin).\n- Skip host version managers; the container already pins the runtime from the base image.\n- There are no host port mappings by default; if you start a dev server, access it from inside the container.\n- If a required tool is missing, log the blocker and do not edit the Dockerfile in run mode.\n`
    : "";

  return `# Ralph Run

Repo: ${repoName}

Required at the start of each iteration:
${requiredCommandsSection}

Inputs:
- ${tasksPath} (task list, check items off as completed)
- ${path.relative(root, scratchpadPath)} (summary notes for context)
- ${path.relative(root, logPath)} (iteration log; append every loop)
${dockerNotes}

Process:
1) Re-read ${tasksPath} and ${path.relative(root, logPath)} each iteration.
2) Do not add or remove tasks. The list is immutable.
3) Only update existing tasks by marking:
   - \`[x]\` for completed
   - \`[~]\` for failed/blocked
4) If a task is not started, leave it blank \`[ ]\`.
5) If needed, start the app or run tests. Prefer local-only bind:
   set \`HOST=127.0.0.1\` and \`PORT=3000\` (or project defaults) when launching a dev server.
6) Append a new section to ${path.relative(
    root,
    logPath
  )} with:
   - Iteration number
   - Changes made
   - Commands run + results
   - Blockers + next step
7) Keep edits minimal and aligned with the tasks.
8) Do not ask the user clarifying questions. If unsure, make the best
   reasonable assumption, document it in the log, and proceed.

Completion requirements:
- All tasks are checked in ${tasksPath}
- All items listed under "Success criteria" in ${tasksPath} are satisfied

When complete, output exactly: ${completionPromise}
`;
}

const resolvedSandbox = noSandbox ? "danger-full-access" : sandbox;
let completed = false;
let lastStatus = 0;
let lastLogSize = 0;
let lastOutput = "";
let lastScratchpadSize = 0;
let fatalDockerError = null;

function getTaskProgress(tasksFilePath) {
  if (!fs.existsSync(tasksFilePath)) {
    return { completed: 0, blocked: 0, total: 0, percent: 0 };
  }

  const content = fs.readFileSync(tasksFilePath, "utf8");
  const lines = content.split(/\r?\n/);
  let total = 0;
  let completedCount = 0;
  let blockedCount = 0;

  for (const line of lines) {
    const match = line.match(/^\s*[-*]\s+\[([ x~])\]/i);
    if (!match) continue;
    total += 1;
    const status = match[1].toLowerCase();
    if (status === "x") {
      completedCount += 1;
    }
    if (status === "~") {
      blockedCount += 1;
    }
  }

  const percent = total === 0 ? 0 : Math.round((completedCount / total) * 100);
  return { completed: completedCount, blocked: blockedCount, total, percent };
}

function validateTasksFile(tasksFilePath) {
  const warnings = [];
  if (!fs.existsSync(tasksFilePath)) {
    warnings.push(`Missing ${tasksFilePath}.`);
    return warnings;
  }

  const content = fs.readFileSync(tasksFilePath, "utf8");
  const lines = content.split(/\r?\n/);
  let taskCount = 0;
  let invalidTasks = 0;
  let successHeaderIndex = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^(#+\s*)?success criteria\b/i.test(line.trim())) {
      successHeaderIndex = i;
    }
    const match = line.match(/^\s*[-*]\s+\[([^\]])\]\s+.+/);
    if (!match) continue;
    taskCount += 1;
    const status = match[1].trim().toLowerCase();
    if (!["", "x", "~"].includes(status)) {
      invalidTasks += 1;
    }
  }

  if (taskCount === 0) {
    warnings.push("No tasks found. Expected list items like '- [ ] Task'.");
  }
  if (invalidTasks > 0) {
    warnings.push(
      `Found ${invalidTasks} task(s) with invalid status. Use [ ], [x], or [~].`
    );
  }

  if (successHeaderIndex === -1) {
    warnings.push('Missing "Success criteria" section.');
  } else {
    let successItems = 0;
    for (let i = successHeaderIndex + 1; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (!line) continue;
      if (/^#+\s+/.test(line)) break;
      if (line.startsWith("- ")) successItems += 1;
      if (line.toLowerCase().startsWith("success criteria")) continue;
    }
    if (successItems === 0) {
      warnings.push('Success criteria section has no list items.');
    }
  }

  return warnings;
}

function getLastBlocker(logFilePath) {
  if (!fs.existsSync(logFilePath)) return "";
  const content = fs.readFileSync(logFilePath, "utf8");
  const lines = content.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    const match = line.match(/^- Blockers \+ next step:\s*(.*)$/);
    if (match) {
      const text = match[1].trim();
      if (text) return text;
      for (let j = i + 1; j < lines.length; j += 1) {
        const next = lines[j].trim();
        if (next) return next;
      }
    }
  }
  return "";
}

function truncate(text, maxLen) {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 3)).trim()}...`;
}

function detectDockerStorageIssue(output) {
  const text = output.toLowerCase();
  if (
    text.includes("read-only file system") ||
    text.includes("input/output error") ||
    text.includes("error creating temporary lease") ||
    text.includes("overlay2") ||
    (text.includes("containerd") && text.includes("metadata")) ||
    text.includes("failed to initialize session")
  ) {
    return true;
  }
  return false;
}

function printDockerStorageHint(output) {
  const red = "\u001b[31m";
  const yellow = "\u001b[33m";
  const reset = "\u001b[0m";
  process.stderr.write(
    `\n${red}Docker storage error detected.${reset}\n` +
      `${yellow}Likely cause:${reset} Docker Desktop filesystem is read-only or corrupted.\n` +
      `${yellow}Recommended fixes:${reset}\n` +
      `- Restart Docker Desktop\n` +
      `- Check disk space\n` +
      `- Docker Desktop -> Troubleshoot -> Clean/Purge data\n` +
      `- Reinstall Docker or switch to Colima\n` +
      `- Temporary bypass: set docker.enabled=false in ralph.config.yml\n`
  );
  if (output) {
    process.stderr.write(
      `${yellow}Raw error (truncated):${reset} ${truncate(output, 240)}\n`
    );
  }
}

function extractLatestIteration(logContent) {
  const parts = logContent.split(/^##\s+Iteration\s+/m).filter(Boolean);
  if (parts.length === 0) return null;
  const last = parts[parts.length - 1];
  const lines = last.split(/\r?\n/);
  const title = lines[0] ? lines[0].trim() : "";

  const section = (label) => {
    const index = lines.findIndex((line) => line.startsWith(label));
    if (index === -1) return [];
    const items = [];
    for (let i = index + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.startsWith("- ") && !line.startsWith(label)) {
        items.push(line.slice(2).trim());
        continue;
      }
      if (line.startsWith("## ")) break;
      if (line.startsWith("- ")) continue;
      if (line.startsWith("  - ")) {
        items.push(line.slice(4).trim());
      } else if (line.trim() && !line.startsWith("-")) {
        items.push(line.trim());
      }
    }
    return items;
  };

  return {
    title,
    changes: section("- Changes made:"),
    commands: section("- Commands run + results:"),
    blockers: section("- Blockers + next step:"),
  };
}

function writeSummary(summaryPath, data) {
  const lines = [];
  lines.push(`# Summary`);
  lines.push(``);
  lines.push(`- Status: ${data.status}`);
  lines.push(`- Iterations: ${data.iterations}`);
  lines.push(`- Progress: ${data.progress.completed}/${data.progress.total} (${data.progress.percent}%)`);
  lines.push(``);
  if (data.latest?.title) {
    lines.push(`## Latest iteration`);
    lines.push(`- ${data.latest.title}`);
    lines.push(``);
  }
  if (data.latest?.changes?.length) {
    lines.push(`## Changes`);
    data.latest.changes.forEach((item) => lines.push(`- ${item}`));
    lines.push(``);
  }
  if (data.latest?.commands?.length) {
    lines.push(`## Commands`);
    data.latest.commands.forEach((item) => lines.push(`- ${item}`));
    lines.push(``);
  }
  if (data.latest?.blockers?.length) {
    lines.push(`## Blockers`);
    data.latest.blockers.forEach((item) => lines.push(`- ${item}`));
    lines.push(``);
  }
  fs.writeFileSync(summaryPath, lines.join("\n"), "utf8");
}

function readNewLogChunk() {
  if (!fs.existsSync(logPath)) return;
  const stats = fs.statSync(logPath);
  if (stats.size <= lastLogSize) return;
  const log = fs.readFileSync(logPath, "utf8").slice(lastLogSize);
  lastLogSize = stats.size;
  if (log.trim()) {
    process.stdout.write(`\n--- Ralph Loop Log update ---\n\n${log}\n`);
  }
}

function readNewScratchpadChunk() {
  if (!fs.existsSync(scratchpadPath)) return;
  const stats = fs.statSync(scratchpadPath);
  if (stats.size <= lastScratchpadSize) return;
  const log = fs.readFileSync(scratchpadPath, "utf8").slice(lastScratchpadSize);
  lastScratchpadSize = stats.size;
  if (log.trim()) {
    process.stdout.write(
      `\n--- Ralph Scratchpad update ---\n\n${log}\n`
    );
  }
}

function runCodex(prompt) {
  return new Promise((resolve) => {
    const args = ["exec"];
    if (model) args.push("--model", model);
    if (profile) args.push("--profile", profile);
    if (fullAuto) args.push("--full-auto");
    if (askForApproval) {
      args.push("--config", `ask_for_approval=${askForApproval}`);
    }
    if (modelReasoningEffort) {
      args.push(
        "--config",
        `model_reasoning_effort=${modelReasoningEffort}`
      );
    }
    if (resolvedSandbox) args.push("--sandbox", resolvedSandbox);
    args.push("-");

    let command = "codex";
    let commandArgs = args;
    if (activeDockerConfig?.enabled) {
      if (!activeDockerConfig.codexInstall) {
        console.error(
          "docker.codex_install is required when docker.enabled is true."
        );
        process.exit(1);
      }
      ensureDockerImage(activeDockerConfig);
      command = "docker";
      commandArgs = [
        ...buildDockerRunArgs(activeDockerConfig),
        activeDockerConfig.image,
        "codex",
        ...args,
      ];
    }

    const child = spawn(command, commandArgs, {
      cwd: root,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const styler = createLogStyler();
    let output = "";
    let lineBuffer = "";

    const writeWithColor = (text, isStderr = false) => {
      if (isStderr) {
        process.stderr.write(text);
      } else {
        process.stdout.write(text);
      }
    };

    const flushLines = (chunk, isStderr = false) => {
      lineBuffer += chunk;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() || "";

      for (const line of lines) {
        writeWithColor(`${styler.formatLine(line)}\n`, isStderr);
      }
    };
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      flushLines(text, false);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      flushLines(text, true);
    });

    if (streamLog || streamScratchpad) {
      const interval = setInterval(() => {
        if (streamLog) readNewLogChunk();
        if (streamScratchpad) readNewScratchpadChunk();
      }, 500);
      child.on("close", (code) => {
        clearInterval(interval);
        if (streamLog) readNewLogChunk();
        if (streamScratchpad) readNewScratchpadChunk();
        if (lineBuffer) {
          flushLines("\n");
        }
        resolve({ code: code ?? 0, output });
      });
    } else {
      child.on("close", (code) => {
        if (lineBuffer) {
          flushLines("\n");
        }
        resolve({ code: code ?? 0, output });
      });
    }

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function main() {
  const hasCompletion = (output) =>
    output
      .split(/\r?\n/)
      .some((line) => line.trim() === completionPromise);

  if (typeof reasoningChoice !== "undefined") {
    if (reasoningChoice === "__prompt__") {
      modelReasoningEffort = await promptReasoningEffort(modelReasoningEffort);
    } else {
      modelReasoningEffort = normalizeReasoningEffort(reasoningChoice);
    }
  }

  promptBase = buildPromptBase();
  fs.writeFileSync(promptPath, promptBase, "utf8");

  const warnings = validateTasksFile(tasksFile);
  if (warnings.length > 0) {
    const yellow = "\u001b[33m";
    const reset = "\u001b[0m";
    process.stdout.write(`\n${yellow}Task file warnings:${reset}\n`);
    warnings.forEach((warning) =>
      process.stdout.write(`${yellow}- ${warning}${reset}\n`)
    );
    process.stdout.write("\n");

    const confirm = new Confirm({
      name: "continue",
      message: "Continue despite warnings?",
      initial: false,
    });
    const shouldContinue = await confirm.run();
    if (!shouldContinue) {
      process.stdout.write("Aborted by user.\n");
      process.exit(1);
    }
  }

  const initialProgress = getTaskProgress(tasksFile);
  if (initialProgress.total > 0 && initialProgress.completed === initialProgress.total) {
    const green = "\u001b[32m";
    const reset = "\u001b[0m";
    process.stdout.write(
      `\n${green}All tasks are already completed (${initialProgress.completed}/${initialProgress.total}).${reset}\n`
    );
    process.exit(0);
  }

  const barWidth = 20;
  let iterationsUsed = 0;
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    iterationsUsed = iteration;
    const prompt = `${promptBase}\nIteration: ${iteration} of ${maxIterations}\n`;
    const progress = getTaskProgress(tasksFile);
    const blue = "\u001b[34m";
    const cyan = "\u001b[36m";
    const green = "\u001b[32m";
    const yellow = "\u001b[33m";
    const reset = "\u001b[0m";
    const filled = Math.round((progress.percent / 100) * barWidth);
    const empty = barWidth - filled;
    const bar = `[${"#".repeat(filled)}${"-".repeat(empty)}]`;
    const lastBlocker = getLastBlocker(logPath);
    process.stdout.write(
      `\n${blue}=== Iteration ${iteration}/${maxIterations} ===${reset}\n` +
        `${cyan}${bar}${reset} ` +
        `${green}✓ ${progress.completed}${reset} ` +
        `${yellow}~ ${progress.blocked}${reset} / ` +
        `${progress.total} (${progress.percent}%)\n`
    );
    if (lastBlocker) {
      process.stdout.write(
        `${yellow}Last blocker: ${truncate(lastBlocker, 140)}${reset}\n\n`
      );
    } else {
      process.stdout.write("\n");
    }
    const result = await runCodex(prompt);
    lastOutput = result.output;

    if (activeDockerConfig?.enabled && detectDockerStorageIssue(result.output)) {
      fatalDockerError = result.output;
      printDockerStorageHint(result.output);
      break;
    }

    if (hasCompletion(result.output)) {
      completed = true;
      break;
    }

    lastStatus = result.code ?? 0;
    if (lastStatus !== 0 && stopOnError) {
      break;
    }
  }

  const progress = getTaskProgress(tasksFile);
  const iterationsSummary = `${iterationsUsed}/${maxIterations}`;
  const logContent = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
  const latest = logContent ? extractLatestIteration(logContent) : null;
  const summaryStatus = completed ? "completed" : "incomplete";
  writeSummary(scratchpadPath, {
    status: summaryStatus,
    iterations: iterationsSummary,
    progress,
    latest,
  });

  if (!quiet && fs.existsSync(logPath)) {
    const log = fs.readFileSync(logPath, "utf8");
    if (log.trim()) {
      process.stdout.write(
        `\n--- Ralph Loop Log (${path.relative(root, logPath)}) ---\n\n`
      );
      process.stdout.write(log);
      process.stdout.write("\n");
    }
  }

  const green = "\u001b[32m";
  const red = "\u001b[31m";
  const reset = "\u001b[0m";

  if (completed) {
    process.stdout.write(
      `\n${green}Ralph run complete: LOOP_COMPLETE detected.${reset}\n`
    );
    cleanupDockerImage(activeDockerConfig || { enabled: false });
    process.exit(0);
  }

  if (fatalDockerError) {
    process.stderr.write(
      `\n${red}Ralph run failed: Docker storage error.${reset}\n`
    );
    cleanupDockerImage(activeDockerConfig || { enabled: false });
    process.exit(1);
  }

  const reason =
    lastStatus !== 0 && stopOnError
      ? `Stopped on error (exit code ${lastStatus}).`
      : "Max iterations reached without completion.";

  const hint =
    "Review .ralph/loop-log.md for blockers and decide next steps.";

  process.stderr.write(`\n${red}Ralph run failed: ${reason}${reset}\n`);
  process.stderr.write(`${red}${hint}${reset}\n`);
  cleanupDockerImage(activeDockerConfig || { enabled: false });
  process.exit(1);
}

void main();
