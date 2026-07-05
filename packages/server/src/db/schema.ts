import { sqliteTable, text, integer, blob } from "drizzle-orm/sqlite-core";

// M0 scope: only what passkey auth needs. The full household data model
// (accounts, statements, transactions, envelopes, ...) lands in M1 per DESIGN.md §5.

export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  baseCurrency: text("base_currency").notNull().default("USD"),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id),
  name: text("name").notNull(),
  role: text("role", { enum: ["operator", "partner"] }).notNull(),
  createdAt: text("created_at").notNull(),
});

export const webauthnCredentials = sqliteTable("webauthn_credentials", {
  // WebAuthn credential ID, base64url — globally unique, used as PK.
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  publicKey: blob("public_key", { mode: "buffer" }).notNull(),
  counter: integer("counter").notNull(),
  transports: text("transports"), // JSON array, nullable
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  // SHA-256 hash of the session token — the raw token only ever lives in the cookie.
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expires_at").notNull(), // epoch ms
});
