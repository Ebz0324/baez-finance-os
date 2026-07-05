import { randomBytes, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Db } from "../db/client.js";
import { sessions, users } from "../db/schema.js";
import { config } from "../config.js";

// Hand-rolled cookie sessions following Lucia's reference pattern (the `lucia`
// package itself is no longer a dependency we take on — see M0 plan notes).

const SESSION_COOKIE = "session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000; // renew if <15 days left

export function generateSessionToken(): string {
  return randomBytes(20).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSession(db: Db, token: string, userId: string) {
  const session = {
    id: hashToken(token),
    userId,
    expiresAt: Date.now() + SESSION_DURATION_MS,
  };
  db.insert(sessions).values(session).run();
  return session;
}

export function validateSessionToken(db: Db, token: string) {
  const id = hashToken(token);
  const row = db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id))
    .get();

  if (!row) return null;

  if (Date.now() >= row.session.expiresAt) {
    db.delete(sessions).where(eq(sessions.id, id)).run();
    return null;
  }

  if (row.session.expiresAt - Date.now() < RENEW_THRESHOLD_MS) {
    const expiresAt = Date.now() + SESSION_DURATION_MS;
    db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id)).run();
    row.session.expiresAt = expiresAt;
  }

  return row;
}

export function invalidateSession(db: Db, token: string) {
  db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
}

export function setSessionCookie(c: Context, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export function getSessionToken(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}
