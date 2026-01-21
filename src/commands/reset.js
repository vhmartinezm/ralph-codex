import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { colors } from "../ui/terminal.js";

const root = process.cwd();
const argv = process.argv.slice(2);

let tasksPath = "tasks.md";
let configPath = null;
let showHelp = false;

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
}

function printHelp() {
  process.stdout.write(
    `\n${colors.cyan("ralph-codex reset [options]")}\n\n` +
      `${colors.yellow("Options:")}\n` +
      `  ${colors.green("--tasks <path>")}                  Tasks file to reset (default: tasks.md)\n` +
      `  ${colors.green("--config <path>")}                 Path to ralph.config.yml\n` +
      `  ${colors.green("-h, --help")}                      Show help\n\n`
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

const resolvedConfigPath = configPath || path.join(root, "ralph.config.yml");
const config = loadConfig(resolvedConfigPath);
const planConfig = config?.plan || {};
const runConfig = config?.run || {};
if (tasksPath === "tasks.md") {
  if (planConfig.tasks_path) {
    tasksPath = planConfig.tasks_path;
  } else if (runConfig.tasks_path) {
    tasksPath = runConfig.tasks_path;
  }
}

const tasksFile = path.join(root, tasksPath);
if (!fs.existsSync(tasksFile)) {
  console.error(`Missing ${tasksPath}. Run ralph-codex plan or create it first.`);
  process.exit(1);
}

const content = fs.readFileSync(tasksFile, "utf8");
const lines = content.split(/\r?\n/);
let changed = 0;
const updatedLines = lines.map((line) => {
  const updated = line.replace(
    /^(\s*(?:[-*]|\d+[.)])\s+\[)[xX~](\])/,
    "$1 $2"
  );
  if (updated !== line) changed += 1;
  return updated;
});

if (changed === 0) {
  process.stdout.write(
    `No completed or blocked tasks to reset in ${path.relative(root, tasksFile)}.\n`
  );
  process.exit(0);
}

const trailingNewline = content.endsWith("\n");
const output = `${updatedLines.join("\n")}${trailingNewline ? "\n" : ""}`;
fs.writeFileSync(tasksFile, output, "utf8");
process.stdout.write(
  `Reset ${changed} task${changed === 1 ? "" : "s"} in ${path.relative(
    root,
    tasksFile
  )}.\n`
);
