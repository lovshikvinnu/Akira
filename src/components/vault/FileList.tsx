import React, { useState } from "react";
import { Folder, FileText, Image, Film, Music, FileArchive, File, Star } from "lucide-react";
import { VaultFile, VaultFolder } from "../../shared/types/store-types";
import { Thumbnail } from "./Thumbnail";

interface FileListProps {
  folders: VaultFolder[];
  files: VaultFile[];
  selectedIds: Set<string>;
  onItemClick: (id: string, e: React.MouseEvent) => void;
  onOpenFolder: (id: string) => void;
  onToggleFavorite: (id: string, favorite: boolean) => void;
  onContextMenu: (e: React.MouseEvent, type: "file" | "folder", id: string) => void;
}

export function FileList({
  folders,
  files,
  selectedIds,
  onItemClick,
  onOpenFolder,
  onToggleFavorite,
  onContextMenu,
}: FileListProps) {
  const getFileIcon = (mime: string) => {
    const m = mime.toLowerCase();
    if (m.startsWith("image/")) return <Image className="h-4 w-4 text-sky-400" />;
    if (m.startsWith("video/")) return <Film className="h-4 w-4 text-rose-400" />;
    if (m.startsWith("audio/")) return <Music className="h-4 w-4 text-emerald-400" />;
    if (m.includes("zip") || m.includes("tar") || m.includes("rar"))
      return <FileArchive className="h-4 w-4 text-amber-400" />;
    if (m.includes("pdf") || m.includes("text") || m.includes("document"))
      return <FileText className="h-4 w-4 text-indigo-400" />;
    return <File className="h-4 w-4 text-gray-400" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto px-6 py-4">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b border-white/5 text-muted-foreground/60 select-none pb-2">
            <th className="font-medium pb-2 pl-2">Name</th>
            <th className="font-medium pb-2">Type</th>
            <th className="font-medium pb-2">Size</th>
            <th className="font-medium pb-2">Date Modified</th>
            <th className="font-medium pb-2 w-10 text-right pr-2">Favorite</th>
          </tr>
        </thead>
        <tbody>
          {/* Folders first */}
          {folders.map((folder) => {
            const isSelected = selectedIds.has(folder.id);
            const isOver = dragOverFolderId === folder.id;

            return (
              <tr
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
                  console.log(`List Folder Drop: FileID ${fileId} onto ${folder.name}`);
                }}
                className={`border-b border-white/5 cursor-pointer transition-colors group ${
                  isSelected
                    ? "bg-white/10 text-white font-medium"
                    : "hover:bg-white/[0.02] text-muted-foreground hover:text-foreground"
                } ${isOver ? "bg-white/10" : ""}`}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onOpenFolder(folder.id);
                  if (e.key === " ") onItemClick(folder.id, e as any);
                }}
              >
                <td className="py-2.5 pl-2 flex items-center gap-2.5 font-medium text-foreground">
                  <Folder className="h-4 w-4 text-blue-400 shrink-0" />
                  <span className="truncate">{folder.name}</span>
                </td>
                <td className="py-2.5">Directory</td>
                <td className="py-2.5">--</td>
                <td className="py-2.5">{formatDate(folder.updatedAt)}</td>
                <td className="py-2.5 pr-2"></td>
              </tr>
            );
          })}

          {/* Files */}
          {files.map((file) => {
            const isSelected = selectedIds.has(file.id);

            return (
              <tr
                key={file.id}
                onClick={(e) => onItemClick(file.id, e)}
                onContextMenu={(e) => onContextMenu(e, "file", file.id)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("akira/vault-file-id", file.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                className={`border-b border-white/5 cursor-pointer transition-colors group ${
                  isSelected
                    ? "bg-white/10 text-white font-medium"
                    : "hover:bg-white/[0.02] text-muted-foreground hover:text-foreground"
                }`}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === " ") onItemClick(file.id, e as any);
                }}
              >
                <td className="py-2.5 pl-2 flex items-center gap-2.5 font-medium text-foreground">
                  <Thumbnail file={file} className="h-4 w-4 object-contain rounded shrink-0" />
                  <span className="truncate" title={file.displayName}>
                    {file.displayName}
                  </span>
                </td>
                <td className="py-2.5">{file.extension.toUpperCase()} File</td>
                <td className="py-2.5">{formatSize(file.sizeBytes)}</td>
                <td className="py-2.5">{formatDate(file.updatedAt)}</td>
                <td className="py-2.5 text-right pr-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(file.id, !file.favorite);
                    }}
                    className={`p-1 rounded transition-colors ${
                      file.favorite
                        ? "text-amber-500"
                        : "text-muted-foreground/30 hover:text-amber-500 opacity-0 group-hover:opacity-100 focus:opacity-100"
                    }`}
                  >
                    <Star className="h-3.5 w-3.5 fill-current" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
export default FileList;
