import { index, integer, real, sqliteTable, text, blob, unique } from "drizzle-orm/sqlite-core";
import { minorInt } from "./columns";

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
  // Scope switcher preference (DESIGN §3): pure filter, persists per user.
  defaultScope: text("default_scope", { enum: ["me", "partner", "household"] })
    .notNull()
    .default("household"),
  // Quick add remembers the last currency toggle per user (DESIGN §4).
  quickAddCurrency: text("quick_add_currency", { enum: ["USD", "DOP"] }),
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

// --- M1: the ledger (DESIGN §5) ---

export const ACCOUNT_KINDS = [
  "checking",
  "savings",
  "cash",
  "card",
  "cd",
  "brokerage",
  "retirement",
  "property",
  "vehicle",
  "liability",
  "custom",
] as const;

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  kind: text("kind", { enum: ACCOUNT_KINDS }).notNull(),
  currency: text("currency", { enum: ["USD", "DOP"] }).notNull(),
  scope: text("scope", { enum: ["me", "partner", "household"] }).notNull(),
  lockedThrough: text("locked_through"), // YYYY-MM-DD; enforcement arrives in M2
  // Saved CSV column mapping (JSON CsvMapping) — set on first import.
  csvMapping: text("csv_mapping"),
  createdAt: text("created_at").notNull(),
});

export const statements = sqliteTable(
  "statements",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    openingMinor: minorInt("opening_minor").notNull(),
    closingMinor: minorInt("closing_minor").notNull(),
    // sha256 of the imported file content — duplicate-import protection.
    fileRef: text("file_ref").notNull(),
    status: text("status", {
      enum: ["uploaded", "parsed", "in_review", "reconciled", "failed"],
    }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [unique().on(t.accountId, t.periodStart, t.periodEnd)],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(), // client-generated UUID for quick add (idempotent replay)
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    statementId: text("statement_id").references(() => statements.id),
    categoryId: text("category_id").references(() => categories.id),
    postedOn: text("posted_on").notNull(), // YYYY-MM-DD
    amountMinor: minorInt("amount_minor").notNull(), // signed; single-entry ledger
    currency: text("currency", { enum: ["USD", "DOP"] }).notNull(),
    merchantRaw: text("merchant_raw"),
    merchantNorm: text("merchant_norm"),
    catSource: text("cat_source", { enum: ["rule", "ai", "user"] }),
    confidence: real("confidence"),
    transferGroup: text("transfer_group"), // two legs share this; excluded from spending (UI in M2)
    supersededBy: text("superseded_by"), // corrections supersede, never edit (invariant #4)
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("transactions_account_posted_idx").on(t.accountId, t.postedOn),
    index("transactions_category_idx").on(t.categoryId),
  ],
);

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["expense", "income", "transfer"] }).notNull(),
});

export const merchantRules = sqliteTable("merchant_rules", {
  // Table ships in M1 for schema completeness; population starts in M2.
  id: text("id").primaryKey(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id),
  pattern: text("pattern").notNull(),
  scope: text("scope"),
  hitCount: integer("hit_count").notNull().default(0),
  lastUsed: text("last_used"),
});

export const fxRates = sqliteTable(
  "fx_rates",
  {
    rateDate: text("rate_date").notNull(), // YYYY-MM-DD
    pair: text("pair").notNull(), // e.g. "USD/DOP"
    // Exact decimal string (e.g. "59.104456") — never a float (invariant #1 spirit).
    rate: text("rate").notNull(),
    source: text("source", { enum: ["api", "manual"] }).notNull(),
    fetchedAt: text("fetched_at").notNull(),
  },
  (t) => [unique().on(t.rateDate, t.pair)],
);
