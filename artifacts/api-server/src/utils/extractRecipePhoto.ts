import { ObjectStorageService, objectStorageClient } from "../lib/objectStorage";
import { openai } from "@workspace/integrations-openai-ai-server";
import { AI_MODEL_MAIN } from "../lib/aiModels";
import { escalatingTrim } from "../lib/imageUtils";

function parseObjectPath(storagePath: string): { bucketName: string; objectName: string } {
  let p = storagePath;
  if (!p.startsWith("/")) p = `/${p}`;
  const parts = p.split("/");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

async function downloadPdfBuffer(sourceDocumentUrl: string, storageService: ObjectStorageService): Promise<Buffer> {
  const objectPath = sourceDocumentUrl.startsWith("/api/storage")
    ? sourceDocumentUrl.replace("/api/storage", "")
    : sourceDocumentUrl;

  let file = null;
  if (objectPath.startsWith("/objects/")) {
    file = await storageService.getObjectEntityFile(objectPath).catch(() => null);
  }
  if (!file) {
    file = await storageService.searchPublicObject(objectPath.replace(/^\/objects\//, "")).catch(() => null);
  }
  if (!file) {
    const privateObjectDir = storageService.getPrivateObjectDir();
    const dir = privateObjectDir.endsWith("/") ? privateObjectDir : `${privateObjectDir}/`;
    const entityId = objectPath.startsWith("/objects/")
      ? objectPath.slice("/objects/".length)
      : objectPath;
    const fullPath = `${dir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const bucket = objectStorageClient.bucket(bucketName);
    file = bucket.file(objectName);
    const [exists] = await file.exists();
    if (!exists) file = null;
  }

  if (!file) {
    throw new Error("Quelldokument nicht gefunden");
  }

  const [contents] = await file.download();
  return contents as Buffer;
}

interface PdfViewport {
  width: number;
  height: number;
}

interface PdfPage {
  getViewport: (opts: { scale: number }) => PdfViewport;
  render: (opts: { canvasContext: object; viewport: PdfViewport }) => { promise: Promise<void> };
}

interface PdfDocument {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
}

interface PdfjsWithGetDocument {
  getDocument: (opts: { data: Uint8Array; verbosity: number }) => { promise: Promise<PdfDocument> };
}

async function renderFirstPdfPage(pdfBuffer: Buffer): Promise<Buffer> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");

  const uint8Array = new Uint8Array(pdfBuffer);
  const pdfjs = pdfjsLib as unknown as PdfjsWithGetDocument;
  const pdfDoc = await pdfjs.getDocument({ data: uint8Array, verbosity: 0 }).promise;

  const page = await pdfDoc.getPage(1);
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx as unknown as object, viewport }).promise;
  return canvas.toBuffer("image/jpeg", 85);
}

const FOOD_CROP_SYSTEM_PROMPT = `Du bist ein Bildanalyse-Assistent für Rezept-Scans. Prüfe das Bild: Ist ein eingebettetes Lebensmittelfoto erkennbar (Foto des fertigen Gerichts oder der Zutaten)? Falls ja, gib die EXAKTEN Koordinaten des eingebetteten Fotos als Prozentwerte zurück. WICHTIG: Erkenne den genauen Bildrand des Fotos und schneide NUR das Foto selbst aus – ohne umliegenden Seitentext, Rezepttext, QR-Codes, Bildunterschriften oder weißen Seitenhintergrund. Die x/y/width/height-Werte sollen eng am tatsächlichen Fotorand enden, kein Leerraum außen. Falls kein Lebensmittelfoto erkennbar ist, gib null zurück. Antworte NUR mit reinem JSON ohne Markdown, ohne Backticks: {"foodImageCrop": {"x": number, "y": number, "width": number, "height": number} | null}`;

export async function extractRecipePhoto(sourceDocumentUrl: string): Promise<Buffer | null> {
  const storageService = new ObjectStorageService();
  const sharp = (await import("sharp")).default;

  const pdfBuffer = await downloadPdfBuffer(sourceDocumentUrl, storageService);

  const pageBuffer = await renderFirstPdfPage(pdfBuffer);

  const aiResponse = await openai.chat.completions.create({
    model: AI_MODEL_MAIN,
    max_completion_tokens: 256,
    messages: [
      { role: "system", content: FOOD_CROP_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image_url" as const,
            image_url: {
              url: `data:image/jpeg;base64,${pageBuffer.toString("base64")}`,
              detail: "high" as const,
            },
          },
          { type: "text" as const, text: "Erkenne und lokalisiere das Lebensmittelfoto in diesem Scan." },
        ],
      },
    ],
  });

  let rawJson = aiResponse.choices[0]?.message?.content ?? "";
  rawJson = rawJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let crop: { x: number; y: number; width: number; height: number } | null = null;
  try {
    const parsed = JSON.parse(rawJson) as { foodImageCrop?: unknown };
    const c = parsed.foodImageCrop;
    if (
      c !== null && typeof c === "object" &&
      Number.isFinite((c as { x: unknown }).x) &&
      Number.isFinite((c as { y: unknown }).y) &&
      Number.isFinite((c as { width: unknown }).width) &&
      Number.isFinite((c as { height: unknown }).height) &&
      (c as { x: number }).x >= 0 && (c as { y: number }).y >= 0 &&
      (c as { width: number }).width > 0 && (c as { height: number }).height > 0 &&
      (c as { x: number; width: number }).x + (c as { x: number; width: number }).width <= 100 &&
      (c as { y: number; height: number }).y + (c as { y: number; height: number }).height <= 100
    ) {
      crop = c as { x: number; y: number; width: number; height: number };
    }
  } catch {
    return null;
  }

  if (!crop) return null;

  const meta = await sharp(pageBuffer).metadata();
  const imgWidth = meta.width ?? 1024;
  const imgHeight = meta.height ?? 1024;

  const cropX = Math.max(0, Math.round((crop.x / 100) * imgWidth));
  const cropY = Math.max(0, Math.round((crop.y / 100) * imgHeight));
  const cropW = Math.min(imgWidth - cropX, Math.max(1, Math.round((crop.width / 100) * imgWidth)));
  const cropH = Math.min(imgHeight - cropY, Math.max(1, Math.round((crop.height / 100) * imgHeight)));

  const extractedBuf = await sharp(pageBuffer)
    .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
    .toBuffer();

  const trimmedBuf = await escalatingTrim(extractedBuf);

  const finalBuffer = await sharp(trimmedBuf)
    .resize(800, 800, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();

  return finalBuffer;
}
