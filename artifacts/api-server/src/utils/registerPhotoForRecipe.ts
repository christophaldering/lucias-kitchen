import { db } from "@workspace/db";
import { photosTable, recipePhotoLinksTable, recipesTable } from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";

type PhotoSource = "original" | "upload" | "ai" | "cooked" | "web" | "pdf_extract" | "ai_generated" | "url_import" | "imported";

function mapSource(source: PhotoSource): "original" | "upload" | "ai" | "cooked" | "web" {
  switch (source) {
    case "ai":
    case "ai_generated":
      return "ai";
    case "web":
    case "url_import":
      return "web";
    case "pdf_extract":
    case "original":
    case "imported":
      return "original";
    case "upload":
      return "upload";
    case "cooked":
      return "cooked";
    default:
      return "original";
  }
}

export async function registerPhotoForRecipe(
  imageUrl: string,
  recipeId: number,
  options?: {
    source?: PhotoSource;
    uploadedBy?: number | null;
    /**
     * true  → always promote this photo to main (demotes previous main)
     * false → never set as main
     * undefined (default) → set as main only if no main exists yet
     */
    setAsMain?: boolean;
    /** When true and photo is set as main, also update recipes.imageUrl */
    syncRecipeImageUrl?: boolean;
  }
): Promise<void> {
  const source = mapSource(options?.source ?? "original");
  const uploadedBy = options?.uploadedBy ?? null;
  const syncRecipeImageUrl = options?.syncRecipeImageUrl !== false;

  let [photo] = await db
    .select({ id: photosTable.id })
    .from(photosTable)
    .where(eq(photosTable.imageUrl, imageUrl))
    .limit(1);

  if (!photo) {
    [photo] = await db
      .insert(photosTable)
      .values({ imageUrl, uploadedBy, source })
      .returning({ id: photosTable.id });
  }

  let shouldSetMain: boolean;
  if (options?.setAsMain === true) {
    shouldSetMain = true;
  } else if (options?.setAsMain === false) {
    shouldSetMain = false;
  } else {
    const [existingMain] = await db
      .select({ id: recipePhotoLinksTable.id })
      .from(recipePhotoLinksTable)
      .where(and(eq(recipePhotoLinksTable.recipeId, recipeId), eq(recipePhotoLinksTable.isMain, true)))
      .limit(1);
    shouldSetMain = !existingMain;
  }

  await db
    .insert(recipePhotoLinksTable)
    .values({ photoId: photo.id, recipeId, sortOrder: shouldSetMain ? -1 : 0, isMain: shouldSetMain })
    .onConflictDoUpdate({
      target: [recipePhotoLinksTable.photoId, recipePhotoLinksTable.recipeId],
      set: {
        isMain: shouldSetMain,
        sortOrder: shouldSetMain ? -1 : sql`${recipePhotoLinksTable.sortOrder}`,
      },
    });

  if (shouldSetMain) {
    await db
      .update(recipePhotoLinksTable)
      .set({ isMain: false })
      .where(
        and(
          eq(recipePhotoLinksTable.recipeId, recipeId),
          eq(recipePhotoLinksTable.isMain, true),
          sql`${recipePhotoLinksTable.photoId} != ${photo.id}`,
        )
      );
  }

  if (syncRecipeImageUrl && shouldSetMain) {
    await db
      .update(recipesTable)
      .set({ imageUrl })
      .where(and(eq(recipesTable.id, recipeId), sql`(image_url IS NULL OR image_url != ${imageUrl})`));
  }
}
