import { useState } from "react";
import { useScope } from "../../lib/scope";
import {
  useAccounts,
  useCategorize,
  useDeleteAccount,
  useTransactions,
  type Account,
  type Transaction,
} from "../../lib/queries";
import { formatMinorString } from "../../lib/format";
import { RecordCard } from "../RecordCard";
import { ScopeSwitcher } from "../ScopeSwitcher";
import { AccountForm } from "../sheets/AccountForm";
import { CategoryPicker } from "../sheets/CategoryPicker";

export function Money() {
  const { scope } = useScope();
  const accountsQuery = useAccounts(scope);
  const transactionsQuery = useTransactions(scope);
  const deleteAccount = useDeleteAccount();
  const categorize = useCategorize();
  const [showForm, setShowForm] = useState(false);
  const [categorizing, setCategorizing] = useState<Transaction | null>(null);

  const accounts = accountsQuery.data ?? [];
  const transactions = transactionsQuery.data ?? [];

  return (
    <div className="px-4 pb-24">
      <ScopeSwitcher />

      <h1 className="mt-4 text-lg font-medium">Accounts</h1>

      {accountsQuery.isLoading && <p className="mt-4 text-sm text-zinc-500">Loading…</p>}

      {!accountsQuery.isLoading && accounts.length === 0 && (
        // Empty state = prompt card offering the next action (nav law 4).
        <div className="mt-4 rounded-xl bg-zinc-900 p-5 text-center">
          <p className="text-sm text-zinc-200">No accounts here yet.</p>
          <p className="mt-1 text-xs text-zinc-500">
            Add the accounts you want to track — balances build from what you record.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-4 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900"
          >
            Add an account
          </button>
        </div>
      )}

      {accounts.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onDelete={() => deleteAccount.mutate(account.id)}
            />
          ))}
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-2 rounded-xl border border-dashed border-zinc-700 py-3 text-sm text-zinc-400"
          >
            Add an account
          </button>
        </div>
      )}

      {transactions.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-medium">Recent activity</h2>
          <div className="mt-3 flex flex-col gap-2">
            {transactions.map((t) => (
              <RecordCard
                key={t.id}
                title={t.merchantRaw ?? t.categoryName ?? "uncategorized"}
                subtitle={`${t.postedOn} · ${t.accountName}${
                  t.categoryName ? ` · ${t.categoryName}` : ""
                }`}
                value={formatMinorString(t.amountMinor, t.currency)}
                onClick={() => setCategorizing(t)}
              />
            ))}
          </div>
        </>
      )}

      {showForm && <AccountForm onClose={() => setShowForm(false)} />}
      {categorizing && (
        <CategoryPicker
          kind={BigInt(categorizing.amountMinor) < 0n ? "expense" : "income"}
          onPick={(picked) => {
            categorize.mutate({ id: categorizing.id, categoryId: picked.id });
            setCategorizing(null);
          }}
          onClose={() => setCategorizing(null)}
        />
      )}
    </div>
  );
}

function AccountCard({ account, onDelete }: { account: Account; onDelete: () => void }) {
  return (
    <RecordCard
      title={account.name}
      subtitle={`${account.kind} · ${account.currency}${
        account.lastActivityOn ? ` · data through ${account.lastActivityOn}` : ""
      }`}
      value={formatMinorString(account.balanceMinor, account.currency)}
      overflowActions={[{ label: "Delete account", onSelect: onDelete }]}
    />
  );
}
