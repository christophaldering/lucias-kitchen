import { Router, type IRouter } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import {
  bulkImportSessionsTable,
  bulkImportFilesTable,
  bulkImportItemsTable,
  recipesTable,
  recipeIngredientsTable,
  recipePhotosTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  BULK_IMPORT_EXTRACTION_SYSTEM_PROMPT,
  BULK_IMPORT_HANDWRITING_PROMPT,
} from "../lib/bulkImportExtractionPrompt";
import { authMiddleware } from "./auth";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

const storageService = new ObjectStorageService();

async function renderPdfPages(pdfBuffer: Buffer): Promise<Buffer[]> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const canvasModule = await import("canvas");
  const { createCanvas } = canvasModule;

  const uint8Array = new Uint8Array(pdfBuffer);
  const loadingTask = pdfjsLib.getDocument({ data: uint8Array, verbosity: 0 });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;
  const pageImages: Buffer[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });

    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");

    await page.render({
      canvasContext: ctx as unknown as Parameters<typeof page.render>[0]["canvasContext"],
      viewport,
    }).promise;

    const jpegBuffer = canvas.toBuffer("image/jpeg", { quality: 0.85 });
    pageImages.push(jpegBuffer);
  }

  return pageImages;
}

async function processPdfFile(
  fileId: number,
  sessionId: number,
  fileName: string,
  pdfBuffer: Buffer,
  pdfBase64: string
): Promise<void> {
  try {
    await db
      .update(bulkImportFilesTable)
      .set({ status: "processing" })
      .where(eq(bulkImportFilesTable.id, fileId));

    await db
      .update(bulkImportSessionsTable)
      .set({ currentFile: fileName, updatedAt: new Date() })
      .where(eq(bulkImportSessionsTable.id, sessionId));

    let pageImageUrls: string[] = [];
    try {
      const pageBuffers = await renderPdfPages(pdfBuffer);
      for (let i = 0; i < pageBuffers.length; i++) {
        const objectPath = await storageService.uploadBuffer(
          pageBuffers[i],
          "image/jpeg",
          "bulk-import/pages"
        );
        const servingUrl = `/api/storage${objectPath}`;
        pageImageUrls.push(servingUrl);
      }
    } catch (renderErr) {
      console.error("PDF rendering failed, proceeding without page images:", renderErr);
    }

    await db
      .update(bulkImportFilesTable)
      .set({ pageImageUrls: pageImageUrls as unknown as string[] })
      .where(eq(bulkImportFilesTable.id, fileId));

    const firstPassResponse = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      system: "Du analysierst einen PDF-Scan. Antworte NUR mit einem JSON-Objekt: {\"hasHandwriting\": true/false}. Prüfe ob handschriftliche Anmerkungen, Notizen oder Korrekturen im Dokument vorhanden sind.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            {
              type: "text",
              text: "Gibt es handschriftliche Anmerkungen, Notizen oder Korrekturen in diesem Dokument?",
            },
          ],
        },
      ],
    });

    let documentHasHandwriting = false;
    try {
      const rawText = firstPassResponse.content[0]?.type === "text" ? firstPassResponse.content[0].text : "{}";
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(cleaned);
      documentHasHandwriting = !!parsed.hasHandwriting;
    } catch {
      documentHasHandwriting = false;
    }

    const systemPrompt = documentHasHandwriting
      ? BULK_IMPORT_HANDWRITING_PROMPT
      : BULK_IMPORT_EXTRACTION_SYSTEM_PROMPT;

    const extractionResponse = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            {
              type: "text",
              text: documentHasHandwriting
                ? "Extrahiere ALLE Rezepte aus diesem Dokument. Achte besonders auf handschriftliche Anmerkungen, Randnotizen und Korrekturen. Erfasse sie vollständig in personalNotes."
                : "Extrahiere ALLE Rezepte aus diesem PDF-Dokument. Ein Dokument kann mehrere Rezepte enthalten.",
            },
          ],
        },
      ],
    });

    let rawJson = extractionResponse.content[0]?.type === "text" ? extractionResponse.content[0].text : "{}";
    rawJson = rawJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let extractedRecipes: Array<{
      title?: string;
      servings?: number;
      prepTime?: string;
      totalTime?: string;
      difficulty?: string;
      category?: string;
      ingredients?: Array<{ amount: string; unit: string; name: string; note?: string }>;
      steps?: string[];
      notes?: string;
      personalNotes?: string;
      source?: string;
      hasHandwriting?: boolean;
      confidence?: string;
      pageNumbers?: number[];
    }> = [];

    try {
      const parsed = JSON.parse(rawJson);
      extractedRecipes = Array.isArray(parsed.recipes) ? parsed.recipes : [];
    } catch {
      await db
        .update(bulkImportFilesTable)
        .set({ status: "failed" })
        .where(eq(bulkImportFilesTable.id, fileId));

      await db.insert(bulkImportItemsTable).values({
        sessionId,
        fileId,
        fileName,
        status: "failed",
        recipeData: null,
        pageNumbers: [] as unknown as string[],
        pageImageUrls: [] as unknown as string[],
        hasHandwriting: documentHasHandwriting,
        errorText: "KI konnte keine gültige JSON-Antwort liefern",
      });
      return;
    }

    for (const recipe of extractedRecipes) {
      const pageNums: number[] = Array.isArray(recipe.pageNumbers) ? recipe.pageNumbers : [];
      const recipePageImageUrls = pageNums
        .filter((n) => n >= 1 && n <= pageImageUrls.length)
        .map((n) => pageImageUrls[n - 1]);

      const hasHw = recipe.hasHandwriting ?? documentHasHandwriting;
      let status: "done" | "uncertain" | "handwriting" | "failed" = "done";
      if (hasHw) {
        status = "handwriting";
      } else if (recipe.confidence === "uncertain") {
        status = "uncertain";
      }

      const recipeData = {
        title: recipe.title ?? "Unbekanntes Rezept",
        servings: recipe.servings,
        prepTime: recipe.prepTime,
        totalTime: recipe.totalTime,
        difficulty: recipe.difficulty ?? "normal",
        category: recipe.category ?? "Vegetarisch",
        ingredients: recipe.ingredients ?? [],
        steps: recipe.steps ?? [],
        notes: recipe.notes,
        personalNotes: recipe.personalNotes,
        source: recipe.source,
      };

      await db.insert(bulkImportItemsTable).values({
        sessionId,
        fileId,
        fileName,
        status,
        recipeData: recipeData as unknown as string,
        pageNumbers: pageNums as unknown as string[],
        pageImageUrls: recipePageImageUrls as unknown as string[],
        hasHandwriting: hasHw,
        errorText: null,
      });
    }

    if (extractedRecipes.length === 0) {
      await db.insert(bulkImportItemsTable).values({
        sessionId,
        fileId,
        fileName,
        status: "failed",
        recipeData: null,
        pageNumbers: [] as unknown as string[],
        pageImageUrls: [] as unknown as string[],
        hasHandwriting: documentHasHandwriting,
        errorText: "Keine Rezepte im Dokument gefunden",
      });
    }

    await db
      .update(bulkImportFilesTable)
      .set({ status: "done" })
      .where(eq(bulkImportFilesTable.id, fileId));

  } catch (err) {
    console.error("Error processing PDF file:", err);
    await db
      .update(bulkImportFilesTable)
      .set({ status: "failed" })
      .where(eq(bulkImportFilesTable.id, fileId));

    await db.insert(bulkImportItemsTable).values({
      sessionId,
      fileId,
      fileName,
      status: "failed",
      recipeData: null,
      pageNumbers: [] as unknown as string[],
      pageImageUrls: [] as unknown as string[],
      hasHandwriting: false,
      errorText: err instanceof Error ? err.message : "Verarbeitung fehlgeschlagen",
    });
  }
}

async function runQueue(
  sessionId: number,
  files: Array<{ id: number; name: string; buffer: Buffer; base64: string }>
): Promise<void> {
  try {
    await db
      .update(bulkImportSessionsTable)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(bulkImportSessionsTable.id, sessionId));

    for (const file of files) {
      await processPdfFile(file.id, sessionId, file.name, file.buffer, file.base64);

      const [session] = await db
        .select()
        .from(bulkImportSessionsTable)
        .where(eq(bulkImportSessionsTable.id, sessionId));

      const newProcessed = (session?.processedFiles ?? 0) + 1;
      await db
        .update(bulkImportSessionsTable)
        .set({ processedFiles: newProcessed, updatedAt: new Date() })
        .where(eq(bulkImportSessionsTable.id, sessionId));
    }

    await db
      .update(bulkImportSessionsTable)
      .set({ status: "done", currentFile: null, updatedAt: new Date() })
      .where(eq(bulkImportSessionsTable.id, sessionId));
  } catch (err) {
    console.error("Queue processing failed:", err);
    await db
      .update(bulkImportSessionsTable)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(bulkImportSessionsTable.id, sessionId));
  }
}

router.post(
  "/bulk-import/start",
  authMiddleware,
  upload.array("pdfs", 100),
  async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.status(400).json({ error: "bad_request", message: "Keine PDF-Dateien hochgeladen" });
        return;
      }

      const [session] = await db
        .insert(bulkImportSessionsTable)
        .values({
          status: "pending",
          totalFiles: files.length,
          processedFiles: 0,
        })
        .returning();

      const fileRecords = await Promise.all(
        files.map((f) =>
          db
            .insert(bulkImportFilesTable)
            .values({
              sessionId: session.id,
              fileName: f.originalname,
              status: "pending",
              pageImageUrls: [] as unknown as string[],
            })
            .returning()
            .then((rows) => rows[0])
        )
      );

      const queueItems = files.map((f, i) => ({
        id: fileRecords[i].id,
        name: f.originalname,
        buffer: f.buffer,
        base64: f.buffer.toString("base64"),
      }));

      setImmediate(() => {
        runQueue(session.id, queueItems).catch(console.error);
      });

      res.json({ sessionId: session.id, totalFiles: files.length });
    } catch (err) {
      req.log.error({ err }, "Failed to start bulk import");
      res.status(500).json({ error: "internal_error", message: "Bulk-Import konnte nicht gestartet werden" });
    }
  }
);

router.get("/bulk-import/:sessionId/status", authMiddleware, async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    if (isNaN(sessionId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid sessionId" });
      return;
    }

    const [session] = await db
      .select()
      .from(bulkImportSessionsTable)
      .where(eq(bulkImportSessionsTable.id, sessionId));

    if (!session) {
      res.status(404).json({ error: "not_found", message: "Session nicht gefunden" });
      return;
    }

    res.json({
      id: session.id,
      status: session.status,
      totalFiles: session.totalFiles,
      processedFiles: session.processedFiles,
      currentFile: session.currentFile,
      updatedAt: session.updatedAt,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get bulk import status");
    res.status(500).json({ error: "internal_error", message: "Status konnte nicht abgerufen werden" });
  }
});

router.get("/bulk-import/:sessionId/results", authMiddleware, async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    if (isNaN(sessionId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid sessionId" });
      return;
    }

    const [session] = await db
      .select()
      .from(bulkImportSessionsTable)
      .where(eq(bulkImportSessionsTable.id, sessionId));

    if (!session) {
      res.status(404).json({ error: "not_found", message: "Session nicht gefunden" });
      return;
    }

    const files = await db
      .select()
      .from(bulkImportFilesTable)
      .where(eq(bulkImportFilesTable.sessionId, sessionId));

    const items = await db
      .select()
      .from(bulkImportItemsTable)
      .where(eq(bulkImportItemsTable.sessionId, sessionId));

    const fileMap = new Map(files.map((f) => [f.id, f]));

    const groupedByFile = files.map((file) => ({
      file: {
        id: file.id,
        fileName: file.fileName,
        status: file.status,
        pageImageUrls: file.pageImageUrls as string[],
      },
      items: items
        .filter((item) => item.fileId === file.id)
        .map((item) => ({
          id: item.id,
          status: item.status,
          hasHandwriting: item.hasHandwriting,
          rejected: item.rejected,
          savedRecipeId: item.savedRecipeId,
          errorText: item.errorText,
          pageNumbers: item.pageNumbers as number[],
          pageImageUrls: item.pageImageUrls as string[],
          recipeData: item.recipeData,
          fileName: item.fileName,
        })),
    }));

    res.json({
      session: {
        id: session.id,
        status: session.status,
        totalFiles: session.totalFiles,
        processedFiles: session.processedFiles,
        currentFile: session.currentFile,
      },
      groups: groupedByFile,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get bulk import results");
    res.status(500).json({ error: "internal_error", message: "Ergebnisse konnten nicht abgerufen werden" });
  }
});

router.post("/bulk-import/:sessionId/restore/:itemId", authMiddleware, async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const itemId = Number(req.params.itemId);
    if (isNaN(sessionId) || isNaN(itemId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid IDs" });
      return;
    }

    await db
      .update(bulkImportItemsTable)
      .set({ rejected: false })
      .where(and(eq(bulkImportItemsTable.id, itemId), eq(bulkImportItemsTable.sessionId, sessionId)));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to restore item");
    res.status(500).json({ error: "internal_error", message: "Wiederherstellen fehlgeschlagen" });
  }
});

router.post("/bulk-import/:sessionId/reject/:itemId", authMiddleware, async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const itemId = Number(req.params.itemId);
    if (isNaN(sessionId) || isNaN(itemId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid IDs" });
      return;
    }

    await db
      .update(bulkImportItemsTable)
      .set({ rejected: true })
      .where(and(eq(bulkImportItemsTable.id, itemId), eq(bulkImportItemsTable.sessionId, sessionId)));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reject item");
    res.status(500).json({ error: "internal_error", message: "Ablehnen fehlgeschlagen" });
  }
});

router.post("/bulk-import/:sessionId/save", authMiddleware, async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    if (isNaN(sessionId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid sessionId" });
      return;
    }

    const [session] = await db
      .select()
      .from(bulkImportSessionsTable)
      .where(eq(bulkImportSessionsTable.id, sessionId));

    if (!session) {
      res.status(404).json({ error: "not_found", message: "Session nicht gefunden" });
      return;
    }

    const itemsToSave = await db
      .select()
      .from(bulkImportItemsTable)
      .where(
        and(
          eq(bulkImportItemsTable.sessionId, sessionId),
          eq(bulkImportItemsTable.rejected, false)
        )
      );

    const savableItems = itemsToSave.filter(
      (item) => item.status !== "failed" && item.recipeData != null && item.savedRecipeId == null
    );

    const userId = req.authUser!.id;
    let savedCount = 0;

    for (const item of savableItems) {
      try {
        const rd = item.recipeData as {
          title: string;
          servings?: number;
          prepTime?: string;
          totalTime?: string;
          difficulty?: string;
          category?: string;
          ingredients?: Array<{ amount: string; unit: string; name: string; note?: string }>;
          steps?: string[];
          notes?: string;
          personalNotes?: string;
          source?: string;
        };

        const [recipe] = await db
          .insert(recipesTable)
          .values({
            title: rd.title ?? "Importiertes Rezept",
            servings: rd.servings ?? null,
            prepTime: rd.prepTime ?? null,
            totalTime: rd.totalTime ?? null,
            difficulty: (rd.difficulty as "simpel" | "normal" | "schwer") ?? "normal",
            category: rd.category ?? "Vegetarisch",
            notes: rd.notes ?? null,
            personalNotes: rd.personalNotes ?? null,
            source: rd.source ?? null,
            steps: (rd.steps ?? []) as unknown as string,
            createdBy: userId,
            seasons: [],
          })
          .returning();

        const ingredients = rd.ingredients ?? [];
        if (ingredients.length > 0) {
          await db.insert(recipeIngredientsTable).values(
            ingredients.map((ing) => ({
              recipeId: recipe.id,
              amount: ing.amount || "",
              unit: ing.unit || "",
              name: ing.name,
              note: ing.note ?? null,
            }))
          );
        }

        const pageImageUrls = item.pageImageUrls as string[];
        if (pageImageUrls.length > 0) {
          await db.insert(recipePhotosTable).values(
            pageImageUrls.map((url) => ({
              recipeId: recipe.id,
              imageUrl: url,
            }))
          );
        }

        await db
          .update(bulkImportItemsTable)
          .set({ savedRecipeId: recipe.id })
          .where(eq(bulkImportItemsTable.id, item.id));

        savedCount++;
      } catch (err) {
        console.error(`Failed to save item ${item.id}:`, err);
      }
    }

    res.json({ success: true, savedCount });
  } catch (err) {
    req.log.error({ err }, "Failed to save bulk import items");
    res.status(500).json({ error: "internal_error", message: "Speichern fehlgeschlagen" });
  }
});

router.delete("/bulk-import/:sessionId", authMiddleware, async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    if (isNaN(sessionId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid sessionId" });
      return;
    }

    await db
      .delete(bulkImportSessionsTable)
      .where(eq(bulkImportSessionsTable.id, sessionId));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete bulk import session");
    res.status(500).json({ error: "internal_error", message: "Bereinigung fehlgeschlagen" });
  }
});

export default router;
