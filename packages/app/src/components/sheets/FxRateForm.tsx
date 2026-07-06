import { useState } from "react";
import { useSetFxRate } from "../../lib/queries";

/** "What's today's USD/DOP rate?" — one field, so the safe-to-spend number can include DOP accounts. */
export function FxRateForm({ onClose }: { onClose: () => void }) {
  const setRateMutation = useSetFxRate();
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const normalized = rate.trim();
    if (!/^\d+(\.\d{1,4})?$/.test(normalized) || Number(normalized) <= 0) {
      setError("enter a rate like 59.10");
      return;
    }
    try {
      await setRateMutation.mutateAsync(normalized);
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
        <h2 className="text-lg font-medium">Today&rsquo;s USD/DOP rate</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Used to include DOP accounts in the safe-to-spend number.
        </p>

        <label className="mt-4 block text-xs text-zinc-400">
          Rate
          <input
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="decimal"
            placeholder="59.10"
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
            disabled={rate.trim() === "" || setRateMutation.isPending}
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
