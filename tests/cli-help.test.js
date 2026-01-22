import path from "path";
import { describe, it, expect } from "vitest";
import { createSandbox, readFile, repoRoot, runCli } from "./helpers/cli.js";

describe("ralph-codex CLI entrypoint", () => {
  it("prints help", () => {
    const sandbox = createSandbox();
    try {
      const result = runCli(["--help"], { cwd: sandbox.cwd, env: sandbox.env });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("ralph-codex <command>");
      expect(result.stdout).toContain("Commands:");
    } finally {
      sandbox.cleanup();
    }
  });

  it("prints version", () => {
    const sandbox = createSandbox();
    try {
      const pkg = JSON.parse(
        readFile(path.join(repoRoot, "package.json")),
      );
      const result = runCli(["--version"], {
        cwd: sandbox.cwd,
        env: sandbox.env,
      });
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(pkg.version);
    } finally {
      sandbox.cleanup();
    }
  });
});
