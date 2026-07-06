import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { parseDecimal } from "@baez/engine";
import type { Db } from "../db/client.js";
import { fxRates } from "../db/schema.js";
import { requireAuth, type AuthEnv } from "../auth/middleware.js";
import { WireError } from "../lib/wire.js";

const PAIR = "USD/DOP";

/** Latest rate on file for the household's one currency pair, or null. */
export function latestFxRate(db: Db): { rate: string; rateDate: string; source: string } | null {
  const row = db
    .select()
    .from(fxRates)
    .where(eq(fxRates.pair, PAIR))
    .orderBy(desc(fxRates.rateDate))
    .limit(1)
    .get();
  return row ? { rate: row.rate, rateDate: row.rateDate, source: row.source } : null;
}

export function fxRoutes(db: Db) {
  const app = new Hono<AuthEnv>();
  app.use("*", requireAuth(db));

  app.get("/rate", (c) => {
    const rate = latestFxRate(db);
    return c.json(rate ?? { rate: null, rateDate: null, source: null });
  });

  app.post("/rate", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }

    try {
      if (typeof body.rate !== "string") throw new WireError("rate required");
      let parsed;
      try {
        parsed = parseDecimal(body.rate);
      } catch {
        throw new WireError("rate must be a plain decimal like 59.10");
      }
      if (parsed.mantissa <= 0n) throw new WireError("rate must be positive");

      const rateDate = new Date().toISOString().slice(0, 10);
      const now = new Date().toISOString();
      db.insert(fxRates)
        .values({ rateDate, pair: PAIR, rate: body.rate, source: "manual", fetchedAt: now })
        .onConflictDoUpdate({
          target: [fxRates.rateDate, fxRates.pair],
          set: { rate: body.rate, source: "manual", fetchedAt: now },
        })
        .run();

      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof WireError) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  return app;
}
