import type { ReactNode } from "react";

type RecordCardProps = {
  title: string;
  subtitle?: string;
  value?: string;
  onClick?: () => void;
  /** Rare/destructive actions live behind this, never beside frequent taps. */
  overflowActions?: Array<{ label: string; onSelect: () => void }>;
  children?: ReactNode;
};

/** The record-card pattern (DESIGN §4) — accounts, bills, binder entries. */
export function RecordCard({ title, subtitle, value, onClick, overflowActions, children }: RecordCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-zinc-900 px-4 py-3">
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className="flex flex-1 items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <p className="truncate text-sm text-zinc-100">{title}</p>
          {subtitle && <p className="truncate text-xs text-zinc-500">{subtitle}</p>}
        </div>
        {value && <p className="shrink-0 text-sm tabular-nums text-zinc-100">{value}</p>}
      </button>
      {overflowActions && overflowActions.length > 0 && (
        <OverflowMenu actions={overflowActions} />
      )}
      {children}
    </div>
  );
}

function OverflowMenu({ actions }: { actions: Array<{ label: string; onSelect: () => void }> }) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none px-1 text-zinc-500">⋯</summary>
      <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-zinc-700 bg-zinc-800 py-1">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={(e) => {
              (e.currentTarget.closest("details") as HTMLDetailsElement).open = false;
              a.onSelect();
            }}
            className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-700"
          >
            {a.label}
          </button>
        ))}
      </div>
    </details>
  );
}
