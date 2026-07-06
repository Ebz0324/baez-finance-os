import { describe, expect, it, beforeEach } from "vitest";
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { openDb, type Db } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import { users, webauthnCredentials } from "../src/db/schema.js";
import { authRoutes } from "../src/routes/auth.js";
import {
  generateSessionToken,
  createSession,
  validateSessionToken,
  invalidateSession,
} from "../src/auth/session.js";

function freshDb(): Db {
  const db = openDb(":memory:");
  runMigrations(db);
  seed(db);
  return db;
}

describe("session helpers", () => {
  it("creates, validates, and invalidates a session", () => {
    const db = freshDb();
    const row = db.select().from(users).all().find((u) => u.name === "Eimer")!;

    const token = generateSessionToken();
    createSession(db, token, row.id);

    const validated = validateSessionToken(db, token);
    expect(validated?.user.id).toBe(row.id);

    invalidateSession(db, token);
    expect(validateSessionToken(db, token)).toBeNull();
  });
});

describe("auth routes", () => {
  let db: Db;
  let app: Hono;

  beforeEach(() => {
    db = freshDb();
    app = new Hono().route("/api/auth", authRoutes(db));
  });

  it("404s setup/options for an unknown name", async () => {
    const res = await app.request("/api/auth/setup/options", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Nobody" }),
    });
    expect(res.status).toBe(404);
  });

  it("200s setup/options for a known, not-yet-registered user and sets a challenge cookie", async () => {
    const res = await app.request("/api/auth/setup/options", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Eimer" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/wa_challenge=/);
  });

  it("409s setup/options once a credential already exists", async () => {
    const user = db.select().from(users).all().find((u) => u.name === "Eimer")!;
    db.insert(webauthnCredentials)
      .values({
        id: "fake-credential-id",
        userId: user.id,
        publicKey: Buffer.from("fake"),
        counter: 0,
        transports: null,
        createdAt: new Date().toISOString(),
      })
      .run();

    const res = await app.request("/api/auth/setup/options", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Eimer" }),
    });
    expect(res.status).toBe(409);
  });

  it("401s login/verify for an unrecognized credential id", async () => {
    const optionsRes = await app.request("/api/auth/login/options", { method: "POST" });
    const cookie = optionsRes.headers.get("set-cookie")!;

    const res = await app.request("/api/auth/login/verify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: cookie.split(";")[0]!,
      },
      body: JSON.stringify({ response: { id: randomUUID() } }),
    });
    expect(res.status).toBe(401);
  });

  it("401s /me without a session cookie", async () => {
    const res = await app.request("/api/auth/me");
    expect(res.status).toBe(401);
  });
});
