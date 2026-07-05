import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { healthRoutes } from "../src/routes/health.js";

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const app = new Hono().route("/api/health", healthRoutes);
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
