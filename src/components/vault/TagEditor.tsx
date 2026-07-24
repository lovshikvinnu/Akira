import React, { useState } from "react";
import { X, Tag, Plus } from "lucide-react";
import { VaultFile } from "../../shared/types/store-types";
import { useAkira } from "../../akira-os";

interface TagEditorProps {
  file: VaultFile;
  onClose: () => void;
  onLinkTag: (fileId: string, tagName: string) => void;
  onUnlinkTag: (fileId: string, tagName: string) => void;
}

export function TagEditor({ file, onClose, onLinkTag, onUnlinkTag }: TagEditorProps) {
  const [newTag, setNewTag] = useState("");

  const allFiles = useAkira((s) => s.vaultFiles || []);

  const suggestedTags = React.useMemo(() => {
    const allTags = new Set<string>();
    allFiles.forEach((f) => f.tags?.forEach((t) => allTags.add(t)));
    file.tags?.forEach((t) => allTags.delete(t));
    return Array.from(allTags);
  }, [allFiles, file.tags]);

  const handleAdd = (name: string) => {
    const clean = name.trim();
    if (clean && !file.tags?.includes(clean)) {
      onLinkTag(file.id, clean);
      setNewTag("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass-panel w-80 rounded-3xl border border-white/10 bg-[#0F1015] p-5 shadow-2xl animate-fade-in flex flex-col gap-4 text-xs">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white text-sm flex items-center gap-1.5">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <span>Manage Tags</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/5 rounded text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="text-muted-foreground text-[10px]">
          Editing tags for:{" "}
          <span className="text-foreground font-semibold">{file.displayName}</span>
        </p>

        {/* Active tags */}
        <div className="flex flex-wrap gap-1.5 py-1">
          {file.tags && file.tags.length > 0 ? (
            file.tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 bg-white/10 border border-white/15 px-2 py-0.5 rounded-full text-foreground"
              >
                <span>{tag}</span>
                <button
                  onClick={() => onUnlinkTag(file.id, tag)}
                  className="hover:text-red-400 p-0.5 rounded-full hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))
          ) : (
            <span className="text-muted-foreground/50 italic py-1 text-[10px]">
              No tags assigned
            </span>
          )}
        </div>

        {/* Input */}
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            placeholder="Add new tag..."
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd(newTag)}
            className="flex-1 bg-white/[0.02] border border-white/10 rounded-xl px-3 py-2 text-foreground focus:outline-none focus:border-white/20 transition-colors"
          />
          <button
            onClick={() => handleAdd(newTag)}
            className="p-2 hover:bg-white/10 bg-white/5 rounded-xl border border-white/10 text-white cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Suggestions */}
        {suggestedTags.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-2">
            <span className="text-[10px] text-muted-foreground/50 font-semibold uppercase tracking-wider">
              Suggested Tags
            </span>
            <div className="flex flex-wrap gap-1.5">
              {suggestedTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => handleAdd(tag)}
                  className="bg-white/[0.02] border border-white/5 hover:border-white/15 hover:bg-white/5 px-2 py-1 rounded-lg text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default TagEditor;
