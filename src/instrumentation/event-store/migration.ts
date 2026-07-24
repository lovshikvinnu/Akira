import { Database } from "better-sqlite3";
import { CREATE_EVENTS_TABLE, CREATE_INDEXES } from "./schema";

/**
 * Bootstraps the Event Store SQLite schema by creating the `events` table
 * and corresponding lookup indexes inside an atomic transaction.
 */
export function runEventStoreMigration(db: Database): void {
  db.transaction(() => {
    db.exec(CREATE_EVENTS_TABLE);
    for (const statement of CREATE_INDEXES) {
      db.exec(statement);
    }
  })();
}
