import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  minor,
  currency,
  addMinor,
  sumMinor,
  negateMinor,
  minorFromString,
  minorToString,
  formatMinor,
} from "../src/index.js";

const fcMinor = fc.bigInt({ min: -(10n ** 13n), max: 10n ** 13n }).map(minor);

describe("minor arithmetic", () => {
  it("adds and negates exactly", () => {
    expect(addMinor(minor(1n), minor(2n))).toBe(3n);
    expect(negateMinor(minor(5n))).toBe(-5n);
    expect(negateMinor(minor(0n))).toBe(0n);
  });

  it("sums an empty list to zero", () => {
    expect(sumMinor([])).toBe(0n);
  });

  it("sum is order-independent and matches fold (property)", () => {
    fc.assert(
      fc.property(fc.array(fcMinor, { maxLength: 200 }), (values) => {
        const folded = values.reduce((acc, v) => acc + v, 0n);
        expect(sumMinor(values)).toBe(folded);
        expect(sumMinor([...values].reverse())).toBe(folded);
      }),
    );
  });
});

describe("wire format", () => {
  it("round-trips any minor value (property)", () => {
    fc.assert(
      fc.property(fcMinor, (v) => {
        expect(minorFromString(minorToString(v))).toBe(v);
      }),
    );
  });

  it("parses plain decimal strings", () => {
    expect(minorFromString("-12345")).toBe(-12345n);
    expect(minorFromString("0")).toBe(0n);
  });

  it("rejects non-integer and malformed strings", () => {
    for (const bad of ["12.5", "", "abc", "1e5", "0x10", "12 3", "--5", "+"]) {
      expect(() => minorFromString(bad), bad).toThrow();
    }
  });
});

describe("formatMinor", () => {
  it("formats USD in en-US", () => {
    expect(formatMinor(minor(-123456n), currency("USD"), "en-US")).toBe("-$1,234.56");
    expect(formatMinor(minor(5n), currency("USD"), "en-US")).toBe("$0.05");
  });

  it("always shows two decimals for DOP", () => {
    const out = formatMinor(minor(100000n), currency("DOP"), "en-US");
    expect(out).toMatch(/1,000\.00/);
  });
});
