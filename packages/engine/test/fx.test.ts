import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { convertMinorForDisplay, parseDecimal, minor } from "../src/index.js";

const RATE = parseDecimal("59.104456"); // USD/DOP, shape of the real feed

describe("convertMinorForDisplay", () => {
  it("converts zero to zero", () => {
    expect(convertMinorForDisplay(minor(0n), RATE, "multiply")).toBe(0n);
    expect(convertMinorForDisplay(minor(0n), RATE, "divide")).toBe(0n);
  });

  it("multiplies USD→DOP at the rate", () => {
    // 10000 minor × 59.104456 = 591044.56 minor → 591045 after rounding
    expect(convertMinorForDisplay(minor(10000n), RATE, "multiply")).toBe(591045n);
  });

  it("divides DOP→USD at the rate", () => {
    // RD$5,910.45 ÷ 59.104456 ≈ $100.0000075 → 10000
    expect(convertMinorForDisplay(minor(591045n), RATE, "divide")).toBe(10000n);
  });

  it("preserves sign (property)", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10n ** 12n }), (v) => {
        const pos = convertMinorForDisplay(minor(v), RATE, "multiply");
        const neg = convertMinorForDisplay(minor(-v), RATE, "multiply");
        expect(neg).toBe(-pos);
      }),
    );
  });

  it("is additive within a 1-minor-unit rounding bound (property)", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 10n), max: 10n ** 10n }),
        fc.bigInt({ min: -(10n ** 10n), max: 10n ** 10n }),
        (a, b) => {
          const together = convertMinorForDisplay(minor(a + b), RATE, "multiply");
          const apart =
            convertMinorForDisplay(minor(a), RATE, "multiply") +
            convertMinorForDisplay(minor(b), RATE, "multiply");
          const diff = together - apart;
          expect(diff <= 1n && diff >= -1n).toBe(true);
        },
      ),
    );
  });

  it("rejects a zero rate", () => {
    expect(() => convertMinorForDisplay(minor(100n), parseDecimal("0"), "divide")).toThrow();
  });
});
