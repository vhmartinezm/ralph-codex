import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    setupFiles: ["./tests/setup.js"],
    testTimeout: 10000,
    hookTimeout: 10000,
    clearMocks: true,
  },
});
