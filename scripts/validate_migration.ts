// scripts/validate_migration.ts
// CLI entrypoint for migration validation. This file lives in the `scripts/` directory, allowing the use of `process.exit`.

import { runValidateMigration } from "../src/persistence/validateMigration";

(async () => {
  try {
    await runValidateMigration();
    console.log("Migration validation succeeded.");
    process.exit(0);
  } catch (e) {
    console.error("Migration validation failed:", e);
    process.exit(1);
  }
})();
