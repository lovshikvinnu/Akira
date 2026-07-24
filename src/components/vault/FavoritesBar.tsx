import React from "react";
import { Star, File } from "lucide-react";
import { VaultFile } from "../../shared/types/store-types";

interface FavoritesBarProps {
  files: VaultFile[];
  onSelectFile: (file: VaultFile) => void;
}

export function FavoritesBar({ files, onSelectFile }: FavoritesBarProps) {
  const favoriteFiles = files.filter((f) => f.favorite && f.deletedAt === null);
  if (favoriteFiles.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 px-6 py-3 border-b border-white/5 bg-white/[0.01] select-none text-xs">
      <span className="text-[10px] font-semibold text-muted-foreground/50 tracking-wider uppercase flex items-center gap-1">
        <Star className="h-3 w-3 text-amber-500 fill-current" />
        <span>Quick Favorites</span>
      </span>
      <div className="flex gap-2 overflow-x-auto py-1">
        {favoriteFiles.map((file) => (
          <button
            key={file.id}
            onClick={() => onSelectFile(file)}
            className="flex items-center gap-2 bg-white/[0.02] border border-white/5 hover:border-white/15 px-3 py-1.5 rounded-xl text-muted-foreground hover:text-foreground transition-all cursor-pointer truncate max-w-[150px]"
          >
            <File className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="truncate">{file.displayName}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
export default FavoritesBar;
