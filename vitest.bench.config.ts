// vitest.bench.config.ts
// Config for GENESIS performance harnesses.
//
// The harnesses are named `*.bench.ts`, which the default config's `include`
// (`**/*.{test,spec}.*`) does not match, so a plain `vitest run` can never
// collect them. That matters in this repo because two sessions share one
// working tree: a benchmark left in `tests/` as a `.test.ts` file breaks or
// perturbs the other session's suite run, and copying it in and deleting it
// immediately does not help -- the copy still overlaps their collection phase.
//
// Run: npx vitest run --config vitest.bench.config.ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["tests/**/*.bench.ts"],
    testTimeout: 900_000,
  },
});
