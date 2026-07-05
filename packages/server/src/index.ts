import { existsSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { config } from "./config.js";
import { openDb, ensureSchema } from "./db/client.js";
import { seed } from "./db/seed.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";

const db = openDb();
ensureSchema(db);
seed(db); // idempotent — safe to run on every boot

const app = new Hono();

app.route("/api/health", healthRoutes);
app.route("/api/auth", authRoutes(db));

// In production the built PWA is copied alongside this server (see Dockerfile)
// and served from the same origin/container — no separate static host, no CORS.
const STATIC_DIR = join(process.cwd(), "public");
if (existsSync(STATIC_DIR)) {
  app.use("/*", serveStatic({ root: "./public" }));
  app.get("*", serveStatic({ path: "./public/index.html" }));
}

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`server listening on http://localhost:${info.port}`);
});
