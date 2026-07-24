import {
  persistCreateFolder,
  persistRenameFolder,
  persistMoveFolder,
  persistDeleteFolder,
  persistRenameFile,
  persistMoveFile,
  persistDeleteFile,
  persistRestoreFile,
  persistPermanentDeleteFile,
  persistSetFavorite,
  persistLinkTagToFile,
  persistUnlinkTagFromFile,
  getRawFileBase64Rpc,
  uploadMockFileServerRpc,
} from "../server";

export const VaultFolderService = {
  async createFolder(name: string, parentId: string | null): Promise<string> {
    return persistCreateFolder({ data: { name, parentId } });
  },
  async renameFolder(folderId: string, newName: string): Promise<void> {
    await persistRenameFolder({ data: { folderId, newName } });
  },
  async moveFolder(folderId: string, targetParentId: string | null): Promise<void> {
    await persistMoveFolder({ data: { folderId, targetParentId } });
  },
  async deleteFolder(folderId: string): Promise<void> {
    await persistDeleteFolder({ data: folderId });
  },
};

export const VaultStorageService = {
  async renameFile(fileId: string, newDisplayName: string): Promise<void> {
    await persistRenameFile({ data: { fileId, newDisplayName } });
  },
  async moveFile(fileId: string, targetFolderId: string | null): Promise<void> {
    await persistMoveFile({ data: { fileId, targetFolderId } });
  },
  async deleteFile(fileId: string): Promise<void> {
    await persistDeleteFile({ data: fileId });
  },
  async restoreFile(fileId: string): Promise<void> {
    await persistRestoreFile({ data: fileId });
  },
  async permanentDeleteFile(fileId: string): Promise<void> {
    await persistPermanentDeleteFile({ data: fileId });
  },
  async setFavorite(fileId: string, favorite: boolean): Promise<void> {
    await persistSetFavorite({ data: { fileId, favorite } });
  },
};

export const VaultTagService = {
  async linkTagToFile(fileId: string, tagName: string): Promise<void> {
    await persistLinkTagToFile({ data: { fileId, tagName } });
  },
  async unlinkTagFromFile(fileId: string, tagName: string): Promise<void> {
    await persistUnlinkTagFromFile({ data: { fileId, tagName } });
  },
};

// Client-safe wrappers for Raw File Actions matching TanStack Start call signatures
export async function getRawFileBase64(input: { data: { id: string } }) {
  return getRawFileBase64Rpc(input);
}

export async function uploadMockFileServer(input: {
  data: {
    name: string;
    mime: string;
    folderId: string | null;
    content: string;
  };
}) {
  return uploadMockFileServerRpc(input);
}
