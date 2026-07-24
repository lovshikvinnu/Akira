import { useRef, useCallback } from "react";
import { VaultFolder } from "../shared/types/store-types";

export function useDragDrop(
  onMoveFile: (fileId: string, folderId: string | null) => void,
  onMoveFolder: (folderId: string, parentId: string | null) => void,
  toggleExpand: (folderId: string) => void,
  expandedFolderIds: Set<string>,
  allFolders: VaultFolder[],
) {
  const expandTimeoutRef = useRef<any>(null);

  const handleDragOverFolder = useCallback(
    (folderId: string) => {
      if (expandedFolderIds.has(folderId)) return;

      if (!expandTimeoutRef.current) {
        expandTimeoutRef.current = setTimeout(() => {
          toggleExpand(folderId);
          expandTimeoutRef.current = null;
        }, 800);
      }
    },
    [expandedFolderIds, toggleExpand],
  );

  const handleDragLeaveFolder = useCallback(() => {
    if (expandTimeoutRef.current) {
      clearTimeout(expandTimeoutRef.current);
      expandTimeoutRef.current = null;
    }
  }, []);

  const handleDropItem = useCallback(
    (e: React.DragEvent, targetFolderId: string | null) => {
      e.preventDefault();
      e.stopPropagation();
      handleDragLeaveFolder();

      const fileId = e.dataTransfer.getData("akira/vault-file-id");
      const folderId = e.dataTransfer.getData("akira/vault-folder-id");

      if (fileId) {
        onMoveFile(fileId, targetFolderId);
      } else if (folderId) {
        if (folderId !== targetFolderId) {
          onMoveFolder(folderId, targetFolderId);
        }
      }
    },
    [onMoveFile, onMoveFolder, handleDragLeaveFolder],
  );

  return {
    handleDragOverFolder,
    handleDragLeaveFolder,
    handleDropItem,
  };
}
