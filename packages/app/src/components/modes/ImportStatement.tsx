import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  applyMapping,
  detectDelimiter,
  tokenizeCsv,
  CSV_PRESETS,
  US_NUMBER_FORMAT,
  DO_NUMBER_FORMAT,
  type CsvMapping,
} from "@baez/engine";
import { apiPost, ApiError } from "../../lib/api";
import { formatMinorString } from "../../lib/format";
import type { Account } from "../../lib/queries";
import { ProgressBar } from "../ProgressBar";

type ImportStatementProps = {
  account: Account;
  onClose: () => void;
};

type Step = "file" | "mapping" | "subaccount" | "balances" | "done";
const STEP_ORDER: Step[] = ["file", "mapping", "subaccount", "balances", "done"];

const DEFAULT_MAPPING: CsvMapping = {
  version: 1,
  delimiter: "auto",
  skipRows: 0,
  hasHeader: true,
  columns: { date: 0, description: 1 },
  amount: { style: "signed", column: 2 },
  signConvention: "debitNegative",
  numberFormat: US_NUMBER_FORMAT,
  dateFormat: "MM/DD/YYYY",
};

/**
 * Full-screen guided mode (DESIGN §3): one question per screen, visible
 * progress, exit anytime without penalty. Client previews via the same
 * engine code the server re-runs as the authority.
 */
export function ImportStatement({ account, onClose }: ImportStatementProps) {
  const qc = useQueryClient();
  const savedMapping = useMemo<CsvMapping | null>(() => {
    // Accounts carry their corrected mapping after the first import.
    const raw = (account as unknown as { csvMapping?: string | null }).csvMapping;
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CsvMapping;
    } catch {
      return null;
    }
  }, [account]);

  const [step, setStep] = useState<Step>("file");
  const [csvText, setCsvText] = useState("");
  const [mapping, setMapping] = useState<CsvMapping>(savedMapping ?? DEFAULT_MAPPING);
  const [opening, setOpening] = useState("");
  const [closing, setClosing] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<{ inserted: number } | null>(null);

  const preview = useMemo(
    () => (csvText ? applyMapping(csvText, mapping) : null),
    [csvText, mapping],
  );

  const headerCells = useMemo(() => {
    if (!csvText) return [];
    const delimiter = mapping.delimiter === "auto" ? detectDelimiter(csvText) : mapping.delimiter;
    const rows = tokenizeCsv(csvText, delimiter);
    return rows[mapping.skipRows] ?? [];
  }, [csvText, mapping.delimiter, mapping.skipRows]);

  const subaccountValues = useMemo(() => {
    if (mapping.accountColumn === undefined || !csvText) return [];
    const delimiter = mapping.delimiter === "auto" ? detectDelimiter(csvText) : mapping.delimiter;
    const rows = tokenizeCsv(csvText, delimiter).slice(mapping.skipRows + (mapping.hasHeader ? 1 : 0));
    return [...new Set(rows.map((r) => (r[mapping.accountColumn!] ?? "").trim()).filter(Boolean))];
  }, [csvText, mapping]);

  function toMinorString(major: string): string | null {
    const normalized = major.trim().replace(/,/g, "");
    if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
    const [whole, frac = ""] = normalized.split(".");
    return `${whole}${frac.padEnd(2, "0")}`;
  }

  async function submit() {
    const openingMinor = toMinorString(opening);
    const closingMinor = toMinorString(closing);
    if (!openingMinor || !closingMinor || !periodStart || !periodEnd) return;
    setBusy(true);
    setServerError(null);
    try {
      const data = await apiPost<{ inserted: number }>("/imports/commit", {
        accountId: account.id,
        csvText,
        mapping,
        openingMinor,
        closingMinor,
        periodStart,
        periodEnd,
        saveMapping: true,
      });
      setResult(data);
      setStep("done");
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["safe-to-spend"] });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "something went wrong — try again");
    } finally {
      setBusy(false);
    }
  }

  const stepIndex = STEP_ORDER.indexOf(step) + 1;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-zinc-950">
      <div className="flex items-center gap-3 p-4">
        <button type="button" onClick={onClose} className="text-sm text-zinc-400">
          Close
        </button>
        <div className="flex-1">
          <ProgressBar step={stepIndex} total={STEP_ORDER.length} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-10">
        <p className="text-xs text-zinc-500">Import a statement · {account.name}</p>

        {step === "file" && (
          <div className="mt-4">
            <h1 className="text-lg font-medium">Pick the CSV file</h1>
            <input
              type="file"
              accept=".csv,text/csv"
              className="mt-4 block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-900"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setCsvText(await file.text());
                setStep("mapping");
              }}
            />
            {savedMapping && (
              <p className="mt-3 text-xs text-zinc-500">
                This account has a saved column mapping — it will be applied automatically.
              </p>
            )}
          </div>
        )}

        {step === "mapping" && preview && (
          <div className="mt-4">
            <h1 className="text-lg font-medium">Check the columns</h1>

            <p className="mt-3 text-xs text-zinc-400">Bank preset</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {CSV_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setMapping(preset.mapping)}
                  className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <ColumnSelect
                label="Date column"
                value={mapping.columns.date}
                headers={headerCells}
                onChange={(i) => setMapping({ ...mapping, columns: { ...mapping.columns, date: i } })}
              />
              <ColumnSelect
                label="Description column"
                value={mapping.columns.description}
                headers={headerCells}
                onChange={(i) =>
                  setMapping({ ...mapping, columns: { ...mapping.columns, description: i } })
                }
              />
              {mapping.amount.style === "signed" && (
                <ColumnSelect
                  label="Amount column"
                  value={mapping.amount.column}
                  headers={headerCells}
                  onChange={(i) => setMapping({ ...mapping, amount: { style: "signed", column: i } })}
                />
              )}
              {mapping.amount.style === "debitCredit" && (
                <>
                  <ColumnSelect
                    label="Debit column"
                    value={mapping.amount.debitColumn}
                    headers={headerCells}
                    onChange={(i) =>
                      setMapping({
                        ...mapping,
                        amount: { ...mapping.amount, style: "debitCredit", debitColumn: i } as CsvMapping["amount"],
                      })
                    }
                  />
                  <ColumnSelect
                    label="Credit column"
                    value={mapping.amount.creditColumn}
                    headers={headerCells}
                    onChange={(i) =>
                      setMapping({
                        ...mapping,
                        amount: { ...mapping.amount, style: "debitCredit", creditColumn: i } as CsvMapping["amount"],
                      })
                    }
                  />
                </>
              )}
            </div>

            <div className="mt-3 flex gap-3">
              <label className="block flex-1 text-xs text-zinc-400">
                Amount style
                <select
                  value={mapping.amount.style}
                  onChange={(e) => {
                    const style = e.target.value as CsvMapping["amount"]["style"];
                    setMapping({
                      ...mapping,
                      amount:
                        style === "signed"
                          ? { style, column: 2 }
                          : style === "debitCredit"
                            ? { style, debitColumn: 2, creditColumn: 3 }
                            : { style, amountColumn: 2, directionColumn: 3, debitValues: ["debit"] },
                    });
                  }}
                  className="mt-1 w-full rounded-lg bg-zinc-800 px-2 py-2 text-sm text-zinc-100"
                >
                  <option value="signed">one signed column</option>
                  <option value="debitCredit">debit / credit columns</option>
                  <option value="amountPlusDirection">amount + direction</option>
                </select>
              </label>
              <label className="block flex-1 text-xs text-zinc-400">
                Date format
                <select
                  value={mapping.dateFormat}
                  onChange={(e) =>
                    setMapping({ ...mapping, dateFormat: e.target.value as CsvMapping["dateFormat"] })
                  }
                  className="mt-1 w-full rounded-lg bg-zinc-800 px-2 py-2 text-sm text-zinc-100"
                >
                  {["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "DD-MM-YYYY", "MM/DD/YY"].map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </label>
              <label className="block flex-1 text-xs text-zinc-400">
                Numbers
                <select
                  value={mapping.numberFormat.decimalSeparator}
                  onChange={(e) =>
                    setMapping({
                      ...mapping,
                      numberFormat: e.target.value === "," ? DO_NUMBER_FORMAT : US_NUMBER_FORMAT,
                    })
                  }
                  className="mt-1 w-full rounded-lg bg-zinc-800 px-2 py-2 text-sm text-zinc-100"
                >
                  <option value=".">1,234.56</option>
                  <option value=",">1.234,56</option>
                </select>
              </label>
            </div>

            <label className="mt-3 block text-xs text-zinc-400">
              Skip rows before the header
              <input
                type="number"
                min={0}
                value={mapping.skipRows}
                onChange={(e) => setMapping({ ...mapping, skipRows: Math.max(0, Number(e.target.value)) })}
                className="mt-1 w-24 rounded-lg bg-zinc-800 px-2 py-2 text-sm text-zinc-100"
              />
            </label>

            <h2 className="mt-5 text-sm font-medium text-zinc-300">
              Preview — {preview.rows.length} rows parsed
              {preview.errors.length > 0 && `, ${preview.errors.length} with problems`}
            </h2>
            <div className="mt-2 flex flex-col gap-1">
              {preview.rows.slice(0, 10).map((row, i) => (
                <div key={i} className="flex justify-between rounded bg-zinc-900 px-3 py-1.5 text-xs">
                  <span className="text-zinc-400">{row.postedOn}</span>
                  <span className="mx-2 flex-1 truncate text-zinc-200">{row.description}</span>
                  <span className="tabular-nums text-zinc-100">
                    {formatMinorString(row.amountMinor.toString(), account.currency)}
                  </span>
                </div>
              ))}
              {preview.errors.slice(0, 3).map((err, i) => (
                <p key={i} className="text-xs text-zinc-500">
                  line {err.line}: {err.reason}
                </p>
              ))}
            </div>

            <button
              type="button"
              disabled={preview.rows.length === 0 || preview.errors.length > 0}
              onClick={() =>
                setStep(mapping.accountColumn !== undefined && subaccountValues.length > 1 ? "subaccount" : "balances")
              }
              className="mt-5 w-full rounded-lg bg-zinc-100 py-3 text-sm font-medium text-zinc-900 disabled:opacity-40"
            >
              These look right
            </button>
          </div>
        )}

        {step === "subaccount" && (
          <div className="mt-4">
            <h1 className="text-lg font-medium">Which sub-account is this statement for?</h1>
            <p className="mt-1 text-xs text-zinc-500">
              This file contains rows for more than one account.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {subaccountValues.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setMapping({ ...mapping, accountFilterValue: value });
                    setStep("balances");
                  }}
                  className="rounded-xl bg-zinc-900 px-4 py-3 text-left text-sm text-zinc-100"
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "balances" && (
          <div className="mt-4">
            <h1 className="text-lg font-medium">Statement balances</h1>
            <p className="mt-1 text-xs text-zinc-500">
              From the statement itself — the import only goes through if everything adds up to the cent.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block text-xs text-zinc-400">
                Opening balance
                <input value={opening} onChange={(e) => setOpening(e.target.value)} inputMode="decimal"
                  placeholder="0.00"
                  className="mt-1 w-full rounded-lg bg-zinc-800 px-3 py-2 text-base tabular-nums text-zinc-100" />
              </label>
              <label className="block text-xs text-zinc-400">
                Closing balance
                <input value={closing} onChange={(e) => setClosing(e.target.value)} inputMode="decimal"
                  placeholder="0.00"
                  className="mt-1 w-full rounded-lg bg-zinc-800 px-3 py-2 text-base tabular-nums text-zinc-100" />
              </label>
              <label className="block text-xs text-zinc-400">
                Period start
                <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100" />
              </label>
              <label className="block text-xs text-zinc-400">
                Period end
                <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100" />
              </label>
            </div>

            {serverError && (
              <p className="mt-4 rounded-lg bg-zinc-900 px-4 py-3 text-sm text-zinc-200">{serverError}</p>
            )}

            <button
              type="button"
              disabled={busy || !toMinorString(opening) || !toMinorString(closing) || !periodStart || !periodEnd}
              onClick={submit}
              className="mt-5 w-full rounded-lg bg-zinc-100 py-3 text-sm font-medium text-zinc-900 disabled:opacity-40"
            >
              {busy ? "Checking…" : "Import statement"}
            </button>
          </div>
        )}

        {step === "done" && result && (
          <div className="mt-16 text-center">
            <p className="text-3xl">✓</p>
            <h1 className="mt-3 text-lg font-medium">Statement balances</h1>
            <p className="mt-1 text-sm text-zinc-400">
              {result.inserted} transactions imported and verified to the cent.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 rounded-lg bg-zinc-100 px-6 py-3 text-sm font-medium text-zinc-900"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ColumnSelect({
  label,
  value,
  headers,
  onChange,
}: {
  label: string;
  value: number;
  headers: string[];
  onChange: (index: number) => void;
}) {
  return (
    <label className="block text-xs text-zinc-400">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-lg bg-zinc-800 px-2 py-2 text-sm text-zinc-100"
      >
        {headers.map((header, i) => (
          <option key={i} value={i}>
            {i}: {header || "(empty)"}
          </option>
        ))}
      </select>
    </label>
  );
}
