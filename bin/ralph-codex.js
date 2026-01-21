#!/usr/bin/env node

const path = require("path");
const { spawnSync } = require("child_process");

const argv = process.argv.slice(2);
const cmd = argv[0];
const args = argv.slice(1);

const showHelp = () => {
  process.stdout.write(`\nralph-codex <command> [options]\n\nCommands:\n  init        Create ralph.config.yml and update .gitignore\n  plan        Generate tasks.md with a single round of questions\n  run         Execute the loop until completion\n  reset       Reset all tasks in tasks.md to [ ]\n  docker      Pick a Docker base image via Codex and update config\n\nExamples:\n  ralph-codex init\n  ralph-codex plan "Add screenshot flow"\n  ralph-codex run --max-iterations 15\n  ralph-codex reset\n\n`);
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
