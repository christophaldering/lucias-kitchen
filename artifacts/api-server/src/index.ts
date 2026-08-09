import app, { devProxy } from "./app";
import { logger } from "./lib/logger";
import { seedRecipes } from "./db/seedRecipes";
import { seedUser } from "./db/seedUser";
import { recoverProcessingSessions } from "./routes/bulkImport";
import { warmupRecipeCache } from "./routes/recipes";
import { startTrashCleanupJob } from "./lib/trashCleanup";
import { buildRecipeExport } from "./lib/recipeExport";
import { sendEmail, sendEmailWithAttachment, isEmailConfigured } from "./lib/email";
import cron from "node-cron";
import { db, HARMLESS_PG_CODES } from "@workspace/db";
import { recipesTable } from "@workspace/db/schema";
import { eq, isNull, and, or, sql } from "drizzle-orm";
import type { Socket } from "node:net";
import net from "node:net";
import http from "node:http";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

function isPortFree(p: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(p);
  });
}

async function waitForPortFree(
  p: number,
  maxAttempts = 10,
  intervalMs = 1_000,
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (await isPortFree(p)) return;
    logger.warn(
      { port: p, attempt, maxAttempts },
      "Port still in use, waiting before retry...",
    );
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(
    `Port ${p} is still occupied after ${maxAttempts} attempts. Giving up.`,
  );
}

function listenOnPort(p: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const srv = app.listen(p, () => resolve(srv));
    srv.once("error", reject);
  });
}

const connections = new Set<Socket>();
let server: http.Server;

async function main() {
  await waitForPortFree(port);

  server = await listenOnPort(port);

  server.on("connection", (socket: Socket) => {
    connections.add(socket);
    socket.once("close", () => connections.delete(socket));
  });

  if (devProxy) {
    server.on("upgrade", devProxy.upgrade);
  }

  logger.info({ port }, "Server listening");

  try {
    await seedRecipes();
  } catch (err) {
    logger.error({ err }, "Failed to seed recipes");
  }

  try {
    await seedUser();
  } catch (err) {
    logger.error({ err }, "Failed to seed user");
  }

  try {
    await recoverProcessingSessions();
  } catch (err) {
    logger.error({ err }, "Failed to recover processing sessions");
  }

  warmupRecipeCache(1).catch(() => {});
  warmupRecipeCache(undefined).catch(() => {});

  startTrashCleanupJob();

  // Wöchentliche Datensicherung per E-Mail (jeden Sonntag 06:00 Europe/Berlin)
  void (async () => {
    const emailReady = await isEmailConfigured().catch(() => false);
    if (!emailReady) {
      logger.info("Wochensicherungs-Cron nicht gestartet: E-Mail nicht konfiguriert.");
      return;
    }
    const ADMIN_EMAIL = "lucia.aldering@googlemail.com";
    const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
    cron.schedule(
      "0 6 * * 0",
      async () => {
        try {
          logger.info("Wochensicherung: Erstelle Export…");
          const exportData = await buildRecipeExport();
          const json = JSON.stringify(exportData, null, 2);
          const date = new Date().toISOString().slice(0, 10);
          const subject = `Lucias Kueche — Wochensicherung ${date}`;
          const body = `<p>Automatische Datensicherung vom ${date}.</p>
<p>Enthält <strong>${exportData.recipeCount} Rezepte</strong>.</p>`;
          const byteSize = Buffer.byteLength(json, "utf8");
          if (byteSize > MAX_ATTACHMENT_BYTES) {
            logger.warn({ byteSize }, "Wochensicherung: Anhang zu groß, sende Hinweis-Mail.");
            await sendEmail(
              ADMIN_EMAIL,
              subject,
              body + `<p><em>Hinweis: Der Export (${(byteSize / 1024 / 1024).toFixed(1)} MB) ist zu groß für einen E-Mail-Anhang. Bitte nutze den manuellen Export im Admin-Bereich.</em></p>`,
            );
          } else {
            const filename = `lucias-kueche-export-${date}.json`;
            await sendEmailWithAttachment(ADMIN_EMAIL, subject, body, {
              filename,
              content: json,
              contentType: "application/json",
            });
            logger.info({ recipeCount: exportData.recipeCount }, "Wochensicherung erfolgreich versendet.");
          }
        } catch (err) {
          logger.error({ err }, "Wochensicherung: Fehler beim Versand — Server läuft weiter.");
        }
      },
      { timezone: "Europe/Berlin" },
    );
    logger.info("Wochensicherungs-Cron registriert (jeden Sonntag 06:00 Europe/Berlin).");
  })();

  try {
    const result = await db
      .update(recipesTable)
      .set({ imageSource: "ai" })
      .where(and(eq(recipesTable.isAiGenerated, true), or(isNull(recipesTable.imageSource), sql`${recipesTable.imageSource} = ''`)));
    logger.info({ result }, "Backfilled image_source='ai' for is_ai_generated recipes");
  } catch (err) {
    logger.error({ err }, "Failed to backfill image_source for AI-generated recipes");
  }
}

main().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});

function gracefulShutdown(signal: string) {
  logger.info({ signal }, "Received shutdown signal, closing server...");

  const forceExitTimeout = setTimeout(() => {
    logger.warn("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, 10_000);

  forceExitTimeout.unref();

  if (server) {
    for (const socket of connections) {
      socket.destroy();
    }

    server.close((err) => {
      if (err) {
        logger.error({ err }, "Error closing server");
        process.exit(1);
      }
      logger.info("Server closed cleanly");
      clearTimeout(forceExitTimeout);
      process.exit(0);
    });
  } else {
    clearTimeout(forceExitTimeout);
    process.exit(0);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  const code = (err as NodeJS.ErrnoException & { code?: string }).code;
  if (code && HARMLESS_PG_CODES.has(code)) {
    logger.warn({ err }, "Transient DB connection error — continuing");
    return;
  }
  logger.error({ err }, "Uncaught exception — shutting down");
  process.exit(1);
});
