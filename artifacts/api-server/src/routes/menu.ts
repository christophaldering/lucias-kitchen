import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { menuItemsTable } from "@workspace/db/schema";

const router: IRouter = Router();

router.get("/menu", async (req, res) => {
  try {
    const items = await db.select().from(menuItemsTable);
    res.json(items);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch menu items");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch menu items" });
  }
});

export default router;
