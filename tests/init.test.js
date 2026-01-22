import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { createSandbox, readFile, runCli } from "./helpers/cli.js";

describe("init command", () => {
  it("creates config and updates .gitignore", () => {
    const sandbox = createSandbox();
    try {
      const env = { ...sandbox.env, RALPH_TEST_MODE: "1" };
      const result = runCli(["init"], { cwd: sandbox.cwd, env });
      expect(result.status).toBe(0);

      const configPath = path.join(sandbox.cwd, "ralph.config.yml");
      expect(fs.existsSync(configPath)).toBe(true);

      const gitignore = readFile(path.join(sandbox.cwd, ".gitignore"));
      expect(gitignore).toContain(".ralph");
    } finally {
      sandbox.cleanup();
    }
  });
});
