// Web Worker for background image thumbnail generation
self.onmessage = async (e: MessageEvent) => {
  const { fileId, base64, mimeType } = e.data;

  try {
    if (!mimeType.startsWith("image/")) {
      self.postMessage({ fileId, success: false, error: "Unsupported MIME type" });
      return;
    }

    // Convert base64 back to a blob
    const response = await fetch(`data:${mimeType};base64,${base64}`);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    // Downscale target sizes
    const maxDim = 80;
    let w = bitmap.width;
    let h = bitmap.height;
    if (w > h) {
      h = Math.round((h * maxDim) / w);
      w = maxDim;
    } else {
      w = Math.round((w * maxDim) / h);
      h = maxDim;
    }

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");

    if (ctx) {
      ctx.drawImage(bitmap, 0, 0, w, h);
      const thumbnailBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.75 });

      // Convert to DataURL
      const reader = new FileReader();
      reader.readAsDataURL(thumbnailBlob);
      reader.onloadend = () => {
        self.postMessage({ fileId, success: true, thumbnail: reader.result });
      };
    } else {
      self.postMessage({ fileId, success: false, error: "Could not create canvas context" });
    }
  } catch (err: any) {
    self.postMessage({ fileId, success: false, error: err.message });
  }
};
export {};
