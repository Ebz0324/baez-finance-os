import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "../../lib/auth";
import { enqueueQuickAdd } from "../../lib/outbox";
import { useFrequentCategories, useUpdateMe } from "../../lib/queries";
import { CategoryPicker } from "./CategoryPicker";

type QuickAddProps = {
  user: User;
  initialDirection: "expense" | "income";
  onClose: () => void;
};

/**
 * DESIGN §4: amount is the only required field; category optional; no way to
 * fail this screen; no AI commentary. Saves through the offline outbox.
 */
export function QuickAdd({ user, initialDirection, onClose }: QuickAddProps) {
  const qc = useQueryClient();
  const updateMe = useUpdateMe();
  const frequentQuery = useFrequentCategories();

  const [direction, setDirection] = useState<"expense" | "income">(initialDirection);
  const [amountCurrency, setAmountCurrency] = useState<"USD" | "DOP">(
    user.quickAddCurrency ?? "DOP",
  );
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<{ id: string; name: string } | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [saved, setSaved] = useState(false);

  const chips = (frequentQuery.data ?? []).slice(0, 6);

  function toggleCurrency(next: "USD" | "DOP") {
    setAmountCurrency(next);
    updateMe.mutate({ quickAddCurrency: next }); // remembered per user
  }

  const normalized = amount.trim().replace(/,/g, "");
  const valid = /^\d+(\.\d{1,2})?$/.test(normalized) && Number(normalized) > 0;

  async function save() {
    if (!valid || saved) return;
    const [whole, frac = ""] = normalized.split(".");
    const payload = {
      id: crypto.randomUUID(),
      amountMinor: `${whole}${frac.padEnd(2, "0")}`,
      currency: amountCurrency,
      direction,
      ...(category ? { categoryId: category.id } : {}),
    };
    await enqueueQuickAdd(payload);
    // Surface immediately even offline; server truth reconciles on flush.
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
    setSaved(true);
    setTimeout(onClose, 600); // brief confirmation → close
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl bg-zinc-900 p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        {saved ? (
          <p className="py-10 text-center text-lg">Saved ✓</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {(
                  [
                    { id: "expense", label: "spent" },
                    { id: "income", label: "received" },
                  ] as const
                ).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDirection(d.id)}
                    className={`rounded-full px-3 py-1 text-xs ${
                      direction === d.id ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                {(["DOP", "USD"] as const).map((cur) => (
                  <button
                    key={cur}
                    type="button"
                    onClick={() => toggleCurrency(cur)}
                    className={`rounded-full px-3 py-1 text-xs ${
                      amountCurrency === cur ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {cur}
                  </button>
                ))}
              </div>
            </div>

            <input
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="mt-5 w-full bg-transparent text-center text-5xl font-semibold tabular-nums text-zinc-100 outline-none placeholder:text-zinc-700"
            />

            <div className="mt-5 flex flex-wrap justify-center gap-1">
              {chips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setCategory(category?.id === chip.id ? null : chip)}
                  className={`rounded-full px-3 py-1.5 text-xs ${
                    category?.id === chip.id
                      ? "bg-zinc-100 text-zinc-900"
                      : "bg-zinc-800 text-zinc-300"
                  }`}
                >
                  {chip.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className={`rounded-full px-3 py-1.5 text-xs ${
                  category && !chips.some((chip) => chip.id === category.id)
                    ? "bg-zinc-100 text-zinc-900"
                    : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {category && !chips.some((chip) => chip.id === category.id)
                  ? category.name
                  : "Other…"}
              </button>
            </div>

            <button
              type="button"
              disabled={!valid}
              onClick={save}
              className="mt-6 w-full rounded-lg bg-zinc-100 py-3 text-sm font-medium text-zinc-900 disabled:opacity-40"
            >
              Save
            </button>
          </>
        )}

        {showPicker && (
          <CategoryPicker
            kind={direction}
            onPick={(picked) => {
              setCategory(picked);
              setShowPicker(false);
            }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>
    </div>
  );
}
