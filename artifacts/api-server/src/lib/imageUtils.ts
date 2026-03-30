/**
 * Applies an escalating trim to remove uniform-color borders from an image.
 *
 * Algorithm:
 * 1. Apply trim(12) as the safe baseline (same as the old single-pass value).
 * 2. Try trim(20) on the baseline; if the image shrinks, keep escalating
 *    through 40 → 60 → 80, stopping as soon as dimensions stabilize.
 * 3. If trim(20) makes no difference, return the trim(12) result.
 *
 * This removes cream-white, light-gray, and off-white book-paper margins that
 * threshold 12 alone cannot detect, without incurring any extra AI cost.
 */
export async function escalatingTrim(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;

  // Baseline: trim(12) — always applied, mirrors the old behaviour
  let current = buffer;
  try {
    current = await sharp(buffer).trim({ threshold: 12 }).toBuffer();
  } catch {
    // keep original if trim fails for any reason
  }

  const baselineMeta = await sharp(current).metadata();
  let currentWidth = baselineMeta.width ?? 0;
  let currentHeight = baselineMeta.height ?? 0;

  // Escalation: 20 → 40 → 60 → 80, stop when stable
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
