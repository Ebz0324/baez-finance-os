/** Wire helpers: bigint money crosses HTTP as decimal strings (invariant #1). */

const INT_RE = /^-?\d+$/;

export function parseMinorString(raw: unknown, field: string): bigint {
  if (typeof raw !== "string" || !INT_RE.test(raw)) {
    throw new WireError(`${field} must be an integer string of minor units`);
  }
  return BigInt(raw);
}

/**
 * Guard for SQL aggregate results (SUM bypasses column types): SQLite hands
 * back a JS number that loses precision past 2^53 — refuse it loudly.
 */
export function toBigIntStrict(value: unknown, context: string): bigint {
  if (typeof value === "bigint") return value;
  if (value === null || value === undefined) return 0n;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${context}: ${value} exceeds safe integer precision`);
    }
    return BigInt(value);
  }
  throw new Error(`${context}: unexpected ${typeof value}`);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDate(raw: unknown, field: string): string {
  if (typeof raw !== "string" || !ISO_DATE_RE.test(raw)) {
    throw new WireError(`${field} must be a YYYY-MM-DD date`);
  }
  const [y, m, d] = raw.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new WireError(`${field} is not a real calendar date`);
  }
  return raw;
}

export function parseEnum<T extends string>(
  raw: unknown,
  values: readonly T[],
  field: string,
): T {
  if (typeof raw !== "string" || !(values as readonly string[]).includes(raw)) {
    throw new WireError(`${field} must be one of: ${values.join(", ")}`);
  }
  return raw as T;
}

export function parseNonEmptyString(raw: unknown, field: string, maxLength = 120): string {
  if (typeof raw !== "string" || raw.trim().length === 0 || raw.length > maxLength) {
    throw new WireError(`${field} must be a non-empty string (max ${maxLength} chars)`);
  }
  return raw.trim();
}

/** 400-worthy input problem — route handlers translate to c.json({error}, 400). */
export class WireError extends Error {}
