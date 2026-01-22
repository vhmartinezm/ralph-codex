import path from "path";
import { describe, it, expect } from "vitest";
import { createSandbox, runCli, tasksTemplate, writeFile } from "./helpers/cli.js";

describe("revise command", () => {
  it("exits cleanly when no changes are proposed", () => {
    const sandbox = createSandbox();
    try {
      const tasksPath = path.join(sandbox.cwd, "tasks.md");
      writeFile(tasksPath, tasksTemplate);

      const result = runCli(["revise", "Add a missing step"], {
        cwd: sandbox.cwd,
        env: sandbox.env,
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("No changes detected");
    } finally {
      sandbox.cleanup();
    }
  });
});
