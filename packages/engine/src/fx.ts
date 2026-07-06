import { rescaleHalfEven, type Decimal } from "./decimal.js";
import { minor, type Minor } from "./types.js";

/**
 * Convert minor units across a currency pair at an exact decimal rate,
 * for display only — stored amounts are never mutated by conversion.
 *
 * direction "multiply": result = amount × rate (e.g. USD→DOP with a USD/DOP rate).
 * direction "divide":   result = amount ÷ rate (e.g. DOP→USD with a USD/DOP rate).
 * Rounds half-even to minor units.
 */
export function convertMinorForDisplay(
  amount: Minor,
  rate: Decimal,
  direction: "multiply" | "divide",
): Minor {
  if (rate.mantissa === 0n) throw new Error("fx rate cannot be zero");

  if (direction === "multiply") {
    // amount × mantissa × 10^-scale → still exact; rescale to 0 extra digits.
    const product: Decimal = { mantissa: amount * rate.mantissa, scale: rate.scale };
    return minor(rescaleHalfEven(product, 0));
  }

  // amount ÷ (mantissa × 10^-scale) = amount × 10^scale / mantissa.
  // Compute with 4 guard digits, then rescale half-even to integer minor units.
  const GUARD = 4;
  const numerator = amount * 10n ** BigInt(rate.scale + GUARD);
  const quotient = divideHalfEven(numerator, rate.mantissa);
  return minor(rescaleHalfEven({ mantissa: quotient, scale: GUARD }, 0));
}

/** Integer division rounding half-even, handling signs. */
function divideHalfEven(numerator: bigint, divisor: bigint): bigint {
  const negative = numerator < 0n !== divisor < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = divisor < 0n ? -divisor : divisor;
  const q = n / d;
  const r = n % d;
  const twice = r * 2n;
  let rounded = q;
  if (twice > d || (twice === d && q % 2n === 1n)) rounded += 1n;
  return negative ? -rounded : rounded;
}
