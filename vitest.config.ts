// vitest.config.ts
// Global Vitest configuration for the AKIRA project.
// This adds a setup file that mocks process.exit to prevent premature test termination.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Execute this file before each test file runs.
    setupFiles: "./src/testing/setup.ts",
  },
});
