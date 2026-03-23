import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { reservationsTable } from "@workspace/db/schema";
import { z } from "zod/v4";

const router: IRouter = Router();

const createReservationSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  date: z.string().min(1),
  time: z.string().min(1),
  guests: z.number().int().min(1).max(20),
  notes: z.string().nullable().optional(),
});

router.post("/reservations", async (req, res) => {
  const parsed = createReservationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.message });
    return;
  }

  try {
    const [reservation] = await db
      .insert(reservationsTable)
      .values({
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        date: parsed.data.date,
        time: parsed.data.time,
        guests: parsed.data.guests,
        notes: parsed.data.notes ?? null,
        status: "pending",
      })
      .returning();

    res.status(201).json(reservation);
  } catch (err) {
    req.log.error({ err }, "Failed to create reservation");
    res.status(500).json({ error: "internal_error", message: "Failed to create reservation" });
  }
});

export default router;
