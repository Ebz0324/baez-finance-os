import { useState } from "react";
import type { AccountKind, NewAccount } from "../../lib/queries";
import { useCreateAccount } from "../../lib/queries";

const KIND_OPTIONS: Array<{ id: AccountKind; label: string }> = [
  { id: "checking", label: "checking" },
  { id: "savings", label: "savings" },
  { id: "cash", label: "cash" },
  { id: "card", label: "card" },
  { id: "cd", label: "CD" },
  { id: "brokerage", label: "brokerage" },
  { id: "retirement", label: "retirement" },
  { id: "property", label: "property" },
  { id: "vehicle", label: "vehicle" },
  { id: "liability", label: "liability" },
  { id: "custom", label: "other" },
];

export function AccountForm({ onClose }: { onClose: () => void }) {
  const create = useCreateAccount();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("checking");
  const [accountCurrency, setAccountCurrency] = useState<"USD" | "DOP">("USD");
  const [whose, setWhose] = useState<"me" | "partner" | "shared">("me");
  const [openingMajor, setOpeningMajor] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const body: NewAccount = { name: name.trim(), kind, currency: accountCurrency, whose };
    if (openingMajor.trim() !== "") {
      const normalized = openingMajor.trim().replace(/,/g, "");
      if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
        setError("opening balance should look like 1250.00");
        return;
      }
      const [whole, frac = ""] = normalized.split(".");
      body.openingBalanceMinor = `${whole}${frac.padEnd(2, "0")}`;
    }
    try {
      await create.mutateAsync(body);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl bg-zinc-900 p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-medium">Add an account</h2>

        <label className="mt-4 block text-xs text-zinc-400">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Popular checking"
            className="mt-1 w-full rounded-lg bg-zinc-800 px-3 py-2 text-base text-zinc-100"
          />
        </label>

        <p className="mt-4 text-xs text-zinc-400">Type</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {KIND_OPTIONS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              className={`rounded-full px-3 py-1 text-xs ${
                kind === k.id ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-6">
          <div>
            <p className="text-xs text-zinc-400">Currency</p>
            <div className="mt-1 flex gap-1">
              {(["USD", "DOP"] as const).map((cur) => (
                <button
                  key={cur}
                  type="button"
                  onClick={() => setAccountCurrency(cur)}
                  className={`rounded-full px-3 py-1 text-xs ${
                    accountCurrency === cur ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {cur}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-zinc-400">Whose is this?</p>
            <div className="mt-1 flex gap-1">
              {(
                [
                  { id: "me", label: "mine" },
                  { id: "partner", label: "partner's" },
                  { id: "shared", label: "shared" },
                ] as const
              ).map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWhose(w.id)}
                  className={`rounded-full px-3 py-1 text-xs ${
                    whose === w.id ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="mt-4 block text-xs text-zinc-400">
          Current balance (optional)
          <input
            value={openingMajor}
            onChange={(e) => setOpeningMajor(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className="mt-1 w-full rounded-lg bg-zinc-800 px-3 py-2 text-base tabular-nums text-zinc-100"
          />
        </label>

        {error && <p className="mt-3 text-sm text-zinc-400">{error}</p>}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-zinc-700 py-3 text-sm text-zinc-300"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={name.trim() === "" || create.isPending}
            onClick={save}
            className="flex-1 rounded-lg bg-zinc-100 py-3 text-sm font-medium text-zinc-900 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
