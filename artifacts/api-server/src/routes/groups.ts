import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { groupsTable, groupMembersTable, usersTable, notificationsTable, appSettingsTable } from "@workspace/db/schema";
import { eq, and, or } from "drizzle-orm";
import { z } from "zod/v4";
import { authMiddleware } from "./auth";
import { sendEmail, isEmailConfigured } from "../lib/email";
import { invitationEmail, confirmationEmail, reminderEmail, addedToGroupEmail } from "../lib/emailTemplates";

function generateInviteToken(): string {
  return crypto.randomUUID();
}

function inviteExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d;
}

async function getAppBaseUrl(): Promise<string> {
  try {
    const row = await db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, "app_url"))
      .then((r) => r[0]);
    if (row?.value) return row.value.replace(/\/$/, "");
  } catch {
    // fall through
  }
  const domain = process.env["REPLIT_DOMAINS"]?.split(",")[0] || process.env["REPLIT_DEV_DOMAIN"];
  if (domain) return `https://${domain}`;
  return "http://localhost:5173";
}

const router: IRouter = Router();

const ADMIN_EMAIL = "lucia.aldering@googlemail.com";

function isAdmin(email: string) {
  return email === ADMIN_EMAIL;
}

router.get("/groups", authMiddleware, async (req, res) => {
  try {
    const userId = req.authUser!.id;

    const memberships = await db
      .select({
        groupId: groupMembersTable.groupId,
        role: groupMembersTable.role,
        memberStatus: groupMembersTable.memberStatus,
      })
      .from(groupMembersTable)
      .where(eq(groupMembersTable.userId, userId));

    if (memberships.length === 0) {
      res.json([]);
      return;
    }

    const groupIds = memberships.map((m) => m.groupId);

    const groups = await db
      .select()
      .from(groupsTable)
      .where(
        groupIds.length === 1
          ? eq(groupsTable.id, groupIds[0]!)
          : or(...groupIds.map((id) => eq(groupsTable.id, id)))
      );

    const result = groups.map((g) => {
      const membership = memberships.find((m) => m.groupId === g.id);
      return { ...g, myRole: membership?.role, myMemberStatus: membership?.memberStatus };
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch groups");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/groups/admin", authMiddleware, async (req, res) => {
  try {
    if (!isAdmin(req.authUser!.email)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const groups = await db
      .select({
        id: groupsTable.id,
        name: groupsTable.name,
        imageUrl: groupsTable.imageUrl,
        status: groupsTable.status,
        rejectionReason: groupsTable.rejectionReason,
        creatorId: groupsTable.creatorId,
        createdAt: groupsTable.createdAt,
        updatedAt: groupsTable.updatedAt,
        creatorName: usersTable.displayName,
        creatorEmail: usersTable.email,
      })
      .from(groupsTable)
      .leftJoin(usersTable, eq(groupsTable.creatorId, usersTable.id))
      .orderBy(groupsTable.createdAt);

    res.json(groups);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch groups (admin)");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/groups", authMiddleware, async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100),
      imageUrl: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const userId = req.authUser!.id;

    const [group] = await db
      .insert(groupsTable)
      .values({ name: data.name, imageUrl: data.imageUrl ?? null, creatorId: userId })
      .returning();

    await db.insert(groupMembersTable).values({
      groupId: group!.id,
      userId,
      role: "owner",
      memberStatus: "joined",
      invitedByUserId: userId,
    });

    res.status(201).json(group);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to create group");
    res.status(500).json({ error: "internal_error" });
  }
});

router.put("/groups/:id", authMiddleware, async (req, res) => {
  try {
    const groupId = Number(req.params["id"]);
    if (isNaN(groupId)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    const schema = z.object({
      name: z.string().min(1).max(100),
    });

    const { name } = schema.parse(req.body);
    const userId = req.authUser!.id;

    const myMembership = await db
      .select()
      .from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId)))
      .then((r) => r[0]);

    if (!myMembership || myMembership.role !== "owner") {
      res.status(403).json({ error: "not_owner", message: "Nur der Gruppeninhaber kann den Namen ändern" });
      return;
    }

    const [updated] = await db
      .update(groupsTable)
      .set({ name, updatedAt: new Date() })
      .where(eq(groupsTable.id, groupId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to rename group");
    res.status(500).json({ error: "internal_error" });
  }
});

router.put("/groups/:id/approve", authMiddleware, async (req, res) => {
  try {
    if (!isAdmin(req.authUser!.email)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const groupId = Number(req.params["id"]);
    if (isNaN(groupId)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    const [updated] = await db
      .update(groupsTable)
      .set({ status: "approved", rejectionReason: null, updatedAt: new Date() })
      .where(eq(groupsTable.id, groupId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to approve group");
    res.status(500).json({ error: "internal_error" });
  }
});

router.put("/groups/:id/reject", authMiddleware, async (req, res) => {
  try {
    if (!isAdmin(req.authUser!.email)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const groupId = Number(req.params["id"]);
    if (isNaN(groupId)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    const schema = z.object({
      reason: z.string().optional(),
    });

    const { reason } = schema.parse(req.body);

    const [updated] = await db
      .update(groupsTable)
      .set({ status: "rejected", rejectionReason: reason ?? null, updatedAt: new Date() })
      .where(eq(groupsTable.id, groupId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to reject group");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/groups/:id/members", authMiddleware, async (req, res) => {
  try {
    const groupId = Number(req.params["id"]);
    const userId = req.authUser!.id;

    const group = await db
      .select()
      .from(groupsTable)
      .where(eq(groupsTable.id, groupId))
      .then((r) => r[0]);

    if (!group) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    if (group.status !== "approved" && !isAdmin(req.authUser!.email)) {
      res.status(403).json({ error: "group_not_approved" });
      return;
    }

    const myMembership = await db
      .select()
      .from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId)))
      .then((r) => r[0]);

    if (!myMembership && !isAdmin(req.authUser!.email)) {
      res.status(403).json({ error: "not_a_member" });
      return;
    }

    const members = await db
      .select({
        id: groupMembersTable.id,
        groupId: groupMembersTable.groupId,
        userId: groupMembersTable.userId,
        invitedEmail: groupMembersTable.invitedEmail,
        role: groupMembersTable.role,
        memberStatus: groupMembersTable.memberStatus,
        createdAt: groupMembersTable.createdAt,
        remindersSentAt: groupMembersTable.remindersSentAt,
        displayName: usersTable.displayName,
        email: usersTable.email,
        avatarUrl: usersTable.avatarUrl,
      })
      .from(groupMembersTable)
      .leftJoin(usersTable, eq(groupMembersTable.userId, usersTable.id))
      .where(eq(groupMembersTable.groupId, groupId));

    res.json(members);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch group members");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/groups/:id/invite", authMiddleware, async (req, res) => {
  try {
    const groupId = Number(req.params["id"]);
    const userId = req.authUser!.id;

    const schema = z.object({
      emailOrUsername: z.string().min(1),
    });

    const { emailOrUsername } = schema.parse(req.body);

    const group = await db
      .select()
      .from(groupsTable)
      .where(eq(groupsTable.id, groupId))
      .then((r) => r[0]);

    if (!group) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const myMembership = await db
      .select()
      .from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId)))
      .then((r) => r[0]);

    if (!myMembership || myMembership.role !== "owner") {
      res.status(403).json({ error: "not_owner", message: "Nur der Gruppenersteller kann Mitglieder einladen" });
      return;
    }

    const invitedUser = await db
      .select()
      .from(usersTable)
      .where(
        or(
          eq(usersTable.email, emailOrUsername.toLowerCase()),
          eq(usersTable.displayName, emailOrUsername)
        )
      )
      .then((r) => r[0]);

    if (!invitedUser) {
      const normalizedEmail = emailOrUsername.toLowerCase();

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        res.status(404).json({ error: "user_not_found", message: "Nutzer nicht gefunden" });
        return;
      }

      if (!await isEmailConfigured()) {
        res.status(503).json({ error: "email_not_configured", message: "E-Mail-Versand ist nicht konfiguriert. Einladungen können derzeit nicht versendet werden." });
        return;
      }

      const existingEmailInvite = await db
        .select()
        .from(groupMembersTable)
        .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.invitedEmail, normalizedEmail)))
        .then((r) => r[0]);

      if (existingEmailInvite) {
        res.status(409).json({ error: "already_member", message: "Diese E-Mail ist bereits eingeladen" });
        return;
      }

      const token = generateInviteToken();
      const [member] = await db
        .insert(groupMembersTable)
        .values({
          groupId,
          userId: null,
          invitedEmail: normalizedEmail,
          invitedByUserId: userId,
          role: "member",
          memberStatus: "invited",
          inviteToken: token,
          inviteTokenExpiresAt: inviteExpiresAt(),
        })
        .returning();

      const inviter = await db.select({ displayName: usersTable.displayName, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId)).then((r) => r[0]);
      if (inviter) {
        const inviteLink = `${await getAppBaseUrl()}/invite/${token}`;
        try {
          await sendEmail(normalizedEmail, `${inviter.displayName} lädt dich zu Lucia's Küche ein!`, invitationEmail({ inviterName: inviter.displayName, groupName: group!.name, inviteLink, invitedEmail: normalizedEmail }));
          await sendEmail(inviter.email, `Einladung an ${normalizedEmail} versandt`, confirmationEmail({ inviterName: inviter.displayName, invitedEmail: normalizedEmail, groupName: group!.name }));
        } catch (emailErr) {
          req.log.error({ err: emailErr }, "Failed to send invite emails");
          res.status(500).json({ error: "email_send_failed", message: "Die Einladung wurde erstellt, aber die E-Mail konnte nicht versendet werden." });
          return;
        }
      }

      res.status(201).json({ ...member, displayName: null, email: normalizedEmail, inviteType: "email_only" });
      return;
    }

    if (invitedUser.id === userId) {
      res.status(400).json({ error: "cannot_invite_self", message: "Du kannst dich nicht selbst einladen" });
      return;
    }

    const existingMembership = await db
      .select()
      .from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, invitedUser.id)))
      .then((r) => r[0]);

    if (existingMembership) {
      res.status(409).json({ error: "already_member", message: "Nutzer ist bereits Mitglied oder eingeladen" });
      return;
    }

    if (!await isEmailConfigured()) {
      res.status(503).json({ error: "email_not_configured", message: "E-Mail-Versand ist nicht konfiguriert. Einladungen können derzeit nicht versendet werden." });
      return;
    }

    const token = generateInviteToken();
    const [member] = await db
      .insert(groupMembersTable)
      .values({
        groupId,
        userId: invitedUser.id,
        invitedEmail: invitedUser.email,
        invitedByUserId: userId,
        role: "member",
        memberStatus: "invited",
        inviteToken: token,
        inviteTokenExpiresAt: inviteExpiresAt(),
      })
      .returning();

    const inviter = await db.select({ displayName: usersTable.displayName, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId)).then((r) => r[0]);
    if (inviter) {
      const inviteLink = `${await getAppBaseUrl()}/invite/${token}`;
      try {
        await sendEmail(invitedUser.email, `${inviter.displayName} lädt dich zu Lucia's Küche ein!`, invitationEmail({ inviterName: inviter.displayName, groupName: group!.name, inviteLink, invitedEmail: invitedUser.email }));
        await sendEmail(inviter.email, `Einladung an ${invitedUser.email} versandt`, confirmationEmail({ inviterName: inviter.displayName, invitedEmail: invitedUser.email, groupName: group!.name }));
      } catch (emailErr) {
        req.log.error({ err: emailErr }, "Failed to send invite emails for existing user");
        res.status(500).json({ error: "email_send_failed", message: "Die Einladung wurde erstellt, aber die E-Mail konnte nicht versendet werden." });
        return;
      }
    }

    await db.insert(notificationsTable).values({
      userId: invitedUser.id,
      type: "group_invite",
      payload: { message: `${inviter?.displayName ?? "Jemand"} hat dich in die Gruppe „${group!.name}" eingeladen`, groupId, inviterId: userId },
    });

    res.status(201).json({ ...member, displayName: invitedUser.displayName, email: invitedUser.email, inviteType: "user" });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to invite member");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/groups/family-invite", authMiddleware, async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email(),
    });

    const { email } = schema.parse(req.body);
    const userId = req.authUser!.id;

    const ownedMemberships = await db
      .select({ groupId: groupMembersTable.groupId })
      .from(groupMembersTable)
      .where(
        and(
          eq(groupMembersTable.userId, userId),
          eq(groupMembersTable.role, "owner"),
          eq(groupMembersTable.memberStatus, "joined")
        )
      );

    let groupId: number;

    if (ownedMemberships.length > 0) {
      const ownedGroupIds = ownedMemberships.map((m) => m.groupId);
      const ownedGroups = await db
        .select()
        .from(groupsTable)
        .where(
          ownedGroupIds.length === 1
            ? eq(groupsTable.id, ownedGroupIds[0]!)
            : or(...ownedGroupIds.map((id) => eq(groupsTable.id, id)))
        );

      const approvedOwned = ownedGroups.find((g) => g.status === "approved");

      if (approvedOwned) {
        groupId = approvedOwned.id;
      } else {
        const [newGroup] = await db
          .insert(groupsTable)
          .values({ name: "Meine Familie", creatorId: userId, status: "approved" })
          .returning();
        await db.insert(groupMembersTable).values({
          groupId: newGroup!.id,
          userId,
          role: "owner",
          memberStatus: "joined",
          invitedByUserId: userId,
        });
        groupId = newGroup!.id;
      }
    } else {
      const [newGroup] = await db
        .insert(groupsTable)
        .values({ name: "Meine Familie", creatorId: userId, status: "approved" })
        .returning();
      await db.insert(groupMembersTable).values({
        groupId: newGroup!.id,
        userId,
        role: "owner",
        memberStatus: "joined",
        invitedByUserId: userId,
      });
      groupId = newGroup!.id;
    }

    const normalizedEmail = email.toLowerCase();

    const invitedUser = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .then((r) => r[0]);

    if (invitedUser && invitedUser.id === userId) {
      res.status(400).json({ error: "cannot_invite_self", message: "Du kannst dich nicht selbst einladen" });
      return;
    }

    const existingMembership = await db
      .select()
      .from(groupMembersTable)
      .where(
        and(
          eq(groupMembersTable.groupId, groupId),
          invitedUser
            ? eq(groupMembersTable.userId, invitedUser.id)
            : eq(groupMembersTable.invitedEmail, normalizedEmail)
        )
      )
      .then((r) => r[0]);

    if (existingMembership) {
      res.status(409).json({ error: "already_member", message: "Diese Person ist bereits eingeladen oder Mitglied" });
      return;
    }

    const inviter = await db.select({ displayName: usersTable.displayName, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId)).then((r) => r[0]);
    const group = await db.select({ name: groupsTable.name }).from(groupsTable).where(eq(groupsTable.id, groupId)).then((r) => r[0]);

    if (invitedUser) {
      const [member] = await db
        .insert(groupMembersTable)
        .values({
          groupId,
          userId: invitedUser.id,
          invitedEmail: invitedUser.email,
          invitedByUserId: userId,
          role: "member",
          memberStatus: "joined",
        })
        .returning();

      if (isEmailConfigured() && inviter) {
        const groupName = group?.name ?? "Meine Familie";
        try {
          await sendEmail(invitedUser.email, `Du wurdest zur Gruppe „${groupName}" hinzugefügt`, addedToGroupEmail({ inviterName: inviter.displayName, invitedName: invitedUser.displayName, groupName }));
          await sendEmail(inviter.email, `${invitedUser.displayName} wurde hinzugefügt`, confirmationEmail({ inviterName: inviter.displayName, invitedEmail: invitedUser.email, groupName }));
        } catch (emailErr) {
          req.log.error({ err: emailErr }, "Failed to send family invite emails");
        }
      }

      await db.insert(notificationsTable).values({
        userId: invitedUser.id,
        type: "group_joined",
        payload: { message: `${inviter?.displayName ?? "Jemand"} hat dich zur Gruppe „${group?.name ?? "Meine Familie"}" hinzugefügt`, groupId },
      });

      res.status(201).json({ ...member, displayName: invitedUser.displayName, email: invitedUser.email, inviteType: "user", groupId });
    } else {
      if (!await isEmailConfigured()) {
        res.status(503).json({ error: "email_not_configured", message: "E-Mail-Versand ist nicht konfiguriert. Einladungen können derzeit nicht versendet werden." });
        return;
      }

      const token = generateInviteToken();
      const [member] = await db
        .insert(groupMembersTable)
        .values({
          groupId,
          userId: null,
          invitedEmail: normalizedEmail,
          invitedByUserId: userId,
          role: "member",
          memberStatus: "invited",
          inviteToken: token,
          inviteTokenExpiresAt: inviteExpiresAt(),
        })
        .returning();

      if (inviter) {
        const inviteLink = `${await getAppBaseUrl()}/invite/${token}`;
        try {
          await sendEmail(normalizedEmail, `${inviter.displayName} lädt dich zu Lucia's Küche ein!`, invitationEmail({ inviterName: inviter.displayName, groupName: group?.name ?? "Meine Familie", inviteLink, invitedEmail: normalizedEmail }));
          await sendEmail(inviter.email, `Einladung an ${normalizedEmail} versandt`, confirmationEmail({ inviterName: inviter.displayName, invitedEmail: normalizedEmail, groupName: group?.name ?? "Meine Familie" }));
        } catch (emailErr) {
          req.log.error({ err: emailErr }, "Failed to send family invite emails");
          res.status(500).json({ error: "email_send_failed", message: "Die Einladung wurde erstellt, aber die E-Mail konnte nicht versendet werden." });
          return;
        }
      }

      res.status(201).json({ ...member, displayName: null, email: normalizedEmail, inviteType: "email_only", groupId });
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to family-invite member");
    res.status(500).json({ error: "internal_error" });
  }
});

router.put("/groups/:id/join", authMiddleware, async (req, res) => {
  try {
    const groupId = Number(req.params["id"]);
    const userId = req.authUser!.id;

    const group = await db
      .select()
      .from(groupsTable)
      .where(eq(groupsTable.id, groupId))
      .then((r) => r[0]);

    if (!group) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    if (group.status !== "approved") {
      res.status(403).json({ error: "group_not_approved", message: "Gruppe ist noch nicht freigegeben" });
      return;
    }

    const membership = await db
      .select()
      .from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId)))
      .then((r) => r[0]);

    if (!membership) {
      res.status(403).json({ error: "not_invited" });
      return;
    }

    const [updated] = await db
      .update(groupMembersTable)
      .set({ memberStatus: "joined" })
      .where(eq(groupMembersTable.id, membership.id))
      .returning();

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to join group");
    res.status(500).json({ error: "internal_error" });
  }
});

async function handleInviteRemindOrResend(req: any, res: any) {
  try {
    const groupId = Number(req.params["id"]);
    const memberId = Number(req.params["memberId"]);
    const userId = req.authUser!.id;

    if (isNaN(groupId) || isNaN(memberId)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    const myMembership = await db
      .select()
      .from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId)))
      .then((r) => r[0]);

    if (!myMembership || myMembership.role !== "owner") {
      res.status(403).json({ error: "not_owner" });
      return;
    }

    const targetMember = await db
      .select()
      .from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.id, memberId)))
      .then((r) => r[0]);

    if (!targetMember) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    if (targetMember.memberStatus !== "invited") {
      res.status(400).json({ error: "not_invited", message: "Mitglied hat die Einladung bereits angenommen" });
      return;
    }

    const newToken = generateInviteToken();
    const existingReminders: string[] = Array.isArray(targetMember.remindersSentAt) ? targetMember.remindersSentAt as string[] : [];
    await db
      .update(groupMembersTable)
      .set({
        inviteToken: newToken,
        inviteTokenExpiresAt: inviteExpiresAt(),
        remindersSentAt: [...existingReminders, new Date().toISOString()],
      })
      .where(eq(groupMembersTable.id, targetMember.id));

    const group = await db
      .select()
      .from(groupsTable)
      .where(eq(groupsTable.id, groupId))
      .then((r) => r[0]);

    const sender = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .then((r) => r[0]);

    const inviteLink = `${await getAppBaseUrl()}/invite/${newToken}`;
    let emailSent = false;
    if (sender && targetMember.invitedEmail) {
      if (!await isEmailConfigured()) {
        if (!targetMember.userId) {
          res.json({ notified: false, reason: "email_not_configured", inviteLink });
          return;
        }
      } else {
        try {
          await sendEmail(
            targetMember.invitedEmail,
            `Erinnerung: ${sender.displayName} wartet auf dich in Lucia's Küche`,
            reminderEmail({ inviterName: sender.displayName, groupName: group?.name ?? "", inviteLink, invitedEmail: targetMember.invitedEmail })
          );
          emailSent = true;
        } catch (emailErr) {
          req.log.error({ err: emailErr }, "Failed to send reminder email");
          if (!targetMember.userId) {
            res.status(500).json({ error: "email_send_failed", message: "Die Erinnerungs-E-Mail konnte nicht versendet werden." });
            return;
          }
        }
      }
    }

    if (targetMember.userId) {
      await db.insert(notificationsTable).values({
        userId: targetMember.userId,
        type: "group_invite_reminder",
        payload: {
          groupId,
          groupName: group?.name ?? "",
          inviterName: sender?.displayName ?? sender?.email ?? "",
          inviterId: userId,
        },
      });
    }

    res.json({ notified: true, emailSent });
  } catch (err) {
    req.log.error({ err }, "Failed to send invite reminder");
    res.status(500).json({ error: "internal_error" });
  }
}

router.post("/groups/:id/members/:memberId/remind", authMiddleware, handleInviteRemindOrResend);
router.post("/groups/:id/invite/:memberId/resend", authMiddleware, handleInviteRemindOrResend);

router.delete("/groups/:id/members/:memberId", authMiddleware, async (req, res) => {
  try {
    const groupId = Number(req.params["id"]);
    const memberId = Number(req.params["memberId"]);
    const userId = req.authUser!.id;

    const myMembership = await db
      .select()
      .from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId)))
      .then((r) => r[0]);

    if (!myMembership || myMembership.role !== "owner") {
      res.status(403).json({ error: "not_owner" });
      return;
    }

    await db
      .delete(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.id, memberId)));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to remove member");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
