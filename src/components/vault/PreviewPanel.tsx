import React from "react";
import { X, FileText, FileSpreadsheet, Film, Music, FileWarning, EyeOff } from "lucide-react";
import { VaultFile } from "../../shared/types/store-types";
import { usePreview } from "../../hooks/usePreview";

interface PreviewPanelProps {
  file: VaultFile;
  onClose: () => void;
}

export function PreviewPanel({ file, onClose }: PreviewPanelProps) {
  const { loading, error, previewData } = usePreview(file.id);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 h-full w-full py-16 text-muted-foreground animate-pulse">
          <FileText className="h-10 w-10 text-muted-foreground animate-bounce" />
          <span className="text-xs">Generating preview...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 h-full w-full py-16 text-red-400">
          <FileWarning className="h-10 w-10" />
          <span className="text-xs">Preview failed: {error}</span>
        </div>
      );
    }

    if (!previewData) return null;

    const mime = file.mimeType.toLowerCase();

    // 1. Render Image
    if (mime.startsWith("image/") && previewData.objectUrl) {
      return (
        <div className="flex items-center justify-center h-full w-full p-4">
          <img
            src={previewData.objectUrl}
            alt={file.displayName}
            className="max-h-[300px] max-w-full rounded-xl object-contain shadow-lg border border-white/5"
          />
        </div>
      );
    }

    // 2. Render PDF
    if (mime === "application/pdf" && previewData.objectUrl) {
      return (
        <div className="h-[400px] w-full border border-white/5 rounded-xl overflow-hidden">
          <iframe
            src={previewData.objectUrl}
            title={file.displayName}
            className="h-full w-full bg-white"
          />
        </div>
      );
    }

    // 3. Render Text / Markdown / Code
    if (previewData.content !== undefined) {
      return (
        <div className="w-full max-h-[320px] overflow-y-auto bg-white/[0.01] border border-white/5 p-4 rounded-xl font-mono text-[11px] text-foreground/80 leading-relaxed whitespace-pre-wrap select-text">
          {previewData.content}
        </div>
      );
    }

    // 4. Fallback rendering: metadata reminder
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full w-full py-16 text-muted-foreground/60 text-center px-4 select-none">
        <EyeOff className="h-10 w-10 text-muted-foreground/40" />
        <span className="text-xs font-semibold text-foreground">No preview available</span>
        <span className="text-[10px] text-muted-foreground/40 max-w-[200px]">
          Refer to the inspector details panel or open the raw file directly.
        </span>
      </div>
    );
  };

  return (
    <div className="glass-panel flex flex-col gap-4 p-5 rounded-3xl border border-white/10 bg-[#0E0F14]/90 shadow-2xl backdrop-blur-xl animate-fade-in text-xs w-full">
      <div className="flex items-center justify-between pb-2 border-b border-white/5 select-none">
        <div className="flex items-center gap-1.5">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span
            className="font-semibold text-white truncate max-w-[180px]"
            title={file.displayName}
          >
            Preview: {file.displayName}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/5 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">{renderContent()}</div>
    </div>
  );
}
export default PreviewPanel;
