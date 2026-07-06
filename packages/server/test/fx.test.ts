import { describe, expect, it, beforeEach } from "vitest";
import { Hono } from "hono";
import { openDb, type Db } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import { users } from "../src/db/schema.js";
import { fxRoutes } from "../src/routes/fx.js";
import { generateSessionToken, createSession } from "../src/auth/session.js";

let db: Db;
let app: Hono;
let cookie: string;

beforeEach(() => {
  db = openDb(":memory:");
  runMigrations(db);
  seed(db);
  app = new Hono().route("/api/fx", fxRoutes(db));

  const eimer = db.select().from(users).all().find((u) => u.name === "Eimer")!;
  const token = generateSessionToken();
  createSession(db, token, eimer.id);
  cookie = `session=${token}`;
});

function post(rate: unknown) {
  return app.request("/api/fx/rate", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ rate }),
  });
}

describe("fx rate", () => {
  it("401s without a session", async () => {
    const res = await app.request("/api/fx/rate");
    expect(res.status).toBe(401);
  });

  it("returns null when no rate is on file", async () => {
    const res = await app.request("/api/fx/rate", { headers: { cookie } });
    const body = await res.json();
    expect(body.rate).toBeNull();
  });

  it("records a manual rate and returns it as the latest", async () => {
    const posted = await post("59.10");
    expect(posted.status).toBe(200);

    const res = await app.request("/api/fx/rate", { headers: { cookie } });
    const body = await res.json();
    expect(body.rate).toBe("59.10");
    expect(body.source).toBe("manual");
  });

  it("re-entering a rate the same day updates it instead of erroring", async () => {
    await post("59.10");
    const second = await post("60.00");
    expect(second.status).toBe(200);

    const res = await app.request("/api/fx/rate", { headers: { cookie } });
    const body = await res.json();
    expect(body.rate).toBe("60.00");
  });

  it("rejects a non-decimal rate with 400", async () => {
    for (const bad of ["", "abc", "-5", "0", "1,5"]) {
      const res = await post(bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
  });
});
