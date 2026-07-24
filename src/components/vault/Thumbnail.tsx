if (typeof window !== "undefined") {
  // Prevent worker instantiation checks on NodeJS server SSR environment
}

import React, { useState, useEffect } from "react";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import { VaultFile } from "../../shared/types/store-types";
import { getRawFileBase64 } from "../../routes/tools.vault";

interface ThumbnailProps {
  file: VaultFile;
  className?: string;
}

export function Thumbnail({
  file,
  className = "h-8 w-8 object-contain rounded-md",
}: ThumbnailProps) {
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!file.mimeType.toLowerCase().startsWith("image/")) {
      return;
    }

    const cacheKey = `akira:thumbnail:${file.hash}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      setThumbSrc(cached);
      return;
    }

    let active = true;
    setLoading(true);
    setFailed(false);

    getRawFileBase64({ data: { id: file.id } })
      .then((res) => {
        if (!active) return;

        const worker = new Worker(new URL("../../workers/thumbnail-worker.ts", import.meta.url), {
          type: "module",
        });

        worker.onmessage = (e: MessageEvent) => {
          if (!active) {
            worker.terminate();
            return;
          }

          const { success, thumbnail, error } = e.data;
          if (success && thumbnail) {
            localStorage.setItem(cacheKey, thumbnail);
            setThumbSrc(thumbnail);
          } else {
            console.warn(`Thumbnail worker failed: ${error}`);
            setFailed(true);
          }
          setLoading(false);
          worker.terminate();
        };

        worker.postMessage({
          fileId: file.id,
          base64: res.base64,
          mimeType: file.mimeType,
        });
      })
      .catch((err) => {
        console.warn(`Failed to retrieve file for thumbnail generation:`, err);
        if (active) {
          setFailed(true);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [file]);

  if (loading) {
    return <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />;
  }

  if (failed || !thumbSrc) {
    return <ImageIcon className="h-4 w-4 text-sky-400 shrink-0" />;
  }

  return <img src={thumbSrc} alt={file.displayName} className={className} />;
}
export default Thumbnail;
