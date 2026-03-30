/**
 * Applies an escalating trim to remove uniform-color borders from an image.
 * Starts with threshold 20 and escalates through 40, 60, 80.
 * Stops as soon as the image dimensions stop shrinking (stable result).
 * Falls back gracefully if any trim step fails.
 */
export async function escalatingTrim(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;

  let current = buffer;
  const initialMeta = await sharp(current).metadata();
  let currentWidth = initialMeta.width ?? 0;
  let currentHeight = initialMeta.height ?? 0;

  for (const threshold of [20, 40, 60, 80]) {
    let trimmed: Buffer;
    try {
      trimmed = await sharp(current).trim({ threshold }).toBuffer();
    } catch {
      break;
    }
    const trimMeta = await sharp(trimmed).metadata();
    const newWidth = trimMeta.width ?? currentWidth;
    const newHeight = trimMeta.height ?? currentHeight;

    if (newWidth < currentWidth || newHeight < currentHeight) {
      current = trimmed;
      currentWidth = newWidth;
      currentHeight = newHeight;
    } else {
      break;
    }
  }

  return current;
}
