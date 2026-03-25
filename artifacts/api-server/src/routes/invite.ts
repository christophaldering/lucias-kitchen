import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { groupMembersTable, groupsTable, usersTable, notificationsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendEmail, isEmailConfigured } from "../lib/email";
import { joinedNotificationEmail } from "../lib/emailTemplates";

const router: IRouter = Router();
const JWT_SECRET = process.env["JWT_SECRET"] ?? "lucias-kueche-secret-key-2026";

router.get("/invite/:token", async (req, res) => {
  try {
    const token = req.params["token"];
    if (!token) {
      res.status(400).json({ error: "missing_token" });
      return;
    }

    const member = await db
      .select({
        id: groupMembersTable.id,
        groupId: groupMembersTable.groupId,
        invitedEmail: groupMembersTable.invitedEmail,
        memberStatus: groupMembersTable.memberStatus,
        inviteToken: groupMembersTable.inviteToken,
        inviteTokenExpiresAt: groupMembersTable.inviteTokenExpiresAt,
        invitedByUserId: groupMembersTable.invitedByUserId,
      })
      .from(groupMembersTable)
      .where(eq(groupMembersTable.inviteToken, token))
      .then((r) => r[0]);

    if (!member) {
      res.status(404).json({ error: "invalid_token", message: "Dieser Einladungslink ist ungültig." });
      return;
    }

    if (member.memberStatus === "joined") {
      res.status(410).json({ error: "already_used", message: "Diese Einladung wurde bereits angenommen." });
      return;
    }

    if (member.inviteTokenExpiresAt && new Date() > member.inviteTokenExpiresAt) {
      res.status(410).json({
        error: "expired",
        message: "Dieser Einladungslink ist leider abgelaufen. Bitte wende dich an die Person, die dich eingeladen hat, um einen neuen Link zu erhalten.",
      });
      return;
    }

    const group = await db
      .select({ id: groupsTable.id, name: groupsTable.name, imageUrl: groupsTable.imageUrl })
      .from(groupsTable)
      .where(eq(groupsTable.id, member.groupId))
      .then((r) => r[0]);

    let inviterName = "Jemand";
    if (member.invitedByUserId) {
      const inviter = await db
        .select({ displayName: usersTable.displayName })
        .from(usersTable)
        .where(eq(usersTable.id, member.invitedByUserId))
        .then((r) => r[0]);
      if (inviter) inviterName = inviter.displayName;
    }

    res.json({
      groupName: group?.name ?? "Unbekannte Gruppe",
      groupImageUrl: group?.imageUrl ?? null,
      inviterName,
      invitedEmail: member.invitedEmail,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to validate invite token");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/invite/:token/accept", async (req, res) => {
  try {
    const token = req.params["token"];
    if (!token) {
      res.status(400).json({ error: "missing_token" });
      return;
    }

    const schema = z.object({
      displayName: z.string().min(1),
      password: z.string().min(6),
    });
    const { displayName, password } = schema.parse(req.body);

    const member = await db
      .select()
      .from(groupMembersTable)
      .where(eq(groupMembersTable.inviteToken, token))
      .then((r) => r[0]);

    if (!member) {
      res.status(404).json({ error: "invalid_token", message: "Dieser Einladungslink ist ungültig." });
      return;
    }

    if (member.memberStatus === "joined") {
      res.status(410).json({ error: "already_used", message: "Diese Einladung wurde bereits angenommen." });
      return;
    }

    if (member.inviteTokenExpiresAt && new Date() > member.inviteTokenExpiresAt) {
      res.status(410).json({ error: "expired", message: "Dieser Einladungslink ist abgelaufen." });
      return;
    }

    const invitedEmail = member.invitedEmail;
    if (!invitedEmail) {
      res.status(400).json({ error: "no_email", message: "Keine E-Mail für diese Einladung hinterlegt." });
      return;
    }

    const existingUser = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, invitedEmail.toLowerCase()))
      .then((r) => r[0]);

    let user;
    if (existingUser) {
      const valid = await bcrypt.compare(password, existingUser.passwordHash);
      if (!valid) {
        res.status(401).json({ error: "invalid_password", message: "Du hast bereits ein Konto. Bitte gib dein bestehendes Passwort ein, um beizutreten." });
        return;
      }
      user = existingUser;
    } else {
      const passwordHash = await bcrypt.hash(password, 12);
      const [newUser] = await db
        .insert(usersTable)
        .values({
          email: invitedEmail.toLowerCase(),
          passwordHash,
          displayName,
        })
        .returning();
      user = newUser!;
    }

    await db
      .update(groupMembersTable)
      .set({
        userId: user.id,
        memberStatus: "joined",
        inviteToken: null,
        inviteTokenExpiresAt: null,
      })
      .where(eq(groupMembersTable.id, member.id));

    const group = await db
      .select({ name: groupsTable.name })
      .from(groupsTable)
      .where(eq(groupsTable.id, member.groupId))
      .then((r) => r[0]);

    if (member.invitedByUserId) {
      await db.insert(notificationsTable).values({
        userId: member.invitedByUserId,
        type: "invite_accepted",
        payload: {
          message: `${user.displayName} hat deine Einladung angenommen und ist der Gruppe „${group?.name ?? ""}" beigetreten! 🎉`,
          groupId: member.groupId,
          joinedUserId: user.id,
          joinedUserName: user.displayName,
        },
      });

      if (isEmailConfigured()) {
        try {
          const inviter = await db
            .select({ displayName: usersTable.displayName, email: usersTable.email })
            .from(usersTable)
            .where(eq(usersTable.id, member.invitedByUserId))
            .then((r) => r[0]);

          if (inviter) {
            await sendEmail(
              inviter.email,
              `${user.displayName} ist Lucia's Küche beigetreten!`,
              joinedNotificationEmail({
                inviterName: inviter.displayName,
                joinedUserName: user.displayName,
                groupName: group?.name ?? "Unbekannte Gruppe",
              })
            );
          }
        } catch (emailErr) {
          req.log.error({ err: emailErr }, "Failed to send join notification email to inviter");
        }
      }
    }

    const jwtToken = jwt.sign(
      { id: user.id, email: user.email, displayName: user.displayName },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    const { passwordHash: _, ...safeUser } = user;
    res.json({ token: jwtToken, user: safeUser });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to accept invite");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
