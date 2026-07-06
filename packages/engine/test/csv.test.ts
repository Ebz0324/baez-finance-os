import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  tokenizeCsv,
  applyMapping,
  CSV_PRESETS,
  renderLocalizedAmount,
  US_NUMBER_FORMAT,
  DO_NUMBER_FORMAT,
  type CsvMapping,
} from "../src/index.js";

describe("tokenizeCsv", () => {
  it("splits simple rows", () => {
    expect(tokenizeCsv("a,b,c\n1,2,3", ",")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields with embedded delimiters, quotes, and newlines", () => {
    const text = 'name,note\n"Pérez, Juan","said ""hola""\nand left"';
    expect(tokenizeCsv(text, ",")).toEqual([
      ["name", "note"],
      ['Pérez, Juan', 'said "hola"\nand left'],
    ]);
  });

  it("handles CRLF and trailing newline", () => {
    expect(tokenizeCsv("a,b\r\n1,2\r\n", ",")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("supports semicolon and tab delimiters", () => {
    expect(tokenizeCsv("a;b\n1;2", ";")).toEqual([["a", "b"], ["1", "2"]]);
    expect(tokenizeCsv("a\tb\n1\t2", "\t")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

const SIGNED_US: CsvMapping = {
  version: 1,
  delimiter: ",",
  skipRows: 0,
  hasHeader: true,
  columns: { date: 0, description: 1 },
  amount: { style: "signed", column: 2 },
  signConvention: "debitNegative",
  numberFormat: US_NUMBER_FORMAT,
  dateFormat: "MM/DD/YYYY",
};

describe("applyMapping", () => {
  it("parses a signed US-format CSV", () => {
    const csv = [
      "Date,Description,Amount",
      "07/01/2026,COLMADO LA ESQUINA,-1250.50",
      "07/02/2026,PAYROLL ACME,3000.00",
    ].join("\n");
    const result = applyMapping(csv, SIGNED_US);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { postedOn: "2026-07-01", description: "COLMADO LA ESQUINA", amountMinor: -125050n },
      { postedOn: "2026-07-02", description: "PAYROLL ACME", amountMinor: 300000n },
    ]);
  });

  it("parses DR-format debit/credit columns with es-DO numbers and DD/MM/YYYY", () => {
    const mapping: CsvMapping = {
      version: 1,
      delimiter: ";",
      skipRows: 1, // bank preamble line
      hasHeader: true,
      columns: { date: 0, description: 1 },
      amount: { style: "debitCredit", debitColumn: 2, creditColumn: 3 },
      signConvention: "debitNegative",
      numberFormat: DO_NUMBER_FORMAT,
      dateFormat: "DD/MM/YYYY",
    };
    const csv = [
      "Banco Popular Dominicano - Estado de cuenta",
      "Fecha;Descripción;Débito;Crédito",
      "05/07/2026;SUPERMERCADO NACIONAL;1.250,50;",
      "06/07/2026;DEPOSITO NOMINA;;25.000,00",
    ].join("\n");
    const result = applyMapping(csv, mapping);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { postedOn: "2026-07-05", description: "SUPERMERCADO NACIONAL", amountMinor: -125050n },
      { postedOn: "2026-07-06", description: "DEPOSITO NOMINA", amountMinor: 2500000n },
    ]);
  });

  it("debitPositive sign convention flips signed amounts", () => {
    const mapping: CsvMapping = { ...SIGNED_US, signConvention: "debitPositive" };
    const csv = "Date,Description,Amount\n07/01/2026,STORE,1250.50";
    const result = applyMapping(csv, mapping);
    expect(result.rows[0]!.amountMinor).toBe(-125050n);
  });

  it("filters by sub-account column (Relay-style exports)", () => {
    const mapping: CsvMapping = {
      ...SIGNED_US,
      columns: { date: 0, description: 1 },
      amount: { style: "signed", column: 2 },
      accountColumn: 3,
      accountFilterValue: "Operating",
    };
    const csv = [
      "Date,Description,Amount,Account",
      "07/01/2026,VENDOR A,-100.00,Operating",
      "07/01/2026,VENDOR B,-200.00,Payroll",
      "07/02/2026,VENDOR C,-300.00,Operating",
    ].join("\n");
    const result = applyMapping(csv, mapping);
    expect(result.rows.map((r) => r.description)).toEqual(["VENDOR A", "VENDOR C"]);
    expect(result.skipped).toBe(1);
  });

  it("reports row-level errors with line numbers, never throwing", () => {
    const csv = [
      "Date,Description,Amount",
      "07/01/2026,GOOD,-10.00",
      "not-a-date,BAD DATE,-5.00",
      "07/03/2026,BAD AMOUNT,xyz",
    ].join("\n");
    const result = applyMapping(csv, SIGNED_US);
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]!.line).toBe(3);
    expect(result.errors[1]!.line).toBe(4);
  });

  it("empty amount rows are skipped, not errors (running-balance filler lines)", () => {
    const csv = "Date,Description,Amount\n07/01/2026,BEGINNING BALANCE,\n07/02/2026,REAL,-5.00";
    const result = applyMapping(csv, SIGNED_US);
    expect(result.rows).toHaveLength(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it("round-trips generated rows through render → parse (property)", () => {
    const fcRow = fc.record({
      amount: fc.bigInt({ min: -(10n ** 10n), max: 10n ** 10n }).filter((v) => v !== 0n),
      day: fc.integer({ min: 1, max: 28 }),
      month: fc.integer({ min: 1, max: 12 }),
      desc: fc
        .string({ minLength: 1, maxLength: 30 })
        // The mapper trims descriptions by design, so only generate
        // already-trimmed values for the exact round-trip comparison.
        .filter((s) => !s.includes("\r") && s.trim() === s && s.length > 0),
    });

    fc.assert(
      fc.property(
        fc.array(fcRow, { minLength: 1, maxLength: 40 }),
        fc.constantFrom<"us" | "do">("us", "do"),
        (rows, style) => {
          const numberFormat = style === "us" ? US_NUMBER_FORMAT : DO_NUMBER_FORMAT;
          const dateFormat = style === "us" ? "MM/DD/YYYY" : "DD/MM/YYYY";
          const mapping: CsvMapping = {
            version: 1,
            delimiter: ",",
            skipRows: 0,
            hasHeader: true,
            columns: { date: 0, description: 1 },
            amount: { style: "signed", column: 2 },
            signConvention: "debitNegative",
            numberFormat,
            dateFormat: dateFormat as CsvMapping["dateFormat"],
          };

          const csvLines = ["Date,Description,Amount"];
          for (const row of rows) {
            const dd = String(row.day).padStart(2, "0");
            const mm = String(row.month).padStart(2, "0");
            const date = style === "us" ? `${mm}/${dd}/2026` : `${dd}/${mm}/2026`;
            const amount = renderLocalizedAmount({ mantissa: row.amount, scale: 2 }, numberFormat);
            const desc = `"${row.desc.replaceAll('"', '""')}"`;
            csvLines.push(`${date},${desc},"${amount}"`);
          }

          const result = applyMapping(csvLines.join("\n"), mapping);
          expect(result.errors).toEqual([]);
          expect(result.rows).toHaveLength(rows.length);
          result.rows.forEach((parsed, i) => {
            expect(parsed.amountMinor).toBe(rows[i]!.amount);
            expect(parsed.description).toBe(rows[i]!.desc);
          });
        },
      ),
    );
  });
});

describe("CSV_PRESETS", () => {
  it("ships the five household banks", () => {
    const ids = CSV_PRESETS.map((p) => p.id);
    expect(ids).toEqual([
      "banco-popular-do",
      "parval-do",
      "chase",
      "bank-of-america",
      "relay",
    ]);
  });

  it("relay preset declares a sub-account column", () => {
    const relay = CSV_PRESETS.find((p) => p.id === "relay")!;
    expect(relay.mapping.accountColumn).toBeTypeOf("number");
  });

  it("DR presets use es-DO number and date formats", () => {
    for (const id of ["banco-popular-do", "parval-do"]) {
      const preset = CSV_PRESETS.find((p) => p.id === id)!;
      expect(preset.mapping.numberFormat).toEqual(DO_NUMBER_FORMAT);
      expect(preset.mapping.dateFormat).toBe("DD/MM/YYYY");
    }
  });
});
