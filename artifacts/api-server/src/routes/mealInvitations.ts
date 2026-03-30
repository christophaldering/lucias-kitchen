import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  mealInvitationsTable,
  mealInvitationMembersTable,
  mealWishesTable,
  notificationsTable,
  usersTable,
  recipesTable,
} from "@workspace/db/schema";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { authMiddleware } from "./auth";
import { sendEmail, isEmailConfigured } from "../lib/email";
import { mealReminderEmail } from "../lib/emailTemplates";

const router: IRouter = Router();

async function createNotification(
  userId: number,
  type: string,
  message: string,
  relatedId?: number
) {
  await db.insert(notificationsTable).values({
    userId,
    type,
    payload: { message, relatedId: relatedId ?? null },
  });
}

async function getInvitationWithDetails(invitationId: number) {
  const [invitation] = await db
    .select()
    .from(mealInvitationsTable)
    .where(eq(mealInvitationsTable.id, invitationId));
  if (!invitation) return null;

  const members = await db
    .select()
    .from(mealInvitationMembersTable)
    .where(eq(mealInvitationMembersTable.mealInvitationId, invitationId));

  const wishes = await db
    .select()
    .from(mealWishesTable)
    .where(eq(mealWishesTable.mealInvitationId, invitationId));

  const [host] = await db
    .select({ id: usersTable.id, displayName: usersTable.displayName, avatarUrl: usersTable.avatarUrl })
    .from(usersTable)
    .where(eq(usersTable.id, invitation.hostUserId));

  const memberUserIds = members.map((m) => m.userId);
  let memberUsers: { id: number; displayName: string; avatarUrl: string | null }[] = [];
  if (memberUserIds.length > 0) {
    memberUsers = await db
      .select({ id: usersTable.id, displayName: usersTable.displayName, avatarUrl: usersTable.avatarUrl })
      .from(usersTable)
      .where(inArray(usersTable.id, memberUserIds));
  }

  let finalRecipe = null;
  if (invitation.finalRecipeId) {
    const [recipe] = await db
      .select()
      .from(recipesTable)
      .where(eq(recipesTable.id, invitation.finalRecipeId));
    finalRecipe = recipe ?? null;
  }

  const membersWithDetails = members.map((m) => ({
    ...m,
    user: memberUsers.find((u) => u.id === m.userId) ?? null,
    wish: wishes.find((w) => w.userId === m.userId) ?? null,
  }));

  return {
    ...invitation,
    host: host ?? null,
    members: membersWithDetails,
    finalRecipe,
  };
}

router.get("/meal-invitations", authMiddleware, async (req, res) => {
  try {
    const userId = req.authUser!.id;

    const asHostInvitations = await db
      .select()
      .from(mealInvitationsTable)
      .where(eq(mealInvitationsTable.hostUserId, userId));

    const asGuestMemberships = await db
      .select()
      .from(mealInvitationMembersTable)
      .where(eq(mealInvitationMembersTable.userId, userId));

    const guestInvitationIds = asGuestMemberships.map((m) => m.mealInvitationId);
    let asGuestInvitations: (typeof mealInvitationsTable.$inferSelect)[] = [];
    if (guestInvitationIds.length > 0) {
      asGuestInvitations = await db
        .select()
        .from(mealInvitationsTable)
        .where(inArray(mealInvitationsTable.id, guestInvitationIds));
    }

    const allInvitationIds = [
      ...new Set([
        ...asHostInvitations.map((i) => i.id),
        ...asGuestInvitations.map((i) => i.id),
      ]),
    ];

    const details = await Promise.all(
      allInvitationIds.map((id) => getInvitationWithDetails(id))
    );

    const result = details
      .filter(Boolean)
      .map((inv) => ({
        ...inv,
        isHost: inv!.hostUserId === userId,
        myMembership: asGuestMemberships.find((m) => m.mealInvitationId === inv!.id) ?? null,
      }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch meal invitations");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch meal invitations" });
  }
});

router.get("/meal-invitations/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid invitation id" });
      return;
    }

    const userId = req.authUser!.id;
    const invitation = await getInvitationWithDetails(id);

    if (!invitation) {
      res.status(404).json({ error: "not_found", message: "Invitation not found" });
      return;
    }

    const isHost = invitation.hostUserId === userId;
    const isMember = invitation.members.some((m) => m.userId === userId);

    if (!isHost && !isMember) {
      res.status(403).json({ error: "forbidden", message: "Not authorized" });
      return;
    }

    const myMembership = invitation.members.find((m) => m.userId === userId) ?? null;

    res.json({ ...invitation, isHost, myMembership });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch meal invitation");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch meal invitation" });
  }
});

router.post("/meal-invitations", authMiddleware, async (req, res) => {
  try {
    const schema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
      mode: z.enum(["surprise", "wishlist", "vote", "choice"]),
      memberUserIds: z.array(z.number().int().positive()).min(1),
      recipeOptions: z.array(z.number().int().positive()).optional().default([]),
      deadline: z.string().optional().nullable(),
    });

    const data = schema.parse(req.body);
    const hostUserId = req.authUser!.id;

    const [invitation] = await db
      .insert(mealInvitationsTable)
      .values({
        hostUserId,
        date: data.date,
        mode: data.mode,
        status: "open",
        recipeOptions: data.recipeOptions,
        deadline: data.deadline ?? null,
      })
      .returning();

    await db.insert(mealInvitationMembersTable).values(
      data.memberUserIds.map((uid) => ({
        mealInvitationId: invitation.id,
        userId: uid,
        rsvp: "pending" as const,
      }))
    );

    const [host] = await db
      .select({ displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.id, hostUserId));

    const modeLabels: Record<string, string> = {
      surprise: "Überraschung",
      wishlist: "Wunschzettel",
      vote: "Abstimmung",
      choice: "Auswahl",
    };

    for (const uid of data.memberUserIds) {
      await createNotification(
        uid,
        "invitation",
        `${host.displayName} hat dich zu einem Kochabend am ${data.date} eingeladen (Modus: ${modeLabels[data.mode]})`,
        invitation.id
      );
    }

    const result = await getInvitationWithDetails(invitation.id);
    res.status(201).json({ ...result, isHost: true, myMembership: null });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to create meal invitation");
    res.status(500).json({ error: "internal_error", message: "Failed to create meal invitation" });
  }
});

router.patch("/meal-invitations/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid invitation id" });
      return;
    }

    const userId = req.authUser!.id;

    const [existing] = await db
      .select()
      .from(mealInvitationsTable)
      .where(eq(mealInvitationsTable.id, id));

    if (!existing) {
      res.status(404).json({ error: "not_found", message: "Invitation not found" });
      return;
    }

    if (existing.hostUserId !== userId) {
      res.status(403).json({ error: "forbidden", message: "Only the host can update the invitation" });
      return;
    }

    const schema = z.object({
      status: z.enum(["open", "decided", "cancelled"]).optional(),
      finalRecipeId: z.number().int().positive().nullable().optional(),
    });

    const data = schema.parse(req.body);

    const [updated] = await db
      .update(mealInvitationsTable)
      .set(data)
      .where(eq(mealInvitationsTable.id, id))
      .returning();

    if (data.status === "decided" && data.finalRecipeId) {
      const members = await db
        .select()
        .from(mealInvitationMembersTable)
        .where(eq(mealInvitationMembersTable.mealInvitationId, id));

      const [host] = await db
        .select({ displayName: usersTable.displayName })
        .from(usersTable)
        .where(eq(usersTable.id, userId));

      const [recipe] = await db
        .select({ title: recipesTable.title })
        .from(recipesTable)
        .where(eq(recipesTable.id, data.finalRecipeId));

      for (const member of members) {
        await createNotification(
          member.userId,
          "decision",
          `${host.displayName} kocht am ${existing.date}: ${recipe?.title ?? "Überraschung"}`,
          id
        );
      }
    }

    const result = await getInvitationWithDetails(updated.id);
    res.json({ ...result, isHost: true, myMembership: null });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to update meal invitation");
    res.status(500).json({ error: "internal_error", message: "Failed to update meal invitation" });
  }
});

router.delete("/meal-invitations/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid invitation id" });
      return;
    }

    const userId = req.authUser!.id;

    const [existing] = await db
      .select()
      .from(mealInvitationsTable)
      .where(eq(mealInvitationsTable.id, id));

    if (!existing) {
      res.status(404).json({ error: "not_found", message: "Invitation not found" });
      return;
    }

    if (existing.hostUserId !== userId) {
      res.status(403).json({ error: "forbidden", message: "Only the host can cancel the invitation" });
      return;
    }

    await db
      .update(mealInvitationsTable)
      .set({ status: "cancelled" })
      .where(eq(mealInvitationsTable.id, id));

    const members = await db
      .select()
      .from(mealInvitationMembersTable)
      .where(eq(mealInvitationMembersTable.mealInvitationId, id));

    const [host] = await db
      .select({ displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    for (const member of members) {
      await createNotification(
        member.userId,
        "cancellation",
        `${host.displayName} hat die Kocheinladung für den ${existing.date} abgesagt`,
        id
      );
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to cancel meal invitation");
    res.status(500).json({ error: "internal_error", message: "Failed to cancel meal invitation" });
  }
});

router.post("/meal-invitations/:id/wishes", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid invitation id" });
      return;
    }

    const userId = req.authUser!.id;

    const member = await db
      .select()
      .from(mealInvitationMembersTable)
      .where(
        and(
          eq(mealInvitationMembersTable.mealInvitationId, id),
          eq(mealInvitationMembersTable.userId, userId)
        )
      );

    if (member.length === 0) {
      res.status(403).json({ error: "forbidden", message: "You are not a member of this invitation" });
      return;
    }

    const schema = z.object({
      wishText: z.string().optional().nullable(),
      recipeId: z.number().int().positive().optional().nullable(),
      ranking: z.number().int().optional().nullable(),
      constraints: z.string().optional().nullable(),
    });

    const data = schema.parse(req.body);

    const [existing] = await db
      .select()
      .from(mealWishesTable)
      .where(
        and(
          eq(mealWishesTable.mealInvitationId, id),
          eq(mealWishesTable.userId, userId)
        )
      );

    let wish;
    if (existing) {
      const [updated] = await db
        .update(mealWishesTable)
        .set(data)
        .where(eq(mealWishesTable.id, existing.id))
        .returning();
      wish = updated;
    } else {
      const [created] = await db
        .insert(mealWishesTable)
        .values({
          mealInvitationId: id,
          userId,
          ...data,
        })
        .returning();
      wish = created;
    }

    res.status(201).json(wish);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to submit wish");
    res.status(500).json({ error: "internal_error", message: "Failed to submit wish" });
  }
});

router.patch("/meal-invitations/:id/rsvp", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid invitation id" });
      return;
    }

    const userId = req.authUser!.id;

    const schema = z.object({
      rsvp: z.enum(["coming", "not_coming", "pending"]),
    });

    const { rsvp } = schema.parse(req.body);

    const [updated] = await db
      .update(mealInvitationMembersTable)
      .set({ rsvp })
      .where(
        and(
          eq(mealInvitationMembersTable.mealInvitationId, id),
          eq(mealInvitationMembersTable.userId, userId)
        )
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "not_found", message: "Membership not found" });
      return;
    }

    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to update RSVP");
    res.status(500).json({ error: "internal_error", message: "Failed to update RSVP" });
  }
});

router.post("/meal-invitations/:id/remind", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid invitation id" });
      return;
    }

    const userId = req.authUser!.id;

    const [invitation] = await db
      .select()
      .from(mealInvitationsTable)
      .where(eq(mealInvitationsTable.id, id));

    if (!invitation) {
      res.status(404).json({ error: "not_found", message: "Invitation not found" });
      return;
    }

    if (invitation.hostUserId !== userId) {
      res.status(403).json({ error: "forbidden", message: "Only the host can send reminders" });
      return;
    }

    if (invitation.status !== "open") {
      res.status(400).json({ error: "bad_request", message: "Reminders can only be sent for open invitations" });
      return;
    }

    const pendingMembers = await db
      .select()
      .from(mealInvitationMembersTable)
      .where(
        and(
          eq(mealInvitationMembersTable.mealInvitationId, id),
          eq(mealInvitationMembersTable.rsvp, "pending")
        )
      );

    if (pendingMembers.length === 0) {
      res.status(400).json({ error: "bad_request", message: "No pending guests to remind" });
      return;
    }

    const [host] = await db
      .select({ displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    const pendingUserIds = pendingMembers.map((m) => m.userId);
    let pendingUsers: { id: number; email: string | null }[] = [];
    if (pendingUserIds.length > 0) {
      pendingUsers = await db
        .select({ id: usersTable.id, email: usersTable.email })
        .from(usersTable)
        .where(inArray(usersTable.id, pendingUserIds));
    }

    const appLink = `${process.env["APP_BASE_URL"] ?? "https://lucias-kueche.replit.app"}/meal-invitations/${id}`;
    const nowIso = new Date().toISOString();

    for (const member of pendingMembers) {
      await db
        .update(mealInvitationMembersTable)
        .set({
          remindersSentAt: sql`coalesce(${mealInvitationMembersTable.remindersSentAt}, '[]'::jsonb) || ${JSON.stringify([nowIso])}::jsonb`,
        })
        .where(eq(mealInvitationMembersTable.id, member.id));

      await createNotification(
        member.userId,
        "reminder",
        `Du wurdest an die Einladung zum Kochabend am ${invitation.date} erinnert – bitte antworte noch.`,
        id
      );

      if (await isEmailConfigured()) {
        const guestUser = pendingUsers.find((u) => u.id === member.userId);
        if (guestUser?.email) {
          try {
            const html = mealReminderEmail({
              hostName: host?.displayName ?? "Dein Gastgeber",
              date: invitation.date,
              appLink,
              guestEmail: guestUser.email,
            });
            await sendEmail(guestUser.email, `Erinnerung: Kochabend am ${invitation.date}`, html);
          } catch (emailErr) {
            req.log.warn({ err: emailErr, userId: member.userId }, "Failed to send reminder email to guest");
          }
        }
      }
    }

    res.json({ success: true, reminded: pendingMembers.length });
  } catch (err) {
    req.log.error({ err }, "Failed to send reminders");
    res.status(500).json({ error: "internal_error", message: "Failed to send reminders" });
  }
});

router.post("/meal-invitations/:id/guests/:guestId/remind", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const guestId = Number(req.params.guestId);
    if (isNaN(id) || isNaN(guestId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid id" });
      return;
    }

    const userId = req.authUser!.id;

    const [invitation] = await db
      .select()
      .from(mealInvitationsTable)
      .where(eq(mealInvitationsTable.id, id));

    if (!invitation) {
      res.status(404).json({ error: "not_found", message: "Invitation not found" });
      return;
    }

    if (invitation.hostUserId !== userId) {
      res.status(403).json({ error: "forbidden", message: "Only the host can send reminders" });
      return;
    }

    if (invitation.status !== "open") {
      res.status(400).json({ error: "bad_request", message: "Reminders can only be sent for open invitations" });
      return;
    }

    const [member] = await db
      .select()
      .from(mealInvitationMembersTable)
      .where(
        and(
          eq(mealInvitationMembersTable.id, guestId),
          eq(mealInvitationMembersTable.mealInvitationId, id)
        )
      );

    if (!member) {
      res.status(404).json({ error: "not_found", message: "Guest not found" });
      return;
    }

    if (member.rsvp !== "pending") {
      res.status(400).json({ error: "bad_request", message: "Guest has already responded" });
      return;
    }

    const [host] = await db
      .select({ displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    const nowIso = new Date().toISOString();

    await db
      .update(mealInvitationMembersTable)
      .set({
        remindersSentAt: sql`coalesce(${mealInvitationMembersTable.remindersSentAt}, '[]'::jsonb) || ${JSON.stringify([nowIso])}::jsonb`,
      })
      .where(eq(mealInvitationMembersTable.id, member.id));

    await createNotification(
      member.userId,
      "reminder",
      `Du wurdest an die Einladung zum Kochabend am ${invitation.date} erinnert – bitte antworte noch.`,
      id
    );

    if (await isEmailConfigured()) {
      const [guestUser] = await db
        .select({ id: usersTable.id, email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, member.userId));

      if (guestUser?.email) {
        try {
          const appLink = `${process.env["APP_BASE_URL"] ?? "https://lucias-kueche.replit.app"}/meal-invitations/${id}`;
          const html = mealReminderEmail({
            hostName: host?.displayName ?? "Dein Gastgeber",
            date: invitation.date,
            appLink,
            guestEmail: guestUser.email,
          });
          await sendEmail(guestUser.email, `Erinnerung: Kochabend am ${invitation.date}`, html);
        } catch (emailErr) {
          req.log.warn({ err: emailErr, userId: member.userId }, "Failed to send reminder email to guest");
        }
      }
    }

    res.json({ success: true, reminded: 1 });
  } catch (err) {
    req.log.error({ err }, "Failed to send individual reminder");
    res.status(500).json({ error: "internal_error", message: "Failed to send reminder" });
  }
});

router.get("/notifications", authMiddleware, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const notifications = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, userId))
      .orderBy(notificationsTable.createdAt);

    res.json(notifications.reverse());
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
      .where(eq(notificationsTable.userId, userId));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to mark all notifications as read");
    res.status(500).json({ error: "internal_error", message: "Failed to mark all notifications as read" });
  }
});

router.patch("/notifications/:id/read", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = req.authUser!.id;

    await db
      .update(notificationsTable)
      .set({ readAt: new Date() })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to mark notification as read");
    res.status(500).json({ error: "internal_error", message: "Failed to mark notification as read" });
  }
});

router.get("/users", authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.authUser!.id;
    const users = await db
      .select({ id: usersTable.id, displayName: usersTable.displayName, avatarUrl: usersTable.avatarUrl, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, currentUserId));

    const allUsers = await db
      .select({ id: usersTable.id, displayName: usersTable.displayName, avatarUrl: usersTable.avatarUrl })
      .from(usersTable);

    res.json(allUsers);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch users");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch users" });
  }
});

export default router;
