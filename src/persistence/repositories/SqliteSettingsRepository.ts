if (typeof window !== "undefined") {
  throw new Error(
    "persistence/repositories/SqliteSettingsRepository.ts must only be loaded on the server side.",
  );
}

import { SettingsRepository } from "../../contracts/repositories/SettingsRepository";
import { getDatabaseConnection } from "../connection";

interface SettingRow {
  key: string;
  value: string;
  updated_at: string;
}

export class SqliteSettingsRepository implements SettingsRepository {
  private getDb() {
    return getDatabaseConnection();
  }

  get(key: string): string | null {
    const row = this.getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
      SettingRow | undefined;
    return row ? row.value : null;
  }

  set(key: string, value: string): void {
    const now = new Date().toISOString();
    this.getDb()
      .prepare(
        `
        INSERT OR REPLACE INTO settings (key, value, updated_at)
        VALUES (?, ?, ?)
      `,
      )
      .run(key, value, now);
  }

  delete(key: string): void {
    this.getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
  }
}
