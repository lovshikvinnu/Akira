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
        // Deduplication Check: Look for matching hashes
        const duplicates = VaultHashService.findDuplicates(hash);
        if (duplicates.length > 0) {
          // Deduplication Match Found: Reuse physical file path
          const existingFile = duplicates[0];
          targetRelativePath = existingFile.storagePath;

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

    const sourcePath = VaultValidationService.resolveSafePath(file.storagePath);
    const trashRelativePath = `Trash/${file.id}${file.extension}`;
    const trashAbsolutePath = VaultValidationService.resolveSafePath(trashRelativePath);

    fs.mkdirSync(path.dirname(trashAbsolutePath), { recursive: true });

    // Move physical file to Trash
    if (fs.existsSync(sourcePath)) {
      fs.renameSync(sourcePath, trashAbsolutePath);
    }

    // Update metadata path and status
    vaultFileRepository.update(fileId, {
      deletedAt: new Date().toISOString(),
      storagePath: trashRelativePath,
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

    const trashPath = VaultValidationService.resolveSafePath(file.storagePath);

    const category = getCategoryFromMime(file.mimeType);
    const activeRelativePath = `${category}/${file.id}${file.extension}`;
    const activeAbsolutePath = VaultValidationService.resolveSafePath(activeRelativePath);

    fs.mkdirSync(path.dirname(activeAbsolutePath), { recursive: true });

    // Move physical file back
    if (fs.existsSync(trashPath)) {
      fs.renameSync(trashPath, activeAbsolutePath);
    }

    vaultFileRepository.update(fileId, {
      deletedAt: null,
      storagePath: activeRelativePath,
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
   * Validates duplicate references sharing same hash.
   * Deletes physical disk file ONLY if no other active metadata references exist.
   */
  permanentDeleteFile(fileId: string): void {
    const file = vaultFileRepository.getById(fileId);
    if (!file) return;

    const db = getDatabaseConnection();

    db.transaction(() => {
      // 1. Check logical reference count for this hash
      const count = vaultFileRepository.countReferencesByHash(file.hash);

      // 2. Delete metadata record first
      vaultFileRepository.purge(fileId);

      if (count === 1) {
        // This is the last logical reference, purge physical disk file
        const physicalPath = VaultValidationService.resolveSafePath(file.storagePath);
        if (fs.existsSync(physicalPath)) {
          fs.unlinkSync(physicalPath);
        }
      }
    })();
  },
};
