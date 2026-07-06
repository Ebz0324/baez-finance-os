import type { Scope } from "../lib/auth";
import { useScope } from "../lib/scope";

const OPTIONS: Array<{ id: Scope; label: string }> = [
  { id: "me", label: "me" },
  { id: "household", label: "household" },
  { id: "partner", label: "partner" },
];

export function ScopeSwitcher() {
  const { scope, setScope } = useScope();
  return (
    <div className="flex justify-center gap-1 pt-4">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setScope(o.id)}
          className={`rounded-full px-3 py-1 text-xs ${
            scope === o.id ? "bg-zinc-100 text-zinc-900" : "text-zinc-400"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
