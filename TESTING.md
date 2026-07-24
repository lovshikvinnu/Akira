# AKIRA OS Testing Reference

This document explains the testing structures, mocking configurations, execution commands, and guidelines for writing tests in AKIRA.

---

## 1. Test Architecture & Directory Setup

We organize tests near the modules they target to ensure cohesion.

```
src/
├── akira-os/
│   └── vault/
│       ├── VaultStorageService.ts
│       └── vault.test.ts          # Module unit & integration tests
├── persistence/
│   ├── vault-db.test.ts           # Database integration tests
│   └── temp_e2e_akira.db          # Mock database instance utilized during testing
```

*   **Unit Tests (`*.test.ts`)**: Fast, memory-isolated tests that validate logic without side-effects (e.g. filename sanitizers, date helpers, memory importance decays).
*   **Database Integration Tests**: Verify prepared statement calculations and constraint executions against a test database runner.

---

## 2. Testing Repository Operations (Database Mocking)

To test SQLite queries without modifying production data, tests initialize a temporary database file (`temp_e2e_akira.db`) stored under `src/persistence/`.

### 2.1. Environment Redirection
The test runner configures the environment variable `AKIRA_DATABASE_PATH` before booting database connection scripts:

```typescript
import { beforeAll, afterAll, beforeEach } from "vitest";
import path from "path";
import fs from "fs";
import { getDatabaseConnection, closeDatabaseConnection } from "./connection";
import { initializeDatabase } from "./initializer";

beforeAll(() => {
  // Direct connection to temporary test database
  const testDbPath = path.resolve(__dirname, "temp_e2e_akira.db");
  process.env.AKIRA_DATABASE_PATH = testDbPath;

  // Initial schema run
  initializeDatabase();
});

beforeEach(() => {
  const db = getDatabaseConnection();
  // Clear tables between runs to reset test state
  db.prepare("DELETE FROM vault_files").run();
  db.prepare("DELETE FROM vault_folders").run();
});

afterAll(() => {
  closeDatabaseConnection();
  // Remove temporary files
  const testDbPath = path.resolve(__dirname, "temp_e2e_akira.db");
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});
```

---

## 3. Testing RPC Functions (Server functions)

RPC methods utilizing `createServerFn` must be tested by invoking their logic context directly or verifying the validation parameters:

```typescript
import { describe, it, expect } from "vitest";
import { persistAddNote } from "../notes";

describe("Notes RPC Functions", () => {
  it("should validate and persist notes through the server handler", async () => {
    // Mimic the RPC execution payload
    const noteId = await persistAddNote({
      data: {
        title: "Test Note",
        content: "Validating RPC write boundaries.",
      }
    });

    expect(noteId).toBeDefined();
    expect(typeof noteId).toBe("string");
  });
});
```

---

## 4. UI Layout & Frontend Component Testing

*   **Mock State Provider**: React views rely on state hooks mapping back to `akira-store`. During testing, we utilize `akira.initializeState(mockState)` to seed mock data.
*   **Virtual Router**: Wrap UI tests with TanStack Router's `RouterProvider` using memory history:
    ```tsx
    import { createMemoryHistory, createRouter } from "@tanstack/react-router";
    // Setup test-specific routing trees to avoid layout rendering conflicts
    ```

---

## 5. Execution Reference Commands

Execute Vitest test suites using the following commands:

```bash
npm run test          # Execute all test suites once
npm run test:watch    # Start active file-watcher development testing
npm run test:ui       # Launch vitest dashboard client interface
npm run test:coverage # Generate HTML test coverage reports
```
