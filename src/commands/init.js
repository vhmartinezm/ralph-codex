import fs from "fs";
import path from "path";
import enquirer from "enquirer";
import { fileURLToPath } from "url";

const { AutoComplete, Confirm, Input, Toggle } = enquirer;

const root = process.cwd();
const argv = process.argv.slice(2);
const isTestMode = process.env.RALPH_TEST_MODE === "1";

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(
  __dirname,
  "..",
  "..",
  "templates",
  "ralph.config.yml",
);
const targetPath = configPath
  ? path.resolve(root, configPath)
  : path.join(root, "ralph.config.yml");

async function confirmOverwrite() {
  if (isTestMode) return true;
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

async function promptAutoComplete(message, choices, initial = 0, options = {}) {
  const prompt = new AutoComplete({
    name: "choice",
    message,
    choices,
    initial,
    limit: Math.min(choices.length, 12),
    ...options,
  });
  return prompt.run();
}

async function promptModelChoice() {
  const choices = [
    {
      name: "unset",
      message: "unset (null)",
      value: null,
      hint: "Use the Codex default",
    },
    {
      name: "gpt-5.2-codex",
      message: "gpt-5.2-codex",
      value: "gpt-5.2-codex",
      hint: "Recommended: most advanced agentic coding model.",
    },
    {
      name: "gpt-5.1-codex-mini",
      message: "gpt-5.1-codex-mini",
      value: "gpt-5.1-codex-mini",
      hint: "Recommended: smaller, cost-effective GPT-5.1-Codex.",
    },
    {
      name: "gpt-5.1-codex-max",
      message: "gpt-5.1-codex-max",
      value: "gpt-5.1-codex-max",
      hint: "Optimized for long-horizon, agentic coding tasks.",
    },
    {
      name: "gpt-5.2",
      message: "gpt-5.2",
      value: "gpt-5.2",
      hint: "Best general agentic model across domains.",
    },
    {
      name: "gpt-5.1",
      message: "gpt-5.1",
      value: "gpt-5.1",
      hint: "Strong general coding model (succeeded by GPT-5.2).",
    },
    {
      name: "gpt-5.1-codex",
      message: "gpt-5.1-codex",
      value: "gpt-5.1-codex",
      hint: "Long-running agentic coding (succeeded by GPT-5.1-Codex-Max).",
    },
    {
      name: "gpt-5-codex",
      message: "gpt-5-codex",
      value: "gpt-5-codex",
      hint: "Tuned for long-running agentic coding (succeeded by GPT-5.1-Codex).",
    },
    {
      name: "gpt-5-codex-mini",
      message: "gpt-5-codex-mini",
      value: "gpt-5-codex-mini",
      hint: "Smaller GPT-5-Codex (succeeded by GPT-5.1-Codex-Mini).",
    },
    {
      name: "gpt-5",
      message: "gpt-5",
      value: "gpt-5",
      hint: "Reasoning model for coding (succeeded by GPT-5.1).",
    },
    {
      name: "custom",
      message: "custom (enter manually)",
      value: "__custom__",
      hint: "Enter any other model string.",
    },
  ];
  const choice = await promptAutoComplete(
    "Select a Codex model (type to filter; choose custom for other models):",
    choices,
    0,
    {
      suggest: (input, list) => {
        const term = String(input || "").toLowerCase();
        if (!term) return list;
        const matches = list.filter((item) => {
          const label = String(
            item?.message || item?.name || item?.value || ""
          ).toLowerCase();
          return label.includes(term);
        });
        for (const item of list) {
          if (item?.name === "unset" || item?.name === "custom") {
            if (!matches.includes(item)) matches.push(item);
          }
        }
        return matches;
      },
    }
  );

  if (choice === "__custom__") {
    return promptOptionalInput("Custom model name (leave blank for null)");
  }

  return choice;
}

async function collectCodexConfig() {
  if (isTestMode) {
    return {
      model: null,
      profile: null,
      sandbox: null,
      ask_for_approval: null,
      full_auto: false,
      model_reasoning_effort: null,
    };
  }
  const model = await promptModelChoice();
  const profile = await promptOptionalInput(
    "Codex CLI profile (optional; leave blank to use Codex default)",
  );
  const fullAuto = await new Toggle({
    name: "full_auto",
    message: "Enable full_auto? (workspace-write + on-request)",
    enabled: "Yes",
    disabled: "No",
    initial: false,
  }).run();

  const sandbox = await promptAutoComplete("Sandbox mode:", [
    {
      name: "unset",
      message: "unset (null)",
      value: null,
      hint: "Use the Codex default",
    },
    {
      name: "read-only",
      message: "read-only",
      value: "read-only",
      hint: "Safest; no writes allowed.",
    },
    {
      name: "workspace-write",
      message: "workspace-write",
      value: "workspace-write",
      hint: "Recommended; allow repo writes only.",
    },
    {
      name: "danger-full-access",
      message: "danger-full-access",
      value: "danger-full-access",
      hint: "No guardrails; full system access.",
    },
  ]);

  const askForApproval = await promptAutoComplete("Approval policy:", [
    {
      name: "unset",
      message: "unset (null)",
      value: null,
      hint: "Use the Codex default",
    },
    {
      name: "untrusted",
      message: "untrusted",
      value: "untrusted",
      hint: "Prompt often for approvals.",
    },
    {
      name: "on-failure",
      message: "on-failure",
      value: "on-failure",
      hint: "Prompt only on errors.",
    },
    {
      name: "on-request",
      message: "on-request",
      value: "on-request",
      hint: "Prompt for risky operations.",
    },
    {
      name: "never",
      message: "never",
      value: "never",
      hint: "Never prompt for approvals.",
    },
  ]);

  const modelReasoningEffort = await promptAutoComplete(
    "Model reasoning effort:",
    [
      {
        name: "unset",
        message: "unset (null)",
        value: null,
        hint: "Use the Codex default",
      },
      {
        name: "low",
        message: "low",
        value: "low",
        hint: "Faster, less thorough reasoning.",
      },
      {
        name: "medium",
        message: "medium",
        value: "medium",
        hint: "Default balance of speed + depth.",
      },
      {
        name: "high",
        message: "high",
        value: "high",
        hint: "Deeper reasoning, slower.",
      },
      {
        name: "xhigh",
        message: "xhigh",
        value: "xhigh",
        hint: "Maximum depth, slowest.",
      },
    ],
    2,
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
  const useDocker = isTestMode
    ? process.env.RALPH_TEST_USE_DOCKER === "1"
    : await new Toggle({
        name: "use_docker",
        message: "Use Docker for the loop? (adds a docker section)",
        enabled: "Yes",
        disabled: "No",
        initial: false,
      }).run();

  let updated = content;
  updated = setYamlValue(updated, "model", codexConfig.model);
  updated = setYamlValue(updated, "profile", codexConfig.profile);
  updated = setYamlValue(updated, "sandbox", codexConfig.sandbox);
  updated = setYamlValue(
    updated,
    "ask_for_approval",
    codexConfig.ask_for_approval,
  );
  updated = setYamlValue(updated, "full_auto", codexConfig.full_auto);
  updated = setYamlValue(
    updated,
    "model_reasoning_effort",
    codexConfig.model_reasoning_effort,
  );

  if (useDocker) {
    updated = setYamlValue(updated, "enabled", true);
  } else {
    updated = removeTopLevelSection(updated, "docker");
  }

  fs.writeFileSync(targetPath, `${updated.trimEnd()}\n`, "utf8");
  process.stdout.write(
    `Success: configured ${path.relative(root, targetPath)}\n`,
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
