import { useAccounts, type Account } from "../../lib/queries";

/** "Which account is this statement for?" — one question, big targets. */
export function AccountPicker({
  onPick,
  onClose,
}: {
  onPick: (account: Account) => void;
  onClose: () => void;
}) {
  const accountsQuery = useAccounts("household");
  const accounts = (accountsQuery.data ?? []).filter((a) => a.kind !== "cash");

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[70vh] w-full overflow-y-auto rounded-t-2xl bg-zinc-900 p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-medium">Which account is the statement for?</h2>
        <div className="mt-3 flex flex-col gap-2">
          {accounts.length === 0 && (
            <p className="text-sm text-zinc-500">
              No bank accounts yet — add one under Money first.
            </p>
          )}
          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              onClick={() => onPick(account)}
              className="rounded-xl bg-zinc-800 px-4 py-3 text-left"
            >
              <p className="text-sm text-zinc-100">{account.name}</p>
              <p className="text-xs text-zinc-500">
                {account.kind} · {account.currency}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
