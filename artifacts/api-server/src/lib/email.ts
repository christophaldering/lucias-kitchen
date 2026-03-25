import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { logger } from "./logger";

const GMAIL_USER = "lucia.aldering@googlemail.com";
const GMAIL_APP_PASSWORD = process.env["GMAIL_APP_PASSWORD"];

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!GMAIL_APP_PASSWORD) {
    throw new Error("GMAIL_APP_PASSWORD is not configured. Email sending is disabled.");
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const t = getTransporter();
  try {
    await t.sendMail({
      from: `"Lucia's Küche" <${GMAIL_USER}>`,
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

export function isEmailConfigured(): boolean {
  return !!GMAIL_APP_PASSWORD;
}
