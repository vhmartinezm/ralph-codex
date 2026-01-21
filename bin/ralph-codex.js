#!/usr/bin/env node

const path = require("path");
const { spawnSync } = require("child_process");

function getColors() {
  try {
    const ui = require(path.join(__dirname, "..", "src", "ui", "terminal"));
    return ui?.colors || null;
  } catch (_) {
    return null;
  }
}

const colors = getColors() || {
  cyan: (text) => text,
  yellow: (text) => text,
  green: (text) => text,
  gray: (text) => text,
};

const argv = process.argv.slice(2);
const cmd = argv[0];
const args = argv.slice(1);

const showHelp = () => {
  process.stdout.write(
    `\n${colors.cyan("ralph-codex <command> [options]")}\n\n` +
      `${colors.yellow("Commands:")}\n` +
      `  ${colors.green("init")}        Create ralph.config.yml and update .gitignore\n` +
      `  ${colors.green("plan")}        Generate tasks.md with a single round of questions\n` +
      `  ${colors.green("run")}         Execute the loop until completion\n` +
      `  ${colors.green("reset")}       Reset all tasks in tasks.md to [ ]\n` +
      `  ${colors.green("docker")}      Pick a Docker base image via Codex and update config\n\n` +
      `${colors.yellow("Examples:")}\n` +
      `  ralph-codex init\n` +
      `  ralph-codex plan "Add screenshot flow"\n` +
      `  ralph-codex run --max-iterations 15\n` +
      `  ralph-codex reset\n\n` +
      `${colors.gray('Tip: run "ralph-codex <command> --help" for command options.')}\n\n`
  );
};

if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") {
  showHelp();
  process.exit(0);
}

if (cmd === "-v" || cmd === "--version") {
  const pkg = require(path.join(__dirname, "..", "package.json"));
  process.stdout.write(`${pkg.version}\n`);
  process.exit(0);
}

const scriptPath = path.join(__dirname, "..", "src", "commands", `${cmd}.js`);
const result = spawnSync(process.execPath, [scriptPath, ...args], {
  stdio: "inherit",
  cwd: process.cwd(),
  env: process.env,
});

process.exit(result.status ?? 0);
