import React from "react";
import { Info, File, Calendar, Hash, FolderOpen, Star, Tag } from "lucide-react";
import { VaultFile, VaultFolder } from "../../shared/types/store-types";

interface MetadataPanelProps {
  file: VaultFile;
  folders: VaultFolder[];
  onToggleFavorite: (id: string, favorite: boolean) => void;
  onEditTags: () => void;
}

export function MetadataPanel({ file, folders, onToggleFavorite, onEditTags }: MetadataPanelProps) {
  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "--";
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const folderName = file.folderId
    ? folders.find((f) => f.id === file.folderId)?.name || "Unknown Folder"
    : "Vault (Root)";

  return (
    <div className="flex h-full w-full flex-col gap-6 p-5 bg-[#0B0C10] border-l border-white/5 select-none overflow-y-auto text-xs">
      <div className="flex items-center gap-2 pb-3 border-b border-white/5">
        <Info className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-white text-sm">Metadata Inspector</h3>
      </div>

      {/* Basic File Display */}
      <div className="flex flex-col items-center gap-3 py-4 bg-white/[0.01] border border-white/5 rounded-2xl p-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.03] border border-white/5 text-muted-foreground">
          <File className="h-6 w-6 text-foreground" />
        </div>
        <div className="text-center w-full">
          <h4 className="font-semibold text-foreground truncate px-2" title={file.displayName}>
            {file.displayName}
          </h4>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {file.extension.replace(".", "") || "File"}
          </span>
        </div>
      </div>

      {/* Info Rows */}
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider">
            Original Name
          </span>
          <span className="text-foreground font-medium break-all">{file.originalName}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider">
            Size
          </span>
          <span className="text-foreground font-medium">{formatSize(file.sizeBytes)}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider">
            MIME Type
          </span>
          <span className="text-foreground font-medium truncate max-w-[150px]">
            {file.mimeType}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider">
            Folder Path
          </span>
          <span className="text-foreground font-medium flex items-center gap-1">
            <FolderOpen className="h-3 w-3 text-muted-foreground/60" />
            <span>{folderName}</span>
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider">
            SHA-256 Hash
          </span>
          <span className="font-mono text-[9px] text-muted-foreground/80 break-all select-all bg-white/[0.02] border border-white/5 p-1.5 rounded-lg">
            {file.hash}
          </span>
        </div>

        <div className="my-1 border-t border-white/5" />

        <div className="flex justify-between items-center">
          <span className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider">
            Created At
          </span>
          <span className="text-foreground font-medium">{formatDate(file.createdAt)}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider">
            Modified At
          </span>
          <span className="text-foreground font-medium">{formatDate(file.updatedAt)}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider">
            Last Opened
          </span>
          <span className="text-foreground font-medium">{formatDate(file.lastOpenedAt)}</span>
        </div>

        <div className="my-1 border-t border-white/5" />

        {/* Favorite Status */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider">
            Favorite File
          </span>
          <button
            onClick={() => onToggleFavorite(file.id, !file.favorite)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              file.favorite
                ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
                : "border-white/5 bg-white/[0.01] text-muted-foreground hover:text-foreground"
            }`}
          >
            <Star className="h-3.5 w-3.5 fill-current" />
          </button>
        </div>

        {/* Tags Block */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider">
              Tags
            </span>
            <button
              onClick={onEditTags}
              className="text-[10px] font-semibold text-white/80 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <Tag className="h-3 w-3 shrink-0" />
              <span>Edit</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {file.tags && file.tags.length > 0 ? (
              file.tags.map((tag) => (
                <span
                  key={tag}
                  className="bg-white/5 border border-white/10 text-muted-foreground px-2 py-0.5 rounded-md text-[10px] font-medium"
                >
                  {tag}
                </span>
              ))
            ) : (
              <span className="text-muted-foreground/40 italic text-[10px]">No tags assigned</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
export default MetadataPanel;
