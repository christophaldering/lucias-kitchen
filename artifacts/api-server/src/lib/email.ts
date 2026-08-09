import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { logger } from "./logger";
import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

async function getDbSetting(key: string): Promise<string | null> {
  try {
    const row = await db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, key))
      .then((r) => r[0]);
    return row?.value ?? null;
  } catch {
    return null;
  }
}

let cachedTransporter: Transporter | null = null;
let lastConfigHash = "";

async function getTransporter(): Promise<Transporter> {
  const dbPassword = await getDbSetting("smtp_password");
  const dbEmail = await getDbSetting("smtp_sender_email");

  const password = dbPassword ?? process.env["GMAIL_APP_PASSWORD"];
  const email = dbEmail ?? "lucia.aldering@googlemail.com";

  if (!password) {
    throw new Error("E-Mail-Passwort ist nicht konfiguriert. Bitte in den Admin-Einstellungen hinterlegen.");
  }

  const configHash = `${email}:${password}`;
  if (cachedTransporter && configHash === lastConfigHash) {
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: email,
      pass: password,
    },
  });
  lastConfigHash = configHash;
  return cachedTransporter;
}

export async function getSenderEmail(): Promise<string> {
  const dbEmail = await getDbSetting("smtp_sender_email");
  return dbEmail ?? "lucia.aldering@googlemail.com";
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const t = await getTransporter();
  const fromEmail = await getSenderEmail();
  try {
    await t.sendMail({
      from: `"Lucia's Küche" <${fromEmail}>`,
      to,
      subject,
      html,
    });
    logger.info({ to, subject }, "Email sent successfully");
  } catch (err) {
    logger.error({ err, to, subject }, "Failed to send email");
    throw err;
  }
}

export async function sendEmailWithAttachment(
  to: string,
  subject: string,
  html: string,
  attachment: { filename: string; content: string | Buffer; contentType: string },
): Promise<void> {
  const t = await getTransporter();
  const fromEmail = await getSenderEmail();
  try {
    await t.sendMail({
      from: `"Lucia's Küche" <${fromEmail}>`,
      to,
      subject,
      html,
      attachments: [
        {
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType,
        },
      ],
    });
    logger.info({ to, subject }, "Email with attachment sent successfully");
  } catch (err) {
    logger.error({ err, to, subject }, "Failed to send email with attachment");
    throw err;
  }
}

export async function isEmailConfigured(): Promise<boolean> {
  const dbPassword = await getDbSetting("smtp_password");
  return !!(dbPassword ?? process.env["GMAIL_APP_PASSWORD"]);
}
