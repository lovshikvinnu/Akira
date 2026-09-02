import { VaultFile, VaultFileLink } from "../../shared/types/store-types";

export interface VaultFileRepository {
  getById(id: string): VaultFile | undefined;
  getByHash(hash: string): VaultFile[];
  getByFolder(folderId: string | null, includeDeleted?: boolean): VaultFile[];
  getAll(): VaultFile[];
  getTrash(): VaultFile[];
  getFavorites(): VaultFile[];
  getRecent(limit: number): VaultFile[];

  add(
    input: Omit<VaultFile, "id" | "createdAt" | "updatedAt" | "deletedAt" | "lastOpenedAt"> & {
      id?: string;
    },
  ): string;
  update(id: string, patch: Partial<Omit<VaultFile, "id" | "hash" | "sizeBytes">>): void;
  delete(id: string): void; // logical/soft delete
  restore(id: string): void; // restores soft deleted file
  purge(id: string): void; // permanent delete from metadata

  // Reference checks
  countReferencesByHash(hash: string): number;
  /**
   * Counts logical records backed by the same physical file, including
   * soft-deleted ones. This is the ownership key for physical file lifetime:
   * deduplicated records share a storage path, so a physical file may only be
   * moved or unlinked when exactly one record still refers to it.
   */
  countReferencesByStoragePath(storagePath: string): number;

  // Polymorphic Links
  addLink(fileId: string, entityType: string, entityId: string): string;
  removeLink(linkId: string): void;
  removeLinksByFileAndEntity(fileId: string, entityType: string, entityId: string): void;
  getLinksForFile(fileId: string): VaultFileLink[];
  getLinksForEntity(entityType: string, entityId: string): VaultFileLink[];
}
