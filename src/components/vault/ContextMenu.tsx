import React, { useEffect, useRef } from "react";
import {
  FolderOpen,
  Edit2,
  Move,
  Star,
  Tag,
  Copy,
  Trash2,
  FolderPlus,
  FolderMinus,
} from "lucide-react";

interface ContextMenuProps {
  x: number;
  y: number;
  type: "file" | "folder";
  targetId: string;
  onClose: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string) => void;
  onMove: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onAddTag: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ContextMenu({
  x,
  y,
  type,
  targetId,
  onClose,
  onOpen,
  onRename,
  onMove,
  onToggleFavorite,
  onAddTag,
  onDelete,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside clicks
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [onClose]);

  // Adjust menu placement to prevent screen overflowing
  const adjustCoords = () => {
    let finalX = x;
    let finalY = y;
    if (typeof window !== "undefined") {
      const menuWidth = 160;
      const menuHeight = 220;
      if (x + menuWidth > window.innerWidth) {
        finalX = window.innerWidth - menuWidth - 8;
      }
      if (y + menuHeight > window.innerHeight) {
        finalY = window.innerHeight - menuHeight - 8;
      }
    }
    return { left: `${finalX}px`, top: `${finalY}px` };
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(targetId);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      style={adjustCoords()}
      className="fixed z-50 w-44 rounded-2xl border border-white/10 bg-[#0E0F14]/90 p-1.5 shadow-2xl backdrop-blur-xl animate-fade-in select-none text-xs"
      role="menu"
    >
      {type === "file" ? (
        <>
          <button
            onClick={() => {
              onOpen(targetId);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-foreground hover:bg-white/5 transition-all cursor-pointer"
            role="menuitem"
          >
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Open Preview</span>
          </button>
          <button
            onClick={() => {
              onRename(targetId);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-foreground hover:bg-white/5 transition-all cursor-pointer"
            role="menuitem"
          >
            <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Rename</span>
          </button>
          <button
            onClick={() => {
              onMove(targetId);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-foreground hover:bg-white/5 transition-all cursor-pointer"
            role="menuitem"
          >
            <Move className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Move To...</span>
          </button>
          <button
            onClick={() => {
              onToggleFavorite(targetId);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-foreground hover:bg-white/5 transition-all cursor-pointer"
            role="menuitem"
          >
            <Star className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Toggle Favorite</span>
          </button>
          <button
            onClick={() => {
              onAddTag(targetId);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-foreground hover:bg-white/5 transition-all cursor-pointer"
            role="menuitem"
          >
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Manage Tags</span>
          </button>
          <button
            onClick={handleCopyId}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-foreground hover:bg-white/5 transition-all cursor-pointer"
            role="menuitem"
          >
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Copy Vault ID</span>
          </button>
          <div className="my-1 border-t border-white/5" />
          <button
            onClick={() => {
              onDelete(targetId);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
            role="menuitem"
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" />
            <span>Move to Trash</span>
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => {
              onOpen(targetId);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-foreground hover:bg-white/5 transition-all cursor-pointer"
            role="menuitem"
          >
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Browse Folder</span>
          </button>
          <button
            onClick={() => {
              onRename(targetId);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-foreground hover:bg-white/5 transition-all cursor-pointer"
            role="menuitem"
          >
            <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Rename Folder</span>
          </button>
          <button
            onClick={() => {
              onMove(targetId);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-foreground hover:bg-white/5 transition-all cursor-pointer"
            role="menuitem"
          >
            <Move className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Move Folder</span>
          </button>
          <div className="my-1 border-t border-white/5" />
          <button
            onClick={() => {
              onDelete(targetId);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
            role="menuitem"
          >
            <FolderMinus className="h-3.5 w-3.5 shrink-0" />
            <span>Delete Folder</span>
          </button>
        </>
      )}
    </div>
  );
}
export default ContextMenu;
