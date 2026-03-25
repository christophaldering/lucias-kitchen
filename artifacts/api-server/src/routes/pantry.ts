import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { userPantryTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import { authMiddleware } from "./auth";

const router: IRouter = Router();

router.get("/pantry", authMiddleware, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const items = await db
      .select()
      .from(userPantryTable)
      .where(eq(userPantryTable.userId, userId));
    res.json({ items });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch pantry");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/pantry", authMiddleware, async (req, res) => {
  try {
    const schema = z.object({
      ingredientName: z.string().min(1),
      expiryPriority: z.enum(["today", "week", "good"]).default("good"),
      isDefault: z.number().int().min(0).max(1).default(0),
      storageLocation: z.enum(["fridge", "freezer", "pantry"]).default("fridge"),
      expiryDate: z.string().nullable().optional(),
    });
    const data = schema.parse(req.body);
    const userId = req.authUser!.id;

    const existing = await db
      .select()
      .from(userPantryTable)
      .where(
        and(
          eq(userPantryTable.userId, userId),
          eq(userPantryTable.ingredientName, data.ingredientName),
          eq(userPantryTable.storageLocation, data.storageLocation)
        )
      );

    if (existing.length > 0) {
      const [updated] = await db
        .update(userPantryTable)
        .set({
          expiryPriority: data.expiryPriority,
          isDefault: data.isDefault,
          expiryDate: data.expiryDate ?? null,
          updatedAt: new Date(),
        })
        .where(eq(userPantryTable.id, existing[0].id))
        .returning();
      res.json({ item: updated });
    } else {
      const [item] = await db
        .insert(userPantryTable)
        .values({ userId, ...data, expiryDate: data.expiryDate ?? null })
        .returning();
      res.json({ item });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to upsert pantry item");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/pantry/batch", authMiddleware, async (req, res) => {
  try {
    const schema = z.object({
      items: z.array(z.object({
        ingredientName: z.string().min(1),
        expiryPriority: z.enum(["today", "week", "good"]).default("good"),
        isDefault: z.number().int().min(0).max(1).default(0),
        storageLocation: z.enum(["fridge", "freezer", "pantry"]).default("fridge"),
        expiryDate: z.string().nullable().optional(),
      })),
      location: z.enum(["fridge", "freezer", "pantry"]),
    });
    const { items, location } = schema.parse(req.body);
    const userId = req.authUser!.id;

    await db.delete(userPantryTable).where(
      and(
        eq(userPantryTable.userId, userId),
        eq(userPantryTable.storageLocation, location)
      )
    );

    if (items.length > 0) {
      await db.insert(userPantryTable).values(
        items.map((item) => ({ userId, ...item, expiryDate: item.expiryDate ?? null }))
      );
    }

    const saved = await db.select().from(userPantryTable).where(eq(userPantryTable.userId, userId));
    res.json({ items: saved });
  } catch (err) {
    req.log.error({ err }, "Failed to batch save pantry");
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/pantry/by-id/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid id" });
      return;
    }
    await db
      .delete(userPantryTable)
      .where(
        and(
          eq(userPantryTable.userId, userId),
          eq(userPantryTable.id, id)
        )
      );
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete pantry item by id");
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/pantry/:name", authMiddleware, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const name = decodeURIComponent(req.params.name);
    await db
      .delete(userPantryTable)
      .where(
        and(
          eq(userPantryTable.userId, userId),
          eq(userPantryTable.ingredientName, name)
        )
      );
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete pantry item");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
