// Client-side prevention guard
if (typeof window !== "undefined") {
  throw new Error("persistence/connection.ts must only be loaded on the server side.");
}

import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";

/**
 * Isolated database used whenever code runs under a test runner without an
 * explicit AKIRA_DATABASE_PATH. Each connection gets its own private database,
 * so parallel workers cannot corrupt one another and nothing is left on disk.
 */
export const TEST_DATABASE_PATH = ":memory:";

/**
 * True when running under a test runner.
 *
 * Vitest sets both `VITEST` and `NODE_ENV=test` in every worker process, so this
 * requires no cooperation from individual test files. That matters: a test file
 * cannot protect itself by assigning `process.env.AKIRA_DATABASE_PATH` at the top
 * of the module, because ESM evaluates all `import` declarations *before* any
 * statement in the module body — and several imported modules open the database
 * at module scope (e.g. `persistence/repositories/index.ts`,
 * `analytics/validation/diagnostics.ts`). The assignment therefore lands after the
 * connection has already been resolved and cached.
 */
const isTestEnvironment = (): boolean =>
  process.env.VITEST === "true" || process.env.NODE_ENV === "test";

// Determine the local database file path
export const getDatabasePath = (): string => {
  // 1. An explicit override always wins — production, development, and any test
  //    that deliberately wants a real file on disk.
  if (process.env.AKIRA_DATABASE_PATH) {
    return process.env.AKIRA_DATABASE_PATH;
  }

  // 2. Under a test runner, never fall back to the user's persistent database.
  if (isTestEnvironment()) {
    return TEST_DATABASE_PATH;
  }

  // 3. Production / development default: the user's persistent database.
  const appDataDir = process.env.APPDATA
    ? path.join(process.env.APPDATA, "AKIRA")
    : path.join(os.homedir(), ".akira");

  if (!fs.existsSync(appDataDir)) {
    fs.mkdirSync(appDataDir, { recursive: true });
  }

  return path.join(appDataDir, "akira.db");
};

let dbInstance: Database.Database | null = null;

/**
 * Retrieves the singleton SQLite database connection instance.
 * Applies critical PRAGMA settings upon connection initialization.
 */
export const getDatabaseConnection = (): Database.Database => {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = getDatabasePath();
  const db = new Database(dbPath);

  // Apply SQLite PRAGMA configurations
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("auto_vacuum = INCREMENTAL");

  dbInstance = db;

  // Intercept prepare statements to detect table writes and clear search cache

  const originalPrepare = (db as any).prepare;

  (db as any).prepare = function (this: any, sql: string) {
    const stmt = originalPrepare.call(this, sql);
    const isWrite = /insert\s+into|update|delete\s+from/i.test(sql);
    const isSearchTable = /projects|tasks|notes|sessions|timeline_events/i.test(sql);

    if (isWrite && isSearchTable) {
      const originalRun = stmt.run;

      (stmt as any).run = function (this: any, ...args: any[]) {
        const res = (originalRun as any).apply(this, args);
        // Clear search query cache on mutations
        try {
          import("../akira-os/search")
            .then(({ searchService }) => {
              searchService.clearCache();
            })
            .catch(() => {});
        } catch {
          // ignore
        }
        return res;
      };
    }
    return stmt;
  };

  return db;
};

/**
 * Gracefully winds down the database connection and resets the singleton instance.
 */
export const closeDatabaseConnection = (): void => {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
};
