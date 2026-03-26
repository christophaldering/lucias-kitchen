import { Router, type IRouter } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { generateTagsForRecipe } from "../lib/generateRecipeTags";
import {
  bulkImportSessionsTable,
  bulkImportFilesTable,
  bulkImportItemsTable,
  recipesTable,
  recipeIngredientsTable,
  recipePhotosTable,
  usersTable,
  notificationsTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, or, inArray } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { ObjectStorageService, objectStorageClient } from "../lib/objectStorage";
import {
  BULK_IMPORT_EXTRACTION_SYSTEM_PROMPT,
  BULK_IMPORT_HANDWRITING_PROMPT,
} from "../lib/bulkImportExtractionPrompt";
import { invalidateRecipeListCache } from "./recipes";
import { authMiddleware } from "./auth";
import { generateTagsForRecipe } from "../lib/generateRecipeTags";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

const storageService = new ObjectStorageService();

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) path = `/${path}`;
  const parts = path.split("/");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

async function downloadPdfFromStorage(storagePath: string): Promise<Buffer> {
  const privateObjectDir = storageService.getPrivateObjectDir();
  let dir = privateObjectDir;
  if (!dir.endsWith("/")) dir = `${dir}/`;

  const entityId = storagePath.startsWith("/objects/")
    ? storagePath.slice("/objects/".length)
    : storagePath;

  const fullPath = `${dir}${entityId}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  const [contents] = await file.download();
  return contents as Buffer;
}

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
      .set({ status: "processing", startedAt: new Date(), errorText: null })
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

    const parseError = "KI konnte keine gültige JSON-Antwort liefern";
    try {
      const parsed = JSON.parse(rawJson);
      extractedRecipes = Array.isArray(parsed.recipes) ? parsed.recipes : [];
    } catch {
      await db
        .update(bulkImportFilesTable)
        .set({ status: "failed", finishedAt: new Date(), errorText: parseError })
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
        errorText: parseError,
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
      const noRecipesError = "Keine Rezepte im Dokument gefunden";
      await db
        .update(bulkImportFilesTable)
        .set({ status: "failed", finishedAt: new Date(), errorText: noRecipesError })
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
        errorText: noRecipesError,
      });
      return;
    }

    await db
      .update(bulkImportFilesTable)
      .set({ status: "done", finishedAt: new Date() })
      .where(eq(bulkImportFilesTable.id, fileId));

  } catch (err) {
    console.error("Error processing PDF file:", err);
    const errMsg = err instanceof Error ? err.message : "Verarbeitung fehlgeschlagen";
    await db
      .update(bulkImportFilesTable)
      .set({ status: "failed", finishedAt: new Date(), errorText: errMsg })
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
      errorText: errMsg,
    });
  }
}

async function runQueue(
  sessionId: number,
  files: Array<{ id: number; name: string; buffer: Buffer; base64: string }>,
  userId?: number
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

    // Re-read latest session state — add-file may have incremented totalFiles after we started
    const [latestSession] = await db
      .select()
      .from(bulkImportSessionsTable)
      .where(eq(bulkImportSessionsTable.id, sessionId));

    if ((latestSession?.processedFiles ?? 0) < (latestSession?.totalFiles ?? files.length)) {
      // More files are still being added / processed by add-file calls — don't close yet
      return;
    }

    await db
      .update(bulkImportSessionsTable)
      .set({ status: "done", currentFile: null, updatedAt: new Date() })
      .where(eq(bulkImportSessionsTable.id, sessionId));

    if (userId != null) {
      await db
        .update(usersTable)
        .set({ activeBulkImportSessionId: null })
        .where(eq(usersTable.id, userId));

      const allItems = await db
        .select()
        .from(bulkImportItemsTable)
        .where(eq(bulkImportItemsTable.sessionId, sessionId));

      const [finalSession] = await db
        .select()
        .from(bulkImportSessionsTable)
        .where(eq(bulkImportSessionsTable.id, sessionId));

      const totalRecipes = allItems.filter((i) => i.status !== "failed").length;
      const totalFiles = finalSession?.totalFiles ?? files.length;

      await db.insert(notificationsTable).values({
        userId,
        type: "bulk_import_done",
        payload: {
          sessionId,
          totalRecipes,
          totalFiles,
          message: `Import abgeschlossen: ${totalRecipes} Rezepte aus ${totalFiles} Datei${totalFiles !== 1 ? "en" : ""} extrahiert`,
        },
      });
    }
  } catch (err) {
    console.error("Queue processing failed:", err);
    await db
      .update(bulkImportSessionsTable)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(bulkImportSessionsTable.id, sessionId));

    if (userId != null) {
      await db
        .update(usersTable)
        .set({ activeBulkImportSessionId: null })
        .where(eq(usersTable.id, userId));
    }
  }
}

export async function recoverProcessingSessions(): Promise<void> {
  try {
    console.log("[BulkImport] Checking for interrupted processing sessions...");

    const processingSessions = await db
      .select()
      .from(bulkImportSessionsTable)
      .where(
        or(
          eq(bulkImportSessionsTable.status, "processing"),
          eq(bulkImportSessionsTable.status, "pending")
        )
      );

    if (processingSessions.length === 0) {
      console.log("[BulkImport] No interrupted sessions found.");
      return;
    }

    console.log(`[BulkImport] Found ${processingSessions.length} interrupted session(s). Recovering...`);

    for (const session of processingSessions) {
      const allFiles = await db
        .select()
        .from(bulkImportFilesTable)
        .where(eq(bulkImportFilesTable.sessionId, session.id));

      const stuckFiles = allFiles.filter(
        (f) => f.status === "pending" || f.status === "processing"
      );

      if (stuckFiles.length === 0) {
        const anyStillRunning = allFiles.some((f) => f.status === "pending" || f.status === "processing");
        if (!anyStillRunning) {
          await db
            .update(bulkImportSessionsTable)
            .set({ status: "done", currentFile: null, updatedAt: new Date() })
            .where(eq(bulkImportSessionsTable.id, session.id));
          console.log(`[BulkImport] Session ${session.id}: all files resolved, marked as done.`);

          const usersWithSession = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.activeBulkImportSessionId, session.id));
          for (const user of usersWithSession) {
            await db.update(usersTable).set({ activeBulkImportSessionId: null }).where(eq(usersTable.id, user.id));
          }
        }
        continue;
      }

      console.log(`[BulkImport] Session ${session.id}: ${stuckFiles.length} stuck file(s) (pending/processing). Recovering...`);

      for (const f of stuckFiles) {
        if (f.status === "processing") {
          await db
            .update(bulkImportFilesTable)
            .set({ status: "pending", startedAt: null, pageImageUrls: [] as unknown as string[] })
            .where(eq(bulkImportFilesTable.id, f.id));

          await db
            .delete(bulkImportItemsTable)
            .where(and(eq(bulkImportItemsTable.fileId, f.id), eq(bulkImportItemsTable.sessionId, session.id)));
        }
      }

      const recoverableFiles = stuckFiles.filter((f) => f.pdfStoragePath != null);
      const unrecoverableFiles = stuckFiles.filter((f) => f.pdfStoragePath == null);

      if (unrecoverableFiles.length > 0) {
        console.log(`[BulkImport] Session ${session.id}: ${unrecoverableFiles.length} file(s) have no stored PDF, marking as failed.`);
        for (const f of unrecoverableFiles) {
          await db
            .update(bulkImportFilesTable)
            .set({
              status: "failed",
              errorText: "Verarbeitung nach Neustart nicht möglich (PDF nicht gespeichert)",
              finishedAt: new Date(),
            })
            .where(eq(bulkImportFilesTable.id, f.id));
        }
      }

      const usersWithSession = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.activeBulkImportSessionId, session.id));
      const userId = usersWithSession[0]?.id;

      if (recoverableFiles.length === 0) {
        await db
          .update(bulkImportSessionsTable)
          .set({ status: "done", currentFile: null, updatedAt: new Date() })
          .where(eq(bulkImportSessionsTable.id, session.id));
        for (const user of usersWithSession) {
          await db.update(usersTable).set({ activeBulkImportSessionId: null }).where(eq(usersTable.id, user.id));
        }
        continue;
      }

      console.log(`[BulkImport] Session ${session.id}: recovering ${recoverableFiles.length} file(s) from storage...`);

      setImmediate(async () => {
        try {
          const queueItems: Array<{ id: number; name: string; buffer: Buffer; base64: string }> = [];
          for (const f of recoverableFiles) {
            try {
              const buffer = await downloadPdfFromStorage(f.pdfStoragePath!);
              queueItems.push({
                id: f.id,
                name: f.fileName,
                buffer,
                base64: buffer.toString("base64"),
              });
            } catch (downloadErr) {
              console.error(`[BulkImport] Failed to download PDF for file ${f.id}:`, downloadErr);
              await db
                .update(bulkImportFilesTable)
                .set({
                  status: "failed",
                  errorText: "PDF konnte nicht aus dem Speicher geladen werden",
                  finishedAt: new Date(),
                })
                .where(eq(bulkImportFilesTable.id, f.id));
            }
          }

          if (queueItems.length > 0) {
            await runQueue(session.id, queueItems, userId);
          } else {
            await db
              .update(bulkImportSessionsTable)
              .set({ status: "done", currentFile: null, updatedAt: new Date() })
              .where(eq(bulkImportSessionsTable.id, session.id));
            if (userId != null) {
              await db.update(usersTable).set({ activeBulkImportSessionId: null }).where(eq(usersTable.id, userId));
            }
          }
        } catch (err) {
          console.error(`[BulkImport] Recovery failed for session ${session.id}:`, err);
          await db
            .update(bulkImportSessionsTable)
            .set({ status: "failed", updatedAt: new Date() })
            .where(eq(bulkImportSessionsTable.id, session.id));
          if (userId != null) {
            await db.update(usersTable).set({ activeBulkImportSessionId: null }).where(eq(usersTable.id, userId));
          }
        }
      });
    }
  } catch (err) {
    console.error("[BulkImport] Recovery check failed:", err);
  }
}

router.get("/bulk-import/active", authMiddleware, async (req, res) => {
  try {
    const userId = req.authUser!.id;

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!user?.activeBulkImportSessionId) {
      res.json(null);
      return;
    }

    const [session] = await db
      .select()
      .from(bulkImportSessionsTable)
      .where(eq(bulkImportSessionsTable.id, user.activeBulkImportSessionId));

    if (!session || (session.status !== "pending" && session.status !== "processing")) {
      await db
        .update(usersTable)
        .set({ activeBulkImportSessionId: null })
        .where(eq(usersTable.id, userId));
      res.json(null);
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
    req.log.error({ err }, "Failed to get active bulk import session");
    res.status(500).json({ error: "internal_error", message: "Aktive Session konnte nicht abgerufen werden" });
  }
});

router.get("/bulk-import/history", authMiddleware, async (req, res) => {
  try {
    const userId = req.authUser!.id;

    const sessions = await db
      .select()
      .from(bulkImportSessionsTable)
      .where(
        and(
          eq(bulkImportSessionsTable.userId, userId),
          eq(bulkImportSessionsTable.archived, true)
        )
      )
      .orderBy(desc(bulkImportSessionsTable.archivedAt));

    const historyEntries = await Promise.all(
      sessions.map(async (session) => {
        const files = await db
          .select()
          .from(bulkImportFilesTable)
          .where(eq(bulkImportFilesTable.sessionId, session.id));

        const items = await db
          .select()
          .from(bulkImportItemsTable)
          .where(eq(bulkImportItemsTable.sessionId, session.id));

        const totalItems = items.filter((i) => i.status !== "failed").length;
        const savedItems = items.filter((i) => i.savedRecipeId != null).length;
        const rejectedItems = items.filter((i) => i.rejected && i.savedRecipeId == null).length;

        return {
          id: session.id,
          createdAt: session.createdAt,
          archivedAt: session.archivedAt,
          totalFiles: session.totalFiles,
          fileNames: files.map((f) => f.fileName),
          totalItems,
          savedItems,
          rejectedItems,
        };
      })
    );

    res.json(historyEntries);
  } catch (err) {
    req.log.error({ err }, "Failed to get bulk import history");
    res.status(500).json({ error: "internal_error", message: "Verlauf konnte nicht abgerufen werden" });
  }
});

const CHUNK_TTL_MS = 10 * 60 * 1000;

const chunkBuffer = new Map<
  string,
  { chunks: (Buffer | null)[]; totalChunks: number; fileName: string; expiresAt: number }
>();

function evictExpiredChunks() {
  const now = Date.now();
  for (const [key, entry] of chunkBuffer) {
    if (entry.expiresAt < now) {
      chunkBuffer.delete(key);
    }
  }
}

setInterval(evictExpiredChunks, 60_000);

router.post(
  "/bulk-import/upload-chunk",
  authMiddleware,
  async (req, res) => {
    try {
      const { fileName, chunkIndex, totalChunks, data, sessionId, uploadId } = req.body as {
        fileName: string;
        chunkIndex: number;
        totalChunks: number;
        data: string;
        sessionId?: number;
        uploadId: string;
      };

      if (!fileName || !uploadId || chunkIndex == null || totalChunks == null || !data) {
        res.status(400).json({ error: "bad_request", message: "Fehlende Parameter" });
        return;
      }

      const userId = req.authUser!.id;
      const key = `${userId}:${uploadId}`;

      if (!chunkBuffer.has(key)) {
        chunkBuffer.set(key, {
          chunks: new Array(totalChunks).fill(null),
          totalChunks,
          fileName,
          expiresAt: Date.now() + CHUNK_TTL_MS,
        });
      }

      const entry = chunkBuffer.get(key)!;
      entry.expiresAt = Date.now() + CHUNK_TTL_MS;
      entry.chunks[chunkIndex] = Buffer.from(data, "base64");

      const received = entry.chunks.filter((c) => c !== null).length;
      const isComplete = received === totalChunks;

      if (!isComplete) {
        res.json({ received, totalChunks, complete: false });
        return;
      }

      const fullBuffer = Buffer.concat(entry.chunks as Buffer[]);
      chunkBuffer.delete(key);

      const isFirstFile = sessionId == null;

      if (isFirstFile) {
        const [session] = await db
          .insert(bulkImportSessionsTable)
          .values({
            userId,
            status: "pending",
            totalFiles: 1,
            processedFiles: 0,
          })
          .returning();

        await db
          .update(usersTable)
          .set({ activeBulkImportSessionId: session.id })
          .where(eq(usersTable.id, userId));

        let pdfStoragePath: string | null = null;
        try {
          pdfStoragePath = await storageService.uploadBuffer(fullBuffer, "application/pdf", "bulk-import/pdfs");
        } catch (uploadErr) {
          console.error("Failed to persist PDF to storage:", uploadErr);
        }

        const [fileRecord] = await db
          .insert(bulkImportFilesTable)
          .values({
            sessionId: session.id,
            fileName,
            status: "pending",
            pageImageUrls: [] as unknown as string[],
            pdfStoragePath,
          })
          .returning();

        const fileBase64 = fullBuffer.toString("base64");

        setImmediate(() => {
          runQueue(session.id, [{ id: fileRecord.id, name: fileName, buffer: fullBuffer, base64: fileBase64 }], userId).catch(console.error);
        });

        res.json({ complete: true, sessionId: session.id });
      } else {
        const [session] = await db
          .select()
          .from(bulkImportSessionsTable)
          .where(eq(bulkImportSessionsTable.id, sessionId));

        if (!session) {
          res.status(404).json({ error: "not_found", message: "Session nicht gefunden" });
          return;
        }

        if (session.userId !== userId) {
          res.status(403).json({ error: "forbidden", message: "Zugriff verweigert" });
          return;
        }

        let pdfStoragePath: string | null = null;
        try {
          pdfStoragePath = await storageService.uploadBuffer(fullBuffer, "application/pdf", "bulk-import/pdfs");
        } catch (uploadErr) {
          console.error("Failed to persist PDF to storage:", uploadErr);
        }

        const [fileRecord] = await db
          .insert(bulkImportFilesTable)
          .values({
            sessionId,
            fileName,
            status: "pending",
            pageImageUrls: [] as unknown as string[],
            pdfStoragePath,
          })
          .returning();

        await db
          .update(bulkImportSessionsTable)
          .set({
            totalFiles: sql`${bulkImportSessionsTable.totalFiles} + 1`,
            status: "processing",
            updatedAt: new Date(),
          })
          .where(eq(bulkImportSessionsTable.id, sessionId));

        res.json({ complete: true, sessionId, fileId: fileRecord.id });

        const fileBase64 = fullBuffer.toString("base64");

        setImmediate(async () => {
          try {
            await processPdfFile(fileRecord.id, sessionId, fileName, fullBuffer, fileBase64);

            const [updated] = await db
              .update(bulkImportSessionsTable)
              .set({
                processedFiles: sql`${bulkImportSessionsTable.processedFiles} + 1`,
                updatedAt: new Date(),
              })
              .where(eq(bulkImportSessionsTable.id, sessionId))
              .returning();

            if ((updated?.processedFiles ?? 0) >= (updated?.totalFiles ?? 1)) {
              await db
                .update(bulkImportSessionsTable)
                .set({ status: "done", currentFile: null, updatedAt: new Date() })
                .where(eq(bulkImportSessionsTable.id, sessionId));

              await db
                .update(usersTable)
                .set({ activeBulkImportSessionId: null })
                .where(eq(usersTable.id, userId));

              const allItems = await db
                .select()
                .from(bulkImportItemsTable)
                .where(eq(bulkImportItemsTable.sessionId, sessionId));

              const [finalSession] = await db
                .select()
                .from(bulkImportSessionsTable)
                .where(eq(bulkImportSessionsTable.id, sessionId));

              const totalRecipes = allItems.filter((i) => i.status !== "failed").length;
              const totalFilesCount = finalSession?.totalFiles ?? 1;

              await db.insert(notificationsTable).values({
                userId,
                type: "bulk_import_done",
                payload: {
                  sessionId,
                  totalRecipes,
                  totalFiles: totalFilesCount,
                  message: `Import abgeschlossen: ${totalRecipes} Rezepte aus ${totalFilesCount} Datei${totalFilesCount !== 1 ? "en" : ""} extrahiert`,
                },
              });
            }
          } catch (procErr) {
            console.error("upload-chunk add-file processing failed:", procErr);
            await db
              .update(bulkImportSessionsTable)
              .set({
                processedFiles: sql`${bulkImportSessionsTable.processedFiles} + 1`,
                updatedAt: new Date(),
              })
              .where(eq(bulkImportSessionsTable.id, sessionId));
          }
        });
      }
    } catch (err) {
      req.log.error({ err }, "Failed to handle chunk upload");
      res.status(500).json({ error: "internal_error", message: "Chunk-Upload fehlgeschlagen" });
    }
  }
);

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

      const userId = req.authUser!.id;

      const [session] = await db
        .insert(bulkImportSessionsTable)
        .values({
          userId,
          status: "pending",
          totalFiles: files.length,
          processedFiles: 0,
        })
        .returning();

      await db
        .update(usersTable)
        .set({ activeBulkImportSessionId: session.id })
        .where(eq(usersTable.id, userId));

      const fileRecords = await Promise.all(
        files.map(async (f) => {
          let pdfStoragePath: string | null = null;
          try {
            pdfStoragePath = await storageService.uploadBuffer(f.buffer, "application/pdf", "bulk-import/pdfs");
          } catch (uploadErr) {
            console.error("Failed to persist PDF to storage:", uploadErr);
          }

          const [record] = await db
            .insert(bulkImportFilesTable)
            .values({
              sessionId: session.id,
              fileName: f.originalname,
              status: "pending",
              pageImageUrls: [] as unknown as string[],
              pdfStoragePath,
            })
            .returning();
          return record;
        })
      );

      const queueItems = files.map((f, i) => ({
        id: fileRecords[i].id,
        name: f.originalname,
        buffer: f.buffer,
        base64: f.buffer.toString("base64"),
      }));

      setImmediate(() => {
        runQueue(session.id, queueItems, userId).catch(console.error);
      });

      res.json({ sessionId: session.id, totalFiles: files.length });
    } catch (err) {
      req.log.error({ err }, "Failed to start bulk import");
      res.status(500).json({ error: "internal_error", message: "Bulk-Import konnte nicht gestartet werden" });
    }
  }
);

router.post(
  "/bulk-import/:sessionId/add-file",
  authMiddleware,
  upload.single("pdf"),
  async (req, res) => {
    try {
      const sessionId = Number(req.params.sessionId);
      if (isNaN(sessionId)) {
        res.status(400).json({ error: "bad_request", message: "Ungültige Session-ID" });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "bad_request", message: "Keine PDF-Datei hochgeladen" });
        return;
      }

      const userId = req.authUser!.id;

      const [session] = await db
        .select()
        .from(bulkImportSessionsTable)
        .where(eq(bulkImportSessionsTable.id, sessionId));

      if (!session) {
        res.status(404).json({ error: "not_found", message: "Session nicht gefunden" });
        return;
      }

      if (session.userId !== userId) {
        res.status(403).json({ error: "forbidden", message: "Zugriff verweigert" });
        return;
      }

      let pdfStoragePath: string | null = null;
      try {
        pdfStoragePath = await storageService.uploadBuffer(file.buffer, "application/pdf", "bulk-import/pdfs");
      } catch (uploadErr) {
        console.error("Failed to persist PDF to storage:", uploadErr);
      }

      const [fileRecord] = await db
        .insert(bulkImportFilesTable)
        .values({
          sessionId,
          fileName: file.originalname,
          status: "pending",
          pageImageUrls: [] as unknown as string[],
          pdfStoragePath,
        })
        .returning();

      await db
        .update(bulkImportSessionsTable)
        .set({
          totalFiles: sql`${bulkImportSessionsTable.totalFiles} + 1`,
          status: "processing",
          updatedAt: new Date(),
        })
        .where(eq(bulkImportSessionsTable.id, sessionId));

      res.json({ fileId: fileRecord.id, sessionId });

      const fileBuffer = file.buffer;
      const fileBase64 = file.buffer.toString("base64");
      const fileName = file.originalname;

      setImmediate(async () => {
        try {
          await processPdfFile(fileRecord.id, sessionId, fileName, fileBuffer, fileBase64);

          const [updated] = await db
            .update(bulkImportSessionsTable)
            .set({
              processedFiles: sql`${bulkImportSessionsTable.processedFiles} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(bulkImportSessionsTable.id, sessionId))
            .returning();

          if ((updated?.processedFiles ?? 0) >= (updated?.totalFiles ?? 1)) {
            await db
              .update(bulkImportSessionsTable)
              .set({ status: "done", currentFile: null, updatedAt: new Date() })
              .where(eq(bulkImportSessionsTable.id, sessionId));

            await db
              .update(usersTable)
              .set({ activeBulkImportSessionId: null })
              .where(eq(usersTable.id, userId));

            const allItems = await db
              .select()
              .from(bulkImportItemsTable)
              .where(eq(bulkImportItemsTable.sessionId, sessionId));

            const [finalSession] = await db
              .select()
              .from(bulkImportSessionsTable)
              .where(eq(bulkImportSessionsTable.id, sessionId));

            const totalRecipes = allItems.filter((i) => i.status !== "failed").length;
            const totalFilesCount = finalSession?.totalFiles ?? 1;

            await db.insert(notificationsTable).values({
              userId,
              type: "bulk_import_done",
              payload: {
                sessionId,
                totalRecipes,
                totalFiles: totalFilesCount,
                message: `Import abgeschlossen: ${totalRecipes} Rezepte aus ${totalFilesCount} Datei${totalFilesCount !== 1 ? "en" : ""} extrahiert`,
              },
            });
          }
        } catch (procErr) {
          console.error("add-file processing failed:", procErr);
          await db
            .update(bulkImportSessionsTable)
            .set({
              processedFiles: sql`${bulkImportSessionsTable.processedFiles} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(bulkImportSessionsTable.id, sessionId));
        }
      });
    } catch (err) {
      req.log.error({ err }, "Failed to add file to bulk import session");
      res.status(500).json({ error: "internal_error", message: "Datei konnte nicht hinzugefügt werden" });
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

    const files = await db
      .select()
      .from(bulkImportFilesTable)
      .where(eq(bulkImportFilesTable.sessionId, sessionId));

    const errorCount = files.filter((f) => f.status === "failed").length;

    res.json({
      id: session.id,
      status: session.status,
      totalFiles: session.totalFiles,
      processedFiles: session.processedFiles,
      currentFile: session.currentFile,
      errorCount,
      updatedAt: session.updatedAt,
      files: files.map((f) => ({
        id: f.id,
        fileName: f.fileName,
        status: f.status,
        errorText: f.errorText,
        startedAt: f.startedAt,
        finishedAt: f.finishedAt,
        canRetry: f.pdfStoragePath != null,
      })),
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

    const groupedByFile = files.map((file) => ({
      file: {
        id: file.id,
        fileName: file.fileName,
        status: file.status,
        pageImageUrls: file.pageImageUrls as string[],
        errorText: file.errorText,
        startedAt: file.startedAt,
        finishedAt: file.finishedAt,
        canRetry: file.pdfStoragePath != null,
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

router.post("/bulk-import/:sessionId/retry/:fileId", authMiddleware, async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const fileId = Number(req.params.fileId);
    if (isNaN(sessionId) || isNaN(fileId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid IDs" });
      return;
    }

    const [file] = await db
      .select()
      .from(bulkImportFilesTable)
      .where(and(eq(bulkImportFilesTable.id, fileId), eq(bulkImportFilesTable.sessionId, sessionId)));

    if (!file) {
      res.status(404).json({ error: "not_found", message: "Datei nicht gefunden" });
      return;
    }

    if (!file.pdfStoragePath) {
      res.status(400).json({ error: "bad_request", message: "PDF nicht mehr verfügbar — kein Retry möglich" });
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

    await db
      .update(bulkImportFilesTable)
      .set({ status: "pending", startedAt: null, finishedAt: null, errorText: null, pageImageUrls: [] as unknown as string[] })
      .where(eq(bulkImportFilesTable.id, fileId));

    await db
      .delete(bulkImportItemsTable)
      .where(and(eq(bulkImportItemsTable.fileId, fileId), eq(bulkImportItemsTable.sessionId, sessionId)));

    if (session.processedFiles > 0) {
      await db
        .update(bulkImportSessionsTable)
        .set({
          processedFiles: Math.max(0, session.processedFiles - 1),
          status: "processing",
          updatedAt: new Date(),
        })
        .where(eq(bulkImportSessionsTable.id, sessionId));
    } else {
      await db
        .update(bulkImportSessionsTable)
        .set({ status: "processing", updatedAt: new Date() })
        .where(eq(bulkImportSessionsTable.id, sessionId));
    }

    const userId = req.authUser!.id;
    await db
      .update(usersTable)
      .set({ activeBulkImportSessionId: sessionId })
      .where(eq(usersTable.id, userId));

    setImmediate(async () => {
      try {
        const buffer = await downloadPdfFromStorage(file.pdfStoragePath!);
        const base64 = buffer.toString("base64");
        await processPdfFile(fileId, sessionId, file.fileName, buffer, base64);

        const [updatedSession] = await db
          .select()
          .from(bulkImportSessionsTable)
          .where(eq(bulkImportSessionsTable.id, sessionId));

        const newProcessed = (updatedSession?.processedFiles ?? 0) + 1;
        await db
          .update(bulkImportSessionsTable)
          .set({ processedFiles: newProcessed, updatedAt: new Date() })
          .where(eq(bulkImportSessionsTable.id, sessionId));

        const allFiles = await db
          .select()
          .from(bulkImportFilesTable)
          .where(eq(bulkImportFilesTable.sessionId, sessionId));

        const stillPending = allFiles.some((f) => f.status === "pending" || f.status === "processing");
        if (!stillPending) {
          await db
            .update(bulkImportSessionsTable)
            .set({ status: "done", currentFile: null, updatedAt: new Date() })
            .where(eq(bulkImportSessionsTable.id, sessionId));
          await db
            .update(usersTable)
            .set({ activeBulkImportSessionId: null })
            .where(eq(usersTable.id, userId));
        }
      } catch (err) {
        console.error(`Failed to retry file ${fileId}:`, err);
        const errMsg = err instanceof Error ? err.message : "Retry fehlgeschlagen";
        await db
          .update(bulkImportFilesTable)
          .set({ status: "failed", errorText: errMsg, finishedAt: new Date() })
          .where(eq(bulkImportFilesTable.id, fileId));
      }
    });

    res.json({ success: true, message: "Datei wird erneut verarbeitet" });
  } catch (err) {
    req.log.error({ err }, "Failed to retry file");
    res.status(500).json({ error: "internal_error", message: "Retry fehlgeschlagen" });
  }
});

async function extractPdfPages(pdfBuffer: Buffer, pageNumbers: number[]): Promise<Buffer | null> {
  if (pageNumbers.length === 0) return null;
  try {
    const { PDFDocument } = await import("pdf-lib");
    const srcDoc = await PDFDocument.load(pdfBuffer);
    const totalPages = srcDoc.getPageCount();
    const newDoc = await PDFDocument.create();
    for (const pageNum of pageNumbers) {
      const pageIndex = pageNum - 1;
      if (pageIndex >= 0 && pageIndex < totalPages) {
        const [copiedPage] = await newDoc.copyPages(srcDoc, [pageIndex]);
        newDoc.addPage(copiedPage);
      }
    }
    if (newDoc.getPageCount() === 0) return null;
    const bytes = await newDoc.save();
    return Buffer.from(bytes);
  } catch {
    return null;
  }
}

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

    // Preload original PDFs per file (keyed by fileId) for page extraction
    const fileIds = [...new Set(savableItems.map((item) => item.fileId))];
    const pdfBuffersByFileId = new Map<number, Buffer>();
    const fileRecords = fileIds.length > 0
      ? await db
          .select()
          .from(bulkImportFilesTable)
          .where(inArray(bulkImportFilesTable.id, fileIds))
      : [];

    for (const fileRecord of fileRecords) {
      if (fileRecord.pdfStoragePath) {
        try {
          const buf = await downloadPdfFromStorage(fileRecord.pdfStoragePath);
          pdfBuffersByFileId.set(fileRecord.id, buf);
        } catch {
        }
      }
    }

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

        // Build source document URL: extract relevant pages from the original PDF
        let sourceDocumentUrl: string | null = null;
        const pageNumbers = (item.pageNumbers as number[]) ?? [];
        const originalPdfBuffer = pdfBuffersByFileId.get(item.fileId);
        if (originalPdfBuffer) {
          try {
            if (pageNumbers.length > 0) {
              const miniPdf = await extractPdfPages(originalPdfBuffer, pageNumbers);
              if (miniPdf) {
                const storagePath = await storageService.uploadBuffer(miniPdf, "application/pdf", "source-documents");
                sourceDocumentUrl = `/api/storage${storagePath}`;
              }
            } else {
              // No page numbers — store the entire PDF
              const storagePath = await storageService.uploadBuffer(originalPdfBuffer, "application/pdf", "source-documents");
              sourceDocumentUrl = `/api/storage${storagePath}`;
            }
          } catch {
          }
        }

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
            sourceDocumentUrl,
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

        generateTagsForRecipe({
          title: rd.title ?? "Importiertes Rezept",
          category: rd.category ?? null,
          ingredients: (rd.ingredients ?? []).map((i) => ({ name: i.name })),
          seasons: [],
          steps: rd.steps ?? [],
          notes: rd.notes ?? null,
        }).then((tags) => {
          if (tags.length > 0) {
            db.update(recipesTable)
              .set({ tags })
              .where(eq(recipesTable.id, recipe.id))
              .catch(() => {});
          }
        }).catch(() => {});

        savedCount++;

        setImmediate(() => {
          generateTagsForRecipe({
            title: rd.title ?? "Importiertes Rezept",
            category: rd.category ?? null,
            ingredients: (rd.ingredients ?? []).map((i) => ({ name: i.name })),
            seasons: [],
            steps: rd.steps ?? [],
            notes: rd.notes ?? null,
          }).then((tags) => {
            if (tags.length > 0) {
              db.update(recipesTable)
                .set({ tags })
                .where(eq(recipesTable.id, recipe.id))
                .catch(() => {});
            }
          }).catch(() => {});
        });
      } catch (err) {
        console.error(`Failed to save item ${item.id}:`, err);
      }
    }

    if (savedCount > 0) {
      invalidateRecipeListCache();
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

    const userId = req.authUser!.id;

    const [session] = await db
      .select()
      .from(bulkImportSessionsTable)
      .where(eq(bulkImportSessionsTable.id, sessionId));

    if (!session) {
      res.status(404).json({ error: "not_found", message: "Session nicht gefunden" });
      return;
    }

    if (session.userId !== null && session.userId !== userId) {
      res.status(403).json({ error: "forbidden", message: "Zugriff verweigert" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (user?.activeBulkImportSessionId === sessionId) {
      await db
        .update(usersTable)
        .set({ activeBulkImportSessionId: null })
        .where(eq(usersTable.id, userId));
    }

    await db
      .update(bulkImportSessionsTable)
      .set({ archived: true, archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(bulkImportSessionsTable.id, sessionId));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to archive bulk import session");
    res.status(500).json({ error: "internal_error", message: "Archivierung fehlgeschlagen" });
  }
});

export default router;
