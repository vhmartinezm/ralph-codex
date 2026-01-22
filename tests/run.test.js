import path from "path";
import { describe, it, expect } from "vitest";
import {
  createSandbox,
  readFile,
  runCli,
  tasksTemplate,
  writeFile,
} from "./helpers/cli.js";

describe("run command", () => {
  it("completes when the completion token is emitted", () => {
    const sandbox = createSandbox();
    try {
      const tasksPath = path.join(sandbox.cwd, "tasks.md");
      writeFile(tasksPath, tasksTemplate);

      const result = runCli(
        ["run", "--max-iterations", "1", "--no-log-stream", "--no-tail"],
        { cwd: sandbox.cwd, env: sandbox.env },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Ralph run complete");

      const promptPath = path.join(
        sandbox.cwd,
        ".ralph",
        "ralph-run-prompt.md",
      );
      const prompt = readFile(promptPath);
      const head = prompt.split("\n").slice(0, 11).join("\n");
      expect(head).toMatchInlineSnapshot(`
"# Ralph Run

Repo: workspace

Required at the start of each iteration:
- None.

Inputs:
- tasks.md (task list, check items off as completed)
- .ralph/summary.md (summary notes for context)
- .ralph/loop-log.md (iteration log; append every loop)"
`);
    } finally {
      sandbox.cleanup();
    }
  });

  it("ignores completion token when tasks are incomplete", () => {
    const sandbox = createSandbox();
    try {
      const tasksPath = path.join(sandbox.cwd, "tasks.md");
      writeFile(tasksPath, tasksTemplate);

      const env = {
        ...sandbox.env,
        CODEX_STUB_SKIP_TASK_COMPLETE: "1",
      };
      const result = runCli(
        ["run", "--max-iterations", "1", "--no-log-stream", "--no-tail"],
        { cwd: sandbox.cwd, env },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        "Completion token received but tasks remain incomplete; continuing.",
      );
    } finally {
      sandbox.cleanup();
    }
  });
});
