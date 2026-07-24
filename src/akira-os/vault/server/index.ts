import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// --- Folder Actions ---
export const persistCreateFolder = createServerFn({ method: "POST" })
  .validator((input: { name: string; parentId: string | null }) => input)
  .handler(async ({ data: { name, parentId } }) => {
    const { VaultFolderService } = await import("../VaultFolderService");
    return VaultFolderService.createFolder(name, parentId);
  });

export const persistRenameFolder = createServerFn({ method: "POST" })
  .validator((input: { folderId: string; newName: string }) => input)
  .handler(async ({ data: { folderId, newName } }) => {
    const { VaultFolderService } = await import("../VaultFolderService");
    VaultFolderService.renameFolder(folderId, newName);
  });

export const persistMoveFolder = createServerFn({ method: "POST" })
  .validator((input: { folderId: string; targetParentId: string | null }) => input)
  .handler(async ({ data: { folderId, targetParentId } }) => {
    const { VaultFolderService } = await import("../VaultFolderService");
    VaultFolderService.moveFolder(folderId, targetParentId);
  });

export const persistDeleteFolder = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .handler(async ({ data: folderId }) => {
    const { VaultFolderService } = await import("../VaultFolderService");
    VaultFolderService.deleteFolder(folderId);
  });

// --- File Actions ---
export const persistRenameFile = createServerFn({ method: "POST" })
  .validator((input: { fileId: string; newDisplayName: string }) => input)
  .handler(async ({ data: { fileId, newDisplayName } }) => {
    const { VaultStorageService } = await import("../VaultStorageService");
    VaultStorageService.renameFile(fileId, newDisplayName);
  });

export const persistMoveFile = createServerFn({ method: "POST" })
  .validator((input: { fileId: string; targetFolderId: string | null }) => input)
  .handler(async ({ data: { fileId, targetFolderId } }) => {
    const { VaultStorageService } = await import("../VaultStorageService");
    VaultStorageService.moveFile(fileId, targetFolderId);
  });

export const persistDeleteFile = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .handler(async ({ data: fileId }) => {
    const { VaultStorageService } = await import("../VaultStorageService");
    VaultStorageService.deleteFile(fileId);
  });

export const persistRestoreFile = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .handler(async ({ data: fileId }) => {
    const { VaultStorageService } = await import("../VaultStorageService");
    VaultStorageService.restoreFile(fileId);
  });

export const persistPermanentDeleteFile = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .handler(async ({ data: fileId }) => {
    const { VaultStorageService } = await import("../VaultStorageService");
    VaultStorageService.permanentDeleteFile(fileId);
  });

export const persistSetFavorite = createServerFn({ method: "POST" })
  .validator((input: { fileId: string; favorite: boolean }) => input)
  .handler(async ({ data: { fileId, favorite } }) => {
    const { VaultStorageService } = await import("../VaultStorageService");
    VaultStorageService.setFavorite(fileId, favorite);
  });

// --- Tag Actions ---
export const persistLinkTagToFile = createServerFn({ method: "POST" })
  .validator((input: { fileId: string; tagName: string }) => input)
  .handler(async ({ data: { fileId, tagName } }) => {
    const { vaultTagRepository } = await import("../../../persistence/repositories");
    const tag = vaultTagRepository.getByName(tagName);
    let tagId: string;
    if (!tag) {
      tagId = vaultTagRepository.add(tagName);
    } else {
      tagId = tag.id;
    }
    vaultTagRepository.linkTagToFile(fileId, tagId);
  });

export const persistUnlinkTagFromFile = createServerFn({ method: "POST" })
  .validator((input: { fileId: string; tagName: string }) => input)
  .handler(async ({ data: { fileId, tagName } }) => {
    const { vaultTagRepository } = await import("../../../persistence/repositories");
    const tag = vaultTagRepository.getByName(tagName);
    if (tag) {
      vaultTagRepository.unlinkTagFromFile(fileId, tag.id);
    }
  });

// --- Raw File Actions & Upload Mock ---
export const getRawFileBase64Rpc = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const fs = await import("fs");
    const { vaultFileRepository } = await import("../../../persistence/repositories");
    const { VaultValidationService } = await import("../VaultValidationService");

    const file = vaultFileRepository.getById(data.id);
    if (!file) throw new Error("File not found");

    const absolutePath = VaultValidationService.resolveSafePath(file.storagePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File is missing from disk: ${absolutePath}`);
    }

    const buffer = fs.readFileSync(absolutePath);
    return {
      base64: buffer.toString("base64"),
      mimeType: file.mimeType,
    };
  });

export const uploadMockFileServerRpc = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: z.string(),
      mime: z.string(),
      folderId: z.string().nullable(),
      content: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const fs = await import("fs");
    const path = await import("path");
    const { getVaultRoot } = await import("../VaultValidationService");

    const tempDir = path.join(getVaultRoot(), "Temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempPath = path.join(tempDir, `upload_${Date.now()}.part`);
    fs.writeFileSync(tempPath, data.content);

    const { VaultStorageService } = await import("../VaultStorageService");
    const fileId = await VaultStorageService.uploadFile(
      tempPath,
      data.name,
      data.mime,
      data.folderId,
    );

    const { vaultFileRepository } = await import("../../../persistence/repositories");
    return vaultFileRepository.getById(fileId);
  });
