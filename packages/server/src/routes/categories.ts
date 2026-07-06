import { Hono } from "hono";
import { and, eq, gte, isNotNull, ne } from "drizzle-orm";
import { rankFrequentCategories, isoDate, type CategoryUse } from "@baez/engine";
import type { Db } from "../db/client.js";
import { categories, transactions } from "../db/schema.js";
import { requireAuth, type AuthEnv } from "../auth/middleware.js";

const CHIP_LIMIT = 6;
const WINDOW_DAYS = 90;

export function categoriesRoutes(db: Db) {
  const app = new Hono<AuthEnv>();
  app.use("*", requireAuth(db));

  app.get("/", (c) => {
    const rows = db.select().from(categories).all();
    return c.json({ categories: rows });
  });

  app.get("/frequent", (c) => {
    const today = new Date().toISOString().slice(0, 10);
    const cutoff = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

    // Spending chips only — transfers (incl. opening anchors) never rank.
    const expenseCategoryIds = new Set(
      db.select({ id: categories.id }).from(categories).where(ne(categories.kind, "transfer")).all()
        .map((r) => r.id),
    );

    const load = (own: boolean): CategoryUse[] =>
      db
        .select({ categoryId: transactions.categoryId, postedOn: transactions.postedOn })
        .from(transactions)
        .where(
          and(
            isNotNull(transactions.categoryId),
            gte(transactions.postedOn, cutoff),
            ...(own ? [eq(transactions.createdBy, c.var.user.id)] : []),
          ),
        )
        .all()
        .filter((r) => expenseCategoryIds.has(r.categoryId!))
        .map((r) => ({ categoryId: r.categoryId!, postedOn: isoDate(r.postedOn) }));

    // Rank the caller's own usage first; pad from household-wide usage.
    let ranked = rankFrequentCategories(load(true), {
      limit: CHIP_LIMIT,
      windowDays: WINDOW_DAYS,
      today: isoDate(today),
    });
    if (ranked.length < CHIP_LIMIT) {
      const household = rankFrequentCategories(load(false), {
        limit: CHIP_LIMIT,
        windowDays: WINDOW_DAYS,
        today: isoDate(today),
      });
      for (const id of household) {
        if (ranked.length >= CHIP_LIMIT) break;
        if (!ranked.includes(id)) ranked = [...ranked, id];
      }
    }

    const byId = new Map(db.select().from(categories).all().map((r) => [r.id, r]));
    return c.json({
      categories: ranked.flatMap((id) => {
        const cat = byId.get(id);
        return cat ? [{ id: cat.id, name: cat.name, kind: cat.kind }] : [];
      }),
    });
  });

  return app;
}
