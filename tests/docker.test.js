import path from "path";
import { describe, it, expect } from "vitest";
import {
  createSandbox,
  readFile,
  repoRoot,
  runCli,
  writeFile,
} from "./helpers/cli.js";

describe("docker command", () => {
  it("updates docker config with the suggested base image", () => {
    const sandbox = createSandbox();
    try {
      const configPath = path.join(sandbox.cwd, "ralph.config.yml");
      const template = readFile(
        path.join(repoRoot, "templates", "ralph.config.yml"),
      );
      writeFile(configPath, template);

      const env = {
        ...sandbox.env,
        RALPH_TEST_MODE: "1",
        CODEX_STUB_BASE_IMAGE: "node:22-bullseye",
      };
      const result = runCli(["docker"], { cwd: sandbox.cwd, env });
      expect(result.status).toBe(0);

      const updated = readFile(configPath);
      expect(updated).toContain("enabled: true");
      expect(updated).toContain("base_image: node:22-bullseye");
    } finally {
      sandbox.cleanup();
    }
  });
});
