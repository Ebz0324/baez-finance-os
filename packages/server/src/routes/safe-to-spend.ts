import { Hono } from "hono";
import { and, eq, inArray, max, sum } from "drizzle-orm";
import {
  currency,
  isoDate,
  minor,
  parseDecimal,
  safeToSpendV1,
  LIQUID_KINDS,
  type AccountBalance,
} from "@baez/engine";
import type { Db } from "../db/client.js";
import { accounts, households, transactions, type ACCOUNT_KINDS } from "../db/schema.js";
import { requireAuth, type AuthEnv } from "../auth/middleware.js";
import { parseEnum } from "../lib/wire.js";
import { scopeCondition, type Scope } from "./accounts.js";
import { latestFxRate } from "./fx.js";

export function safeToSpendRoutes(db: Db) {
  const app = new Hono<AuthEnv>();
  app.use("*", requireAuth(db));

  app.get("/", (c) => {
    const scope = parseEnum(
      c.req.query("scope") ?? c.var.user.defaultScope,
      ["me", "partner", "household"] as const,
      "scope",
    );

    const household = db
      .select()
      .from(households)
      .where(eq(households.id, c.var.user.householdId))
      .get()!;
    const baseCurrency = currency(household.baseCurrency);

    const rows = db
      .select({
        id: accounts.id,
        name: accounts.name,
        kind: accounts.kind,
        accountCurrency: accounts.currency,
        balance: sum(transactions.amountMinor),
        lastActivityOn: max(transactions.postedOn),
      })
      .from(accounts)
      .leftJoin(transactions, eq(transactions.accountId, accounts.id))
      .where(
        and(
          scopeCondition(scope as Scope, c.var.user.id),
          inArray(accounts.kind, LIQUID_KINDS as unknown as (typeof ACCOUNT_KINDS)[number][]),
        ),
      )
      .groupBy(accounts.id)
      .all();

    const rate = latestFxRate(db);

    const included: AccountBalance[] = [];
    const excludedAccounts: Array<{ id: string; name: string; currency: string }> = [];

    for (const r of rows) {
      const accountCurrency = currency(r.accountCurrency);
      if (accountCurrency !== baseCurrency && !rate) {
        excludedAccounts.push({ id: r.id, name: r.name, currency: accountCurrency });
        continue;
      }
      included.push({
        accountId: r.id,
        kind: r.kind,
        currency: accountCurrency,
        balanceMinor: minor(r.balance === null ? 0n : BigInt(r.balance)),
        latestDataOn: r.lastActivityOn ? isoDate(r.lastActivityOn) : null,
      });
    }

    const result = safeToSpendV1(
      included,
      baseCurrency,
      rate ? parseDecimal(rate.rate) : parseDecimal("1"),
    );

    return c.json({
      availableMinor: result.availableMinor.toString(),
      baseCurrency: result.baseCurrency,
      accountCount: result.accountCount,
      dataThrough: result.dataThrough,
      needsRate: excludedAccounts.length > 0,
      excludedAccounts,
    });
  });

  return app;
}
