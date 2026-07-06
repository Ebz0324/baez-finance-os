import { DO_NUMBER_FORMAT, US_NUMBER_FORMAT } from "../decimal.js";
import type { CsvMapping } from "./mapper.js";

export type CsvPreset = {
  id: string;
  label: string;
  mapping: CsvMapping;
  notes: string;
};

/**
 * Best-effort defaults for the household's five banks. Every preset is
 * correctable in the mapper UI on first import (and the corrected mapping is
 * saved per account), so a wrong guess costs one manual adjustment — the
 * balance gate prevents wrong parses from ever corrupting the ledger.
 * Refine against real exports as they land in packages/engine/fixtures/.
 */
export const CSV_PRESETS: CsvPreset[] = [
  {
    id: "banco-popular-do",
    label: "Banco Popular (DR)",
    mapping: {
      version: 1,
      delimiter: "auto",
      skipRows: 0,
      hasHeader: true,
      columns: { date: 0, description: 1 },
      amount: { style: "debitCredit", debitColumn: 2, creditColumn: 3 },
      signConvention: "debitNegative",
      numberFormat: DO_NUMBER_FORMAT,
      dateFormat: "DD/MM/YYYY",
    },
    notes: "Débito/Crédito columns, es-DO numbers (1.234,56).",
  },
  {
    id: "parval-do",
    label: "Parval (DR)",
    mapping: {
      version: 1,
      delimiter: "auto",
      skipRows: 0,
      hasHeader: true,
      columns: { date: 0, description: 1 },
      amount: { style: "signed", column: 2 },
      signConvention: "debitNegative",
      numberFormat: DO_NUMBER_FORMAT,
      dateFormat: "DD/MM/YYYY",
    },
    notes: "Single signed amount column, es-DO numbers.",
  },
  {
    id: "chase",
    label: "Chase",
    mapping: {
      version: 1,
      delimiter: ",",
      skipRows: 0,
      hasHeader: true,
      columns: { date: 1, description: 2 },
      amount: { style: "signed", column: 3 },
      signConvention: "debitNegative",
      numberFormat: US_NUMBER_FORMAT,
      dateFormat: "MM/DD/YYYY",
    },
    notes:
      "Checking exports: Details, Posting Date, Description, Amount, … Card exports differ — adjust columns on first import.",
  },
  {
    id: "bank-of-america",
    label: "Bank of America",
    mapping: {
      version: 1,
      delimiter: ",",
      skipRows: 6,
      hasHeader: true,
      columns: { date: 0, description: 1 },
      amount: { style: "signed", column: 2 },
      signConvention: "debitNegative",
      numberFormat: US_NUMBER_FORMAT,
      dateFormat: "MM/DD/YYYY",
    },
    notes:
      "BofA prepends a summary preamble before the header — skipRows covers it; adjust if your export differs.",
  },
  {
    id: "relay",
    label: "Relay",
    mapping: {
      version: 1,
      delimiter: ",",
      skipRows: 0,
      hasHeader: true,
      columns: { date: 0, description: 1 },
      amount: { style: "signed", column: 2 },
      signConvention: "debitNegative",
      numberFormat: US_NUMBER_FORMAT,
      dateFormat: "MM/DD/YYYY",
      accountColumn: 3,
    },
    notes:
      "Relay supports sub-accounts and exports commonly carry a per-row account column — the import wizard asks which sub-account this statement belongs to.",
  },
];
