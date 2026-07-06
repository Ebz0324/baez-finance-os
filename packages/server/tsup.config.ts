import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  // Bundle the workspace engine (source-only package) into the server
  // artifact; leave real deps — especially better-sqlite3's native binding —
  // external to be resolved from node_modules at runtime.
  noExternal: ["@baez/engine"],
});
