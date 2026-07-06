import { describe, expect, it } from "vitest";
import {
  safeToSpendV1,
  parseDecimal,
  minor,
  currency,
  isoDate,
  type AccountBalance,
} from "../src/index.js";

const USD = currency("USD");
const DOP = currency("DOP");
const RATE = parseDecimal("60"); // clean rate for readable expectations

function account(partial: Partial<AccountBalance> & Pick<AccountBalance, "accountId">): AccountBalance {
  return {
    kind: "checking",
    currency: USD,
    balanceMinor: minor(0n),
    latestDataOn: null,
    ...partial,
  };
}

describe("safeToSpendV1", () => {
  it("sums USD liquid accounts directly", () => {
    const result = safeToSpendV1(
      [
        account({ accountId: "a", balanceMinor: minor(10000n), latestDataOn: isoDate("2026-07-01") }),
        account({ accountId: "b", kind: "savings", balanceMinor: minor(5000n), latestDataOn: isoDate("2026-07-03") }),
      ],
      USD,
      RATE,
    );
    expect(result.availableMinor).toBe(15000n);
    expect(result.accountCount).toBe(2);
  });

  it("converts DOP balances at the rate (divide into USD)", () => {
    const result = safeToSpendV1(
      [account({ accountId: "c", kind: "cash", currency: DOP, balanceMinor: minor(600000n) })],
      USD,
      RATE,
    );
    // RD$6,000.00 ÷ 60 = $100.00
    expect(result.availableMinor).toBe(10000n);
  });

  it("excludes non-liquid kinds", () => {
    const result = safeToSpendV1(
      [
        account({ accountId: "a", balanceMinor: minor(10000n) }),
        account({ accountId: "d", kind: "card", balanceMinor: minor(-50000n) }),
        account({ accountId: "e", kind: "brokerage", balanceMinor: minor(999999n) }),
      ],
      USD,
      RATE,
    );
    expect(result.availableMinor).toBe(10000n);
    expect(result.accountCount).toBe(1);
  });

  it("dataThrough is the OLDEST latest-data date among counted accounts", () => {
    const result = safeToSpendV1(
      [
        account({ accountId: "a", latestDataOn: isoDate("2026-07-03") }),
        account({ accountId: "b", kind: "cash", latestDataOn: isoDate("2026-06-20") }),
      ],
      USD,
      RATE,
    );
    expect(result.dataThrough).toBe("2026-06-20");
  });

  it("accounts with no data don't produce a dataThrough of their own", () => {
    const result = safeToSpendV1(
      [
        account({ accountId: "a", latestDataOn: isoDate("2026-07-03") }),
        account({ accountId: "b", kind: "cash", latestDataOn: null }),
      ],
      USD,
      RATE,
    );
    expect(result.dataThrough).toBe("2026-07-03");
  });

  it("handles the empty household", () => {
    const result = safeToSpendV1([], USD, RATE);
    expect(result.availableMinor).toBe(0n);
    expect(result.accountCount).toBe(0);
    expect(result.dataThrough).toBeNull();
  });
});
