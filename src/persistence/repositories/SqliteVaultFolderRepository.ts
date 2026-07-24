if (typeof window !== "undefined") {
  throw new Error(
    "persistence/repositories/SqliteVaultFolderRepository.ts must only be loaded on the server side.",
  );
}

import { VaultFolder } from "../../shared/types/store-types";
import { VaultFolderRepository } from "../../contracts/repositories/VaultFolderRepository";
import { getDatabaseConnection } from "../connection";

interface VaultFolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export class SqliteVaultFolderRepository implements VaultFolderRepository {
  private getDb() {
    return getDatabaseConnection();
  }

  private mapRowToFolder(row: VaultFolderRow): VaultFolder {
    return {
      id: row.id,
      name: row.name,
      parentId: row.parent_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getById(id: string): VaultFolder | undefined {
    const row = this.getDb().prepare("SELECT * FROM vault_folders WHERE id = ?").get(id) as
      VaultFolderRow | undefined;
    return row ? this.mapRowToFolder(row) : undefined;
  }

  getByParent(parentId: string | null): VaultFolder[] {
    let rows: VaultFolderRow[];
    if (parentId === null) {
      rows = this.getDb()
        .prepare("SELECT * FROM vault_folders WHERE parent_id IS NULL ORDER BY name ASC")
        .all() as VaultFolderRow[];
    } else {
      rows = this.getDb()
        .prepare("SELECT * FROM vault_folders WHERE parent_id = ? ORDER BY name ASC")
        .all(parentId) as VaultFolderRow[];
    }
    return rows.map((r) => this.mapRowToFolder(r));
  }

  getAll(): VaultFolder[] {
    const rows = this.getDb()
      .prepare("SELECT * FROM vault_folders ORDER BY name ASC")
      .all() as VaultFolderRow[];
    return rows.map((r) => this.mapRowToFolder(r));
  }

  add(input: { id?: string; name: string; parentId: string | null }): string {
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const name = input.name.trim() || "New Folder";
    const parentId = input.parentId;

    this.getDb()
      .prepare(
        `
        INSERT INTO vault_folders (id, name, parent_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(id, name, parentId, now, now);

    return id;
  }

  update(id: string, patch: Partial<Omit<VaultFolder, "id" | "createdAt">>): void {
    const mappings: Record<string, string> = {
      name: "name",
      parentId: "parent_id",
    };

    const sets: string[] = [];
    const params: unknown[] = [];

    (Object.keys(patch) as Array<keyof typeof patch>).forEach((key) => {
      const col = mappings[key];
      const value = patch[key];
      if (col !== undefined && value !== undefined) {
        sets.push(`${col} = ?`);
        params.push(value);
      }
    });

    if (sets.length === 0) return;

    sets.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(id);

    const query = `UPDATE vault_folders SET ${sets.join(", ")} WHERE id = ?`;
    this.getDb()
      .prepare(query)
      .run(...params);
  }

  delete(id: string): void {
    // Delete in SQLite cascades down because of FOREIGN KEY (parent_id) REFERENCES vault_folders(id) ON DELETE CASCADE
    // And on files it sets folder_id = NULL because of ON DELETE SET NULL
    this.getDb().prepare("DELETE FROM vault_folders WHERE id = ?").run(id);
  }

  isCircularMove(folderId: string, targetParentId: string): boolean {
    if (folderId === targetParentId) return true;
    const result = this.getDb()
      .prepare(
        `
        WITH RECURSIVE FolderHierarchy AS (
          SELECT id, parent_id 
          FROM vault_folders 
          WHERE id = ?
          
          UNION ALL
          
          SELECT f.id, f.parent_id 
          FROM vault_folders f
          INNER JOIN FolderHierarchy h ON f.id = h.parent_id
        )
        SELECT COUNT(*) AS is_circular 
        FROM FolderHierarchy 
        WHERE id = ?
      `,
      )
      .get(targetParentId, folderId) as { is_circular: number } | undefined;
    return result ? result.is_circular > 0 : false;
  }
}
