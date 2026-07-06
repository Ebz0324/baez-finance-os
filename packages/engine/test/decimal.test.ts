import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  parseDecimal,
  parseLocalizedAmount,
  renderLocalizedAmount,
  decimalToMinor,
  minorToDecimal,
  minor,
  US_NUMBER_FORMAT,
  DO_NUMBER_FORMAT,
  type NumberFormat,
  type Decimal,
} from "../src/index.js";

describe("parseDecimal", () => {
  it("parses integers and decimals exactly", () => {
    expect(parseDecimal("1234.56")).toEqual({ mantissa: 123456n, scale: 2 });
    expect(parseDecimal("-7")).toEqual({ mantissa: -7n, scale: 0 });
    expect(parseDecimal("0.005")).toEqual({ mantissa: 5n, scale: 3 });
  });

  it("rejects malformed input", () => {
    for (const bad of ["", ".", "1.", ".5.", "1,2", "1e3", "abc", "- 5"]) {
      expect(() => parseDecimal(bad), bad).toThrow();
    }
  });
});

describe("parseLocalizedAmount", () => {
  it("parses DR-style amounts (1.234,56)", () => {
    expect(parseLocalizedAmount("1.234,56", DO_NUMBER_FORMAT)).toEqual({
      mantissa: 123456n,
      scale: 2,
    });
    expect(parseLocalizedAmount("-10.000,00", DO_NUMBER_FORMAT)).toEqual({
      mantissa: -1000000n,
      scale: 2,
    });
  });

  it("parses US-style amounts (1,234.56)", () => {
    expect(parseLocalizedAmount("1,234.56", US_NUMBER_FORMAT)).toEqual({
      mantissa: 123456n,
      scale: 2,
    });
  });

  it("parses parenthesized negatives", () => {
    const parens: NumberFormat = { ...US_NUMBER_FORMAT, negativeStyle: "parens" };
    expect(parseLocalizedAmount("(1,234.56)", parens)).toEqual({
      mantissa: -123456n,
      scale: 2,
    });
  });

  it("parses trailing-minus negatives", () => {
    const trailing: NumberFormat = { ...DO_NUMBER_FORMAT, negativeStyle: "trailingMinus" };
    expect(parseLocalizedAmount("1.234,56-", trailing)).toEqual({
      mantissa: -123456n,
      scale: 2,
    });
  });

  it("tolerates leading/trailing whitespace and currency-free plain numbers", () => {
    expect(parseLocalizedAmount("  250,00 ", DO_NUMBER_FORMAT)).toEqual({
      mantissa: 25000n,
      scale: 2,
    });
    expect(parseLocalizedAmount("250", US_NUMBER_FORMAT)).toEqual({ mantissa: 250n, scale: 0 });
  });

  it("rejects garbage", () => {
    for (const bad of ["", "abc", "1..2", "1,2,3.4.5", "(", "()"]) {
      expect(() => parseLocalizedAmount(bad, US_NUMBER_FORMAT), bad).toThrow();
    }
  });

  it("round-trips render → parse for any amount and format (property)", () => {
    const fcFormat = fc.record({
      decimalSeparator: fc.constantFrom(".", ",") as fc.Arbitrary<"." | ",">,
      thousandsSeparator: fc.constantFrom(",", ".", " ", "'", "") as fc.Arbitrary<
        "," | "." | " " | "'" | ""
      >,
      negativeStyle: fc.constantFrom("minus", "parens", "trailingMinus") as fc.Arbitrary<
        "minus" | "parens" | "trailingMinus"
      >,
    }).filter((f) => f.decimalSeparator !== f.thousandsSeparator);

    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 12n), max: 10n ** 12n }),
        fcFormat,
        (mantissa, format) => {
          const value: Decimal = { mantissa, scale: 2 };
          const rendered = renderLocalizedAmount(value, format);
          const parsed = parseLocalizedAmount(rendered, format);
          expect(parsed.mantissa).toBe(mantissa);
          expect(parsed.scale).toBe(2);
        },
      ),
    );
  });
});

describe("decimalToMinor", () => {
  it("scales exact 2-decimal values", () => {
    expect(decimalToMinor({ mantissa: 123456n, scale: 2 })).toBe(123456n);
    expect(decimalToMinor({ mantissa: -7n, scale: 0 })).toBe(-700n);
  });

  it("rounds half-even beyond 2 decimals", () => {
    expect(decimalToMinor({ mantissa: 12345n, scale: 3 })).toBe(1234n); // 12.345 → 12.34
    expect(decimalToMinor({ mantissa: 12355n, scale: 3 })).toBe(1236n); // 12.355 → 12.36
    expect(decimalToMinor({ mantissa: 12351n, scale: 3 })).toBe(1235n); // 12.351 → 12.35
    expect(decimalToMinor({ mantissa: -12345n, scale: 3 })).toBe(-1234n);
  });

  it("round-trips with minorToDecimal (property)", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -(10n ** 13n), max: 10n ** 13n }), (v) => {
        expect(decimalToMinor(minorToDecimal(minor(v)))).toBe(v);
      }),
    );
  });
});
