import type { Decimal } from "./decimal.js";
import { convertMinorForDisplay } from "./fx.js";
import { minor, type CurrencyCode, type IsoDate, type Minor } from "./types.js";

export const LIQUID_KINDS = ["checking", "savings", "cash"] as const;
export type LiquidKind = (typeof LIQUID_KINDS)[number];

export type AccountBalance = {
  accountId: string;
  kind: string;
  currency: CurrencyCode;
  balanceMinor: Minor;
  /** Latest posted_on among the account's transactions; null if empty. */
  latestDataOn: IsoDate | null;
};

export type SafeToSpendV1 = {
  /** Total across liquid accounts, in the base currency. */
  availableMinor: Minor;
  baseCurrency: CurrencyCode;
  accountCount: number;
  /**
   * Oldest of the per-account latest-data dates among counted accounts —
   * the honest "based on data through" date. Null when no account has data.
   */
  dataThrough: IsoDate | null;
  perAccount: Array<{ accountId: string; convertedMinor: Minor }>;
};

/**
 * v1 (M1): sum of liquid balances consolidated to the base currency at the
 * given USD/DOP rate. Bills and envelopes join the formula in M4.
 */
export function safeToSpendV1(
  accounts: readonly AccountBalance[],
  baseCurrency: CurrencyCode,
  usdDopRate: Decimal,
): SafeToSpendV1 {
  const liquid = accounts.filter((a) => (LIQUID_KINDS as readonly string[]).includes(a.kind));

  let total = 0n;
  let dataThrough: IsoDate | null = null;
  const perAccount: SafeToSpendV1["perAccount"] = [];

  for (const account of liquid) {
    const converted =
      account.currency === baseCurrency
        ? account.balanceMinor
        : convertMinorForDisplay(
            account.balanceMinor,
            usdDopRate,
            baseCurrency === "USD" ? "divide" : "multiply",
          );
    total += converted;
    perAccount.push({ accountId: account.accountId, convertedMinor: converted });

    // ISO dates compare correctly as strings; track the oldest known-through.
    if (account.latestDataOn !== null) {
      if (dataThrough === null || account.latestDataOn < dataThrough) {
        dataThrough = account.latestDataOn;
      }
    }
  }

  return {
    availableMinor: minor(total),
    baseCurrency,
    accountCount: liquid.length,
    dataThrough,
    perAccount,
  };
}
