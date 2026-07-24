if (typeof window !== "undefined") {
  throw new Error(
    "persistence/repositories/SqliteVaultTagRepository.ts must only be loaded on the server side.",
  );
}

import { VaultTag } from "../../shared/types/store-types";
import { VaultTagRepository } from "../../contracts/repositories/VaultTagRepository";
import { getDatabaseConnection } from "../connection";

interface VaultTagRow {
  id: string;
  name: string;
  created_at: string;
}

export class SqliteVaultTagRepository implements VaultTagRepository {
  private getDb() {
    return getDatabaseConnection();
  }

  private mapRowToTag(row: VaultTagRow): VaultTag {
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
    };
  }

  getById(id: string): VaultTag | undefined {
    const row = this.getDb().prepare("SELECT * FROM vault_tags WHERE id = ?").get(id) as
      VaultTagRow | undefined;
    return row ? this.mapRowToTag(row) : undefined;
  }

  getByName(name: string): VaultTag | undefined {
    const sanitized = name.trim().toLowerCase();
    const row = this.getDb()
      .prepare("SELECT * FROM vault_tags WHERE LOWER(name) = ?")
      .get(sanitized) as VaultTagRow | undefined;
    return row ? this.mapRowToTag(row) : undefined;
  }

  getAll(): VaultTag[] {
    const rows = this.getDb()
      .prepare("SELECT * FROM vault_tags ORDER BY name ASC")
      .all() as VaultTagRow[];
    return rows.map((r) => this.mapRowToTag(r));
  }

  getTagsForFile(fileId: string): VaultTag[] {
    const rows = this.getDb()
      .prepare(
        `
        SELECT vt.* FROM vault_tags vt
        INNER JOIN vault_file_tags vft ON vt.id = vft.tag_id
        WHERE vft.file_id = ?
        ORDER BY vt.name ASC
      `,
      )
      .all(fileId) as VaultTagRow[];
    return rows.map((r) => this.mapRowToTag(r));
  }

  add(name: string): string {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const cleanName = name.trim();

    this.getDb()
      .prepare("INSERT INTO vault_tags (id, name, created_at) VALUES (?, ?, ?)")
      .run(id, cleanName, now);

    return id;
  }

  linkTagToFile(fileId: string, tagId: string): void {
    this.getDb()
      .prepare("INSERT OR IGNORE INTO vault_file_tags (file_id, tag_id) VALUES (?, ?)")
      .run(fileId, tagId);
  }

  unlinkTagFromFile(fileId: string, tagId: string): void {
    // Delete query will trigger the trg_vault_file_tags_cleanup trigger in SQLite to clean up unused tags
    this.getDb()
      .prepare("DELETE FROM vault_file_tags WHERE file_id = ? AND tag_id = ?")
      .run(fileId, tagId);
  }

  rename(tagId: string, newName: string): void {
    this.getDb().prepare("UPDATE vault_tags SET name = ? WHERE id = ?").run(newName.trim(), tagId);
  }
}
