import { minor, type Minor } from "./types.js";

export type BalanceGateInput = {
  openingMinor: Minor;
  closingMinor: Minor;
  amounts: readonly Minor[];
};

export type BalanceGateResult =
  | { ok: true }
  | {
      ok: false;
      /** closing − (opening + Σ amounts): exactly what's missing or extra. */
      gapMinor: Minor;
    };

/**
 * Invariant #3: a statement enters the ledger only if
 * opening + Σ(transactions) = closing, to the cent. Never bypassed.
 */
export function checkBalanceGate(input: BalanceGateInput): BalanceGateResult {
  let sum = 0n;
  for (const a of input.amounts) sum += a;
  const gap = input.closingMinor - (input.openingMinor + sum);
  return gap === 0n ? { ok: true } : { ok: false, gapMinor: minor(gap) };
}
