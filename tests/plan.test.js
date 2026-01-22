import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import {
  createSandbox,
  readFile,
  repoRoot,
  runCli,
  writeFile,
} from "./helpers/cli.js";

describe("plan command", () => {
  it("creates tasks.md and writes the plan prompt", () => {
    const sandbox = createSandbox();
    try {
      const configPath = path.join(sandbox.cwd, "ralph.config.yml");
      const template = readFile(
        path.join(repoRoot, "templates", "ralph.config.yml"),
      );
      writeFile(configPath, template);

      const env = { ...sandbox.env, RALPH_TEST_MODE: "1" };
      const result = runCli(["plan", "Test plan"], {
        cwd: sandbox.cwd,
        env,
      });
      expect(result.status).toBe(0);

      const tasksPath = path.join(sandbox.cwd, "tasks.md");
      expect(fs.existsSync(tasksPath)).toBe(true);

      const promptPath = path.join(
        sandbox.cwd,
        ".ralph",
        "ralph-plan-prompt.md",
      );
      const prompt = readFile(promptPath);
      const head = prompt.split("\n").slice(0, 15).join("\n");
      expect(head).toMatchInlineSnapshot(`
"# Ralph Plan

You are creating a task list for this repo.

Idea:
Test plan

Context scan (read-only):
- Quickly inspect top-level files to understand stack and conventions: README, package.json,
  pyproject.toml, requirements.txt, go.mod, Cargo.toml, pom.xml, build.gradle, Makefile,
  .nvmrc, Dockerfile, etc. Only inspect files that exist.
- Use this context to infer file locations, tooling, and sensible commands.
 - You may use read-only commands like ls, rg, and cat to inspect files.

Requirements:"
`);
    } finally {
      sandbox.cleanup();
    }
  });

  it("reads idea from a markdown file", () => {
    const sandbox = createSandbox();
    try {
      const configPath = path.join(sandbox.cwd, "ralph.config.yml");
      const template = readFile(
        path.join(repoRoot, "templates", "ralph.config.yml"),
      );
      writeFile(configPath, template);

      const ideaPath = path.join(sandbox.cwd, "idea.md");
      writeFile(ideaPath, "Line one\nLine two\n\n- Bullet\n");

      const env = { ...sandbox.env, RALPH_TEST_MODE: "1" };
      const result = runCli(["plan", "--idea-file", "idea.md"], {
        cwd: sandbox.cwd,
        env,
      });
      expect(result.status).toBe(0);

      const promptPath = path.join(
        sandbox.cwd,
        ".ralph",
        "ralph-plan-prompt.md",
      );
      const prompt = readFile(promptPath);
      expect(prompt).toContain("Idea:\nLine one\nLine two\n\n- Bullet");
    } finally {
      sandbox.cleanup();
    }
  });
});
