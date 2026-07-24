import React from "react";
import { FolderNode } from "./FolderNode";
import { VaultFolder } from "../../shared/types/store-types";

interface FolderTreeProps {
  folders: VaultFolder[];
  activeFolderId: string | null;
  expandedFolderIds: Set<string>;
  toggleExpand: (id: string) => void;
  onSelect: (id: string | null) => void;
}

export function FolderTree({
  folders,
  activeFolderId,
  expandedFolderIds,
  toggleExpand,
  onSelect,
}: FolderTreeProps) {
  const rootFolders = folders.filter((f) => !f.parentId);

  return (
    <div role="tree" aria-label="Vault folders" className="flex flex-col gap-1 w-full">
      {rootFolders.map((folder) => (
        <FolderNode
          key={folder.id}
          folder={folder}
          allFolders={folders}
          activeFolderId={activeFolderId}
          expandedFolderIds={expandedFolderIds}
          toggleExpand={toggleExpand}
          onSelect={onSelect}
          level={0}
        />
      ))}
      {rootFolders.length === 0 && (
        <div className="text-xs text-muted-foreground/50 px-2 py-4 italic">No folders created</div>
      )}
    </div>
  );
}
export default FolderTree;
