import { parseLocalizedAmount, decimalToMinor, type NumberFormat } from "../decimal.js";
import type { Minor } from "../types.js";
import { tokenizeCsv, detectDelimiter, type CsvDelimiter } from "./tokenize.js";

export type CsvDateFormat = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD" | "DD-MM-YYYY" | "MM/DD/YY";

export type CsvMapping = {
  version: 1;
  delimiter: CsvDelimiter | "auto";
  /** Preamble lines before the header/data (bank branding, summaries). */
  skipRows: number;
  hasHeader: boolean;
  columns: { date: number; description: number };
  amount:
    | { style: "signed"; column: number }
    | { style: "debitCredit"; debitColumn: number; creditColumn: number }
    | {
        style: "amountPlusDirection";
        amountColumn: number;
        directionColumn: number;
        debitValues: string[];
      };
  /** How outflows appear in the file: negative amounts, or positive debits. */
  signConvention: "debitNegative" | "debitPositive";
  numberFormat: NumberFormat;
  dateFormat: CsvDateFormat;
  /** Multi-account exports (e.g. Relay sub-accounts): keep only matching rows. */
  accountColumn?: number;
  accountFilterValue?: string;
};

export type MappedRow = { postedOn: string; description: string; amountMinor: Minor };

export type MappingResult = {
  rows: MappedRow[];
  /** Rows dropped on purpose (empty amounts, filtered sub-accounts). */
  skipped: number;
  errors: Array<{ line: number; reason: string }>;
};

/** Pure: CSV text + mapping config → ledger-shaped rows. Never throws on data. */
export function applyMapping(csvText: string, mapping: CsvMapping): MappingResult {
  const delimiter = mapping.delimiter === "auto" ? detectDelimiter(csvText) : mapping.delimiter;
  const allRows = tokenizeCsv(csvText, delimiter);

  const startIndex = mapping.skipRows + (mapping.hasHeader ? 1 : 0);
  const dataRows = allRows.slice(startIndex);

  const rows: MappedRow[] = [];
  const errors: MappingResult["errors"] = [];
  let skipped = 0;

  dataRows.forEach((cells, index) => {
    const line = startIndex + index + 1; // 1-based, matching what a user sees in a text editor

    // Ignore blank lines entirely.
    if (cells.every((cell) => cell.trim() === "")) return;

    if (
      mapping.accountColumn !== undefined &&
      mapping.accountFilterValue !== undefined &&
      (cells[mapping.accountColumn] ?? "").trim() !== mapping.accountFilterValue
    ) {
      skipped += 1;
      return;
    }

    const rawDate = (cells[mapping.columns.date] ?? "").trim();
    const description = (cells[mapping.columns.description] ?? "").trim();

    const postedOn = parseCsvDate(rawDate, mapping.dateFormat);
    if (!postedOn) {
      errors.push({ line, reason: `unrecognized date "${rawDate}"` });
      return;
    }

    const amount = extractAmount(cells, mapping);
    if (amount === "empty") {
      skipped += 1;
      return;
    }
    if (amount === "invalid") {
      errors.push({ line, reason: `unrecognized amount` });
      return;
    }

    rows.push({ postedOn, description, amountMinor: amount });
  });

  return { rows, skipped, errors };
}

function extractAmount(cells: string[], mapping: CsvMapping): Minor | "empty" | "invalid" {
  const flip = mapping.signConvention === "debitPositive";

  const parse = (raw: string): Minor | null => {
    try {
      return decimalToMinor(parseLocalizedAmount(raw, mapping.numberFormat));
    } catch {
      return null;
    }
  };

  switch (mapping.amount.style) {
    case "signed": {
      const raw = (cells[mapping.amount.column] ?? "").trim();
      if (raw === "") return "empty";
      const value = parse(raw);
      if (value === null) return "invalid";
      return (flip ? -value : value) as Minor;
    }
    case "debitCredit": {
      const debitRaw = (cells[mapping.amount.debitColumn] ?? "").trim();
      const creditRaw = (cells[mapping.amount.creditColumn] ?? "").trim();
      if (debitRaw === "" && creditRaw === "") return "empty";
      if (debitRaw !== "" && creditRaw !== "") return "invalid"; // both filled = ambiguous
      const value = parse(debitRaw !== "" ? debitRaw : creditRaw);
      if (value === null) return "invalid";
      const abs = value < 0n ? -value : value;
      return (debitRaw !== "" ? -abs : abs) as Minor;
    }
    case "amountPlusDirection": {
      const raw = (cells[mapping.amount.amountColumn] ?? "").trim();
      if (raw === "") return "empty";
      const value = parse(raw);
      if (value === null) return "invalid";
      const directionRaw = (cells[mapping.amount.directionColumn] ?? "").trim().toLowerCase();
      const isDebit = mapping.amount.debitValues.some((v) => v.toLowerCase() === directionRaw);
      const abs = value < 0n ? -value : value;
      return (isDebit ? -abs : abs) as Minor;
    }
  }
}

function parseCsvDate(raw: string, format: CsvDateFormat): string | null {
  let y: number, m: number, d: number;
  let match: RegExpExecArray | null;

  switch (format) {
    case "YYYY-MM-DD":
      match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
      if (!match) return null;
      [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
      break;
    case "DD/MM/YYYY":
      match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
      if (!match) return null;
      [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
      break;
    case "DD-MM-YYYY":
      match = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(raw);
      if (!match) return null;
      [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
      break;
    case "MM/DD/YYYY":
      match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
      if (!match) return null;
      [m, d, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
      break;
    case "MM/DD/YY":
      match = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(raw);
      if (!match) return null;
      [m, d] = [Number(match[1]), Number(match[2])];
      y = 2000 + Number(match[3]);
      break;
  }

  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
