import app, { devProxy } from "./app";
import { logger } from "./lib/logger";
import { seedRecipes } from "./db/seedRecipes";
import { seedUser } from "./db/seedUser";
import { recoverProcessingSessions } from "./routes/bulkImport";
import { warmupRecipeCache } from "./routes/recipes";
import { startTrashCleanupJob } from "./lib/trashCleanup";

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

const server = app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  try {
    await seedRecipes();
  } catch (seedErr) {
    logger.error({ err: seedErr }, "Failed to seed recipes");
  }

  try {
    await seedUser();
  } catch (seedErr) {
    logger.error({ err: seedErr }, "Failed to seed user");
  }

  try {
    await recoverProcessingSessions();
  } catch (recoverErr) {
    logger.error({ err: recoverErr }, "Failed to recover processing sessions");
  }

  warmupRecipeCache(1).catch(() => {});
  warmupRecipeCache(undefined).catch(() => {});

  startTrashCleanupJob();
});

if (devProxy) {
  server.on("upgrade", devProxy.upgrade);
}
