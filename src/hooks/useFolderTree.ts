import { useState, useCallback } from "react";
import { VaultFolder } from "../shared/types/store-types";

export function useFolderTree(folders: VaultFolder[]) {
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((folderId: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const expandToFolder = useCallback(
    (folderId: string) => {
      const parentChain: string[] = [];
      let currentId: string | null = folderId;

      while (currentId) {
        const folder = folders.find((f) => f.id === currentId);
        if (folder && folder.parentId) {
          parentChain.push(folder.parentId);
          currentId = folder.parentId;
        } else {
          currentId = null;
        }
      }

      if (parentChain.length > 0) {
        setExpandedFolderIds((prev) => {
          const next = new Set(prev);
          parentChain.forEach((id) => next.add(id));
          return next;
        });
      }
    },
    [folders],
  );

  return {
    expandedFolderIds,
    toggleExpand,
    expandToFolder,
  };
}
