import React from "react";
import { X, RefreshCw, AlertCircle, CheckCircle, Upload } from "lucide-react";
import { UploadItem } from "../../hooks/useUploadQueue";

interface UploadQueueProps {
  queue: UploadItem[];
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onClose: () => void;
}

export function UploadQueue({ queue, onRetry, onCancel, onClose }: UploadQueueProps) {
  if (queue.length === 0) return null;

  return (
    <div className="fixed bottom-12 right-6 z-50 w-80 max-h-96 rounded-3xl border border-white/10 bg-[#0F1015]/95 p-4 shadow-2xl backdrop-blur-xl flex flex-col gap-3 text-xs overflow-y-auto select-none">
      <div className="flex items-center justify-between pb-2 border-b border-white/5">
        <h4 className="font-semibold text-white flex items-center gap-1.5">
          <Upload className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Upload Queue</span>
        </h4>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/5 rounded text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        {queue.map((item) => (
          <div
            key={item.id}
            className="flex flex-col gap-1.5 bg-white/[0.01] border border-white/5 p-2.5 rounded-2xl relative"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="truncate font-medium text-foreground max-w-[180px]">
                {item.name}
              </span>

              <div className="flex items-center gap-1 shrink-0">
                {item.status === "failed" && (
                  <button
                    onClick={() => onRetry(item.id)}
                    className="p-1 hover:bg-white/5 rounded text-amber-500 transition-colors cursor-pointer"
                    title="Retry"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                )}
                <button
                  onClick={() => onCancel(item.id)}
                  className="p-1 hover:bg-white/5 rounded text-muted-foreground hover:text-red-400 transition-colors cursor-pointer"
                  title="Cancel"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>{item.mime.split("/")[1]?.toUpperCase() || "FILE"}</span>
              <span className="flex items-center gap-1">
                {item.status === "uploading" && `${item.progress}%`}
                {item.status === "success" && (
                  <span className="text-emerald-500 flex items-center gap-0.5">
                    <CheckCircle className="h-3 w-3" />
                    <span>Complete</span>
                  </span>
                )}
                {item.status === "failed" && (
                  <span className="text-red-400 flex items-center gap-0.5" title={item.error}>
                    <AlertCircle className="h-3 w-3" />
                    <span>Failed</span>
                  </span>
                )}
              </span>
            </div>

            {item.status === "uploading" && (
              <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden mt-1">
                <div
                  style={{ width: `${item.progress}%` }}
                  className="bg-white h-full rounded-full transition-all duration-300 shadow-inner"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
export default UploadQueue;
