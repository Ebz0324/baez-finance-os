import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { Db } from "./client.js";

/**
 * Applies pending drizzle migrations. Every execution context (dev scripts,
 * vitest, the prod container) runs with packages/server as cwd, so the
 * migrations folder resolves from there.
 */
export function runMigrations(db: Db) {
  const migrationsFolder = resolve(process.cwd(), "drizzle");
  if (!existsSync(migrationsFolder)) {
    throw new Error(
      `migrations folder not found at ${migrationsFolder} — run from packages/server (or check the Dockerfile COPYs drizzle/)`,
    );
  }
  migrate(db, { migrationsFolder });
}
