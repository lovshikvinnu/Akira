if (typeof window !== "undefined") {
  throw new Error(
    "persistence/repositories/SqliteVaultFileRepository.ts must only be loaded on the server side.",
  );
}

import { VaultFile, VaultFileLink } from "../../shared/types/store-types";
import { VaultFileRepository } from "../../contracts/repositories/VaultFileRepository";
import { getDatabaseConnection } from "../connection";

interface VaultFileRow {
  id: string;
  display_name: string;
  original_name: string;
  mime_type: string;
  extension: string;
  size_bytes: number;
  hash: string;
  storage_path: string;
  folder_id: string | null;
  status: "Uploading" | "Ready" | "Failed";
  favorite: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  last_opened_at: string | null;
}

interface VaultFileLinkRow {
  id: string;
  file_id: string;
  entity_type: "project" | "task" | "note" | "session";
  entity_id: string;
  created_at: string;
}

export class SqliteVaultFileRepository implements VaultFileRepository {
  private getDb() {
    return getDatabaseConnection();
  }

  private mapRowToFile(row: VaultFileRow): VaultFile {
    const tagRows = this.getDb()
      .prepare(
        `
      SELECT name FROM vault_tags vt
      INNER JOIN vault_file_tags vft ON vt.id = vft.tag_id
      WHERE vft.file_id = ?
    `,
      )
      .all(row.id) as { name: string }[];
    const tags = tagRows.map((t) => t.name);

    return {
      id: row.id,
      displayName: row.display_name,
      originalName: row.original_name,
      mimeType: row.mime_type,
      extension: row.extension,
      sizeBytes: row.size_bytes,
      hash: row.hash,
      storagePath: row.storage_path,
      folderId: row.folder_id,
      status: row.status,
      favorite: row.favorite === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      lastOpenedAt: row.last_opened_at,
      tags,
    };
  }

  private mapRowToLink(row: VaultFileLinkRow): VaultFileLink {
    return {
      id: row.id,
      fileId: row.file_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      createdAt: row.created_at,
    };
  }

  getAll(): VaultFile[] {
    const rows = this.getDb()
      .prepare("SELECT * FROM vault_files ORDER BY created_at DESC")
      .all() as VaultFileRow[];
    return rows.map((r) => this.mapRowToFile(r));
  }

  getById(id: string): VaultFile | undefined {
    const row = this.getDb().prepare("SELECT * FROM vault_files WHERE id = ?").get(id) as
      VaultFileRow | undefined;
    return row ? this.mapRowToFile(row) : undefined;
  }

  getByHash(hash: string): VaultFile[] {
    const rows = this.getDb()
      .prepare("SELECT * FROM vault_files WHERE hash = ? ORDER BY created_at DESC")
      .all(hash) as VaultFileRow[];
    return rows.map((r) => this.mapRowToFile(r));
  }

  getByFolder(folderId: string | null, includeDeleted = false): VaultFile[] {
    let query = "SELECT * FROM vault_files WHERE ";
    const params: any[] = [];

    if (folderId === null) {
      query += "folder_id IS NULL";
    } else {
      query += "folder_id = ?";
      params.push(folderId);
    }

    if (!includeDeleted) {
      query += " AND deleted_at IS NULL";
    }

    query += " ORDER BY created_at DESC";

    const rows = this.getDb()
      .prepare(query)
      .all(...params) as VaultFileRow[];
    return rows.map((r) => this.mapRowToFile(r));
  }

  getTrash(): VaultFile[] {
    const rows = this.getDb()
      .prepare("SELECT * FROM vault_files WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC")
      .all() as VaultFileRow[];
    return rows.map((r) => this.mapRowToFile(r));
  }

  getFavorites(): VaultFile[] {
    const rows = this.getDb()
      .prepare(
        "SELECT * FROM vault_files WHERE favorite = 1 AND deleted_at IS NULL ORDER BY updated_at DESC",
      )
      .all() as VaultFileRow[];
    return rows.map((r) => this.mapRowToFile(r));
  }

  getRecent(limit: number): VaultFile[] {
    const rows = this.getDb()
      .prepare(
        `
        SELECT * FROM vault_files 
        WHERE deleted_at IS NULL 
        ORDER BY COALESCE(last_opened_at, created_at) DESC 
        LIMIT ?
      `,
      )
      .all(limit) as VaultFileRow[];
    return rows.map((r) => this.mapRowToFile(r));
  }

  add(
    input: Omit<VaultFile, "id" | "createdAt" | "updatedAt" | "deletedAt" | "lastOpenedAt"> & {
      id?: string;
    },
  ): string {
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const displayName = input.displayName.trim() || "Untitled file";
    const originalName = input.originalName.trim() || "untitled";
    const mimeType = input.mimeType || "application/octet-stream";
    const extension = input.extension || "";
    const sizeBytes = input.sizeBytes;
    const hash = input.hash;
    const storagePath = input.storagePath;
    const folderId = input.folderId;
    const status = input.status || "Uploading";
    const favorite = input.favorite ? 1 : 0;

    this.getDb()
      .prepare(
        `
        INSERT INTO vault_files (
          id, display_name, original_name, mime_type, extension, size_bytes, hash, 
          storage_path, folder_id, status, favorite, created_at, updated_at, deleted_at, last_opened_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
      `,
      )
      .run(
        id,
        displayName,
        originalName,
        mimeType,
        extension,
        sizeBytes,
        hash,
        storagePath,
        folderId,
        status,
        favorite,
        now,
        now,
      );

    return id;
  }

  update(id: string, patch: Partial<Omit<VaultFile, "id" | "hash" | "sizeBytes">>): void {
    const mappings: Record<string, string> = {
      displayName: "display_name",
      originalName: "original_name",
      mimeType: "mime_type",
      extension: "extension",
      storagePath: "storage_path",
      folderId: "folder_id",
      status: "status",
      favorite: "favorite",
      deletedAt: "deleted_at",
      lastOpenedAt: "last_opened_at",
    };

    const sets: string[] = [];
    const params: unknown[] = [];

    (Object.keys(patch) as Array<keyof typeof patch>).forEach((key) => {
      const col = mappings[key];
      let value: any = patch[key];
      if (col !== undefined && value !== undefined) {
        if (key === "favorite") {
          value = value ? 1 : 0;
        }
        sets.push(`${col} = ?`);
        params.push(value);
      }
    });

    if (sets.length === 0) return;

    sets.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(id);

    const query = `UPDATE vault_files SET ${sets.join(", ")} WHERE id = ?`;
    this.getDb()
      .prepare(query)
      .run(...params);
  }

  delete(id: string): void {
    const now = new Date().toISOString();
    this.getDb()
      .prepare("UPDATE vault_files SET deleted_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, id);
  }

  restore(id: string): void {
    const now = new Date().toISOString();
    this.getDb()
      .prepare("UPDATE vault_files SET deleted_at = NULL, updated_at = ? WHERE id = ?")
      .run(now, id);
  }

  purge(id: string): void {
    this.getDb().prepare("DELETE FROM vault_files WHERE id = ?").run(id);
  }

  countReferencesByHash(hash: string): number {
    const result = this.getDb()
      .prepare("SELECT COUNT(*) as count FROM vault_files WHERE hash = ?")
      .get(hash) as { count: number } | undefined;
    return result ? result.count : 0;
  }

  addLink(fileId: string, entityType: string, entityId: string): string {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.getDb()
      .prepare(
        `
        INSERT INTO vault_file_links (id, file_id, entity_type, entity_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(id, fileId, entityType, entityId, now);

    return id;
  }

  removeLink(linkId: string): void {
    this.getDb().prepare("DELETE FROM vault_file_links WHERE id = ?").run(linkId);
  }

  removeLinksByFileAndEntity(fileId: string, entityType: string, entityId: string): void {
    this.getDb()
      .prepare(
        "DELETE FROM vault_file_links WHERE file_id = ? AND entity_type = ? AND entity_id = ?",
      )
      .run(fileId, entityType, entityId);
  }

  getLinksForFile(fileId: string): VaultFileLink[] {
    const rows = this.getDb()
      .prepare("SELECT * FROM vault_file_links WHERE file_id = ?")
      .all(fileId) as VaultFileLinkRow[];
    return rows.map((r) => this.mapRowToLink(r));
  }

  getLinksForEntity(entityType: string, entityId: string): VaultFileLink[] {
    const rows = this.getDb()
      .prepare("SELECT * FROM vault_file_links WHERE entity_type = ? AND entity_id = ?")
      .all(entityType, entityId) as VaultFileLinkRow[];
    return rows.map((r) => this.mapRowToLink(r));
  }
}
