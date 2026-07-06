import { describe, expect, it, beforeEach } from "vitest";
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { openDb, type Db } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import { accounts, categories, transactions, users } from "../src/db/schema.js";
import { transactionsRoutes } from "../src/routes/transactions.js";
import { categoriesRoutes } from "../src/routes/categories.js";
import { generateSessionToken, createSession } from "../src/auth/session.js";

let db: Db;
let app: Hono;
let eimerCookie: string;
let eimerId: string;

beforeEach(() => {
  db = openDb(":memory:");
  runMigrations(db);
  seed(db);
  app = new Hono()
    .route("/api/transactions", transactionsRoutes(db))
    .route("/api/categories", categoriesRoutes(db));

  eimerId = db.select().from(users).all().find((u) => u.name === "Eimer")!.id;
  const token = generateSessionToken();
  createSession(db, token, eimerId);
  eimerCookie = `session=${token}`;
});

function quickAdd(body: Record<string, unknown>) {
  return app.request("/api/transactions/quick-add", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: eimerCookie },
    body: JSON.stringify(body),
  });
}

describe("quick add", () => {
  it("creates a cash account on first use and stores a signed expense", async () => {
    const id = randomUUID();
    const res = await quickAdd({ id, amountMinor: "25000", currency: "DOP", direction: "expense" });
    expect(res.status).toBe(200);
    const { transaction } = await res.json();
    expect(transaction.amountMinor).toBe("-25000");

    const cash = db.select().from(accounts).all();
    expect(cash).toHaveLength(1);
    expect(cash[0]!.name).toBe("Cash · DOP");
    expect(cash[0]!.kind).toBe("cash");
    expect(cash[0]!.scope).toBe("me");
  });

  it("income is stored positive", async () => {
    const res = await quickAdd({
      id: randomUUID(), amountMinor: "100000", currency: "USD", direction: "income",
    });
    const { transaction } = await res.json();
    expect(transaction.amountMinor).toBe("100000");
  });

  it("is idempotent: double-POST with the same UUID yields exactly one row", async () => {
    const id = randomUUID();
    const body = { id, amountMinor: "5000", currency: "DOP", direction: "expense" };
    const first = await quickAdd(body);
    const second = await quickAdd(body);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await second.json()).transaction.id).toBe(id);
    expect(db.select().from(transactions).all()).toHaveLength(1);
  });

  it("reuses the same cash account per currency", async () => {
    await quickAdd({ id: randomUUID(), amountMinor: "100", currency: "DOP", direction: "expense" });
    await quickAdd({ id: randomUUID(), amountMinor: "200", currency: "DOP", direction: "expense" });
    await quickAdd({ id: randomUUID(), amountMinor: "300", currency: "USD", direction: "expense" });
    expect(db.select().from(accounts).all()).toHaveLength(2); // one per currency
  });

  it("accepts an optional category and marks cat_source=user", async () => {
    const groceries = db.select().from(categories).all().find((c) => c.name === "groceries")!;
    const res = await quickAdd({
      id: randomUUID(), amountMinor: "9900", currency: "DOP", direction: "expense",
      categoryId: groceries.id,
    });
    const { transaction } = await res.json();
    expect(transaction.categoryId).toBe(groceries.id);
    expect(transaction.catSource).toBe("user");
  });

  it("rejects invalid input with 400", async () => {
    for (const body of [
      { id: randomUUID(), amountMinor: "0", currency: "DOP", direction: "expense" },
      { id: randomUUID(), amountMinor: "-50", currency: "DOP", direction: "expense" },
      { id: randomUUID(), amountMinor: "12.5", currency: "DOP", direction: "expense" },
      { id: randomUUID(), amountMinor: "100", currency: "EUR", direction: "expense" },
      { id: randomUUID(), amountMinor: "100", currency: "DOP", direction: "sideways" },
      { id: randomUUID(), amountMinor: "100", currency: "DOP", direction: "expense", categoryId: "nope" },
    ]) {
      const res = await quickAdd(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });
});

describe("transactions list", () => {
  it("pages newest-first with a cursor", async () => {
    for (let i = 1; i <= 5; i++) {
      await quickAdd({
        id: randomUUID(), amountMinor: `${i}00`, currency: "DOP", direction: "expense",
        occurredOn: `2026-07-0${i}`,
      });
    }
    const first = await (
      await app.request("/api/transactions?scope=me&limit=3", { headers: { cookie: eimerCookie } })
    ).json();
    expect(first.transactions).toHaveLength(3);
    expect(first.transactions[0].postedOn).toBe("2026-07-05");
    expect(first.nextCursor).not.toBeNull();

    const second = await (
      await app.request(`/api/transactions?scope=me&limit=3&before=${encodeURIComponent(first.nextCursor)}`, {
        headers: { cookie: eimerCookie },
      })
    ).json();
    expect(second.transactions).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
  });

  it("recategorizes with PATCH and sets cat_source=user", async () => {
    const id = randomUUID();
    await quickAdd({ id, amountMinor: "700", currency: "DOP", direction: "expense" });
    const fuel = db.select().from(categories).all().find((c) => c.name === "fuel")!;
    const res = await app.request(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: eimerCookie },
      body: JSON.stringify({ categoryId: fuel.id }),
    });
    expect(res.status).toBe(200);
    const row = db.select().from(transactions).where(eq(transactions.id, id)).get()!;
    expect(row.categoryId).toBe(fuel.id);
    expect(row.catSource).toBe("user");
  });
});

describe("frequent categories", () => {
  it("ranks by the caller's usage and excludes transfer-kind categories", async () => {
    const all = db.select().from(categories).all();
    const groceries = all.find((c) => c.name === "groceries")!;
    const fuel = all.find((c) => c.name === "fuel")!;
    const today = new Date().toISOString().slice(0, 10);

    for (let i = 0; i < 3; i++) {
      await quickAdd({
        id: randomUUID(), amountMinor: "100", currency: "DOP", direction: "expense",
        categoryId: groceries.id, occurredOn: today,
      });
    }
    await quickAdd({
      id: randomUUID(), amountMinor: "100", currency: "DOP", direction: "expense",
      categoryId: fuel.id, occurredOn: today,
    });

    const res = await (
      await app.request("/api/categories/frequent", { headers: { cookie: eimerCookie } })
    ).json();
    const names = res.categories.map((c: { name: string }) => c.name);
    expect(names[0]).toBe("groceries");
    expect(names).toContain("fuel");
    expect(names).not.toContain("opening balance");
    expect(names).not.toContain("transfer");
  });
});
