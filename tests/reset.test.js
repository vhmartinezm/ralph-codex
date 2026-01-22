import path from "path";
import { describe, it, expect } from "vitest";
import { createSandbox, readFile, runCli, writeFile } from "./helpers/cli.js";

describe("reset command", () => {
  it("clears completed and blocked statuses", () => {
    const sandbox = createSandbox();
    try {
      const tasksPath = path.join(sandbox.cwd, "tasks.md");
      writeFile(
        tasksPath,
        `# Tasks
- [x] Done task
- [~] Blocked task
- [ ] Pending task

## Success criteria
- Run the project's primary test suite

## Required tools
- apt: none
- npm: none
- pip: none
`,
      );

      const result = runCli(["reset"], { cwd: sandbox.cwd, env: sandbox.env });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Reset 2 tasks");

      const updated = readFile(tasksPath);
      expect(updated).toContain("- [ ] Done task");
      expect(updated).toContain("- [ ] Blocked task");
    } finally {
      sandbox.cleanup();
    }
  });
});
