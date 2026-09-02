if (typeof window !== "undefined") {
  throw new Error("akira-os/vault/VaultStorageService.ts must only be loaded on the server side.");
}

import path from "path";
import fs from "fs";
import { getDatabaseConnection } from "../../persistence/connection";
import { vaultFileRepository } from "../../persistence/repositories";
import { VaultValidationService, getVaultRoot } from "./VaultValidationService";
import { VaultHashService } from "./VaultHashService";
import { publish } from "../../instrumentation";
import { Events } from "../../contracts/events";
import { VaultFile } from "../../shared/types/store-types";

const TRASH_DIRECTORY = "Trash";

function getCategoryFromMime(mimeType: string): string {
  const mimeLower = mimeType.toLowerCase();
  if (mimeLower.startsWith("image/")) return "Images";
  if (mimeLower.startsWith("audio/")) return "Audio";
  if (mimeLower.startsWith("video/")) return "Video";
  if (
    mimeLower === "application/pdf" ||
    mimeLower.startsWith("text/plain") ||
    mimeLower.includes("word") ||
    mimeLower.includes("excel") ||
    mimeLower.includes("powerpoint") ||
    mimeLower.includes("officedocument")
  ) {
    return "Documents";
  }
  if (
    mimeLower.startsWith("text/javascript") ||
    mimeLower.startsWith("text/typescript") ||
    mimeLower.startsWith("text/css") ||
    mimeLower.startsWith("text/x-") ||
    mimeLower === "application/json" ||
    mimeLower === "application/javascript"
  ) {
    return "Code";
  }
  if (
    mimeLower.includes("zip") ||
    mimeLower.includes("tar") ||
    mimeLower.includes("rar") ||
    mimeLower.includes("compressed") ||
    mimeLower.includes("gzip")
  ) {
    return "Archives";
  }
  return "Documents";
}

export const VaultStorageService = {
  /**
   * Safe upload and storage registration pipeline.
   * Upload -> Temp File -> Hash -> SQLite Transaction -> Move File -> Ready -> Commit.
   * If any failure occurs, it rolls back both the filesystem write and the SQLite transaction.
   */
  async uploadFile(
    tempSourcePath: string,
    displayName: string,
    mimeType: string,
    folderId: string | null,
  ): Promise<string> {
    // 1. Sanitize input name and safe-resolve path
    const safeTempPath = VaultValidationService.resolveSafePath(
      path.relative(getVaultRoot(), tempSourcePath),
    );

    const cleanDisplayName = VaultValidationService.sanitizeFilename(displayName);
    const ext = path.extname(cleanDisplayName);

    // Validate MIME types based on magic numbers
    VaultValidationService.validateMagicNumberMime(safeTempPath, mimeType);

    // 2. Hash computation from temp file
    const hash = await VaultHashService.generateHashFromStream(safeTempPath);
    const sizeBytes = fs.statSync(safeTempPath).size;

    const db = getDatabaseConnection();
    const fileId = crypto.randomUUID();

    // 3. Begin SQLite Transaction
    let committed = false;
    let registeredId: string = fileId;
    let targetRelativePath = "";
    let targetAbsolutePath = "";

    try {
      db.transaction(() => {
        // Deduplication Check: only a live, fully written record whose physical
        // file is still on disk may back a new logical record. Reusing a
        // soft-deleted record would aim the new file at Trash/, where a later
        // restore or purge of the original would carry the content away with it.
        // A record whose file is already missing is skipped so the fresh upload
        // is preserved rather than discarded against a dangling path.
        const reusableDuplicate = VaultHashService.findDuplicates(hash).find(
          (candidate) =>
            candidate.deletedAt === null &&
            candidate.status === "Ready" &&
            fs.existsSync(VaultValidationService.resolveSafePath(candidate.storagePath)),
        );

        if (reusableDuplicate) {
          // Deduplication Match Found: Reuse physical file path
          targetRelativePath = reusableDuplicate.storagePath;

          // Register a new logical file pointing to the duplicate storage path
          registeredId = vaultFileRepository.add({
            id: fileId,
            displayName: cleanDisplayName,
            originalName: cleanDisplayName,
            mimeType,
            extension: ext,
            sizeBytes,
            hash,
            storagePath: targetRelativePath,
            folderId,
            status: "Ready",
            favorite: false,
          });

          // Delete the temporary file since it is not needed
          fs.unlinkSync(safeTempPath);
          committed = true;
        } else {
          // Unique File: Create metadata shell with status 'Uploading'
          registeredId = vaultFileRepository.add({
            id: fileId,
            displayName: cleanDisplayName,
            originalName: cleanDisplayName,
            mimeType,
            extension: ext,
            sizeBytes,
            hash,
            storagePath: `Temp/${path.basename(safeTempPath)}`,
            folderId,
            status: "Uploading",
            favorite: false,
          });

          // Define destination paths
          const category = getCategoryFromMime(mimeType);
          const physicalName = `${fileId}${ext}`;
          targetRelativePath = `${category}/${physicalName}`;
          targetAbsolutePath = VaultValidationService.resolveSafePath(targetRelativePath);

          // Ensure parent directory exists
          fs.mkdirSync(path.dirname(targetAbsolutePath), { recursive: true });

          // Relocate file physically
          fs.copyFileSync(safeTempPath, targetAbsolutePath);
          fs.unlinkSync(safeTempPath);

          // Update SQLite metadata to final active state
          vaultFileRepository.update(registeredId, {
            status: "Ready",
            storagePath: targetRelativePath,
          });

          committed = true;
        }
      })();

      // Emit domain event
      const fileRecord = vaultFileRepository.getById(registeredId);
      if (fileRecord) {
        publish({
          type: "vault.file.uploaded",
          source: "vault-service",
          payload: {
            id: fileRecord.id,
            displayName: fileRecord.displayName,
            sizeBytes: fileRecord.sizeBytes,
            mimeType: fileRecord.mimeType,
          },
          version: 1,
        });
      }
      return registeredId;
    } catch (err) {
      // Manual rollback of physical copy if transaction failed
      if (!committed && targetAbsolutePath && fs.existsSync(targetAbsolutePath)) {
        try {
          fs.unlinkSync(targetAbsolutePath);
        } catch (_) {
          /* ignore */
        }
      }
      // Re-throw to cause transaction rollback
      throw err;
    }
  },

  /**
   * Renames a file's logical display name.
   */
  renameFile(fileId: string, newDisplayName: string): void {
    const file = vaultFileRepository.getById(fileId);
    if (!file) throw new Error("File not found.");

    const cleanName = VaultValidationService.sanitizeFilename(newDisplayName);
    vaultFileRepository.update(fileId, { displayName: cleanName });

    publish({
      type: "vault.file.renamed",
      source: "vault-service",
      payload: { id: fileId, oldName: file.displayName, newName: cleanName },
      version: 1,
    });
  },

  /**
   * Moves a file to another folder.
   */
  moveFile(fileId: string, targetFolderId: string | null): void {
    const file = vaultFileRepository.getById(fileId);
    if (!file) throw new Error("File not found.");

    vaultFileRepository.update(fileId, { folderId: targetFolderId });

    publish({
      type: "vault.file.moved",
      source: "vault-service",
      payload: { id: fileId, oldFolderId: file.folderId, newFolderId: targetFolderId },
      version: 1,
    });
  },

  /**
   * Toggles a file's favorite status.
   */
  setFavorite(fileId: string, favorite: boolean): void {
    vaultFileRepository.update(fileId, { favorite });
  },

  /**
   * Touches a file's lastOpenedAt timestamp.
   */
  touchFile(fileId: string): void {
    vaultFileRepository.update(fileId, { lastOpenedAt: new Date().toISOString() });
  },

  /**
   * Soft Deletion: Relocates file physically into Vault/Trash/ and marks metadata deleted_at.
   */
  deleteFile(fileId: string): void {
    const file = vaultFileRepository.getById(fileId);
    if (!file || file.deletedAt) return;

    // Deduplicated records share a single physical file. Relocating that file
    // into Trash on behalf of one record would strip the content from every
    // other record still pointing at it, so only an exclusively owned file is
    // moved. A shared file keeps its active path and is merely marked deleted;
    // it becomes movable again once it is the last remaining reference.
    const isExclusivelyOwned =
      vaultFileRepository.countReferencesByStoragePath(file.storagePath) <= 1;

    let storagePath = file.storagePath;

    if (isExclusivelyOwned) {
      const sourcePath = VaultValidationService.resolveSafePath(file.storagePath);
      storagePath = `${TRASH_DIRECTORY}/${file.id}${file.extension}`;
      const trashAbsolutePath = VaultValidationService.resolveSafePath(storagePath);

      fs.mkdirSync(path.dirname(trashAbsolutePath), { recursive: true });

      // Move physical file to Trash
      if (fs.existsSync(sourcePath)) {
        fs.renameSync(sourcePath, trashAbsolutePath);
      }
    }

    // Update metadata path and status
    vaultFileRepository.update(fileId, {
      deletedAt: new Date().toISOString(),
      storagePath,
    });

    publish({
      type: "vault.file.deleted",
      source: "vault-service",
      payload: { id: file.id, displayName: file.displayName, hash: file.hash },
      version: 1,
    });
  },

  /**
   * Restores a soft-deleted file back from Trash to its active category.
   */
  restoreFile(fileId: string): void {
    const file = vaultFileRepository.getById(fileId);
    if (!file || !file.deletedAt) return;

    // A record that was never physically moved — because its file is shared
    // with another record — already sits at an active path and only needs its
    // deletion marker cleared. Only a file parked in Trash is relocated, and
    // only while it is the sole reference to those bytes.
    const isInTrash = file.storagePath.startsWith(`${TRASH_DIRECTORY}/`);
    const isExclusivelyOwned =
      vaultFileRepository.countReferencesByStoragePath(file.storagePath) <= 1;

    let storagePath = file.storagePath;

    if (isInTrash && isExclusivelyOwned) {
      const trashPath = VaultValidationService.resolveSafePath(file.storagePath);

      const category = getCategoryFromMime(file.mimeType);
      storagePath = `${category}/${file.id}${file.extension}`;
      const activeAbsolutePath = VaultValidationService.resolveSafePath(storagePath);

      fs.mkdirSync(path.dirname(activeAbsolutePath), { recursive: true });

      // Move physical file back
      if (fs.existsSync(trashPath)) {
        fs.renameSync(trashPath, activeAbsolutePath);
      }
    }

    vaultFileRepository.update(fileId, {
      deletedAt: null,
      storagePath,
    });

    publish({
      type: "vault.file.restored",
      source: "vault-service",
      payload: { id: file.id, displayName: file.displayName, hash: file.hash },
      version: 1,
    });
  },

  /**
   * Permanent Deletion / Purging:
   * Validates duplicate references sharing the same physical storage path.
   * Deletes physical disk file ONLY if no other metadata record references it.
   */
  permanentDeleteFile(fileId: string): void {
    const file = vaultFileRepository.getById(fileId);
    if (!file) return;

    const db = getDatabaseConnection();

    db.transaction(() => {
      // 1. Physical lifetime is owned by the storage path, not the content
      // hash. Two records can share a hash while occupying separate physical
      // files (a duplicate added after the original was trashed), and only
      // records sharing a path share the bytes on disk. Counting by hash would
      // both spare files that nothing references and, in the reverse case,
      // leave orphans behind.
      const references = vaultFileRepository.countReferencesByStoragePath(file.storagePath);

      // 2. Delete metadata record first
      vaultFileRepository.purge(fileId);

      if (references <= 1) {
        // This is the last logical reference, purge physical disk file
        const physicalPath = VaultValidationService.resolveSafePath(file.storagePath);
        if (fs.existsSync(physicalPath)) {
          fs.unlinkSync(physicalPath);
        }
      }
    })();
  },
};
