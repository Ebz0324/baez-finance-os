import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { users } from "../db/schema.js";
import { requireAuth, type AuthEnv } from "../auth/middleware.js";
import { WireError, parseEnum } from "../lib/wire.js";

export function meRoutes(db: Db) {
  const app = new Hono<AuthEnv>();
  app.use("*", requireAuth(db));

  app.patch("/", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }

    try {
      const updates: Partial<{
        defaultScope: "me" | "partner" | "household";
        quickAddCurrency: "USD" | "DOP";
      }> = {};
      if (body.defaultScope !== undefined) {
        updates.defaultScope = parseEnum(
          body.defaultScope,
          ["me", "partner", "household"] as const,
          "defaultScope",
        );
      }
      if (body.quickAddCurrency !== undefined) {
        updates.quickAddCurrency = parseEnum(
          body.quickAddCurrency,
          ["USD", "DOP"] as const,
          "quickAddCurrency",
        );
      }
      if (Object.keys(updates).length === 0) {
        return c.json({ error: "nothing to update" }, 400);
      }
      db.update(users).set(updates).where(eq(users.id, c.var.user.id)).run();
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof WireError) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  return app;
}
