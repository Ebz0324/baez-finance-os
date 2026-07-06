import { createHash, randomUUID } from "node:crypto";
import { Hono } from "hono";
import { and, eq, gte, lte } from "drizzle-orm";
import {
  applyMapping,
  checkBalanceGate,
  minor,
  type CsvMapping,
  type Minor,
} from "@baez/engine";
import type { Db } from "../db/client.js";
import { accounts, categories, statements, transactions } from "../db/schema.js";
import { OPENING_BALANCE_CATEGORY } from "../db/seed.js";
import { requireAuth, type AuthEnv } from "../auth/middleware.js";
import { WireError, parseIsoDate, parseMinorString } from "../lib/wire.js";

export function importsRoutes(db: Db) {
  const app = new Hono<AuthEnv>();
  app.use("*", requireAuth(db));

  /**
   * The single authoritative import endpoint. The client previews with the
   * same engine code for instant feedback; the server re-parses and is the
   * only writer. Nothing persists unless the balance gate passes (invariant #3).
   */
  app.post("/commit", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }

    try {
      const accountId = String(body.accountId ?? "");
      const account = db.select().from(accounts).where(eq(accounts.id, accountId)).get();
      if (!account) return c.json({ error: "unknown account" }, 404);

      if (typeof body.csvText !== "string" || body.csvText.length === 0) {
        throw new WireError("csvText required");
      }
      if (body.csvText.length > 5_000_000) {
        throw new WireError("file too large");
      }
      const mapping = body.mapping as CsvMapping; // validated by parsing below
      if (!mapping || mapping.version !== 1) throw new WireError("mapping.version must be 1");

      const openingMinor = parseMinorString(body.openingMinor, "openingMinor");
      const closingMinor = parseMinorString(body.closingMinor, "closingMinor");
      const periodStart = parseIsoDate(body.periodStart, "periodStart");
      const periodEnd = parseIsoDate(body.periodEnd, "periodEnd");
      if (periodEnd < periodStart) throw new WireError("periodEnd before periodStart");

      // Duplicate protection 1: exact same file already imported for this account.
      const fileRef = createHash("sha256").update(body.csvText).digest("hex");
      const sameFile = db
        .select()
        .from(statements)
        .where(and(eq(statements.accountId, account.id), eq(statements.fileRef, fileRef)))
        .get();
      if (sameFile) {
        return c.json({ error: "this file was already imported for this account" }, 409);
      }

      // Duplicate protection 2: overlapping statement period.
      const overlapping = db
        .select()
        .from(statements)
        .where(
          and(
            eq(statements.accountId, account.id),
            lte(statements.periodStart, periodEnd),
            gte(statements.periodEnd, periodStart),
          ),
        )
        .get();
      if (overlapping) {
        return c.json(
          {
            error: `this period overlaps an existing statement (${overlapping.periodStart} to ${overlapping.periodEnd})`,
          },
          409,
        );
      }

      // Server-side parse — the authority.
      const parsed = applyMapping(body.csvText, mapping);
      if (parsed.errors.length > 0) {
        return c.json(
          { error: "some rows could not be parsed", rowErrors: parsed.errors.slice(0, 20) },
          422,
        );
      }
      if (parsed.rows.length === 0) {
        return c.json({ error: "no transactions found in the file" }, 422);
      }

      // The balance gate (invariant #3): reject to the cent, nothing persists.
      const amounts = parsed.rows.map((r) => r.amountMinor);
      const gate = checkBalanceGate({
        openingMinor: minor(openingMinor),
        closingMinor: minor(closingMinor),
        amounts,
      });
      if (!gate.ok) {
        const sum = amounts.reduce<bigint>((acc, v) => acc + v, 0n);
        return c.json(
          {
            error: "statement does not balance",
            gapMinor: gate.gapMinor.toString(),
            parsedSumMinor: sum.toString(),
            parsedCount: parsed.rows.length,
          },
          422,
        );
      }

      // First statement for the account anchors the opening balance so
      // balance = Σ transactions stays true (D6).
      const hasStatement = db
        .select()
        .from(statements)
        .where(eq(statements.accountId, account.id))
        .get();
      const hasAnyTransaction = db
        .select()
        .from(transactions)
        .where(eq(transactions.accountId, account.id))
        .limit(1)
        .get();
      const needsAnchor = !hasStatement && !hasAnyTransaction && openingMinor !== 0n;

      const statementId = randomUUID();
      const now = new Date().toISOString();
      const user = c.var.user;

      db.transaction((tx) => {
        tx.insert(statements)
          .values({
            id: statementId,
            accountId: account.id,
            periodStart,
            periodEnd,
            openingMinor: minor(openingMinor) as Minor,
            closingMinor: minor(closingMinor) as Minor,
            fileRef,
            status: "reconciled", // the balance equation was verified; locking arrives in M2
            createdAt: now,
          })
          .run();

        if (needsAnchor) {
          const anchorCategory = tx
            .select()
            .from(categories)
            .where(eq(categories.name, OPENING_BALANCE_CATEGORY))
            .get();
          const dayBefore = new Date(new Date(`${periodStart}T00:00:00Z`).getTime() - 86_400_000)
            .toISOString()
            .slice(0, 10);
          tx.insert(transactions)
            .values({
              id: randomUUID(),
              accountId: account.id,
              categoryId: anchorCategory?.id ?? null,
              postedOn: dayBefore,
              amountMinor: minor(openingMinor) as Minor,
              currency: account.currency,
              merchantRaw: "Opening balance",
              merchantNorm: "opening balance",
              catSource: "user",
              createdBy: user.id,
              createdAt: now,
            })
            .run();
        }

        for (const row of parsed.rows) {
          tx.insert(transactions)
            .values({
              id: randomUUID(),
              accountId: account.id,
              statementId,
              postedOn: row.postedOn,
              amountMinor: row.amountMinor,
              currency: account.currency,
              merchantRaw: row.description,
              merchantNorm: row.description.toLowerCase(),
              createdBy: user.id,
              createdAt: now,
            })
            .run();
        }
      });

      if (body.saveMapping === true) {
        db.update(accounts)
          .set({ csvMapping: JSON.stringify(mapping) })
          .where(eq(accounts.id, account.id))
          .run();
      }

      return c.json({
        statementId,
        inserted: parsed.rows.length,
        skipped: parsed.skipped,
        anchored: needsAnchor,
      });
    } catch (err) {
      if (err instanceof WireError) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  return app;
}
