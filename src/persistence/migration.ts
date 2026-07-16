import { createServerFn } from "@tanstack/react-start";
import { executeMigration } from "./migration-impl";

interface MigrationResponse {
  success: boolean;
  status: "already_completed" | "migrated" | "failed";
  error?: string;
}

export const migrateLegacyState = createServerFn({ method: "POST" })
  .validator((d: string) => d)
  .handler(async ({ data: rawData }): Promise<MigrationResponse> => {
    const { getDatabaseConnection } = await import("./connection");
    const db = getDatabaseConnection();
    return executeMigration(db, rawData);
  });
export { executeMigration };
