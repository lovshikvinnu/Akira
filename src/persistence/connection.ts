// Client-side prevention guard
if (typeof window !== "undefined") {
  throw new Error("persistence/connection.ts must only be loaded on the server side.");
}

import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";

// Determine the local database file path
export const getDatabasePath = (): string => {
  if (process.env.AKIRA_DATABASE_PATH) {
    return process.env.AKIRA_DATABASE_PATH;
  }
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const originalPrepare = (db as any).prepare;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (db as any).prepare = function (this: any, sql: string) {
    const stmt = originalPrepare.call(this, sql);
    const isWrite = /insert\s+into|update|delete\s+from/i.test(sql);
    const isSearchTable = /projects|tasks|notes|sessions|timeline_events/i.test(sql);

    if (isWrite && isSearchTable) {
      const originalRun = stmt.run;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (stmt as any).run = function (this: any, ...args: any[]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
