import { minor, type Minor } from "./types.js";

/** Exact decimal: mantissa × 10^-scale. No floats anywhere. */
export type Decimal = { mantissa: bigint; scale: number };

export type NumberFormat = {
  decimalSeparator: "." | ",";
  thousandsSeparator: "," | "." | " " | "'" | "";
  negativeStyle: "minus" | "parens" | "trailingMinus";
};

export const US_NUMBER_FORMAT: NumberFormat = {
  decimalSeparator: ".",
  thousandsSeparator: ",",
  negativeStyle: "minus",
};

export const DO_NUMBER_FORMAT: NumberFormat = {
  decimalSeparator: ",",
  thousandsSeparator: ".",
  negativeStyle: "minus",
};

const PLAIN_DECIMAL_RE = /^(-?)(\d+)(?:\.(\d+))?$/;

/** Parse a plain decimal string like "-1234.56" (dot separator, no grouping). */
export function parseDecimal(raw: string): Decimal {
  const m = PLAIN_DECIMAL_RE.exec(raw);
  if (!m) throw new Error(`not a decimal: ${JSON.stringify(raw)}`);
  const [, sign, whole, frac = ""] = m;
  const mantissa = BigInt(whole + frac) * (sign === "-" ? -1n : 1n);
  return { mantissa, scale: frac.length };
}

/**
 * Parse a bank-statement amount in a given localized format
 * ("1.234,56", "(1,234.56)", "1234.56-", …). Throws on malformed input.
 */
export function parseLocalizedAmount(raw: string, format: NumberFormat): Decimal {
  let s = raw.trim();
  if (s.length === 0) throw new Error("empty amount");

  let negative = false;

  if (s.startsWith("(") || s.endsWith(")")) {
    if (!(s.startsWith("(") && s.endsWith(")")) || s.length < 3) {
      throw new Error(`malformed parenthesized amount: ${JSON.stringify(raw)}`);
    }
    negative = true;
    s = s.slice(1, -1).trim();
  } else if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1).trim();
  } else if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1).trim();
  }

  const { decimalSeparator, thousandsSeparator } = format;
  const decIdx = s.lastIndexOf(decimalSeparator);
  let wholePart = decIdx === -1 ? s : s.slice(0, decIdx);
  const fracPart = decIdx === -1 ? "" : s.slice(decIdx + 1);

  if (thousandsSeparator !== "") {
    // Grouping must not appear after the decimal separator.
    if (fracPart.includes(thousandsSeparator)) {
      throw new Error(`grouping inside fraction: ${JSON.stringify(raw)}`);
    }
    wholePart = wholePart.split(thousandsSeparator).join("");
  }

  if (!/^\d+$/.test(wholePart) || (fracPart !== "" && !/^\d+$/.test(fracPart))) {
    throw new Error(`not a localized amount: ${JSON.stringify(raw)}`);
  }

  const mantissa = BigInt(wholePart + fracPart) * (negative ? -1n : 1n);
  return { mantissa, scale: fracPart.length };
}

/** Render a Decimal in a localized format (inverse of parseLocalizedAmount). */
export function renderLocalizedAmount(value: Decimal, format: NumberFormat): string {
  const negative = value.mantissa < 0n;
  const abs = (negative ? -value.mantissa : value.mantissa).toString().padStart(value.scale + 1, "0");
  const whole = value.scale === 0 ? abs : abs.slice(0, -value.scale);
  const frac = value.scale === 0 ? "" : abs.slice(-value.scale);

  let grouped = "";
  for (let i = 0; i < whole.length; i++) {
    const fromEnd = whole.length - i;
    if (i > 0 && fromEnd % 3 === 0) grouped += format.thousandsSeparator;
    grouped += whole[i];
  }

  const body = frac === "" ? grouped : `${grouped}${format.decimalSeparator}${frac}`;
  if (!negative) return body;
  switch (format.negativeStyle) {
    case "minus":
      return `-${body}`;
    case "parens":
      return `(${body})`;
    case "trailingMinus":
      return `${body}-`;
  }
}

/**
 * Convert an exact decimal to integer minor units (scale 2), rounding
 * half-even when the input has more precision.
 */
export function decimalToMinor(value: Decimal): Minor {
  return minor(rescaleHalfEven(value, 2));
}

export function minorToDecimal(value: Minor): Decimal {
  return { mantissa: value, scale: 2 };
}

/** Rescale mantissa×10^-scale to targetScale digits, rounding half-even. */
export function rescaleHalfEven(value: Decimal, targetScale: number): bigint {
  const diff = targetScale - value.scale;
  if (diff >= 0) return value.mantissa * 10n ** BigInt(diff);

  const divisor = 10n ** BigInt(-diff);
  const negative = value.mantissa < 0n;
  const abs = negative ? -value.mantissa : value.mantissa;
  const quotient = abs / divisor;
  const remainder = abs % divisor;
  const twice = remainder * 2n;

  let rounded = quotient;
  if (twice > divisor || (twice === divisor && quotient % 2n === 1n)) {
    rounded += 1n;
  }
  return negative ? -rounded : rounded;
}
