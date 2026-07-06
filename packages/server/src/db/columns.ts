import { customType } from "drizzle-orm/sqlite-core";

/**
 * Integer minor units as SQLite INTEGER (full int64), surfaced as bigint
 * (invariant #1: money is bigint minor units, never floats).
 *
 * Writes bind BigInt natively, so stored values are always exact int64.
 * Reads arrive as JS numbers (we deliberately do NOT enable safeIntegers
 * db-wide — it would leak bigints into session/webauthn columns). A number
 * past 2^53 has already lost precision, so refuse it loudly rather than
 * return corrupted money. 2^53 minor units ≈ $90 trillion; the guard exists
 * for correctness, not because the household will hit it.
 *
 * SQL aggregates (SUM) bypass column types entirely — route those through
 * the same guard via toBigIntStrict in lib/wire.ts.
 */
export const minorInt = customType<{ data: bigint; driverData: number | bigint }>({
  dataType: () => "integer",
  toDriver: (value: bigint) => value,
  fromDriver: (value) => {
    if (typeof value === "bigint") return value;
    if (!Number.isSafeInteger(value)) {
      throw new Error(`amount_minor ${value} exceeds safe integer precision — refusing lossy read`);
    }
    return BigInt(value);
  },
});
