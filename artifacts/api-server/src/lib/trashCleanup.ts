import { db } from "@workspace/db";
import { recipesTable } from "@workspace/db/schema";
import { sql, inArray, and, eq, isNull } from "drizzle-orm";
import { logger } from "./logger";

const TRASH_RETENTION_DAYS = 30;

export async function cleanupExpiredTrash(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const expired = await db
      .select({ id: recipesTable.id, sourceDocumentUrl: recipesTable.sourceDocumentUrl })
      .from(recipesTable)
      .where(sql`${recipesTable.deletedAt} IS NOT NULL AND ${recipesTable.deletedAt} < ${cutoff}`);

    if (expired.length === 0) return;

    const expiredIds = new Set(expired.map((r) => r.id));

    for (const recipe of expired) {
      if (recipe.sourceDocumentUrl) {
        try {
          const [activeRef] = await db
            .select({ id: recipesTable.id })
            .from(recipesTable)
            .where(
              and(
                eq(recipesTable.sourceDocumentUrl, recipe.sourceDocumentUrl),
                isNull(recipesTable.deletedAt),
                sql`${recipesTable.id} != ${recipe.id}`
              )
            )
            .limit(1);

          if (!activeRef) {
            const { ObjectStorageService } = await import("./objectStorage");
            const storageService = new ObjectStorageService();
            const storagePath = recipe.sourceDocumentUrl.replace(/^\/api\/storage/, "");
            await storageService.deleteObject(storagePath);
          }
        } catch {
        }
      }
    }

    await db.delete(recipesTable).where(inArray(recipesTable.id, [...expiredIds]));
    logger.info({ count: expired.length }, "Cleaned up expired trash recipes");
  } catch (err) {
    logger.error({ err }, "Failed to clean up expired trash");
  }
}

export function startTrashCleanupJob(): void {
  cleanupExpiredTrash().catch(() => {});
  const INTERVAL_MS = 24 * 60 * 60 * 1000;
  setInterval(() => {
    cleanupExpiredTrash().catch(() => {});
  }, INTERVAL_MS);
}
