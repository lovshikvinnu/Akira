if (typeof window !== "undefined") {
  throw new Error("akira-os/vault/VaultFolderService.ts must only be loaded on the server side.");
}

import { vaultFolderRepository, vaultFileRepository } from "../../persistence/repositories";
import { VaultValidationService } from "./VaultValidationService";
import { publish } from "../../instrumentation";
import { Events } from "../../contracts/events";

export const VaultFolderService = {
  /**
   * Creates a new virtual folder and logs the event to the timeline.
   */
  createFolder(name: string, parentId: string | null): string {
    const id = vaultFolderRepository.add({ name, parentId });
    publish({
      type: "vault.folder.created",
      source: "vault-service",
      payload: { id, name, parentId },
      version: 1,
    });
    return id;
  },

  /**
   * Renames a virtual folder.
   */
  renameFolder(folderId: string, newName: string): void {
    vaultFolderRepository.update(folderId, { name: newName });
  },

  /**
   * Moves a folder under a new parent target after verifying circular check constraints.
   */
  moveFolder(folderId: string, targetParentId: string | null): void {
    VaultValidationService.validateFolderMove(folderId, targetParentId);
    const oldFolder = vaultFolderRepository.getById(folderId);

    vaultFolderRepository.update(folderId, { parentId: targetParentId });

    publish({
      type: "vault.folder.moved",
      source: "vault-service",
      payload: {
        id: folderId,
        name: oldFolder?.name || "",
        oldParentId: oldFolder?.parentId || null,
        newParentId: targetParentId,
      },
      version: 1,
    });
  },

  /**
   * Deletes a virtual folder. Direct child files are orphaned (moved to Root) in SQLite.
   */
  deleteFolder(folderId: string): void {
    const folder = vaultFolderRepository.getById(folderId);
    vaultFolderRepository.delete(folderId);

    publish({
      type: "vault.folder.deleted",
      source: "vault-service",
      payload: {
        id: folderId,
        name: folder?.name || "",
        parentId: folder?.parentId || null,
      },
      version: 1,
    });
  },

  /**
   * Empties all contents of a folder.
   * Batches soft-deletion for all files belonging to this folder and subfolders recursively,
   * and cascade deletes child folders.
   */
  emptyFolder(folderId: string): void {
    const getSubfolderData = (id: string, folders: string[], files: string[]) => {
      const childFolders = vaultFolderRepository.getByParent(id);
      const childFiles = vaultFileRepository.getByFolder(id);

      childFiles.forEach((f) => files.push(f.id));

      childFolders.forEach((folder) => {
        folders.push(folder.id);
        getSubfolderData(folder.id, folders, files);
      });
    };

    const foldersToEvict: string[] = [];
    const filesToSoftDelete: string[] = [];

    // Collect immediate files
    const immediateFiles = vaultFileRepository.getByFolder(folderId);
    immediateFiles.forEach((f) => filesToSoftDelete.push(f.id));

    // Collect subfolders and subfiles
    const immediateFolders = vaultFolderRepository.getByParent(folderId);
    immediateFolders.forEach((folder) => {
      foldersToEvict.push(folder.id);
      getSubfolderData(folder.id, foldersToEvict, filesToSoftDelete);
    });

    // 1. Soft delete all files
    filesToSoftDelete.forEach((fid) => {
      vaultFileRepository.delete(fid);
    });

    // 2. Delete all subfolders (cascades)
    foldersToEvict.forEach((foid) => {
      vaultFolderRepository.delete(foid);
    });
  },
};
