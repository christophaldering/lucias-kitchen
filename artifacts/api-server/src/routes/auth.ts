import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable, groupMembersTable, groupsTable, notificationsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod/v4";
import { sendEmail, isEmailConfigured } from "../lib/email";
import { joinedNotificationEmail } from "../lib/emailTemplates";
import { authLimiter } from "../lib/rateLimits";

const router: IRouter = Router();

const JWT_SECRET_RAW = process.env["JWT_SECRET"];
if (!JWT_SECRET_RAW) {
  throw new Error("JWT_SECRET ist nicht gesetzt — Server startet nicht ohne Secret.");
}
const JWT_SECRET: string = JWT_SECRET_RAW;

export interface AuthUser {
  id: number;
  email: string;
  displayName: string;
  tokenVersion: number;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthorized", message: "No token provided" });
    return;
  }

  const token = authHeader.slice(7);
  let decoded: AuthUser;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (typeof payload !== "object" || payload === null) {
      res.status(401).json({ error: "unauthorized", message: "Invalid token payload" });
      return;
    }
    const p = payload as Record<string, unknown>;
    if (typeof p["id"] !== "number" || typeof p["email"] !== "string" || typeof p["displayName"] !== "string" || typeof p["tokenVersion"] !== "number") {
      res.status(401).json({ error: "unauthorized", message: "Invalid token claims" });
      return;
    }
    decoded = { id: p["id"] as number, email: p["email"] as string, displayName: p["displayName"] as string, tokenVersion: p["tokenVersion"] as number };
  } catch {
    res.status(401).json({ error: "unauthorized", message: "Invalid or expired token" });
    return;
  }

  // Verify tokenVersion against the DB to support password-change revocation.
  // Tokens issued before a password change carry an older tokenVersion and are rejected.
  try {
    const [user] = await db
      .select({ tokenVersion: usersTable.tokenVersion })
      .from(usersTable)
      .where(eq(usersTable.id, decoded.id));

    if (!user || user.tokenVersion !== decoded.tokenVersion) {
      res.status(401).json({ error: "unauthorized", message: "Session invalidated — please log in again" });
      return;
    }
  } catch {
    res.status(500).json({ error: "internal_error", message: "Session check failed" });
    return;
  }

  req.authUser = decoded;
  next();
}

function sanitizeUser(user: typeof usersTable.$inferSelect) {
  const { passwordHash: _, tokenVersion: __, ...safe } = user;
  return safe;
}

router.post("/auth/register", authLimiter, async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(6),
      displayName: z.string().min(1),
    });
    const { email, password, displayName } = schema.parse(req.body);
    const normalizedEmail = email.toLowerCase();

    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
    if (existing) {
      res.status(409).json({ error: "email_taken", message: "Diese E-Mail-Adresse ist bereits registriert" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db
      .insert(usersTable)
      .values({ email: normalizedEmail, passwordHash, displayName })
      .returning();

    const pendingInvites = await db
      .select({
        id: groupMembersTable.id,
        groupId: groupMembersTable.groupId,
        invitedByUserId: groupMembersTable.invitedByUserId,
      })
      .from(groupMembersTable)
      .where(eq(groupMembersTable.invitedEmail, normalizedEmail));

    await db
      .update(groupMembersTable)
      .set({ userId: user!.id, memberStatus: "joined", inviteToken: null, inviteTokenExpiresAt: null })
      .where(eq(groupMembersTable.invitedEmail, normalizedEmail));

    for (const inv of pendingInvites) {
      if (inv.invitedByUserId) {
        const groupInfo = await db.select({ name: groupsTable.name }).from(groupsTable).where(eq(groupsTable.id, inv.groupId)).then((r) => r[0]);
        await db.insert(notificationsTable).values({
          userId: inv.invitedByUserId,
          type: "invite_accepted",
          payload: {
            message: `${user!.displayName} hat sich registriert und ist der Gruppe „${groupInfo?.name ?? ""}" beigetreten! 🎉`,
            groupId: inv.groupId,
            joinedUserId: user!.id,
            joinedUserName: user!.displayName,
          },
        });

        if (await isEmailConfigured()) {
          try {
            const inviterUser = await db.select({ displayName: usersTable.displayName, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, inv.invitedByUserId)).then((r) => r[0]);
            if (inviterUser) {
              await sendEmail(inviterUser.email, `${user!.displayName} ist Lucia's Küche beigetreten!`, joinedNotificationEmail({ inviterName: inviterUser.displayName, joinedUserName: user!.displayName, groupName: groupInfo?.name ?? "Unbekannte Gruppe" }));
            }
          } catch (emailErr) {
            req.log.error({ err: emailErr }, "Failed to send join notification email to inviter");
          }
        }
      }
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, displayName: user.displayName, tokenVersion: user.tokenVersion },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Registration failed");
    res.status(500).json({ error: "internal_error", message: "Registrierung fehlgeschlagen" });
  }
});

router.post("/auth/login", authLimiter, async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    });
    const { email, password } = schema.parse(req.body);

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

    if (!user) {
      res.status(401).json({ error: "invalid_credentials", message: "E-Mail oder Passwort falsch" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "invalid_credentials", message: "E-Mail oder Passwort falsch" });
      return;
    }

    const [updatedUser] = await db
      .update(usersTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(usersTable.id, user.id))
      .returning();

    const finalUser = updatedUser ?? user;
    const token = jwt.sign(
      { id: finalUser.id, email: finalUser.email, displayName: finalUser.displayName, tokenVersion: finalUser.tokenVersion },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({ token, user: sanitizeUser(finalUser) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Login failed");
    res.status(500).json({ error: "internal_error", message: "Login fehlgeschlagen" });
  }
});

router.get("/auth/me", authMiddleware, async (req, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.authUser!.id));
    if (!user) {
      res.status(404).json({ error: "not_found", message: "Nutzer nicht gefunden" });
      return;
    }
    res.json(sanitizeUser(user));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch user");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/auth/logout", (_req, res) => {
  res.json({ success: true });
});

router.put("/auth/profile", authMiddleware, async (req, res) => {
  try {
    const schema = z.object({
      displayName: z.string().min(1).optional(),
      bio: z.string().nullable().optional(),
      cookingLevel: z.string().nullable().optional(),
      favoriteCategories: z.array(z.string()).optional(),
      dietaryPreference: z.string().nullable().optional(),
      onboardingCompleted: z.boolean().optional(),
    });

    const data = schema.parse(req.body);
    const updateData: Record<string, unknown> = {};
    if (data.displayName !== undefined) updateData["displayName"] = data.displayName;
    if (data.bio !== undefined) updateData["bio"] = data.bio;
    if (data.cookingLevel !== undefined) updateData["cookingLevel"] = data.cookingLevel;
    if (data.favoriteCategories !== undefined) updateData["favoriteCategories"] = data.favoriteCategories;
    if (data.dietaryPreference !== undefined) updateData["dietaryPreference"] = data.dietaryPreference;
    if (data.onboardingCompleted !== undefined) updateData["onboardingCompleted"] = data.onboardingCompleted;

    const [updated] = await db
      .update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, req.authUser!.id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    res.json(sanitizeUser(updated));
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to update profile");
    res.status(500).json({ error: "internal_error" });
  }
});

router.put("/auth/password", authMiddleware, async (req, res) => {
  try {
    const schema = z.object({
      oldPassword: z.string().min(1),
      newPassword: z.string().min(6),
    });

    const { oldPassword, newPassword } = schema.parse(req.body);

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.authUser!.id));
    if (!user) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const valid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!valid) {
      res.status(400).json({ error: "wrong_password", message: "Altes Passwort ist falsch" });
      return;
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    // Increment tokenVersion atomically — invalidates all previously issued tokens.
    const [updated] = await db
      .update(usersTable)
      .set({ passwordHash: newHash, tokenVersion: sql`${usersTable.tokenVersion} + 1` })
      .where(eq(usersTable.id, req.authUser!.id))
      .returning();

    // Issue a fresh token with the new version so the current session stays alive.
    const newToken = jwt.sign(
      { id: updated.id, email: updated.email, displayName: updated.displayName, tokenVersion: updated.tokenVersion },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({ token: newToken, user: sanitizeUser(updated) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to change password");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/auth/avatar", authMiddleware, async (req, res) => {
  try {
    const schema = z.object({
      avatarUrl: z.string().min(1),
    });

    const { avatarUrl } = schema.parse(req.body);

    const [updated] = await db
      .update(usersTable)
      .set({ avatarUrl })
      .where(eq(usersTable.id, req.authUser!.id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    res.json(sanitizeUser(updated));
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to upload avatar");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
