import { createMiddleware } from "hono/factory";
import type { Db } from "../db/client.js";
import { getSessionToken, validateSessionToken } from "./session.js";

export type AuthedUser = {
  id: string;
  name: string;
  role: "operator" | "partner";
  householdId: string;
  defaultScope: "me" | "partner" | "household";
  quickAddCurrency: "USD" | "DOP" | null;
};

export type AuthEnv = { Variables: { user: AuthedUser } };

/** Rejects unauthenticated requests; downstream handlers get c.var.user. */
export function requireAuth(db: Db) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const token = getSessionToken(c);
    if (!token) return c.json({ error: "unauthenticated" }, 401);
    const row = validateSessionToken(db, token);
    if (!row) return c.json({ error: "unauthenticated" }, 401);
    c.set("user", {
      id: row.user.id,
      name: row.user.name,
      role: row.user.role,
      householdId: row.user.householdId,
      defaultScope: row.user.defaultScope,
      quickAddCurrency: row.user.quickAddCurrency,
    });
    await next();
  });
}
