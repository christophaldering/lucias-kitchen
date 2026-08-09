/**
 * Haupt-Assembler für alle recipes-Module.
 *
 * Reihenfolge ist entscheidend: list → admin → photos → detail
 * Damit werden Literal-Pfade (/recipes/stats, /recipes/trash, …)
 * IMMER vor dem Catch-All /:id registriert.
 *
 * warmupRecipeCache wird re-exportiert, weil index.ts in src/index.ts
 * diesen Import erwartet.
 */

import { Router, type IRouter } from "express";
import { invalidateRecipeListCache } from "./shared";
import listRouter from "./list";
import adminRouter from "./admin";
import photosRouter from "./photos";
import detailRouter from "./detail";

export { warmupRecipeCache, invalidateRecipeListCache } from "./shared";

const router: IRouter = Router();

// Cache-Invalidierungs-Middleware: läuft bei jeder nicht-GET-Anfrage auf /recipes*
router.use((req, _res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD" && req.path.startsWith("/recipes")) {
    invalidateRecipeListCache();
  }
  next();
});

// Reihenfolge: fixe Pfade zuerst, /:id-Catch-All zuletzt
router.use(listRouter);   // /recipes, /recipes/count, /recipes/search, /recipes/stats, …
router.use(adminRouter);  // /recipes/trash, /recipes/seed, /admin/…
router.use(photosRouter); // /recipes/:id/photos, /recipes/:id/generate-image, …
router.use(detailRouter); // /recipes/:id (GET/PUT/PATCH/DELETE), Favoriten, …

export default router;
