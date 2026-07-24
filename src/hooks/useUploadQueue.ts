import { useState, useCallback } from "react";
import { uploadMockFileServer } from "../akira-os/vault";
import { akira } from "../persistence/akira-store";

export interface UploadItem {
  id: string;
  name: string;
  mime: string;
  content: string;
  progress: number;
  status: "pending" | "uploading" | "success" | "failed";
  error?: string;
  folderId: string | null;
}

export function useUploadQueue() {
  const [queue, setQueue] = useState<UploadItem[]>([]);

  const processUpload = useCallback(
    async (id: string, name: string, mime: string, content: string, folderId: string | null) => {
      try {
        const result = await uploadMockFileServer({
          data: {
            name,
            mime,
            folderId,
            content,
          },
        });

        if (result) {
          akira.addUploadedFile(result as any);
          setQueue((prev) =>
            prev.map((i) => (i.id === id ? { ...i, status: "success", progress: 100 } : i)),
          );
        } else {
          throw new Error("Failed to ingest file");
        }
      } catch (err: any) {
        setQueue((prev) =>
          prev.map((i) =>
            i.id === id ? { ...i, status: "failed", error: err.message || "Upload error" } : i,
          ),
        );
      }
    },
    [],
  );

  const addUpload = useCallback(
    async (name: string, mime: string, content: string, folderId: string | null) => {
      const id = crypto.randomUUID();
      const item: UploadItem = {
        id,
        name,
        mime,
        content,
        progress: 10,
        status: "uploading",
        folderId,
      };

      setQueue((prev) => [item, ...prev]);

      // Progress increments simulation
      let progress = 10;
      const interval = setInterval(() => {
        progress = Math.min(progress + 25, 90);
        setQueue((prev) =>
          prev.map((i) => (i.id === id && i.status === "uploading" ? { ...i, progress } : i)),
        );
      }, 150);

      await processUpload(id, name, mime, content, folderId);
      clearInterval(interval);
    },
    [processUpload],
  );

  const retryUpload = useCallback(
    async (id: string) => {
      const item = queue.find((i) => i.id === id);
      if (!item) return;

      setQueue((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, status: "uploading", progress: 10, error: undefined } : i,
        ),
      );

      let progress = 10;
      const interval = setInterval(() => {
        progress = Math.min(progress + 25, 90);
        setQueue((prev) =>
          prev.map((i) => (i.id === id && i.status === "uploading" ? { ...i, progress } : i)),
        );
      }, 150);

      await processUpload(id, item.name, item.mime, item.content, item.folderId);
      clearInterval(interval);
    },
    [queue, processUpload],
  );

  const cancelUpload = useCallback((id: string) => {
    setQueue((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setQueue((prev) => prev.filter((i) => i.status !== "success" && i.status !== "failed"));
  }, []);

  return {
    queue,
    addUpload,
    retryUpload,
    cancelUpload,
    clearCompleted,
  };
}
