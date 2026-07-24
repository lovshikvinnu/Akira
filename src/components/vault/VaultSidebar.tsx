import React, { useState } from "react";
import { HardDrive, Star, Trash2, Tag, Plus } from "lucide-react";
import { FolderTree } from "./FolderTree";
import { VaultFolder } from "../../shared/types/store-types";

interface VaultSidebarProps {
  folders: VaultFolder[];
  activeFolderId: string | null;
  showFavorites: boolean;
  showDeleted: boolean;
  filterTag: string | null;
  expandedFolderIds: Set<string>;
  toggleExpand: (id: string) => void;
  onSelectFolder: (id: string | null) => void;
  onSelectFavorites: () => void;
  onSelectTrash: () => void;
  onSelectTag: (tag: string | null) => void;
  onCreateFolder: (name: string) => void;
}

export function VaultSidebar({
  folders,
  activeFolderId,
  showFavorites,
  showDeleted,
  filterTag,
  expandedFolderIds,
  toggleExpand,
  onSelectFolder,
  onSelectFavorites,
  onSelectTrash,
  onSelectTag,
  onCreateFolder,
}: VaultSidebarProps) {
  const tags = ["Work", "Personal", "Archive", "Invoice"];

  const [isTrashDragOver, setIsTrashDragOver] = useState(false);
  const [isFavDragOver, setIsFavDragOver] = useState(false);

  return (
    <div className="flex h-full w-full flex-col gap-6 p-4">
      {/* Title */}
      <div className="flex items-center justify-between px-2">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
          Vault Storage
        </h2>
        <button
          onClick={() => {
            const name = prompt("Enter folder name:");
            if (name) onCreateFolder(name);
          }}
          className="p-1 hover:bg-white/5 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="New Folder"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Main Categories */}
      <div className="flex flex-col gap-1">
        <button
          onClick={() => onSelectFolder(null)}
          className={`flex items-center gap-2.5 px-3 py-2 text-sm rounded-xl transition-all cursor-pointer ${
            activeFolderId === null && !showFavorites && !showDeleted && !filterTag
              ? "bg-white/10 text-white font-medium shadow-inner"
              : "hover:bg-white/[0.02] text-muted-foreground hover:text-foreground"
          }`}
        >
          <HardDrive className="h-4 w-4 shrink-0" />
          <span>All Files</span>
        </button>

        <button
          onClick={onSelectFavorites}
          onDragOver={(e) => {
            e.preventDefault();
            setIsFavDragOver(true);
          }}
          onDragLeave={() => setIsFavDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsFavDragOver(false);
            const fileId = e.dataTransfer.getData("akira/vault-file-id");
            console.log(`Drop onto Favorites: FileID ${fileId}`);
          }}
          className={`flex items-center gap-2.5 px-3 py-2 text-sm rounded-xl transition-all cursor-pointer ${
            showFavorites
              ? "bg-white/10 text-white font-medium shadow-inner"
              : "hover:bg-white/[0.02] text-muted-foreground hover:text-foreground"
          } ${isFavDragOver ? "bg-amber-500/10 border border-amber-500/30" : ""}`}
        >
          <Star className="h-4 w-4 shrink-0" />
          <span>Favorites</span>
        </button>

        <button
          onClick={onSelectTrash}
          onDragOver={(e) => {
            e.preventDefault();
            setIsTrashDragOver(true);
          }}
          onDragLeave={() => setIsTrashDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsTrashDragOver(false);
            const fileId = e.dataTransfer.getData("akira/vault-file-id");
            console.log(`Drop onto Trash: FileID ${fileId}`);
          }}
          className={`flex items-center gap-2.5 px-3 py-2 text-sm rounded-xl transition-all cursor-pointer ${
            showDeleted
              ? "bg-white/10 text-white font-medium shadow-inner"
              : "hover:bg-white/[0.02] text-muted-foreground hover:text-foreground"
          } ${isTrashDragOver ? "bg-red-500/10 border border-red-500/30" : ""}`}
        >
          <Trash2 className="h-4 w-4 shrink-0" />
          <span>Trash</span>
        </button>
      </div>

      {/* Directory Folders Tree */}
      <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
        <span className="text-[10px] font-semibold text-muted-foreground/50 tracking-wider uppercase px-2">
          Folders
        </span>
        <div className="flex flex-col gap-1 pr-1">
          <FolderTree
            folders={folders}
            activeFolderId={activeFolderId}
            expandedFolderIds={expandedFolderIds}
            toggleExpand={toggleExpand}
            onSelect={onSelectFolder}
          />
        </div>
      </div>

      {/* Tags section */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold text-muted-foreground/50 tracking-wider uppercase px-2">
          Tags
        </span>
        <div className="flex flex-wrap gap-1.5 px-2">
          {tags.map((tag) => (
            <button
              key={tag}
              onClick={() => onSelectTag(filterTag === tag ? null : tag)}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition-all cursor-pointer ${
                filterTag === tag
                  ? "bg-white/10 border-white/20 text-white font-medium"
                  : "border-white/5 bg-white/[0.02] text-muted-foreground hover:border-white/10 hover:text-foreground"
              }`}
            >
              <Tag className="h-3 w-3 shrink-0" />
              <span>{tag}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
export default VaultSidebar;
