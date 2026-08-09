import { Router, type IRouter, type Request, type Response } from "express";
import { authMiddleware } from "./auth";
import { buildRecipeExport } from "../lib/recipeExport";

const router: IRouter = Router();

const ADMIN_EMAIL = "lucia.aldering@googlemail.com";
function isAdmin(email: string) {
  return email === ADMIN_EMAIL;
}

router.get("/admin/export", authMiddleware, async (req: Request, res: Response) => {
  if (!req.authUser || !isAdmin(req.authUser.email)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    const data = await buildRecipeExport();
    const json = JSON.stringify(data, null, 2);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="lucias-kueche-export-${date}.json"`,
    );
    res.send(json);
  } catch (err) {
    res.status(500).json({ error: "export_failed", message: String(err) });
  }
});

export default router;
