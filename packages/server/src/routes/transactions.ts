import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { accounts, categories, transactions } from "../db/schema.js";
import { requireAuth, type AuthEnv } from "../auth/middleware.js";
import {
  WireError,
  parseEnum,
  parseIsoDate,
  parseMinorString,
  parseNonEmptyString,
} from "../lib/wire.js";

/**
 * Quick add has no account picker (D5): each user gets an auto-created cash
 * account per currency, e.g. "Cash · DOP".
 */
function resolveCashAccount(db: Db, userId: string, cur: "USD" | "DOP"): string {
  const existing = db
    .select()
    .from(accounts)
    .where(
      and(eq(accounts.ownerId, userId), eq(accounts.kind, "cash"), eq(accounts.currency, cur)),
    )
    .get();
  if (existing) return existing.id;

  const id = randomUUID();
  db.insert(accounts)
    .values({
      id,
      ownerId: userId,
      name: `Cash · ${cur}`,
      kind: "cash",
      currency: cur,
      scope: "me",
      createdAt: new Date().toISOString(),
    })
    .run();
  return id;
}

function scopeAccountIds(db: Db, scope: "me" | "partner" | "household", viewerId: string) {
  const rows =
    scope === "household"
      ? db.select({ id: accounts.id }).from(accounts).all()
      : scope === "me"
        ? db
            .select({ id: accounts.id })
            .from(accounts)
            .where(and(eq(accounts.ownerId, viewerId), ne(accounts.scope, "household")))
            .all()
        : db
            .select({ id: accounts.id })
            .from(accounts)
            .where(and(ne(accounts.ownerId, viewerId), ne(accounts.scope, "household")))
            .all();
  return rows.map((r) => r.id);
}

export function transactionsRoutes(db: Db) {
  const app = new Hono<AuthEnv>();
  app.use("*", requireAuth(db));

  app.post("/quick-add", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }

    try {
      const id = parseNonEmptyString(body.id, "id", 64);
      const amount = parseMinorString(body.amountMinor, "amountMinor");
      if (amount <= 0n) throw new WireError("amountMinor must be positive");
      const cur = parseEnum(body.currency, ["USD", "DOP"] as const, "currency");
      const direction = parseEnum(body.direction, ["expense", "income"] as const, "direction");
      const occurredOn =
        body.occurredOn !== undefined && body.occurredOn !== null
          ? parseIsoDate(body.occurredOn, "occurredOn")
          : new Date().toISOString().slice(0, 10);

      let categoryId: string | null = null;
      if (body.categoryId !== undefined && body.categoryId !== null) {
        const cat = db
          .select()
          .from(categories)
          .where(eq(categories.id, parseNonEmptyString(body.categoryId, "categoryId", 64)))
          .get();
        if (!cat) throw new WireError("unknown categoryId");
        categoryId = cat.id;
      }

      const user = c.var.user;
      const accountId = resolveCashAccount(db, user.id, cur);

      // Idempotency contract: the client UUID is the PK; replays return the
      // existing row with 200 — never a 409, never a duplicate.
      db.insert(transactions)
        .values({
          id,
          accountId,
          categoryId,
          postedOn: occurredOn,
          amountMinor: direction === "expense" ? -amount : amount,
          currency: cur,
          catSource: categoryId ? "user" : null,
          createdBy: user.id,
          createdAt: new Date().toISOString(),
        })
        .onConflictDoNothing({ target: transactions.id })
        .run();

      const row = db.select().from(transactions).where(eq(transactions.id, id)).get()!;
      return c.json({
        transaction: { ...row, amountMinor: row.amountMinor.toString() },
      });
    } catch (err) {
      if (err instanceof WireError) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  app.get("/", (c) => {
    try {
      const scope = parseEnum(
        c.req.query("scope") ?? c.var.user.defaultScope,
        ["me", "partner", "household"] as const,
        "scope",
      );
      const limit = Math.min(Number(c.req.query("limit") ?? 30), 100);
      const before = c.req.query("before"); // cursor: "<postedOn>|<id>"

      const accountIds = scopeAccountIds(db, scope, c.var.user.id);
      if (accountIds.length === 0) return c.json({ transactions: [], nextCursor: null });

      const conditions = [inArray(transactions.accountId, accountIds), isNull(transactions.supersededBy)];
      if (before) {
        const [beforeDate, beforeId] = before.split("|");
        if (!beforeDate || !beforeId) throw new WireError("malformed cursor");
        conditions.push(
          or(
            lt(transactions.postedOn, beforeDate),
            and(eq(transactions.postedOn, beforeDate), lt(transactions.id, beforeId)),
          )!,
        );
      }

      const rows = db
        .select({
          id: transactions.id,
          accountId: transactions.accountId,
          categoryId: transactions.categoryId,
          postedOn: transactions.postedOn,
          amountMinor: transactions.amountMinor,
          currency: transactions.currency,
          merchantRaw: transactions.merchantRaw,
          catSource: transactions.catSource,
          accountName: accounts.name,
          categoryName: categories.name,
        })
        .from(transactions)
        .innerJoin(accounts, eq(accounts.id, transactions.accountId))
        .leftJoin(categories, eq(categories.id, transactions.categoryId))
        .where(and(...conditions))
        .orderBy(desc(transactions.postedOn), desc(transactions.id))
        .limit(limit + 1)
        .all();

      const page = rows.slice(0, limit);
      const nextCursor =
        rows.length > limit ? `${page[page.length - 1]!.postedOn}|${page[page.length - 1]!.id}` : null;

      return c.json({
        transactions: page.map((r) => ({ ...r, amountMinor: r.amountMinor.toString() })),
        nextCursor,
      });
    } catch (err) {
      if (err instanceof WireError) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  app.patch("/:id", async (c) => {
    const row = db
      .select()
      .from(transactions)
      .where(eq(transactions.id, c.req.param("id")))
      .get();
    if (!row) return c.json({ error: "not found" }, 404);
    if (row.supersededBy) return c.json({ error: "transaction has been superseded" }, 409);

    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }

    try {
      const categoryId = parseNonEmptyString(body.categoryId, "categoryId", 64);
      const cat = db.select().from(categories).where(eq(categories.id, categoryId)).get();
      if (!cat) throw new WireError("unknown categoryId");

      db.update(transactions)
        .set({ categoryId, catSource: "user", confidence: null })
        .where(eq(transactions.id, row.id))
        .run();
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof WireError) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  return app;
}

export { resolveCashAccount, scopeAccountIds };
