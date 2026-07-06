import { minor, minorPerMajor, type CurrencyCode, type Minor } from "./types.js";

export function addMinor(a: Minor, b: Minor): Minor {
  return minor(a + b);
}

export function sumMinor(values: Iterable<Minor>): Minor {
  let total = 0n;
  for (const v of values) total += v;
  return minor(total);
}

export function negateMinor(value: Minor): Minor {
  return minor(-value);
}

const WIRE_RE = /^-?\d+$/;

/** Wire format: decimal string ("-12345"). Throws on anything else. */
export function minorFromString(raw: string): Minor {
  if (!WIRE_RE.test(raw)) {
    throw new Error(`not an integer minor-unit string: ${JSON.stringify(raw)}`);
  }
  return minor(BigInt(raw));
}

export function minorToString(value: Minor): string {
  return value.toString();
}

/** Human display, e.g. formatMinor(-123456n, "USD") → "-$1,234.56". */
export function formatMinor(value: Minor, code: CurrencyCode, locale = "en-US"): string {
  const scale = BigInt(minorPerMajor(code));
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const major = abs / scale;
  const cents = abs % scale;
  // Build from bigint parts — Number() only ever sees the sub-unit remainder.
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const parts = formatter.formatToParts(0);
  const rebuilt = parts
    .map((p) => {
      switch (p.type) {
        case "integer":
          return groupDigits(major.toString(), locale);
        case "fraction":
          return cents.toString().padStart(2, "0");
        default:
          return p.value;
      }
    })
    .join("");
  return negative ? `-${rebuilt}` : rebuilt;
}

function groupDigits(digits: string, locale: string): string {
  const sample = new Intl.NumberFormat(locale).formatToParts(1234567);
  const sep = sample.find((p) => p.type === "group")?.value ?? ",";
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    const fromEnd = digits.length - i;
    if (i > 0 && fromEnd % 3 === 0) out += sep;
    out += digits[i];
  }
  return out;
}
