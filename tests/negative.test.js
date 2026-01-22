import { describe, it, expect } from "vitest";
import { createSandbox, runCli } from "./helpers/cli.js";

describe("negative cases", () => {
  it("fails when plan has no idea", () => {
    const sandbox = createSandbox();
    try {
      const result = runCli(["plan"], {
        cwd: sandbox.cwd,
        env: sandbox.env,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Usage: ralph-codex plan');
    } finally {
      sandbox.cleanup();
    }
  });

  it("fails on unknown completion shell", () => {
    const sandbox = createSandbox();
    try {
      const result = runCli(["completion", "powershell"], {
        cwd: sandbox.cwd,
        env: sandbox.env,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Unknown shell: powershell");
    } finally {
      sandbox.cleanup();
    }
  });

  it("fails on invalid view format", () => {
    const sandbox = createSandbox();
    try {
      const result = runCli(["view", "tasks", "--format", "nope"], {
        cwd: sandbox.cwd,
        env: sandbox.env,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Invalid format");
    } finally {
      sandbox.cleanup();
    }
  });

  it("fails when idea file is missing", () => {
    const sandbox = createSandbox();
    try {
      const result = runCli(["plan", "--idea-file", "missing.md"], {
        cwd: sandbox.cwd,
        env: sandbox.env,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Missing idea file");
    } finally {
      sandbox.cleanup();
    }
  });

  it("fails when reset has no tasks file", () => {
    const sandbox = createSandbox();
    try {
      const result = runCli(["reset"], {
        cwd: sandbox.cwd,
        env: sandbox.env,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Missing tasks.md");
    } finally {
      sandbox.cleanup();
    }
  });
});
