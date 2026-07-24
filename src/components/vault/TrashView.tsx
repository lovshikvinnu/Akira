import React from "react";
import { Trash2, RotateCcw } from "lucide-react";
import { VaultFile } from "../../shared/types/store-types";

interface TrashViewProps {
  files: VaultFile[];
  onRestoreAll: () => void;
  onEmptyTrash: () => void;
}

export function TrashView({ files, onRestoreAll, onEmptyTrash }: TrashViewProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex items-center justify-between gap-4 px-6 py-3 bg-red-500/[0.02] border-b border-red-500/10 text-xs select-none">
      <div className="flex items-center gap-1.5 text-red-400">
        <Trash2 className="h-4 w-4 animate-pulse" />
        <span className="font-semibold">{files.length} items currently in Trash</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onRestoreAll}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-white/5 bg-white/[0.02] text-muted-foreground hover:text-foreground transition-all cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Restore All</span>
        </button>

        <button
          onClick={onEmptyTrash}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all cursor-pointer font-semibold"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Empty Trash</span>
        </button>
      </div>
    </div>
  );
}
export default TrashView;
