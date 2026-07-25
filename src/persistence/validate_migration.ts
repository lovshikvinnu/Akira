// src/persistence/validate_migration.ts
// Deprecated wrapper – CLI entrypoints should use scripts/validate_migration.ts.
// This file now simply re‑exports the pure library function without calling process.exit.

export { runValidateMigration } from "./validateMigration";
