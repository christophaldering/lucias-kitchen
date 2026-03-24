import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db/schema";
import { eq, desc, isNull, and } from "drizzle-orm";
import { authMiddleware } from "./auth";

const router: IRouter = Router();

router.get("/notifications", authMiddleware, async (req, res) => {
  try {
    const userId = req.authUser!.id;

    const notifications = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, userId))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(20);

    res.json(notifications);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch notifications");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch notifications" });
  }
});

router.patch("/notifications/read-all", authMiddleware, async (req, res) => {
  try {
    const userId = req.authUser!.id;

    await db
      .update(notificationsTable)
      .set({ readAt: new Date() })
      .where(and(eq(notificationsTable.userId, userId), isNull(notificationsTable.readAt)));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to mark all notifications as read");
    res.status(500).json({ error: "internal_error", message: "Failed to mark all notifications as read" });
  }
});

router.patch("/notifications/:id/read", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid id" });
      return;
    }

    const userId = req.authUser!.id;

    const [updated] = await db
      .update(notificationsTable)
      .set({ readAt: new Date() })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "not_found", message: "Notification not found" });
      return;
    }

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to mark notification as read");
    res.status(500).json({ error: "internal_error", message: "Failed to mark notification as read" });
  }
});

export default router;
