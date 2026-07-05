import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { users, webauthnCredentials } from "../db/schema.js";
import {
  setChallengeCookie,
  readChallengeCookie,
  clearChallengeCookie,
  buildRegistrationOptions,
  checkRegistration,
  buildAuthenticationOptions,
  checkAuthentication,
} from "../auth/webauthn.js";
import {
  generateSessionToken,
  createSession,
  validateSessionToken,
  invalidateSession,
  setSessionCookie,
  clearSessionCookie,
  getSessionToken,
} from "../auth/session.js";

function publicUser(u: { id: string; name: string; role: string }) {
  return { id: u.id, name: u.name, role: u.role };
}

export function authRoutes(db: Db) {
  const app = new Hono();

  // --- one-time passkey bootstrap for the two seeded household members ---

  app.post("/setup/options", async (c) => {
    const { name } = await c.req.json<{ name?: string }>();
    if (!name) return c.json({ error: "name required" }, 400);

    const user = db.select().from(users).where(eq(users.name, name)).get();
    if (!user) return c.json({ error: "unknown user" }, 404);

    const existing = db
      .select()
      .from(webauthnCredentials)
      .where(eq(webauthnCredentials.userId, user.id))
      .get();
    if (existing) return c.json({ error: "already registered" }, 409);

    const options = await buildRegistrationOptions(user.id, user.name);
    setChallengeCookie(c, { challenge: options.challenge, userId: user.id });
    return c.json(options);
  });

  app.post("/setup/verify", async (c) => {
    const { response } = await c.req.json();
    const pending = readChallengeCookie(c);
    if (!pending?.userId) return c.json({ error: "no pending setup" }, 400);

    const user = db.select().from(users).where(eq(users.id, pending.userId)).get();
    if (!user) return c.json({ error: "unknown user" }, 404);

    const existing = db
      .select()
      .from(webauthnCredentials)
      .where(eq(webauthnCredentials.userId, user.id))
      .get();
    if (existing) return c.json({ error: "already registered" }, 409);

    let verification;
    try {
      verification = await checkRegistration(response, pending.challenge);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
    clearChallengeCookie(c);

    if (!verification.verified || !verification.registrationInfo) {
      return c.json({ error: "verification failed" }, 400);
    }

    const { credential } = verification.registrationInfo;
    db.insert(webauthnCredentials)
      .values({
        id: credential.id,
        userId: user.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ? JSON.stringify(credential.transports) : null,
        createdAt: new Date().toISOString(),
      })
      .run();

    const token = generateSessionToken();
    createSession(db, token, user.id);
    setSessionCookie(c, token);

    return c.json({ user: publicUser(user) });
  });

  // --- login: discoverable-credential (usernameless) passkey login ---

  app.post("/login/options", async (c) => {
    const options = await buildAuthenticationOptions();
    setChallengeCookie(c, { challenge: options.challenge });
    return c.json(options);
  });

  app.post("/login/verify", async (c) => {
    const { response } = await c.req.json();
    const pending = readChallengeCookie(c);
    if (!pending) return c.json({ error: "no pending login" }, 400);

    const cred = db
      .select()
      .from(webauthnCredentials)
      .where(eq(webauthnCredentials.id, response.id))
      .get();
    if (!cred) return c.json({ error: "unknown credential" }, 401);

    const user = db.select().from(users).where(eq(users.id, cred.userId)).get();
    if (!user) return c.json({ error: "unknown user" }, 401);

    let verification;
    try {
      verification = await checkAuthentication(response, pending.challenge, {
        id: cred.id,
        publicKey: cred.publicKey,
        counter: cred.counter,
        transports: cred.transports ? JSON.parse(cred.transports) : undefined,
      });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
    clearChallengeCookie(c);

    if (!verification.verified) {
      return c.json({ error: "verification failed" }, 401);
    }

    db.update(webauthnCredentials)
      .set({ counter: verification.authenticationInfo.newCounter })
      .where(eq(webauthnCredentials.id, cred.id))
      .run();

    const token = generateSessionToken();
    createSession(db, token, user.id);
    setSessionCookie(c, token);

    return c.json({ user: publicUser(user) });
  });

  app.post("/logout", async (c) => {
    const token = getSessionToken(c);
    if (token) invalidateSession(db, token);
    clearSessionCookie(c);
    return c.json({ ok: true });
  });

  app.get("/me", async (c) => {
    const token = getSessionToken(c);
    if (!token) return c.json({ error: "unauthenticated" }, 401);
    const row = validateSessionToken(db, token);
    if (!row) return c.json({ error: "unauthenticated" }, 401);
    return c.json({ user: publicUser(row.user) });
  });

  return app;
}
