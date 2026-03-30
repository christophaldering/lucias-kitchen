import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { appSettingsTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { authMiddleware } from "./auth";
import { sendEmail } from "../lib/email";

const router: IRouter = Router();

const ADMIN_EMAIL = "lucia.aldering@googlemail.com";
function isAdmin(email: string) {
  return email === ADMIN_EMAIL;
}

async function getSetting(key: string): Promise<string | null> {
  const row = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, key))
    .then((r) => r[0]);
  return row?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSettingsTable)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value, updatedAt: new Date() } });
}

router.get("/admin/email-config", authMiddleware, async (req, res) => {
  try {
    if (!isAdmin(req.authUser!.email)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const senderEmail = (await getSetting("smtp_sender_email")) ?? process.env["GMAIL_USER"] ?? "lucia.aldering@googlemail.com";
    const hasDbPassword = !!(await getSetting("smtp_password"));
    const hasEnvPassword = !!process.env["GMAIL_APP_PASSWORD"];
    const hasPassword = hasDbPassword || hasEnvPassword;
    const appUrl = (await getSetting("app_url")) ?? null;
    const defaultAppUrl = (() => {
      if (process.env["APP_URL"]) return process.env["APP_URL"].replace(/\/$/, "");
      const domain = process.env["REPLIT_DOMAINS"]?.split(",")[0] || process.env["REPLIT_DEV_DOMAIN"];
      return domain ? `https://${domain}` : null;
    })();

    res.json({
      senderEmail,
      passwordConfigured: hasPassword,
      passwordSource: hasDbPassword ? "database" : hasEnvPassword ? "environment" : "none",
      appUrl,
      defaultAppUrl,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get email config");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/admin/email-config", authMiddleware, async (req, res) => {
  try {
    if (!isAdmin(req.authUser!.email)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const schema = z.object({
      senderEmail: z.string().email().optional(),
      password: z.string().min(1).optional(),
      appUrl: z.string().url().optional(),
    });

    const { senderEmail, password, appUrl } = schema.parse(req.body);

    if (senderEmail) {
      await setSetting("smtp_sender_email", senderEmail);
    }
    if (password) {
      await setSetting("smtp_password", password);
    }
    if (appUrl !== undefined) {
      await setSetting("app_url", appUrl.replace(/\/$/, ""));
    }

    res.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to update email config");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/admin/email-test", authMiddleware, async (req, res) => {
  try {
    if (!isAdmin(req.authUser!.email)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const schema = z.object({
      to: z.string().email().optional(),
    });

    const { to } = schema.parse(req.body);

    const senderEmail = (await getSetting("smtp_sender_email")) ?? process.env["GMAIL_USER"] ?? "lucia.aldering@googlemail.com";
    const recipient = to ?? senderEmail;

    try {
      await sendEmail(
        recipient,
        "✅ Test-E-Mail von Lucia's Küche",
        `<div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #4A7C59;">E-Mail-Versand funktioniert! 🎉</h2>
          <p>Diese Test-E-Mail wurde erfolgreich von <strong>${senderEmail}</strong> versendet.</p>
          <p style="color: #888; font-size: 13px;">Zeitstempel: ${new Date().toLocaleString("de-DE")}</p>
        </div>`
      );
      res.json({ success: true, recipient });
    } catch (emailErr: any) {
      req.log.error({ err: emailErr }, "Test email failed");
      res.status(500).json({ error: "send_failed", message: emailErr?.message ?? "Unbekannter Fehler beim Versand" });
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to send test email");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
