const MAX_SIDE = 1920;
const JPEG_QUALITY = 0.85;
const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif"]);

export async function compressImageToBase64(base64: string, mimeType: string): Promise<{ base64: string; mimeType: string }> {
  if (HEIC_MIME_TYPES.has(mimeType.toLowerCase())) {
    return { base64, mimeType };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const longest = Math.max(width, height);

      if (longest > MAX_SIDE) {
        const scale = MAX_SIDE / longest;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve({ base64, mimeType });
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      const compressed = dataUrl.split(",")[1];
      resolve({ base64: compressed, mimeType: "image/jpeg" });
    };
    img.onerror = () => reject(new Error("Bild konnte nicht komprimiert werden."));
    img.src = `data:${mimeType};base64,${base64}`;
  });
}
