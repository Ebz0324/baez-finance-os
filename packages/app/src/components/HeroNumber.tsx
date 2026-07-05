type HeroNumberProps = {
  value: string;
  label: string;
  trustLine: string;
  statusLine: string;
};

// The "hero number" pattern (DESIGN.md §4): one permission number, the trust
// line beneath it, then a status line naming the next concrete event. Reused
// on Home; other screens compose the same four other patterns, never a sixth.
export function HeroNumber({ value, label, trustLine, statusLine }: HeroNumberProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 pt-16 text-center">
      <p className="text-sm uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="text-6xl font-semibold tabular-nums">{value}</p>
      <p className="text-sm text-zinc-400">{trustLine}</p>
      <p className="mt-4 text-base text-zinc-200">{statusLine}</p>
    </div>
  );
}
