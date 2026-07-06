import { describe, expect, it, beforeEach } from "vitest";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { openDb, type Db } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import { accounts, statements, transactions, users } from "../src/db/schema.js";
import { importsRoutes } from "../src/routes/imports.js";
import { accountsRoutes } from "../src/routes/accounts.js";
import { generateSessionToken, createSession } from "../src/auth/session.js";
import { randomUUID } from "node:crypto";

let db: Db;
let app: Hono;
let cookie: string;
let accountId: string;

const MAPPING = {
  version: 1,
  delimiter: ",",
  skipRows: 0,
  hasHeader: true,
  columns: { date: 0, description: 1 },
  amount: { style: "signed", column: 2 },
  signConvention: "debitNegative",
  numberFormat: { decimalSeparator: ".", thousandsSeparator: ",", negativeStyle: "minus" },
  dateFormat: "MM/DD/YYYY",
};

const CSV = [
  "Date,Description,Amount",
  "07/01/2026,COLMADO,-1000.00",
  "07/02/2026,PAYROLL,3000.00",
  "07/03/2026,SUPERMARKET,-500.00",
].join("\n");
// Σ = +1500.00 → opening 1000.00 must close at 2500.00

function commit(body: Record<string, unknown>) {
  return app.request("/api/imports/commit", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      accountId,
      csvText: CSV,
      mapping: MAPPING,
      openingMinor: "100000",
      closingMinor: "250000",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      saveMapping: false,
      ...body,
    }),
  });
}

beforeEach(() => {
  db = openDb(":memory:");
  runMigrations(db);
  seed(db);
  app = new Hono()
    .route("/api/imports", importsRoutes(db))
    .route("/api/accounts", accountsRoutes(db));

  const eimer = db.select().from(users).all().find((u) => u.name === "Eimer")!;
  const token = generateSessionToken();
  createSession(db, token, eimer.id);
  cookie = `session=${token}`;

  accountId = randomUUID();
  db.insert(accounts)
    .values({
      id: accountId,
      ownerId: eimer.id,
      name: "Chase checking",
      kind: "checking",
      currency: "USD",
      scope: "me",
      createdAt: new Date().toISOString(),
    })
    .run();
});

describe("POST /api/imports/commit", () => {
  it("imports a balancing statement, anchors opening, marks reconciled", async () => {
    const res = await commit({});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.inserted).toBe(3);
    expect(data.anchored).toBe(true);

    const stmt = db.select().from(statements).all()[0]!;
    expect(stmt.status).toBe("reconciled");
    expect(stmt.openingMinor).toBe(100000n);

    // 3 statement rows + 1 anchor; account balance = closing.
    const rows = db.select().from(transactions).where(eq(transactions.accountId, accountId)).all();
    expect(rows).toHaveLength(4);
    const balance = rows.reduce<bigint>((acc, r) => acc + r.amountMinor, 0n);
    expect(balance).toBe(250000n);
  });

  it("rejects a non-balancing statement with the exact gap; persists NOTHING", async () => {
    const res = await commit({ closingMinor: "249900" }); // off by -1.00
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.gapMinor).toBe("-100");
    expect(db.select().from(statements).all()).toHaveLength(0);
    expect(db.select().from(transactions).all()).toHaveLength(0);
  });

  it("409s re-importing the identical file", async () => {
    await commit({});
    const res = await commit({
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already imported/);
  });

  it("409s an overlapping period", async () => {
    await commit({});
    const res = await commit({
      csvText: CSV + "\n07/15/2026,EXTRA,-1.00", // different file hash
      openingMinor: "250000",
      closingMinor: "399900",
      periodStart: "2026-07-15",
      periodEnd: "2026-08-14",
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/overlaps/);
  });

  it("does not re-anchor on the second consecutive statement", async () => {
    await commit({});
    const res = await commit({
      csvText: "Date,Description,Amount\n08/05/2026,RENT,-2000.00",
      openingMinor: "250000",
      closingMinor: "50000",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).anchored).toBe(false);

    const rows = db.select().from(transactions).where(eq(transactions.accountId, accountId)).all();
    const balance = rows.reduce<bigint>((acc, r) => acc + r.amountMinor, 0n);
    expect(balance).toBe(50000n); // continuity holds across statements
  });

  it("422s row-level parse errors without persisting", async () => {
    const res = await commit({
      csvText: "Date,Description,Amount\nnot-a-date,BAD,-1.00",
    });
    expect(res.status).toBe(422);
    expect((await res.json()).rowErrors).toHaveLength(1);
    expect(db.select().from(statements).all()).toHaveLength(0);
  });

  it("saves the mapping on the account when asked", async () => {
    await commit({ saveMapping: true });
    const account = db.select().from(accounts).where(eq(accounts.id, accountId)).get()!;
    expect(JSON.parse(account.csvMapping!).dateFormat).toBe("MM/DD/YYYY");
  });

  it("401s without a session", async () => {
    const res = await app.request("/api/imports/commit", { method: "POST" });
    expect(res.status).toBe(401);
  });
});
