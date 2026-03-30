import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const HARMLESS_PG_CODES = new Set(["57P01", "57014", "08006", "08001"]);

pool.on("error", (err) => {
  const code = (err as NodeJS.ErrnoException & { code?: string }).code;
  if (code && HARMLESS_PG_CODES.has(code)) {
    console.warn("Transient DB pool connection error (ignored):", err.message);
    return;
  }
  // Rethrow unexpected errors on the next tick so they reach the global
  // uncaughtException handler and trigger an orderly shutdown.
  setImmediate(() => {
    throw err;
  });
});

export const db = drizzle(pool, { schema });

export * from "./schema";
