// Branded primitives — invariant #1: money is integer minor units + ISO
// currency code, everywhere, always. The brands make it a type error to pass
// a bare bigint/string where money is expected.

declare const MinorBrand: unique symbol;
declare const CurrencyBrand: unique symbol;
declare const IsoDateBrand: unique symbol;

/** Integer minor units (cents, centavos). Signed. */
export type Minor = bigint & { readonly [MinorBrand]: true };

/** ISO 4217 code. The household uses exactly these two. */
export type CurrencyCode = ("USD" | "DOP") & { readonly [CurrencyBrand]: true };

/** Calendar date as YYYY-MM-DD. */
export type IsoDate = string & { readonly [IsoDateBrand]: true };

export function minor(value: bigint | number): Minor {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`minor(): ${value} is not a safe integer`);
    }
    return BigInt(value) as Minor;
  }
  return value as Minor;
}

const CURRENCIES = new Set(["USD", "DOP"]);

export function currency(code: string): CurrencyCode {
  if (!CURRENCIES.has(code)) {
    throw new Error(`unsupported currency: ${code}`);
  }
  return code as CurrencyCode;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isoDate(value: string): IsoDate {
  if (!ISO_DATE_RE.test(value)) {
    throw new Error(`not a YYYY-MM-DD date: ${value}`);
  }
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new Error(`not a real calendar date: ${value}`);
  }
  return value as IsoDate;
}

/** Minor units per major unit. Both household currencies use 2 decimals. */
export function minorPerMajor(_code: CurrencyCode): number {
  return 100;
}
