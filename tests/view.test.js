import path from "path";
import { describe, it, expect } from "vitest";
import { createSandbox, runCli, tasksTemplate, writeFile } from "./helpers/cli.js";

describe("view command", () => {
  it("renders tasks in list format", () => {
    const sandbox = createSandbox();
    try {
      const tasksPath = path.join(sandbox.cwd, "tasks.md");
      writeFile(tasksPath, tasksTemplate);

      const result = runCli(["view", "tasks", "--format", "list"], {
        cwd: sandbox.cwd,
        env: sandbox.env,
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Tasks");
      expect(result.stdout).toContain("Example task");
    } finally {
      sandbox.cleanup();
    }
  });
});
