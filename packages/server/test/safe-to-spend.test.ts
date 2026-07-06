import { describe, expect, it, beforeEach } from "vitest";
import { Hono } from "hono";
import { openDb, type Db } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import { users } from "../src/db/schema.js";
import { accountsRoutes } from "../src/routes/accounts.js";
import { fxRoutes } from "../src/routes/fx.js";
import { safeToSpendRoutes } from "../src/routes/safe-to-spend.js";
import { generateSessionToken, createSession } from "../src/auth/session.js";

let db: Db;
let app: Hono;
let cookie: string;

beforeEach(() => {
  db = openDb(":memory:");
  runMigrations(db);
  seed(db);
  app = new Hono()
    .route("/api/accounts", accountsRoutes(db))
    .route("/api/fx", fxRoutes(db))
    .route("/api/safe-to-spend", safeToSpendRoutes(db));

  const eimer = db.select().from(users).all().find((u) => u.name === "Eimer")!;
  const token = generateSessionToken();
  createSession(db, token, eimer.id);
  cookie = `session=${token}`;
});

function post(path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

function get(path: string) {
  return app.request(path, { headers: { cookie } });
}

describe("safe to spend", () => {
  it("401s without a session", async () => {
    const res = await app.request("/api/safe-to-spend");
    expect(res.status).toBe(401);
  });

  it("empty household: zero, not a crash", async () => {
    const res = await get("/api/safe-to-spend?scope=household");
    const body = await res.json();
    expect(body.availableMinor).toBe("0");
    expect(body.accountCount).toBe(0);
    expect(body.dataThrough).toBeNull();
    expect(body.needsRate).toBe(false);
  });

  it("sums same-currency liquid accounts, excludes non-liquid kinds", async () => {
    await post("/api/accounts", {
      name: "Chase", kind: "checking", currency: "USD", whose: "me", openingBalanceMinor: "150000",
    });
    await post("/api/accounts", {
      name: "Card", kind: "card", currency: "USD", whose: "me", openingBalanceMinor: "-50000",
    });
    const res = await get("/api/safe-to-spend?scope=household");
    const body = await res.json();
    expect(body.availableMinor).toBe("150000");
    expect(body.accountCount).toBe(1);
    expect(body.needsRate).toBe(false);
  });

  it("excludes a foreign-currency liquid account and flags needsRate when no rate is on file", async () => {
    await post("/api/accounts", {
      name: "Chase", kind: "checking", currency: "USD", whose: "me", openingBalanceMinor: "100000",
    });
    await post("/api/accounts", {
      name: "Ashley cash", kind: "cash", currency: "DOP", whose: "partner", openingBalanceMinor: "600000",
    });
    const res = await get("/api/safe-to-spend?scope=household");
    const body = await res.json();
    expect(body.availableMinor).toBe("100000");
    expect(body.needsRate).toBe(true);
    expect(body.excludedAccounts).toHaveLength(1);
    expect(body.excludedAccounts[0].name).toBe("Ashley cash");
  });

  it("includes the foreign-currency account once a manual rate is on file", async () => {
    await post("/api/accounts", {
      name: "Chase", kind: "checking", currency: "USD", whose: "me", openingBalanceMinor: "100000",
    });
    await post("/api/accounts", {
      name: "Ashley cash", kind: "cash", currency: "DOP", whose: "partner", openingBalanceMinor: "600000",
    });
    await post("/api/fx/rate", { rate: "60" });

    const res = await get("/api/safe-to-spend?scope=household");
    const body = await res.json();
    // $1000.00 + (RD$6,000.00 / 60) = $1000.00 + $100.00
    expect(body.availableMinor).toBe("110000");
    expect(body.needsRate).toBe(false);
    expect(body.excludedAccounts).toHaveLength(0);
  });

  it("scope filters the same as /api/accounts", async () => {
    await post("/api/accounts", {
      name: "Eimer checking", kind: "checking", currency: "USD", whose: "me", openingBalanceMinor: "100000",
    });
    await post("/api/accounts", {
      name: "Ashley cash", kind: "cash", currency: "USD", whose: "partner", openingBalanceMinor: "50000",
    });
    const mine = await (await get("/api/safe-to-spend?scope=me")).json();
    expect(mine.availableMinor).toBe("100000");
    const household = await (await get("/api/safe-to-spend?scope=household")).json();
    expect(household.availableMinor).toBe("150000");
  });
});
