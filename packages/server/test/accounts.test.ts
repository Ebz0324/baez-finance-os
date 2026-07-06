import { describe, expect, it, beforeEach } from "vitest";
import { Hono } from "hono";
import { openDb, type Db } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import { users } from "../src/db/schema.js";
import { accountsRoutes } from "../src/routes/accounts.js";
import { meRoutes } from "../src/routes/me.js";
import { authRoutes } from "../src/routes/auth.js";
import { generateSessionToken, createSession } from "../src/auth/session.js";

let db: Db;
let app: Hono;
let eimerCookie: string;
let ashleyCookie: string;

function login(userId: string): string {
  const token = generateSessionToken();
  createSession(db, token, userId);
  return `session=${token}`;
}

beforeEach(() => {
  db = openDb(":memory:");
  runMigrations(db);
  seed(db);
  app = new Hono()
    .route("/api/auth", authRoutes(db))
    .route("/api/accounts", accountsRoutes(db))
    .route("/api/me", meRoutes(db));

  const all = db.select().from(users).all();
  eimerCookie = login(all.find((u) => u.name === "Eimer")!.id);
  ashleyCookie = login(all.find((u) => u.name === "Ashley")!.id);
});

function post(path: string, cookie: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

describe("accounts", () => {
  it("401s without a session", async () => {
    const res = await app.request("/api/accounts");
    expect(res.status).toBe(401);
  });

  it("creates an account and lists it with a zero balance", async () => {
    const created = await post("/api/accounts", eimerCookie, {
      name: "Popular checking",
      kind: "checking",
      currency: "DOP",
      whose: "me",
    });
    expect(created.status).toBe(201);

    const res = await app.request("/api/accounts?scope=me", {
      headers: { cookie: eimerCookie },
    });
    const { accounts } = await res.json();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].name).toBe("Popular checking");
    expect(accounts[0].balanceMinor).toBe("0");
    expect(accounts[0].lastActivityOn).toBeNull();
  });

  it("anchors an opening balance so balance = Σ transactions", async () => {
    await post("/api/accounts", eimerCookie, {
      name: "Chase",
      kind: "checking",
      currency: "USD",
      whose: "me",
      openingBalanceMinor: "250000",
    });
    const res = await app.request("/api/accounts?scope=me", {
      headers: { cookie: eimerCookie },
    });
    const { accounts } = await res.json();
    expect(accounts[0].balanceMinor).toBe("250000");
    expect(accounts[0].lastActivityOn).not.toBeNull();
  });

  it("scope filter: household sees all, me/partner split by owner", async () => {
    await post("/api/accounts", eimerCookie, {
      name: "Eimer checking", kind: "checking", currency: "USD", whose: "me",
    });
    await post("/api/accounts", eimerCookie, {
      name: "Ashley cash", kind: "cash", currency: "DOP", whose: "partner",
    });
    await post("/api/accounts", eimerCookie, {
      name: "Joint savings", kind: "savings", currency: "USD", whose: "shared",
    });

    const household = await (
      await app.request("/api/accounts?scope=household", { headers: { cookie: eimerCookie } })
    ).json();
    expect(household.accounts).toHaveLength(3);

    const mine = await (
      await app.request("/api/accounts?scope=me", { headers: { cookie: eimerCookie } })
    ).json();
    expect(mine.accounts.map((a: { name: string }) => a.name)).toEqual(["Eimer checking"]);

    const partner = await (
      await app.request("/api/accounts?scope=partner", { headers: { cookie: eimerCookie } })
    ).json();
    expect(partner.accounts.map((a: { name: string }) => a.name)).toEqual(["Ashley cash"]);

    // Same data through Ashley's eyes: her "me" is Eimer's "partner".
    const ashleyMine = await (
      await app.request("/api/accounts?scope=me", { headers: { cookie: ashleyCookie } })
    ).json();
    expect(ashleyMine.accounts.map((a: { name: string }) => a.name)).toEqual(["Ashley cash"]);
  });

  it("defaults the list scope to the user's saved preference", async () => {
    await post("/api/accounts", eimerCookie, {
      name: "Eimer checking", kind: "checking", currency: "USD", whose: "me",
    });
    const patch = await app.request("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: eimerCookie },
      body: JSON.stringify({ defaultScope: "me" }),
    });
    expect(patch.status).toBe(200);

    // No scope param → uses defaultScope (now "me").
    const res = await app.request("/api/accounts", { headers: { cookie: eimerCookie } });
    const { accounts } = await res.json();
    expect(accounts).toHaveLength(1);

    const me = await (
      await app.request("/api/auth/me", { headers: { cookie: eimerCookie } })
    ).json();
    expect(me.user.defaultScope).toBe("me");
  });

  it("rejects bad input with 400", async () => {
    for (const body of [
      { name: "", kind: "checking", currency: "USD", whose: "me" },
      { name: "x", kind: "yacht", currency: "USD", whose: "me" },
      { name: "x", kind: "checking", currency: "EUR", whose: "me" },
      { name: "x", kind: "checking", currency: "USD", whose: "them" },
      { name: "x", kind: "checking", currency: "USD", whose: "me", openingBalanceMinor: "12.5" },
    ]) {
      const res = await post("/api/accounts", eimerCookie, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("refuses to delete an account with transactions", async () => {
    await post("/api/accounts", eimerCookie, {
      name: "Chase", kind: "checking", currency: "USD", whose: "me", openingBalanceMinor: "100",
    });
    const list = await (
      await app.request("/api/accounts?scope=me", { headers: { cookie: eimerCookie } })
    ).json();
    const res = await app.request(`/api/accounts/${list.accounts[0].id}`, {
      method: "DELETE",
      headers: { cookie: eimerCookie },
    });
    expect(res.status).toBe(403);
  });

  it("deletes an empty account", async () => {
    await post("/api/accounts", eimerCookie, {
      name: "Empty", kind: "savings", currency: "USD", whose: "me",
    });
    const list = await (
      await app.request("/api/accounts?scope=me", { headers: { cookie: eimerCookie } })
    ).json();
    const res = await app.request(`/api/accounts/${list.accounts[0].id}`, {
      method: "DELETE",
      headers: { cookie: eimerCookie },
    });
    expect(res.status).toBe(200);
  });
});
