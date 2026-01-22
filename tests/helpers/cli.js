import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const binPath = path.join(repoRoot, "bin", "ralph-codex.js");
const fixturesBin = path.join(repoRoot, "tests", "fixtures", "bin");

function createTempDir(prefix = "ralph-codex-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function createSandbox() {
  const root = createTempDir("ralph-codex-test-");
  const cwd = path.join(root, "workspace");
  const home = path.join(root, "home");
  ensureDir(cwd);
  ensureDir(home);
  const codexHome = path.join(home, ".codex");
  ensureDir(codexHome);

  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    CODEX_HOME: codexHome,
    PATH: `${fixturesBin}${path.delimiter}${process.env.PATH || ""}`,
  };

  const cleanup = () => {
    fs.rmSync(root, { recursive: true, force: true });
  };

  return { cwd, home, codexHome, env, cleanup };
}

function runCli(args, options = {}) {
  const { cwd, env, input } = options;
  const result = spawnSync(process.execPath, [binPath, ...args], {
    cwd: cwd || repoRoot,
    env: env || process.env,
    input,
    encoding: "utf8",
  });
  return {
    status: result.status ?? 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

const tasksTemplate = `# Tasks
- [ ] Example task

## Success criteria
- Run the project's primary test suite

## Required tools
- apt: none
- npm: none
- pip: none
`;

export {
  repoRoot,
  binPath,
  createSandbox,
  runCli,
  writeFile,
  readFile,
  tasksTemplate,
};
