/** The progress-bar pattern (DESIGN §4) — guided modes, goals, envelopes. */
export function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = Math.round((step / total) * 100);
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
      <div className="h-full bg-zinc-100 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
