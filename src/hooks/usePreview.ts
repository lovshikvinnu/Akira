import { useState, useEffect } from "react";
import { getRawFileBase64 } from "../routes/tools.vault";

export function usePreview(fileId: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{
    content?: string;
    objectUrl?: string;
    mimeType?: string;
  } | null>(null);

  useEffect(() => {
    if (!fileId) {
      setPreviewData(null);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    getRawFileBase64({ data: { id: fileId } })
      .then((res) => {
        if (!active) return;

        const mime = res.mimeType.toLowerCase();

        if (
          mime.startsWith("text/") ||
          mime === "application/json" ||
          mime === "application/javascript" ||
          mime.includes("markdown")
        ) {
          const text = atob(res.base64);
          setPreviewData({ content: text, mimeType: res.mimeType });
        } else if (mime.startsWith("image/") || mime === "application/pdf") {
          const binary = atob(res.base64);
          const array = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            array[i] = binary.charCodeAt(i);
          }
          const blob = new Blob([array], { type: res.mimeType });
          const url = URL.createObjectURL(blob);
          setPreviewData({ objectUrl: url, mimeType: res.mimeType });
        } else {
          setPreviewData({ mimeType: res.mimeType });
        }

        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || "Failed to load preview");
        setLoading(false);
      });

    return () => {
      active = false;
      setPreviewData((prev) => {
        if (prev?.objectUrl) {
          URL.revokeObjectURL(prev.objectUrl);
        }
        return null;
      });
    };
  }, [fileId]);

  return {
    loading,
    error,
    previewData,
  };
}
