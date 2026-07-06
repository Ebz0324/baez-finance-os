import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { and, eq, max, ne, sql, sum } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { accounts, categories, transactions, users, ACCOUNT_KINDS } from "../db/schema.js";
import { OPENING_BALANCE_CATEGORY } from "../db/seed.js";
import { requireAuth, type AuthEnv } from "../auth/middleware.js";
import {
  WireError,
  parseEnum,
  parseMinorString,
  parseNonEmptyString,
  toBigIntStrict,
} from "../lib/wire.js";

export type Scope = "me" | "partner" | "household";

/**
 * Scope filter (design decision D4): household = ALL accounts;
 * me = viewer's personal accounts; partner = the other member's personal.
 */
export function scopeCondition(scope: Scope, viewerId: string) {
  switch (scope) {
    case "household":
      return undefined;
    case "me":
      return and(eq(accounts.ownerId, viewerId), ne(accounts.scope, "household"));
    case "partner":
      return and(ne(accounts.ownerId, viewerId), ne(accounts.scope, "household"));
  }
}

export function accountsRoutes(db: Db) {
  const app = new Hono<AuthEnv>();
  app.use("*", requireAuth(db));

  app.get("/", (c) => {
    const scope = parseEnum(
      c.req.query("scope") ?? c.var.user.defaultScope,
      ["me", "partner", "household"] as const,
      "scope",
    );

    const rows = db
      .select({
        id: accounts.id,
        name: accounts.name,
        kind: accounts.kind,
        currency: accounts.currency,
        scope: accounts.scope,
        ownerId: accounts.ownerId,
        csvMapping: accounts.csvMapping,
        balance: sum(transactions.amountMinor),
        lastActivityOn: max(transactions.postedOn),
      })
      .from(accounts)
      .leftJoin(transactions, eq(transactions.accountId, accounts.id))
      .where(scopeCondition(scope, c.var.user.id))
      .groupBy(accounts.id)
      .all();

    return c.json({
      accounts: rows.map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        currency: r.currency,
        scope: r.scope,
        ownerId: r.ownerId,
        csvMapping: r.csvMapping,
        balanceMinor: toBigIntStrict(
          r.balance === null ? 0n : BigInt(r.balance),
          `balance of ${r.id}`,
        ).toString(),
        lastActivityOn: r.lastActivityOn,
      })),
    });
  });

  app.post("/", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }

    try {
      const name = parseNonEmptyString(body.name, "name");
      const kind = parseEnum(body.kind, ACCOUNT_KINDS, "kind");
      const accountCurrency = parseEnum(body.currency, ["USD", "DOP"] as const, "currency");
      const whose = parseEnum(body.whose, ["me", "partner", "shared"] as const, "whose");

      const viewer = c.var.user;
      let ownerId = viewer.id;
      let scope: Scope = "me";
      if (whose === "shared") {
        scope = "household";
      } else if (whose === "partner") {
        const other = db
          .select()
          .from(users)
          .where(and(eq(users.householdId, viewer.householdId), ne(users.id, viewer.id)))
          .get();
        if (!other) return c.json({ error: "no partner user found" }, 400);
        ownerId = other.id;
        scope = "partner";
      }

      const id = randomUUID();
      const now = new Date().toISOString();
      db.insert(accounts)
        .values({ id, ownerId, name, kind, currency: accountCurrency, scope, createdAt: now })
        .run();

      // Optional opening balance → anchor transaction (D6), so balance = Σ rows.
      if (body.openingBalanceMinor !== undefined && body.openingBalanceMinor !== null) {
        const opening = parseMinorString(body.openingBalanceMinor, "openingBalanceMinor");
        if (opening !== 0n) {
          const anchor = db
            .select()
            .from(categories)
            .where(eq(categories.name, OPENING_BALANCE_CATEGORY))
            .get();
          db.insert(transactions)
            .values({
              id: randomUUID(),
              accountId: id,
              categoryId: anchor?.id ?? null,
              postedOn: now.slice(0, 10),
              amountMinor: opening,
              currency: accountCurrency,
              merchantRaw: "Opening balance",
              merchantNorm: "opening balance",
              catSource: "user",
              createdBy: viewer.id,
              createdAt: now,
            })
            .run();
        }
      }

      return c.json({ id }, 201);
    } catch (err) {
      if (err instanceof WireError) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  app.patch("/:id", async (c) => {
    const account = db.select().from(accounts).where(eq(accounts.id, c.req.param("id"))).get();
    if (!account) return c.json({ error: "not found" }, 404);

    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }

    try {
      const updates: Partial<{ name: string; kind: (typeof ACCOUNT_KINDS)[number] }> = {};
      if (body.name !== undefined) updates.name = parseNonEmptyString(body.name, "name");
      if (body.kind !== undefined) updates.kind = parseEnum(body.kind, ACCOUNT_KINDS, "kind");
      if (Object.keys(updates).length === 0) {
        return c.json({ error: "nothing to update" }, 400);
      }
      db.update(accounts).set(updates).where(eq(accounts.id, account.id)).run();
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof WireError) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  app.delete("/:id", (c) => {
    const account = db.select().from(accounts).where(eq(accounts.id, c.req.param("id"))).get();
    if (!account) return c.json({ error: "not found" }, 404);

    const hasRows = db
      .select({ n: sql<number>`1` })
      .from(transactions)
      .where(eq(transactions.accountId, account.id))
      .limit(1)
      .get();
    if (hasRows) {
      return c.json({ error: "account has transactions — it can't be deleted" }, 403);
    }

    db.delete(accounts).where(eq(accounts.id, account.id)).run();
    return c.json({ ok: true });
  });

  return app;
}
