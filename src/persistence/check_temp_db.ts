import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "src", "persistence", "temp_e2e_akira.db");
console.log("Reading temporary E2E database from:", dbPath);
const db = new Database(dbPath);

try {
  const schemaVersion = db
    .prepare("SELECT MAX(version) as version FROM schema_version")
    .get() as any;
  console.log("Schema Version:", schemaVersion?.version);

  const projects = db.prepare("SELECT * FROM projects").all();
  console.log("Projects Count:", projects.length);

  const tasks = db.prepare("SELECT * FROM tasks").all();
  console.log("Tasks Count:", tasks.length);

  const migrationHistory = db.prepare("SELECT * FROM migration_history").all();
  console.log("Migration History:", JSON.stringify(migrationHistory, null, 2));
} catch (err) {
  console.error("Error reading database:", err);
} finally {
  db.close();
}
