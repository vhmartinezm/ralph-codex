import { spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import enquirer from "enquirer";
import yaml from "js-yaml";
import { colors, createLogStyler, createSpinner } from "../ui/terminal.js";
import {
  diffCriteria,
  diffTasks,
  parseSuccessCriteria,
  parseTasks,
} from "../lib/tasks.js";

const { AutoComplete, Confirm, Editor, Input } = enquirer;

const root = process.cwd();
const agentDir = path.join(root, ".ralph");

const argv = process.argv.slice(2);
let tasksPath = "tasks.md";
let configPath = null;
let model = null;
let profile = null;
let sandbox = null;
let noSandbox = false;
let fullAuto = false;
let askForApproval = null;
let modelReasoningEffort = null;
let reasoningChoice;
let runAfter = false;
let showHelp = false;
const feedbackParts = [];

for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--help" || arg === "-h" || arg === "help") {
    showHelp = true;
    continue;
  }
  if (arg === "--tasks") {
    tasksPath = argv[i + 1];
    i += 1;
    continue;
  }
  if (arg === "--config") {
    configPath = argv[i + 1];
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
  if (arg === "--sandbox") {
    sandbox = argv[i + 1];
    i += 1;
    continue;
  }
  if (arg === "--no-sandbox") {
    noSandbox = true;
    continue;
  }
  if (arg === "--ask-for-approval") {
    askForApproval = argv[i + 1];
    i += 1;
    continue;
  }
  if (arg === "--full-auto") {
    fullAuto = true;
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
  if (arg === "--run") {
    runAfter = true;
    continue;
  }
  feedbackParts.push(arg);
}

function printHelp() {
  process.stdout.write(
    `\n${colors.cyan("ralph-codex revise \"<feedback>\" [options]")}\n\n` +
      `${colors.yellow("Options:")}\n` +
      `  ${colors.green("--tasks <path>")}              Tasks file to update (default: tasks.md)\n` +
      `  ${colors.green("--config <path>")}             Path to ralph.config.yml\n` +
      `  ${colors.green("--model <name>, -m")}         Codex model\n` +
      `  ${colors.green("--profile <name>, -p")}       Codex CLI profile\n` +
      `  ${colors.green("--sandbox <mode>")}           read-only | workspace-write | danger-full-access\n` +
      `  ${colors.green("--no-sandbox")}               Use danger-full-access\n` +
      `  ${colors.green("--ask-for-approval <mode>")}  untrusted | on-failure | on-request | never\n` +
      `  ${colors.green("--full-auto")}                workspace-write + on-request\n` +
      `  ${colors.green("--reasoning [effort]")}       low | medium | high | xhigh (omit to pick)\n` +
      `  ${colors.green("--run")}                      Run after approving changes\n` +
      `  ${colors.green("-h, --help")}                 Show help\n\n` +
      `${colors.yellow("Examples:")}\n` +
      `  ralph-codex revise "Improve onboarding copy"\n` +
      `  ralph-codex revise "Fix layout issues" --run\n\n`
  );
}

if (showHelp) {
  printHelp();
  process.exit(0);
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

function resolveTasksPath(config, currentPath) {
  if (currentPath !== "tasks.md") return currentPath;
  if (config?.plan?.tasks_path) return config.plan.tasks_path;
  if (config?.run?.tasks_path) return config.run.tasks_path;
  return currentPath;
}

function normalizeReasoningEffort(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (["null", "unset", "none", "default"].includes(lowered)) return null;
  if (lowered === "extra-high" || lowered === "extra_high") return "xhigh";
  if (["low", "medium", "high", "xhigh"].includes(lowered)) return lowered;
  return trimmed;
}

async function promptReasoningEffort(currentValue) {
  const choices = [
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
  ];
  const normalized = normalizeReasoningEffort(currentValue) || "medium";
  const initial = Math.max(
    0,
    choices.findIndex((choice) => choice.value === normalized)
  );
  const prompt = new AutoComplete({
    name: "reasoning",
    message: "Select model reasoning effort:",
    choices,
    initial,
    limit: Math.min(choices.length, 7),
  });
  return prompt.run();
}

function resetStdin() {
  if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
    process.stdin.setRawMode(false);
  }
  process.stdin.resume();
}

async function readFeedback(promptMessage) {
  resetStdin();
  if (process.stdin.isTTY) {
    try {
      const editor = new Editor({
        name: "feedback",
        message: promptMessage ||
          "Enter revision feedback in the editor, then save and close:",
      });
      const value = await editor.run();
      if (String(value || "").trim()) return value;
    } catch (_) {
      // Fall through to input.
    }
  }

  const input = new Input({
    name: "feedback",
    message: promptMessage ||
      "Enter revision feedback (single line). Use ';' to separate items:",
  });
  return input.run();
}

function renderChanges(changes) {
  if (changes.additions.length > 0) {
    process.stdout.write(`${colors.cyan("Proposed new tasks:")}\n`);
    changes.additions.forEach((task) => {
      const status =
        task.status === "done" ? "[x]" : task.status === "blocked" ? "[~]" : "[ ]";
      process.stdout.write(`- ${status} ${task.text}\n`);
    });
    process.stdout.write("\n");
  } else {
    process.stdout.write(`${colors.cyan("Proposed new tasks:")} none\n\n`);
  }

  const criteriaHasChanges =
    changes.criteria.added.length > 0 || changes.criteria.removed.length > 0;
  if (criteriaHasChanges) {
    process.stdout.write(`${colors.cyan("Success criteria changes:")}\n`);
    changes.criteria.added.forEach((item) => {
      process.stdout.write(`${colors.green(`+ ${item}`)}\n`);
    });
    changes.criteria.removed.forEach((item) => {
      process.stdout.write(`${colors.yellow(`- ${item}`)}\n`);
    });
    process.stdout.write("\n");
  }

  const hasUnexpected =
    changes.modified.length > 0 || changes.removals.length > 0;
  if (hasUnexpected) {
    process.stdout.write(
      `${colors.yellow("Warning: existing tasks changed (expected append-only).")}\n`
    );
    const preview = changes.modified.slice(0, 5);
    preview.forEach((item) => {
      process.stdout.write(
        `- #${item.index} ${item.before.raw} -> ${item.after.raw}\n`
      );
    });
    if (changes.modified.length > preview.length) {
      process.stdout.write(
        `${colors.yellow(`...and ${changes.modified.length - preview.length} more changes`)}\n`
      );
    }
    if (changes.removals.length > 0) {
      process.stdout.write(
        `${colors.yellow(`Removed tasks: ${changes.removals.length}`)}\n`
      );
    }
    process.stdout.write("\n");
  }
}

function buildPrompt(params) {
  const {
    feedback,
    revisionFeedback,
    tasksFileRelative,
    outputRelative,
  } = params;

  return `# Ralph Revise\n\nYou are updating the task list based on feedback.\n\nFiles:\n- Current tasks: ${tasksFileRelative}\n- Output file: ${outputRelative}\n\nFeedback:\n${feedback}\n${revisionFeedback ? `\nRevision feedback:\n${revisionFeedback}\n` : ""}\nRules:\n- Read ${tasksFileRelative} and write updated tasks to ${outputRelative}.\n- Do NOT edit ${tasksFileRelative} directly.\n- Do not remove or modify existing tasks or their statuses.\n- Append new tasks immediately after the last existing task and before the Success criteria section.\n- New tasks must be atomic, ordered, and verifiable. Use \`- [ ]\` checkboxes.\n- If a task is incomplete, add a new task that references the original task and why it is incomplete.\n- Update the Success criteria section only if needed to reflect the feedback.\n- Keep the Required tools section format exactly as-is.\n- Do not edit any other files.\n- You may run read-only commands (cat, rg, ls) to inspect files.\n- Do not run tests or write files other than ${outputRelative}.\n\nWhen done, output exactly: LOOP_COMPLETE\n`;
}

async function runCodex(prompt, codexOptions, spinnerText) {
  const args = ["exec"];
  if (codexOptions.model) args.push("--model", codexOptions.model);
  if (codexOptions.profile) args.push("--profile", codexOptions.profile);
  if (codexOptions.fullAuto) args.push("--full-auto");
  if (codexOptions.askForApproval) {
    args.push("--config", `ask_for_approval=${codexOptions.askForApproval}`);
  }
  if (codexOptions.modelReasoningEffort) {
    args.push(
      "--config",
      `model_reasoning_effort=${codexOptions.modelReasoningEffort}`
    );
  }
  if (codexOptions.sandbox) args.push("--sandbox", codexOptions.sandbox);
  args.push("-");

  const spinner = createSpinner(spinnerText || "Updating tasks...");
  return new Promise((resolve) => {
    const styler = createLogStyler();
    const child = spawn("codex", args, {
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

async function main() {
  const resolvedConfigPath = configPath || path.join(root, "ralph.config.yml");
  const config = loadConfig(resolvedConfigPath);
  const codexConfig = config?.codex || {};

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

  tasksPath = resolveTasksPath(config, tasksPath);
  const tasksFilePath = path.join(root, tasksPath);
  if (!fs.existsSync(tasksFilePath)) {
    console.error(`Missing ${tasksPath}. Run ralph-codex plan first.`);
    process.exit(1);
  }

  const feedback = feedbackParts.join(" ").trim() ||
    (await readFeedback("Enter feedback to revise the plan:"));
  if (!feedback || !String(feedback).trim()) {
    console.error("No feedback provided. Aborting.");
    process.exit(1);
  }

  fs.mkdirSync(agentDir, { recursive: true });
  const proposedPath = path.join(agentDir, "tasks.revise.md");
  const tasksFileRelative = path.relative(root, tasksFilePath);
  const outputRelative = path.relative(root, proposedPath);

  let revisionFeedback = "";
  const codexOptions = {
    model,
    profile,
    sandbox: noSandbox ? "danger-full-access" : sandbox,
    fullAuto,
    askForApproval,
    modelReasoningEffort,
  };

  while (true) {
    if (fs.existsSync(proposedPath)) {
      fs.rmSync(proposedPath, { force: true });
    }

    const prompt = buildPrompt({
      feedback,
      revisionFeedback,
      tasksFileRelative,
      outputRelative,
    });

    const spinnerText = revisionFeedback
      ? "Updating tasks with your feedback..."
      : "Updating tasks...";
    await runCodex(prompt, codexOptions, spinnerText);

    if (!fs.existsSync(proposedPath)) {
      console.error("Revise did not produce a proposed tasks file.");
      process.exit(1);
    }

    const currentContent = fs.readFileSync(tasksFilePath, "utf8");
    const proposedContent = fs.readFileSync(proposedPath, "utf8");
    const currentTasks = parseTasks(currentContent);
    const proposedTasks = parseTasks(proposedContent);
    const currentCriteria = parseSuccessCriteria(currentContent);
    const proposedCriteria = parseSuccessCriteria(proposedContent);

    const taskDiff = diffTasks(currentTasks, proposedTasks);
    const criteriaDiff = diffCriteria(currentCriteria, proposedCriteria);

    const hasAdditions = taskDiff.additions.length > 0;
    const hasCriteriaChanges =
      criteriaDiff.added.length > 0 || criteriaDiff.removed.length > 0;
    const hasUnexpected = taskDiff.modified.length > 0 || taskDiff.removals.length > 0;

    if (!hasAdditions && !hasCriteriaChanges && !hasUnexpected) {
      process.stdout.write(
        `${colors.yellow("No changes detected. Nothing to apply.")}\n`
      );
      process.exit(0);
    }

    renderChanges({
      additions: taskDiff.additions,
      criteria: criteriaDiff,
      modified: taskDiff.modified,
      removals: taskDiff.removals,
    });

    const confirm = new Confirm({
      name: "confirm",
      message: "Apply these changes to tasks.md?",
      initial: true,
    });
    const approved = await confirm.run();
    if (approved) {
      fs.writeFileSync(tasksFilePath, proposedContent, "utf8");
      process.stdout.write(
        `Updated ${tasksFileRelative} with revision changes.\n`
      );
      break;
    }

    revisionFeedback = await readFeedback(
      "Enter revision feedback (single line). Use ';' to separate items:",
    );
    if (!revisionFeedback || !String(revisionFeedback).trim()) {
      console.error("No revision feedback provided. Aborting.");
      process.exit(1);
    }
  }

  if (runAfter) {
    const runScript = path.join(root, "src", "commands", "run.js");
    const runArgs = [];
    if (tasksPath !== "tasks.md") {
      runArgs.push("--tasks", tasksPath);
    }
    if (configPath) {
      runArgs.push("--config", configPath);
    }
    const result = spawnSync(process.execPath, [runScript, ...runArgs], {
      stdio: "inherit",
      cwd: root,
      env: process.env,
    });
    process.exit(result.status ?? 0);
  }
}

void main();
