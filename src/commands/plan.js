const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Confirm, Editor, Input, MultiSelect, Select } = require("enquirer");
const yaml = require("js-yaml");
const { colors, createLogStyler, createSpinner } = require("../ui/terminal");

const root = process.cwd();
const agentDir = path.join(root, ".ralph");

const argv = process.argv.slice(2);
let maxIterations = "1";
let tasksPath = "tasks.md";
let noSandbox = false;
let sandbox = null;
let fullAuto = false;
let askForApproval = null;
let model = null;
let profile = null;
let configPath = null;
let modelReasoningEffort = null;
let activeDockerConfig = null;
let autoDetectSuccessCriteria = null;
let reasoningChoice;
let showHelp = false;
const ideaParts = [];

for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--help" || arg === "-h" || arg === "help") {
    showHelp = true;
    continue;
  }
  if (arg === "--max-iterations") {
    maxIterations = argv[i + 1];
    i += 1;
    continue;
  }
  if (arg === "--tasks") {
    tasksPath = argv[i + 1];
    i += 1;
    continue;
  }
  if (arg === "--output") {
    tasksPath = argv[i + 1];
    i += 1;
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
  if (arg === "--config") {
    configPath = argv[i + 1];
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
  if (arg === "--detect-success-criteria") {
    autoDetectSuccessCriteria = true;
    continue;
  }
  if (arg === "--no-detect-success-criteria") {
    autoDetectSuccessCriteria = false;
    continue;
  }
  ideaParts.push(arg);
}

function printHelp() {
  process.stdout.write(
    `\n${colors.cyan('ralph-codex plan "<idea>" [options]')}\n\n` +
      `${colors.yellow("Options:")}\n` +
      `  ${colors.green("--output <path>")}                 Write tasks to a custom file (alias of --tasks)\n` +
      `  ${colors.green("--tasks <path>")}                  Write tasks to a custom file (default: tasks.md)\n` +
      `  ${colors.green("--max-iterations <n>")}            Max planning iterations (default: 1)\n` +
      `  ${colors.green("--config <path>")}                 Path to ralph.config.yml\n` +
      `  ${colors.green("--model <name>, -m")}              Codex model\n` +
      `  ${colors.green("--profile <name>, -p")}            Codex CLI profile\n` +
      `  ${colors.green("--sandbox <mode>")}                read-only | workspace-write | danger-full-access\n` +
      `  ${colors.green("--no-sandbox")}                    Use danger-full-access\n` +
      `  ${colors.green("--ask-for-approval <mode>")}       untrusted | on-failure | on-request | never\n` +
      `  ${colors.green("--full-auto")}                     workspace-write + on-request\n` +
      `  ${colors.green("--reasoning [effort]")}            low | medium | high | extra-high (omit to pick)\n` +
      `  ${colors.green("--detect-success-criteria")}       Add auto-detected checks\n` +
      `  ${colors.green("--no-detect-success-criteria")}    Disable auto-detect\n` +
      `  ${colors.green("-h, --help")}                      Show help\n\n`
  );
}

if (showHelp) {
  printHelp();
  process.exit(0);
}

const idea = ideaParts.join(" ").trim();

if (!idea) {
  console.error(
    "Usage: ralph-codex plan \"<idea>\" [--output <path>] [--tasks <path>] [--max-iterations <n>]"
  );
  process.exit(1);
}

const promptPath = path.join(agentDir, "ralph-plan-prompt.md");
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
    tty: dockerConfig.tty ?? "auto",
  };
}

function parseRequiredTools(tasksFilePath) {
  if (!fs.existsSync(tasksFilePath)) {
    return { apt: [], npm: [], pip: [] };
  }
  const content = fs.readFileSync(tasksFilePath, "utf8");
  const lines = content.split(/\r?\n/);
  let inSection = false;
  const tools = { apt: [], npm: [], pip: [] };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#+\s*required tools\b/i.test(line) || /^required tools\b/i.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^#+\s+/.test(line)) {
      break;
    }
    if (!inSection) continue;

    const match = line.match(/^-+\s*(apt|npm|pip)\s*:\s*(.*)$/i);
    if (!match) continue;
    const kind = match[1].toLowerCase();
    const items = match[2]
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item && item.toLowerCase() !== "none");
    tools[kind] = tools[kind].concat(items);
  }

  return tools;
}

function uniqueList(values) {
  return Array.from(new Set(values.filter(Boolean)));
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

function normalizeChoiceList(value) {
  if (!Array.isArray(value)) return null;
  const cleaned = value
    .map((item) => String(item).trim())
    .filter(Boolean);
  return cleaned.length > 0 ? cleaned : null;
}

function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (_) {
    return "";
  }
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function fileContains(relativePath, snippet) {
  const content = safeReadFile(path.join(root, relativePath));
  return content.includes(snippet);
}

function detectPackageManager() {
  if (fileExists("pnpm-lock.yaml")) return "pnpm";
  if (fileExists("yarn.lock")) return "yarn";
  if (fileExists("bun.lockb")) return "bun";
  return "npm";
}

function buildScriptCommand(script, manager) {
  if (manager === "yarn") return `yarn ${script}`;
  if (manager === "pnpm") return `pnpm ${script}`;
  if (manager === "bun") return `bun run ${script}`;
  return `npm run ${script}`;
}

function detectNodeSuccessCriteria() {
  if (!fileExists("package.json")) return [];
  let pkg = null;
  try {
    pkg = JSON.parse(safeReadFile(path.join(root, "package.json")));
  } catch (_) {
    return [];
  }
  const scripts = pkg && typeof pkg === "object" ? pkg.scripts : null;
  if (!scripts || typeof scripts !== "object") return [];
  const scriptNames = Object.keys(scripts).filter(
    (name) => name && !name.startsWith("pre") && !name.startsWith("post")
  );
  if (scriptNames.length === 0) return [];
  const preferred = [
    "test",
    "test:unit",
    "test:integration",
    "test:e2e",
    "e2e",
    "lint",
    "typecheck",
    "build",
    "ci",
    "check",
    "format",
  ];
  const manager = detectPackageManager();
  const picked = preferred.filter((name) => scriptNames.includes(name));
  const commands = picked.map((name) => buildScriptCommand(name, manager));
  if (commands.length > 0) return commands;
  const keywordMatches = scriptNames.filter((name) =>
    /(test|lint|build|typecheck|check|ci|e2e)/.test(name)
  );
  return keywordMatches.slice(0, 6).map((name) => buildScriptCommand(name, manager));
}

function detectMakeTargets() {
  const makefile = ["Makefile", "makefile"].find((name) => fileExists(name));
  if (!makefile) return [];
  const content = safeReadFile(path.join(root, makefile));
  if (!content) return [];
  const targets = new Set();
  for (const raw of content.split(/\r?\n/)) {
    if (!raw || /^\s/.test(raw)) continue;
    const match = raw.match(/^([A-Za-z0-9][A-Za-z0-9_./-]*)\s*:/);
    if (!match) continue;
    const target = match[1].trim();
    if (!target || target.startsWith(".") || target.includes("%")) continue;
    targets.add(target);
  }
  const preferred = ["test", "lint", "build", "check", "ci", "fmt", "format"];
  return preferred
    .filter((target) => targets.has(target))
    .map((target) => `make ${target}`);
}

function detectPythonSuccessCriteria() {
  const hasPython =
    fileExists("pyproject.toml") ||
    fileExists("requirements.txt") ||
    fileExists("setup.py") ||
    fileExists("setup.cfg");
  if (!hasPython) return [];
  const hasPytestConfig =
    fileExists("pytest.ini") ||
    fileContains("pyproject.toml", "[tool.pytest") ||
    fileContains("setup.cfg", "[tool:pytest]");
  const hasTestsDir =
    fs.existsSync(path.join(root, "tests")) || fs.existsSync(path.join(root, "test"));
  const choices = [];
  if (fileExists("tox.ini")) choices.push("tox");
  if (fileExists("noxfile.py")) choices.push("nox");
  if (hasPytestConfig || hasTestsDir) choices.push("python -m pytest");
  return choices;
}

function detectGoSuccessCriteria() {
  if (fileExists("go.mod") || fileExists("go.work")) {
    return ["go test ./..."];
  }
  return [];
}

function detectRustSuccessCriteria() {
  if (fileExists("Cargo.toml")) return ["cargo test"];
  return [];
}

function detectJavaSuccessCriteria() {
  const choices = [];
  if (fileExists("pom.xml")) choices.push("mvn test");
  if (fileExists("build.gradle") || fileExists("build.gradle.kts")) {
    choices.push(fileExists("gradlew") ? "./gradlew test" : "gradle test");
  }
  return choices;
}

function detectDotNetSuccessCriteria() {
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (_) {
    return [];
  }
  const hasDotNet = entries.some(
    (entry) =>
      entry.isFile() &&
      (entry.name.endsWith(".sln") ||
        entry.name.endsWith(".csproj") ||
        entry.name.endsWith(".fsproj") ||
        entry.name.endsWith(".vbproj"))
  );
  return hasDotNet ? ["dotnet test"] : [];
}

function detectSuccessCriteria() {
  return uniqueList([
    ...detectNodeSuccessCriteria(),
    ...detectMakeTargets(),
    ...detectPythonSuccessCriteria(),
    ...detectGoSuccessCriteria(),
    ...detectRustSuccessCriteria(),
    ...detectJavaSuccessCriteria(),
    ...detectDotNetSuccessCriteria(),
  ]);
}

function extractRequiredToolsSection(content) {
  const lines = content.split(/\r?\n/);
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (/^(#+\s*)?required tools\b/i.test(line)) {
      start = i;
      break;
    }
  }
  if (start !== -1) {
    for (let i = start + 1; i < lines.length; i += 1) {
      if (/^#+\s+/.test(lines[i].trim())) {
        end = i;
        break;
      }
    }
  }

  const tools = { apt: [], npm: [], pip: [] };
  if (start !== -1) {
    for (let i = start + 1; i < end; i += 1) {
      const line = lines[i].trim();
      const match = line.match(/^-+\s*(apt|npm|pip)\s*:\s*(.*)$/i);
      if (!match) continue;
      const kind = match[1].toLowerCase();
      const items = match[2]
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item && item.toLowerCase() !== "none");
      tools[kind] = items;
    }
  }

  return { lines, start, end, tools };
}

function inferRequiredTools(content) {
  const text = content.toLowerCase();
  const tools = { apt: [], npm: [], pip: [] };
  const add = (bucket, item) => {
    if (!item) return;
    tools[bucket].push(item);
  };

  if (/\bffmpeg\b|\bffprobe\b/.test(text)) add("apt", "ffmpeg");
  if (/\bimagemagick\b|\bconvert\b/.test(text)) add("apt", "imagemagick");
  if (/\bpillow\b/.test(text)) add("pip", "pillow");
  if (/\bpython\b/.test(text)) add("apt", "python3");
  if (/\bcurl\b/.test(text)) add("apt", "curl");
  if (/\bwget\b/.test(text)) add("apt", "wget");
  if (/\bplaywright\b/.test(text)) add("npm", "playwright");
  if (/\bsharp\b/.test(text)) add("npm", "sharp");
  if (/\bchromium\b|\bchrome\b/.test(text)) add("apt", "chromium");

  tools.apt = uniqueList(tools.apt);
  tools.npm = uniqueList(tools.npm);
  tools.pip = uniqueList(tools.pip);
  return tools;
}

function enrichRequiredTools(tasksFilePath) {
  if (!fs.existsSync(tasksFilePath)) return;
  const content = fs.readFileSync(tasksFilePath, "utf8");
  const { lines, start, end, tools: existing } =
    extractRequiredToolsSection(content);
  const inferred = inferRequiredTools(content);

  const merged = {
    apt: uniqueList([...existing.apt, ...inferred.apt]),
    npm: uniqueList([...existing.npm, ...inferred.npm]),
    pip: uniqueList([...existing.pip, ...inferred.pip]),
  };

  const sectionLines = [
    "## Required tools",
    `- apt: ${merged.apt.length ? merged.apt.join(", ") : "none"}`,
    `- npm: ${merged.npm.length ? merged.npm.join(", ") : "none"}`,
    `- pip: ${merged.pip.length ? merged.pip.join(", ") : "none"}`,
  ];

  let updatedLines = lines.slice();
  if (start === -1) {
    const successIndex = updatedLines.findIndex((line) =>
      /^##\s*success criteria\b/i.test(line.trim())
    );
    if (successIndex !== -1) {
      let insertAt = updatedLines.length;
      for (let i = successIndex + 1; i < updatedLines.length; i += 1) {
        if (/^#+\s+/.test(updatedLines[i].trim())) {
          insertAt = i;
          break;
        }
      }
      updatedLines.splice(insertAt, 0, "", ...sectionLines);
    } else {
      updatedLines = updatedLines.concat(["", ...sectionLines]);
    }
  } else {
    updatedLines.splice(start, end - start, ...sectionLines);
  }

  const updated = updatedLines.join("\n");
  if (updated !== content) {
    fs.writeFileSync(tasksFilePath, updated, "utf8");
  }
}

function ensureDockerfile(dockerConfig, requiredTools) {
  if (!dockerConfig.enabled) return;
  const dockerfilePath = path.join(root, dockerConfig.dockerfile);
  const tools = requiredTools || { apt: [], npm: [], pip: [] };
  const aptPackages = uniqueList([
    ...dockerConfig.aptPackages,
    ...tools.apt,
  ]);
  const npmGlobals = uniqueList([
    ...dockerConfig.npmGlobals,
    ...tools.npm,
  ]);
  const pipPackages = uniqueList([
    ...dockerConfig.pipPackages,
    ...tools.pip,
  ]);

  if (pipPackages.length > 0) {
    if (!aptPackages.includes("python3")) aptPackages.push("python3");
    if (!aptPackages.includes("python3-venv")) aptPackages.push("python3-venv");
    if (!aptPackages.includes("python3-pip")) aptPackages.push("python3-pip");
  }

  const lines = [
    "# Generated by ralph-codex plan",
    `FROM ${dockerConfig.baseImage}`,
    aptPackages.length > 0
      ? `RUN apt-get update && apt-get install -y ${aptPackages.join(
          " "
        )} && rm -rf /var/lib/apt/lists/*`
      : "RUN apt-get update && rm -rf /var/lib/apt/lists/*",
    `WORKDIR ${dockerConfig.workdir}`,
  ];

  if (dockerConfig.codexInstall) {
    lines.push(`RUN ${dockerConfig.codexInstall}`);
  } else {
    lines.push("# TODO: set docker.codex_install in ralph.config.yml");
  }

  if (npmGlobals.length > 0) {
    lines.push(`RUN npm install -g ${npmGlobals.join(" ")}`);
  }
  if (pipPackages.length > 0) {
    lines.push("RUN python3 -m venv /opt/venv");
    lines.push('ENV PATH="/opt/venv/bin:$PATH"');
    lines.push(`RUN pip install --no-cache-dir ${pipPackages.join(" ")}`);
  }

  fs.writeFileSync(dockerfilePath, `${lines.join("\n")}\n`, "utf8");
}

let dockerBuilt = false;

function ensureDockerImage(dockerConfig) {
  if (!dockerConfig.enabled || dockerBuilt) return;
  ensureDockerfile(dockerConfig);
  const dockerfilePath = path.join(root, dockerConfig.dockerfile);
  const result = spawnSync(
    "docker",
    ["build", "-f", dockerfilePath, "-t", dockerConfig.image, "."],
    { stdio: "inherit", cwd: root }
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  dockerBuilt = true;
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

function buildPrompt(successCriteria) {
  return `# Ralph Plan

You are creating a task list for this repo.

Idea:
${idea}

Requirements:
- If there are open questions, ask them first and do not write ${tasksPath}.
- Only ask a single round of questions, then stop and output: LOOP_COMPLETE.
- Ask only what blocks concrete task creation. Prefer 3-6 precise, technical questions.
- Use numbered questions. Make each question specific (route, env, file paths, commands).
- If answers are provided, do not ask more questions. Make reasonable assumptions
  and proceed to write ${tasksPath}.
- If "Revision feedback" is provided, update ${tasksPath} accordingly without
  asking new questions.
- Output a Markdown task list to ${tasksPath} using \`- [ ]\` checkboxes.
- Tasks must be atomic, ordered, and verifiable. Include exact file paths,
  commands to run, and expected outcomes. Avoid vague verbs like "handle" or "improve".
- Include a short "Success criteria" section with exactly these items (commands or checks):
${successCriteria}
- Include a "Required tools" section using this exact format:
  - \`- apt: <comma-separated packages or none>\`
  - \`- npm: <comma-separated packages or none>\`
  - \`- pip: <comma-separated packages or none>\`
- Do not edit any files other than ${tasksPath}.
- Do not run tests or start dev servers during planning.

When done, output exactly: LOOP_COMPLETE
`;
}

async function runCodex(prompt, spinnerText) {
  fs.writeFileSync(promptPath, prompt, "utf8");
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

  const resolvedSandbox = noSandbox ? "danger-full-access" : sandbox;
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

  const spinner = createSpinner(spinnerText || "Generating plan...");
  return new Promise((resolve) => {
    const styler = createLogStyler();
    const child = spawn(command, commandArgs, {
      cwd: root,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("error", (error) => {
      spinner.stop();
      console.error(error?.message || error);
      process.exit(1);
    });
    child.on("close", (code) => {
      spinner.stop();
      const combined = `${stdout}\n${stderr}`;
      const lines = combined.split(/\r?\n/);
      for (const line of lines) {
        if (!line) continue;
        process.stdout.write(`${styler.formatLine(line)}\n`);
      }
      resolve({ status: code ?? 0, output: combined.trim() });
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function resetStdin() {
  if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
    process.stdin.setRawMode(false);
  }
  process.stdin.resume();
}

function extractQuestions(output) {
  const lines = output.split(/\r?\n/);
  const questions = [];
  let inQuestions = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#+\s*questions/i.test(line) || /^questions[:]?/i.test(line)) {
      inQuestions = true;
      continue;
    }

    if (inQuestions && !line.startsWith("-") && !line.match(/^\d+[.)]/)) {
      // Stop on first non-question line once in the questions section.
      inQuestions = false;
    }

    const isQuestion =
      line.endsWith("?") || (inQuestions && line.includes("?"));

    if (isQuestion) {
      const cleaned = line.replace(/^[-*\d.)\s]+/, "").trim();
      if (cleaned) questions.push(cleaned);
    }
  }

  return Array.from(new Set(questions));
}

async function readUserAnswers(questions) {
  resetStdin();
  if (questions && questions.length > 0) {
    const answers = [];
    for (const question of questions) {
      const input = new Input({
        name: "answer",
        message: question,
      });
      const answer = await input.run();
      answers.push(`Q: ${question}\nA: ${answer}`);
    }
    return answers.join("\n\n");
  }

  if (process.stdin.isTTY) {
    try {
      const editor = new Editor({
        name: "answers",
        message:
          "Provide your answers in the editor, then save and close to continue.",
      });
      return await editor.run();
    } catch (_) {
      // Fall through to stdin prompt if editor is unavailable.
    }
  }

  const input = new Input({
    name: "answers",
    message: "Provide your answers (single line):",
  });
  return input.run();
}

async function selectSuccessCriteria(defaultCriteria, standardChoices) {
  const customChoice = "Add custom command(s)";
  const defaults = defaultCriteria && defaultCriteria.length > 0
    ? defaultCriteria
    : standardChoices;
  const extras = (defaultCriteria || []).filter(
    (item) => !standardChoices.includes(item)
  );
  const choices = [...standardChoices, ...extras, customChoice];

  const prompt = new MultiSelect({
    name: "criteria",
    message: "Select completion checks (space to toggle, enter to confirm):",
    choices,
    initial: choices
      .map((choice, index) =>
        defaults.includes(choice) ? index : null
      )
      .filter((index) => index !== null),
  });

  let selected = await prompt.run();
  if (!selected || selected.length === 0) {
    throw new Error("You must select at least one completion check.");
  }

  const wantsCustom = selected.includes(customChoice);
  selected = selected.filter((item) => item !== customChoice);

  if (wantsCustom) {
    const input = await new (require("enquirer").Input)({
      name: "custom",
      message:
        "Enter custom commands (comma-separated), e.g. make test, pytest, go test ./...:",
    }).run();

    const extras = input
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    selected = [...selected, ...extras];
  }

  if (selected.length === 0) {
    throw new Error("You must select at least one completion check.");
  }

  return selected;
}

async function confirmPlan(tasksFile) {
  const content = fs.readFileSync(tasksFile, "utf8");
  process.stdout.write(`\n${colors.cyan("--- Proposed tasks.md ---")}\n\n`);
  process.stdout.write(content);
  process.stdout.write(`\n${colors.cyan("--- End tasks.md ---")}\n\n`);
  const confirm = new Confirm({
    name: "confirm",
    message: "Approve this plan?",
    initial: true,
  });
  return confirm.run();
}

async function readRevisionFeedback() {
  resetStdin();
  const input = new Input({
    name: "feedback",
    message:
      "Enter revision feedback (single line). Use ';' to separate items:",
  });
  return input.run();
}

async function confirmResetState(tasksFilePath, agentPath) {
  const hasTasks = fs.existsSync(tasksFilePath);
  const hasAgent = fs.existsSync(agentPath);
  if (!hasTasks && !hasAgent) return false;

  const confirm = new Confirm({
    name: "reset",
    message: "Reset existing plan state (tasks.md + .ralph)?",
    initial: true,
  });
  return confirm.run();
}

function resetState(tasksFilePath, agentPath) {
  if (fs.existsSync(tasksFilePath)) {
    fs.rmSync(tasksFilePath, { force: true });
  }
  if (fs.existsSync(agentPath)) {
    fs.rmSync(agentPath, { recursive: true, force: true });
  }
}

async function main() {
  const resolvedConfigPath =
    configPath || path.join(root, "ralph.config.yml");
  const config = loadConfig(resolvedConfigPath);
  const codexConfig = config?.codex || {};
  const planConfig = config?.plan || {};
  const dockerConfig = resolveDockerConfig(config);
  activeDockerConfig = dockerConfig.useForPlan ? dockerConfig : null;

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
  if (typeof reasoningChoice !== "undefined") {
    if (reasoningChoice === "__prompt__") {
      modelReasoningEffort = await promptReasoningEffort(modelReasoningEffort);
    } else {
      modelReasoningEffort = normalizeReasoningEffort(reasoningChoice);
    }
  }
  if (tasksPath === "tasks.md" && planConfig.tasks_path) {
    tasksPath = planConfig.tasks_path;
  }

  const tasksFile = path.join(root, tasksPath);
  const shouldReset = await confirmResetState(tasksFile, agentDir);
  if (shouldReset) {
    resetState(tasksFile, agentDir);
  }
  fs.mkdirSync(agentDir, { recursive: true });

  let selected = [];
  try {
    const fallbackChoices = [
      "Run the project's primary test suite",
      "Run relevant linters or static checks",
      "Run the project's build or CI checks",
      "Manual verification of the main flow",
    ];
    const autoDetectEnabled =
      typeof autoDetectSuccessCriteria === "boolean"
        ? autoDetectSuccessCriteria
        : Boolean(planConfig.auto_detect_success_criteria);
    const detectedChoices = autoDetectEnabled ? detectSuccessCriteria() : [];
    const configuredDefaults = normalizeChoiceList(
      planConfig.default_success_criteria || config?.run?.success_criteria
    );
    const configuredChoices = normalizeChoiceList(
      planConfig.success_choices || config?.run?.success_criteria
    );
    const baseChoices = configuredChoices || fallbackChoices;
    const standardChoices =
      detectedChoices.length > 0
        ? uniqueList([...detectedChoices, ...baseChoices])
        : baseChoices;
    const defaults =
      configuredDefaults ||
      (detectedChoices.length > 0 ? detectedChoices : baseChoices);
    selected = await selectSuccessCriteria(defaults, standardChoices);
  } catch (error) {
    console.error(error?.message || "Failed to select completion checks.");
    process.exit(1);
  }

  const successCriteria = selected
    .map((item) => `  - \`${item}\``)
    .join("\n");
  const promptBase = buildPrompt(successCriteria);

  const first = await runCodex(promptBase, "Generating plan...");
  const questions = extractQuestions(first.output);

  if (questions.length > 0) {
    const answers = await readUserAnswers(questions);
    if (!answers) {
      console.error("No answers provided. Aborting.");
      process.exit(1);
    }

    process.stdout.write("\nRunning plan with your answers...\n\n");
    const promptWithAnswers = `${promptBase}\nAnswers:\n${answers}\n`;
    await runCodex(promptWithAnswers, "Generating plan with answers...");
    enrichRequiredTools(tasksFile);
  } else {
    enrichRequiredTools(tasksFile);
  }

  if (!fs.existsSync(tasksFile)) {
    console.error(`Planning did not produce ${tasksPath}.`);
    process.exit(1);
  }

  // Allow user review loop for the plan.
  while (true) {
    const approved = await confirmPlan(tasksFile);
    if (approved) break;

    const feedback = await readRevisionFeedback();
    if (!feedback) {
      console.error("No feedback provided. Aborting.");
      process.exit(1);
    }

    process.stdout.write("\nUpdating plan with your feedback...\n\n");
    const revisionPrompt = `${promptBase}\nRevision feedback:\n${feedback}\n`;
    await runCodex(revisionPrompt, "Updating plan...");
    enrichRequiredTools(tasksFile);

    if (!fs.existsSync(tasksFile)) {
      console.error(`Planning did not produce ${tasksPath}.`);
      process.exit(1);
    }
  }

  if (dockerConfig.enabled) {
    const requiredTools = parseRequiredTools(tasksFile);
    ensureDockerfile(dockerConfig, requiredTools);
    process.stdout.write(
      `Generated ${dockerConfig.dockerfile} with required tools.\n`
    );
  }
}

void main();
