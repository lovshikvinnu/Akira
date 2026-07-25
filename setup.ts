// setup.ts
// Global Vitest setup to mock process.exit and prevent test termination.

import { vi, beforeAll } from "vitest";

beforeAll(() => {
  // @ts-expect-error – intentional assignment for testing
  (process as unknown as { __originalExit?: typeof process.exit }).__originalExit = process.exit;
  // Mock process.exit to a no-op
  vi.spyOn(process, "exit").mockImplementation(() => {
    // no operation
  });
});
