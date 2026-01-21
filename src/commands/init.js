const fs = require("fs");
const path = require("path");
const { Confirm, Input, Select } = require("enquirer");

const root = process.cwd();
const argv = process.argv.slice(2);

let force = false;
let configPath = null;
let updateGitignore = true;

for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--force") {
    force = true;
    continue;
  }
  if (arg === "--config") {
    configPath = argv[i + 1];
    i += 1;
    continue;
  }
  if (arg === "--no-gitignore") {
    updateGitignore = false;
    continue;
  }
}

const templatePath = path.join(__dirname, "..", "..", "templates", "ralph.config.yml");
const targetPath = configPath
  ? path.resolve(root, configPath)
  : path.join(root, "ralph.config.yml");

async function confirmOverwrite() {
  const confirm = new Confirm({
    name: "overwrite",
    message: `Overwrite existing ${path.relative(root, targetPath)}?`,
    initial: false,
  });
  return confirm.run();
}

function formatYamlValue(value) {
  if (value === null || value === undefined || value === "") return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return JSON.stringify(String(value));
}

function setYamlValue(content, key, value, indent = "  ") {
  const pattern = new RegExp(`^${indent}${key}:\\s*[^#]*?(\\s*#.*)?$`, "m");
  if (!pattern.test(content)) return content;
  return content.replace(pattern, (match, comment = "") => {
    return `${indent}${key}: ${formatYamlValue(value)}${comment || ""}`;
  });
}

function removeTopLevelSection(content, section) {
  const lines = content.split(/\r?\n/);
  const topLevel = (line) => /^[A-Za-z_][A-Za-z0-9_-]*:\s*$/.test(line);
  let start = -1;
  let end = lines.length;

  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() === `${section}:`) {
      start = i;
      break;
    }
  }

  if (start === -1) return content;

  for (let i = start + 1; i < lines.length; i += 1) {
    if (topLevel(lines[i]) && !lines[i].startsWith("  ")) {
      end = i;
      break;
    }
  }

  const before = lines.slice(0, start);
  const after = lines.slice(end);
  while (
    before.length > 0 &&
    before[before.length - 1].trim() === "" &&
    after.length > 0 &&
    after[0].trim() === ""
  ) {
    before.pop();
  }

  return [...before, ...after].join("\n");
}

async function promptOptionalInput(message) {
  const input = new Input({
    name: "value",
    message,
  });
  const value = await input.run();
  const trimmed = String(value || "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function promptSelect(message, choices, initial = 0) {
  const select = new Select({
    name: "choice",
    message,
    choices,
    initial,
  });
  return select.run();
}

async function promptModelChoice() {
  const models = [
    { value: "gpt-5.2-codex", label: "gpt-5.2-codex (recommended)" },
    { value: "gpt-5.1-codex-mini", label: "gpt-5.1-codex-mini (recommended)" },
    { value: "gpt-5.1-codex-max", label: "gpt-5.1-codex-max" },
    { value: "gpt-5.2", label: "gpt-5.2" },
    { value: "gpt-5.1", label: "gpt-5.1" },
    { value: "gpt-5.1-codex", label: "gpt-5.1-codex" },
    { value: "gpt-5-codex", label: "gpt-5-codex" },
    { value: "gpt-5-codex-mini", label: "gpt-5-codex-mini" },
    { value: "gpt-5", label: "gpt-5" },
  ];
  const choice = await promptSelect("Select a Codex model:", [
    { name: "unset", message: "unset (null)", value: null },
    ...models.map((model) => ({
      name: model.value,
      message: model.label,
      value: model.value,
    })),
    { name: "custom", message: "custom (enter manually)", value: "__custom__" },
  ]);

  if (choice === "__custom__") {
    return promptOptionalInput("Custom model name (leave blank for null)");
  }

  return choice;
}

async function collectCodexConfig() {
  const model = await promptModelChoice();
  const profile = await promptOptionalInput(
    "Codex CLI profile (optional; leave blank to use Codex default)"
  );
  const fullAuto = await new Confirm({
    name: "full_auto",
    message: "Enable full_auto? (quick setup: workspace-write + on-request)",
    initial: false,
  }).run();

  const sandbox = await promptSelect("Sandbox mode:", [
    { name: "unset", message: "unset (null; use Codex default)", value: null },
    { name: "read-only", message: "read-only (safest)", value: "read-only" },
    { name: "workspace-write", message: "workspace-write (recommended)", value: "workspace-write" },
    { name: "danger-full-access", message: "danger-full-access (no guardrails)", value: "danger-full-access" },
  ]);

  const askForApproval = await promptSelect("Approval policy:", [
    { name: "unset", message: "unset (null; use Codex default)", value: null },
    { name: "untrusted", message: "untrusted (prompt often)", value: "untrusted" },
    { name: "on-failure", message: "on-failure (prompt on errors)", value: "on-failure" },
    { name: "on-request", message: "on-request (prompt for risky ops)", value: "on-request" },
    { name: "never", message: "never (no prompts)", value: "never" },
  ]);

  const modelReasoningEffort = await promptSelect(
    "Model reasoning effort:",
    [
      { name: "unset", message: "unset (null)", value: null },
      { name: "low", message: "low", value: "low" },
      { name: "medium", message: "medium", value: "medium" },
      { name: "high", message: "high", value: "high" },
      { name: "extra-high", message: "extra-high", value: "extra-high" },
    ],
    2
  );

  return {
    model,
    profile,
    sandbox,
    ask_for_approval: askForApproval,
    full_auto: fullAuto,
    model_reasoning_effort: modelReasoningEffort,
  };
}

async function main() {
  if (!fs.existsSync(templatePath)) {
    console.error("Missing template ralph.config.yml in package.");
    process.exit(1);
  }

  if (fs.existsSync(targetPath) && !force) {
    const ok = await confirmOverwrite();
    if (!ok) {
      process.stdout.write("Aborted.\n");
      process.exit(1);
    }
  }

  const content = fs.readFileSync(templatePath, "utf8");
  const codexConfig = await collectCodexConfig();
  const useDocker = await new Confirm({
    name: "use_docker",
    message: "Use Docker for the loop? (adds a docker section)",
    initial: false,
  }).run();

  let updated = content;
  updated = setYamlValue(updated, "model", codexConfig.model);
  updated = setYamlValue(updated, "profile", codexConfig.profile);
  updated = setYamlValue(updated, "sandbox", codexConfig.sandbox);
  updated = setYamlValue(updated, "ask_for_approval", codexConfig.ask_for_approval);
  updated = setYamlValue(updated, "full_auto", codexConfig.full_auto);
  updated = setYamlValue(
    updated,
    "model_reasoning_effort",
    codexConfig.model_reasoning_effort
  );

  if (useDocker) {
    updated = setYamlValue(updated, "enabled", true);
  } else {
    updated = removeTopLevelSection(updated, "docker");
  }

  fs.writeFileSync(targetPath, `${updated.trimEnd()}\n`, "utf8");
  process.stdout.write(
    `Success: configured ${path.relative(root, targetPath)}\n`
  );

  if (updateGitignore) {
    const gitignorePath = path.join(root, ".gitignore");
    const entry = ".ralph";
    if (fs.existsSync(gitignorePath)) {
      const gitignore = fs.readFileSync(gitignorePath, "utf8");
      if (!gitignore.split(/\r?\n/).includes(entry)) {
        fs.appendFileSync(gitignorePath, `\n${entry}\n`, "utf8");
        process.stdout.write("Updated .gitignore with .ralph\n");
      }
    } else {
      fs.writeFileSync(gitignorePath, `${entry}\n`, "utf8");
      process.stdout.write("Created .gitignore with .ralph\n");
    }
  }
}

void main();
