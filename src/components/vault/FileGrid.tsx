import React, { useState } from "react";
import { Folder, FileText, Image, Film, Music, FileArchive, File, Star } from "lucide-react";
import { VaultFile, VaultFolder } from "../../shared/types/store-types";
import { Thumbnail } from "./Thumbnail";

interface FileGridProps {
  folders: VaultFolder[];
  files: VaultFile[];
  selectedIds: Set<string>;
  onItemClick: (id: string, e: React.MouseEvent) => void;
  onOpenFolder: (id: string) => void;
  onToggleFavorite: (id: string, favorite: boolean) => void;
  onContextMenu: (e: React.MouseEvent, type: "file" | "folder", id: string) => void;
}

export function FileGrid({
  folders,
  files,
  selectedIds,
  onItemClick,
  onOpenFolder,
  onToggleFavorite,
  onContextMenu,
}: FileGridProps) {
  const getFileIcon = (mime: string) => {
    const m = mime.toLowerCase();
    if (m.startsWith("image/")) return <Image className="h-8 w-8 text-sky-400" />;
    if (m.startsWith("video/")) return <Film className="h-8 w-8 text-rose-400" />;
    if (m.startsWith("audio/")) return <Music className="h-8 w-8 text-emerald-400" />;
    if (m.includes("zip") || m.includes("tar") || m.includes("rar"))
      return <FileArchive className="h-8 w-8 text-amber-400" />;
    if (m.includes("pdf") || m.includes("text") || m.includes("document"))
      return <FileText className="h-8 w-8 text-indigo-400" />;
    return <File className="h-8 w-8 text-gray-400" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-6 overflow-y-auto h-full">
      {/* Folders first */}
      {folders.map((folder) => {
        const isSelected = selectedIds.has(folder.id);
        const isOver = dragOverFolderId === folder.id;

        return (
          <div
            key={folder.id}
            onClick={(e) => onItemClick(folder.id, e)}
            onDoubleClick={() => onOpenFolder(folder.id)}
            onContextMenu={(e) => onContextMenu(e, "folder", folder.id)}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("akira/vault-folder-id", folder.id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverFolderId(folder.id);
            }}
            onDragLeave={() => setDragOverFolderId(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverFolderId(null);
              const fileId = e.dataTransfer.getData("akira/vault-file-id");
              console.log(`Grid Folder Drop: FileID ${fileId} onto ${folder.name}`);
            }}
            className={`glass-panel flex flex-col justify-between p-4 h-32 rounded-2xl border transition-all cursor-pointer select-none relative group ${
              isSelected
                ? "bg-white/10 border-white/20 ring-1 ring-white/10"
                : "bg-white/[0.01] border-white/5 hover:bg-white/[0.03] hover:border-white/10"
            } ${isOver ? "bg-white/10 border-white/30" : ""}`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") onOpenFolder(folder.id);
              if (e.key === " ") onItemClick(folder.id, e as any);
            }}
          >
            <div className="flex items-center justify-between">
              <Folder className="h-8 w-8 text-blue-400 shrink-0" />
            </div>
            <div className="mt-4">
              <p className="text-xs font-semibold text-foreground truncate">{folder.name}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Directory</p>
            </div>
          </div>
        );
      })}

      {/* Files */}
      {files.map((file) => {
        const isSelected = selectedIds.has(file.id);

        return (
          <div
            key={file.id}
            onClick={(e) => onItemClick(file.id, e)}
            onContextMenu={(e) => onContextMenu(e, "file", file.id)}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("akira/vault-file-id", file.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            className={`glass-panel flex flex-col justify-between p-4 h-32 rounded-2xl border transition-all cursor-pointer select-none relative group ${
              isSelected
                ? "bg-white/10 border-white/20 ring-1 ring-white/10"
                : "bg-white/[0.01] border-white/5 hover:bg-white/[0.03] hover:border-white/10"
            }`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === " ") onItemClick(file.id, e as any);
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <Thumbnail file={file} className="h-8 w-8 object-contain rounded-md shrink-0" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(file.id, !file.favorite);
                }}
                className={`p-1 rounded-lg transition-all ${
                  file.favorite
                    ? "text-amber-500 scale-110"
                    : "text-muted-foreground/30 hover:text-amber-500 opacity-0 group-hover:opacity-100 focus:opacity-100"
                }`}
                title={file.favorite ? "Unfavorite" : "Favorite"}
              >
                <Star className="h-3.5 w-3.5 fill-current" />
              </button>
            </div>
            <div className="mt-3">
              <p
                className="text-xs font-semibold text-foreground truncate"
                title={file.displayName}
              >
                {file.displayName}
              </p>
              <div className="flex items-center justify-between mt-0.5 text-[9px] text-muted-foreground">
                <span>{formatSize(file.sizeBytes)}</span>
                <span>{file.extension.toUpperCase()}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
export default FileGrid;
