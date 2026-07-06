import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { openDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import { accounts, categories, transactions, users } from "../src/db/schema.js";
import { randomUUID } from "node:crypto";

/** The exact DDL M0's ensureSchema ran in production before migrations existed. */
function buildM0ShapeDb() {
  const db = openDb(":memory:");
  db.run(sql`CREATE TABLE households (id TEXT PRIMARY KEY, name TEXT NOT NULL, base_currency TEXT NOT NULL DEFAULT 'USD');`);
  db.run(sql`CREATE TABLE users (id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id), name TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('operator','partner')), created_at TEXT NOT NULL);`);
  db.run(sql`CREATE TABLE webauthn_credentials (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), public_key BLOB NOT NULL, counter INTEGER NOT NULL, transports TEXT, created_at TEXT NOT NULL);`);
  db.run(sql`CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);`);
  return db;
}

describe("runMigrations", () => {
  it("creates the full schema on a fresh database", () => {
    const db = openDb(":memory:");
    runMigrations(db);
    seed(db);
    // Ledger tables exist and accept rows.
    expect(db.select().from(categories).all().length).toBeGreaterThan(10);
    expect(db.select().from(accounts).all()).toEqual([]);
  });

  it("upgrades an M0-shape database in place (prod rehearsal)", () => {
    const db = buildM0ShapeDb();
    // Simulate real prod data predating migrations.
    db.run(sql`INSERT INTO households (id, name) VALUES ('h1', 'Baez Household');`);
    db.run(sql`INSERT INTO users (id, household_id, name, role, created_at) VALUES ('u1', 'h1', 'Eimer', 'operator', '2026-07-01T00:00:00Z');`);

    runMigrations(db);
    seed(db);

    // Existing rows survive, and users gained the new columns with defaults.
    const eimer = db.select().from(users).all().find((u) => u.name === "Eimer")!;
    expect(eimer.id).toBe("u1");
    expect(eimer.defaultScope).toBe("household");
    expect(eimer.quickAddCurrency).toBeNull();

    // New tables are usable.
    expect(db.select().from(accounts).all()).toEqual([]);
  });

  it("is idempotent across repeated runs", () => {
    const db = openDb(":memory:");
    runMigrations(db);
    runMigrations(db);
    seed(db);
    seed(db);
    expect(db.select().from(users).all()).toHaveLength(2);
  });

  it("reads large-but-safe bigint minor units exactly (invariant #1)", () => {
    const db = openDb(":memory:");
    runMigrations(db);
    seed(db);

    const user = db.select().from(users).all()[0]!;
    db.insert(accounts)
      .values({
        id: "acc1",
        ownerId: user.id,
        name: "test",
        kind: "checking",
        currency: "USD",
        scope: "me",
        createdAt: new Date().toISOString(),
      })
      .run();

    const large = 2n ** 52n + 3n; // huge but within safe-integer range
    db.insert(transactions)
      .values({
        id: randomUUID(),
        accountId: "acc1",
        postedOn: "2026-07-06",
        amountMinor: large,
        currency: "USD",
        createdBy: user.id,
        createdAt: new Date().toISOString(),
      })
      .run();

    expect(db.select().from(transactions).all()[0]!.amountMinor).toBe(large);
  });

  it("refuses a lossy read past 2^53 instead of returning corrupted money (invariant #1)", () => {
    const db = openDb(":memory:");
    runMigrations(db);
    seed(db);

    const user = db.select().from(users).all()[0]!;
    db.insert(accounts)
      .values({
        id: "acc1",
        ownerId: user.id,
        name: "test",
        kind: "checking",
        currency: "USD",
        scope: "me",
        createdAt: new Date().toISOString(),
      })
      .run();

    const huge = 2n ** 55n + 7n; // past Number.MAX_SAFE_INTEGER
    db.insert(transactions)
      .values({
        id: randomUUID(),
        accountId: "acc1",
        postedOn: "2026-07-06",
        amountMinor: huge, // stored exactly (BigInt bind → int64)
        currency: "USD",
        createdBy: user.id,
        createdAt: new Date().toISOString(),
      })
      .run();

    // The default read path would deliver a lossy double; the column type
    // must throw rather than silently return wrong money.
    expect(() => db.select().from(transactions).all()).toThrow(/safe integer/);
  });
});
