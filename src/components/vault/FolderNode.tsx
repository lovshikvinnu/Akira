import React, { useState } from "react";
import { Folder, ChevronRight, ChevronDown } from "lucide-react";
import { VaultFolder } from "../../shared/types/store-types";

interface FolderNodeProps {
  folder: VaultFolder;
  allFolders: VaultFolder[];
  activeFolderId: string | null;
  expandedFolderIds: Set<string>;
  toggleExpand: (id: string) => void;
  onSelect: (id: string | null) => void;
  level?: number;
}

export function FolderNode({
  folder,
  allFolders,
  activeFolderId,
  expandedFolderIds,
  toggleExpand,
  onSelect,
  level = 0,
}: FolderNodeProps) {
  const isExpanded = expandedFolderIds.has(folder.id);
  const isActive = activeFolderId === folder.id;
  const childFolders = allFolders.filter((f) => f.parentId === folder.id);
  const hasChildren = childFolders.length > 0;

  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("akira/vault-folder-id", folder.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const folderId = e.dataTransfer.getData("akira/vault-folder-id");
    const fileId = e.dataTransfer.getData("akira/vault-file-id");
    console.log(`Drop triggered: FolderId: ${folderId}, FileId: ${fileId} onto ${folder.name}`);
  };

  return (
    <div className="flex flex-col select-none">
      <div
        role="treeitem"
        aria-expanded={isExpanded}
        aria-selected={isActive}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        className={`flex items-center gap-2 py-1.5 px-2 rounded-lg text-sm transition-colors cursor-pointer group relative ${
          isActive
            ? "bg-white/10 text-white font-medium"
            : "hover:bg-white/[0.03] text-muted-foreground hover:text-foreground"
        } ${isDragOver ? "bg-white/10 border-white/20 border" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(folder.id);
        }}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span
          className="p-0.5 hover:bg-white/5 rounded transition-colors cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            toggleExpand(folder.id);
          }}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )
          ) : (
            <span className="w-3.5 h-3.5 block" />
          )}
        </span>

        <Folder
          className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : "text-muted-foreground group-hover:text-foreground"}`}
        />
        <span className="truncate flex-1">{folder.name}</span>
      </div>

      {hasChildren && isExpanded && (
        <div role="group" className="flex flex-col">
          {childFolders.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              allFolders={allFolders}
              activeFolderId={activeFolderId}
              expandedFolderIds={expandedFolderIds}
              toggleExpand={toggleExpand}
              onSelect={onSelect}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
export default FolderNode;
