type PlusMenuProps = {
  onPick: (action: "cash-expense" | "income" | "upload-statement") => void;
  onClose: () => void;
};

/**
 * The global + (DESIGN §3): opens the designed option menu. "Can we
 * afford…?" joins in M4; upload statement activates with CSV import.
 */
export function PlusMenu({ onPick, onClose }: PlusMenuProps) {
  const OPTIONS: Array<{
    id: Parameters<PlusMenuProps["onPick"]>[0];
    label: string;
    hint: string;
    disabled?: boolean;
  }> = [
    { id: "cash-expense", label: "Cash expense", hint: "spent something" },
    { id: "income", label: "Income received", hint: "money came in" },
    {
      id: "upload-statement",
      label: "Upload statement",
      hint: "arrives with CSV import",
      disabled: true,
    },
  ];

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl bg-zinc-900 p-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        {OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={option.disabled}
            onClick={() => onPick(option.id)}
            className="flex w-full items-baseline justify-between rounded-lg px-3 py-3.5 text-left hover:bg-zinc-800 disabled:opacity-40"
          >
            <span className="text-base text-zinc-100">{option.label}</span>
            <span className="text-xs text-zinc-500">{option.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
