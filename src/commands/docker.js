import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import enquirer from "enquirer";
import yaml from "js-yaml";

const { Confirm } = enquirer;

const root = process.cwd();
const defaultConfigPath = path.join(root, "ralph.config.yml");

const argv = process.argv.slice(2);
let configPath = null;

for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--config") {
    configPath = argv[i + 1];
    i += 1;
    continue;
  }
}

const resolvedConfigPath = configPath || defaultConfigPath;

function loadConfig(configFilePath) {
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

function parseBaseImage(output) {
  const match = output.match(/BASE_IMAGE:\s*([^\r\n]+)/i);
  if (!match) return null;
  const line = match[1].trim();
  const image = line.split(/\s+/)[0].replace(/[`"'(),.]+$/g, "");
  return image || null;
}

function updateDockerConfigText(content, baseImage) {
  const lines = content.split(/\r?\n/);
  let dockerStart = lines.findIndex((line) => /^docker:\s*$/.test(line));
  const topLevel = (line) => /^[A-Za-z_][A-Za-z0-9_-]*:\s*$/.test(line);

  if (dockerStart === -1) {
    lines.push(
      "",
      "docker:",
      "  enabled: true",
      `  base_image: ${baseImage}`
    );
    return lines.join("\n");
  }

  let end = lines.length;
  for (let i = dockerStart + 1; i < lines.length; i += 1) {
    if (topLevel(lines[i]) && !lines[i].startsWith("  ")) {
      end = i;
      break;
    }
  }

  let hasEnabled = false;
  let hasBase = false;
  for (let i = dockerStart + 1; i < end; i += 1) {
    if (/^\s+enabled:\s*/.test(lines[i])) {
      lines[i] = "  enabled: true";
      hasEnabled = true;
    }
    if (/^\s+base_image:\s*/.test(lines[i])) {
      lines[i] = `  base_image: ${baseImage}`;
      hasBase = true;
    }
  }

  const insertAt = dockerStart + 1;
  const insertLines = [];
  if (!hasEnabled) insertLines.push("  enabled: true");
  if (!hasBase) insertLines.push(`  base_image: ${baseImage}`);
  if (insertLines.length > 0) {
    lines.splice(insertAt, 0, ...insertLines);
  }

  return lines.join("\n");
}

function runCodex(prompt, codexConfig) {
  const args = ["exec"];
  if (codexConfig.model) args.push("--model", codexConfig.model);
  if (codexConfig.profile) args.push("--profile", codexConfig.profile);
  if (codexConfig.full_auto) args.push("--full-auto");
  if (codexConfig.ask_for_approval) {
    args.push("--config", `ask_for_approval=${codexConfig.ask_for_approval}`);
  }
  if (codexConfig.model_reasoning_effort) {
    args.push(
      "--config",
      `model_reasoning_effort=${codexConfig.model_reasoning_effort}`
    );
  }
  if (codexConfig.sandbox) args.push("--sandbox", codexConfig.sandbox);
  args.push("-");

  const result = spawnSync("codex", args, {
    input: prompt,
    encoding: "utf8",
    cwd: root,
    env: process.env,
  });

  const combined = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  if (combined) process.stdout.write(`${combined}\n`);
  return combined;
}

function buildPrompt(nodeVersion) {
  const nodeLine = nodeVersion ? `Node version: ${nodeVersion}` : "Node 20+";
  return `Find the best Docker base image for this project.
Consider that it needs to run npm scripts, native modules, and should avoid Alpine.
${nodeLine}

Respond with a single line in this format:
BASE_IMAGE: <image>`;
}

async function main() {
  const config = loadConfig(resolvedConfigPath);
  const codexConfig = config?.codex || {};

  const nodeVersionPath = path.join(root, ".nvmrc");
  const nodeVersion = fs.existsSync(nodeVersionPath)
    ? fs.readFileSync(nodeVersionPath, "utf8").trim()
    : "";

  const prompt = buildPrompt(nodeVersion);
  const output = runCodex(prompt, codexConfig);
  const baseImage = parseBaseImage(output);

  if (!baseImage) {
    console.error("Could not parse BASE_IMAGE from Codex output.");
    process.exit(1);
  }

  const confirm = new Confirm({
    name: "confirm",
    message: `Set docker.enabled=true and base_image=${baseImage}?`,
    initial: true,
  });

  const approved = await confirm.run();
  if (!approved) {
    process.stdout.write("Aborted by user.\n");
    process.exit(1);
  }

  const content = fs.existsSync(resolvedConfigPath)
    ? fs.readFileSync(resolvedConfigPath, "utf8")
    : "";
  const updated = updateDockerConfigText(content, baseImage);
  fs.writeFileSync(resolvedConfigPath, updated, "utf8");

  process.stdout.write(
    `Updated ${path.relative(root, resolvedConfigPath)} with docker.enabled=true and base_image=${baseImage}.\n`
  );
}

void main();
