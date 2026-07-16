// Client-side prevention guard
if (typeof window !== "undefined") {
  throw new Error("persistence/initializer.ts must only be loaded on the server side.");
}

import fs from "fs";
import path from "path";
import { getDatabaseConnection } from "./connection";

/**
 * Bootstraps the SQLite database.
 * If the database tables are not initialized, it reads and runs schema.sql,
 * then records version 1 in the schema_version table.
 */
export const initializeDatabase = (): void => {
  const db = getDatabaseConnection();

  // Validate database tables by checking for schema_version
  const tableCheck = db
    .prepare(
      `
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='schema_version'
  `,
    )
    .get();

  if (!tableCheck) {
    // Database schema does not exist, run bootstrap schema DDL
    const schemaPath = path.join(process.cwd(), "src", "persistence", "schema.sql");
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Critical: SQLite schema DDL not found at ${schemaPath}`);
    }

    const ddlContent = fs.readFileSync(schemaPath, "utf8");

    // Execute DDL within an explicit transaction to ensure atomicity
    db.transaction(() => {
      db.exec(ddlContent);

      // Seed the initial database version 1
      const versionStmt = db.prepare(`
        INSERT INTO schema_version (version, applied_at)
        VALUES (?, ?)
      `);
      versionStmt.run(1, new Date().toISOString());
    })();

    console.log("SQLite Database initialized successfully with schema version 1.");
  } else {
    console.log("SQLite Database connection verified. Schema is already present.");
  }
};
