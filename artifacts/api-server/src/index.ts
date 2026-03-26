import app, { devProxy } from "./app";
import { logger } from "./lib/logger";
import { seedRecipes } from "./db/seedRecipes";
import { seedUser } from "./db/seedUser";
import { recoverProcessingSessions } from "./routes/bulkImport";
import { warmupRecipeCache } from "./routes/recipes";
import { startTrashCleanupJob } from "./lib/trashCleanup";
import { db } from "@workspace/db";
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
