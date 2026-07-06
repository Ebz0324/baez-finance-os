/** Display formatting for wire-format minor-unit strings. Client-side only. */
export function formatMinorString(minorString: string, currency: "USD" | "DOP"): string {
  const value = BigInt(minorString);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const major = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, "0");

  let grouped = "";
  const digits = major.toString();
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) grouped += ",";
    grouped += digits[i];
  }

  const symbol = currency === "USD" ? "$" : "RD$";
  return `${negative ? "-" : ""}${symbol}${grouped}.${cents}`;
}
