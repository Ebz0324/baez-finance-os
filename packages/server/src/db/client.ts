import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema.js";
import { config } from "../config.js";

export function openDb(path: string = config.dbPath) {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof openDb>;

// Schema is small enough for M0 that we create tables directly rather than
// wiring up drizzle-kit migrations yet; that arrives with the real schema in M1.
export function ensureSchema(db: Db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS households (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_currency TEXT NOT NULL DEFAULT 'USD'
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL REFERENCES households(id),
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('operator','partner')),
      created_at TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      public_key BLOB NOT NULL,
      counter INTEGER NOT NULL,
      transports TEXT,
      created_at TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL
    );
  `);
}
