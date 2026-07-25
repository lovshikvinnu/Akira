if (typeof window !== "undefined") {
  throw new Error(
    "akira-os/vault/VaultValidationService.ts must only be loaded on the server side.",
  );
}

import path from "path";
import fs from "fs";
import { getDatabasePath } from "../../persistence/connection";
import { vaultFolderRepository, vaultFileRepository } from "../../persistence/repositories";

export function getVaultRoot(): string {
  if (process.env.AKIRA_VAULT_PATH) {
    return path.resolve(process.env.AKIRA_VAULT_PATH);
  }
  return path.resolve(path.join(path.dirname(getDatabasePath()), "Vault"));
}

export const VaultValidationService = {
  /**
   * Resolves a relative path to the absolute Vault root.
   * Enforces path boundary restrictions to prevent directory traversal attacks (../).
   */
  resolveSafePath(relativePath: string): string {
    const root = getVaultRoot();
    const resolved = path.resolve(path.join(root, relativePath));

    if (!resolved.startsWith(root)) {
      throw new Error("Security Violation: Access denied outside the Vault boundary.");
    }
    return resolved;
  },

  /**
   * Validates if a path traversal attempt is present in a filename.
   */
  sanitizeFilename(filename: string): string {
    return path.basename(filename).replace(/[\\/:*?"<>|]/g, "_");
  },

  /**
   * Performs magic-number byte inspection to verify MIME type authenticity.
   */
  validateMagicNumberMime(filePath: string, expectedMime: string): void {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Validation Error: File not found at ${filePath}`);
    }

    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(8);
    fs.readSync(fd, buffer, 0, 8, 0);
    fs.closeSync(fd);

    const isPdf =
      buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46; // %PDF
    const isPng =
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47; // \x89PNG
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff; // JPEG
    const isGif =
      buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38; // GIF
    const isZip =
      buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04; // PK (ZIP)

    const mimeLower = expectedMime.toLowerCase();

    if (mimeLower === "application/pdf" && !isPdf) {
      throw new Error("Validation Error: File signature does not match PDF magic bytes.");
    }
    if (mimeLower === "image/png" && !isPng) {
      throw new Error("Validation Error: File signature does not match PNG magic bytes.");
    }
    if ((mimeLower === "image/jpeg" || mimeLower === "image/jpg") && !isJpeg) {
      throw new Error("Validation Error: File signature does not match JPEG magic bytes.");
    }
    if (mimeLower === "image/gif" && !isGif) {
      throw new Error("Validation Error: File signature does not match GIF magic bytes.");
    }
    if (
      (mimeLower === "application/zip" || mimeLower === "application/x-zip-compressed") &&
      !isZip
    ) {
      throw new Error("Validation Error: File signature does not match ZIP magic bytes.");
    }
  },

  /**
   * Validates folder operations, preventing circular hierarchies using the Recursive CTE.
   */
  validateFolderMove(folderId: string, targetParentId: string | null): void {
    if (targetParentId === null) return; // moving to Root is always safe

    if (folderId === targetParentId) {
      throw new Error("Validation Error: A folder cannot be moved into itself.");
    }

    const parentFolder = vaultFolderRepository.getById(targetParentId);
    if (!parentFolder) {
      throw new Error(`Validation Error: Target parent folder '${targetParentId}' does not exist.`);
    }

    const isCircular = vaultFolderRepository.isCircularMove(folderId, targetParentId);
    if (isCircular) {
      throw new Error(
        "Validation Error: Circular folder hierarchy detected. Cannot move parent folder inside child folder.",
      );
    }
  },
};
