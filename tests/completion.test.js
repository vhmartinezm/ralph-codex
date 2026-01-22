import { describe, it, expect } from "vitest";
import { createSandbox, runCli } from "./helpers/cli.js";

describe("completion command", () => {
  it("prints bash completion", () => {
    const sandbox = createSandbox();
    try {
      const result = runCli(["completion", "bash"], {
        cwd: sandbox.cwd,
        env: sandbox.env,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("ralph-codex completions for bash");
      expect(result.stdout).toContain("complete -F _ralph_codex ralph-codex");
    } finally {
      sandbox.cleanup();
    }
  });

  it("prints zsh completion", () => {
    const sandbox = createSandbox();
    try {
      const result = runCli(["completion", "zsh"], {
        cwd: sandbox.cwd,
        env: sandbox.env,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("#compdef ralph-codex");
    } finally {
      sandbox.cleanup();
    }
  });

  it("prints fish completion", () => {
    const sandbox = createSandbox();
    try {
      const result = runCli(["completion", "fish"], {
        cwd: sandbox.cwd,
        env: sandbox.env,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("ralph-codex completions for fish");
      expect(result.stdout).toContain("complete -c ralph-codex");
    } finally {
      sandbox.cleanup();
    }
  });
});
