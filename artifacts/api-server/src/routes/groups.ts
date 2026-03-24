import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { groupsTable, groupMembersTable, usersTable } from "@workspace/db/schema";
import { eq, and, or } from "drizzle-orm";
import { z } from "zod/v4";
import { authMiddleware } from "./auth";

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

      const existingEmailInvite = await db
        .select()
        .from(groupMembersTable)
        .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.invitedEmail, normalizedEmail)))
        .then((r) => r[0]);

      if (existingEmailInvite) {
        res.status(409).json({ error: "already_member", message: "Diese E-Mail ist bereits eingeladen" });
        return;
      }

      const [member] = await db
        .insert(groupMembersTable)
        .values({
          groupId,
          userId: null,
          invitedEmail: normalizedEmail,
          invitedByUserId: userId,
          role: "member",
          memberStatus: "invited",
        })
        .returning();

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

    const [member] = await db
      .insert(groupMembersTable)
      .values({
        groupId,
        userId: invitedUser.id,
        invitedEmail: invitedUser.email,
        invitedByUserId: userId,
        role: "member",
        memberStatus: "invited",
      })
      .returning();

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
      res.status(201).json({ ...member, displayName: invitedUser.displayName, email: invitedUser.email, inviteType: "user", groupId });
    } else {
      const [member] = await db
        .insert(groupMembersTable)
        .values({
          groupId,
          userId: null,
          invitedEmail: normalizedEmail,
          invitedByUserId: userId,
          role: "member",
          memberStatus: "invited",
        })
        .returning();
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
