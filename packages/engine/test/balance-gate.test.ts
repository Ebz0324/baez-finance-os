import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { checkBalanceGate, minor, type Minor } from "../src/index.js";

const fcAmount = fc.bigInt({ min: -(10n ** 13n), max: 10n ** 13n }).map(minor);
const fcAmounts = fc.array(fcAmount, { maxLength: 500 });

function sum(values: readonly Minor[]): bigint {
  return values.reduce<bigint>((acc, v) => acc + v, 0n);
}

describe("balance gate (invariant #3 — property-based)", () => {
  it("soundness: closing = opening + Σ ⇒ accepted", () => {
    fc.assert(
      fc.property(fcAmount, fcAmounts, (opening, amounts) => {
        const closing = minor(opening + sum(amounts));
        expect(checkBalanceGate({ openingMinor: opening, closingMinor: closing, amounts })).toEqual(
          { ok: true },
        );
      }),
    );
  });

  it("completeness: closing off by δ≠0 ⇒ rejected with gap exactly δ", () => {
    fc.assert(
      fc.property(
        fcAmount,
        fcAmounts,
        fcAmount.filter((d) => d !== 0n),
        (opening, amounts, delta) => {
          const closing = minor(opening + sum(amounts) + delta);
          const result = checkBalanceGate({
            openingMinor: opening,
            closingMinor: closing,
            amounts,
          });
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.gapMinor).toBe(delta);
        },
      ),
    );
  });

  it("perturbation: dropping a nonzero row breaks the equation", () => {
    fc.assert(
      fc.property(
        fcAmount,
        fcAmounts,
        fcAmount.filter((v) => v !== 0n),
        (opening, rest, dropped) => {
          const amounts = [...rest, dropped];
          const closing = minor(opening + sum(amounts));
          const withoutRow = checkBalanceGate({
            openingMinor: opening,
            closingMinor: closing,
            amounts: rest,
          });
          expect(withoutRow.ok).toBe(false);
        },
      ),
    );
  });

  it("perturbation: duplicating a nonzero row breaks the equation", () => {
    fc.assert(
      fc.property(
        fcAmount,
        fcAmounts,
        fcAmount.filter((v) => v !== 0n),
        (opening, rest, dup) => {
          const amounts = [...rest, dup];
          const closing = minor(opening + sum(amounts));
          const doubled = checkBalanceGate({
            openingMinor: opening,
            closingMinor: closing,
            amounts: [...amounts, dup],
          });
          expect(doubled.ok).toBe(false);
        },
      ),
    );
  });

  it("perturbation: flipping the sign of a nonzero row breaks the equation", () => {
    fc.assert(
      fc.property(
        fcAmount,
        fcAmounts,
        fcAmount.filter((v) => v !== 0n),
        (opening, rest, flipped) => {
          const amounts = [...rest, flipped];
          const closing = minor(opening + sum(amounts));
          const tampered = checkBalanceGate({
            openingMinor: opening,
            closingMinor: closing,
            amounts: [...rest, minor(-flipped)],
          });
          expect(tampered.ok).toBe(false);
        },
      ),
    );
  });

  it("accepts the empty statement (opening = closing, no rows)", () => {
    expect(
      checkBalanceGate({ openingMinor: minor(5000n), closingMinor: minor(5000n), amounts: [] }),
    ).toEqual({ ok: true });
  });

  it("reports the one-cent gap that motivates the whole feature", () => {
    const result = checkBalanceGate({
      openingMinor: minor(10000n),
      closingMinor: minor(9999n),
      amounts: [],
    });
    expect(result).toEqual({ ok: false, gapMinor: -1n });
  });
});
