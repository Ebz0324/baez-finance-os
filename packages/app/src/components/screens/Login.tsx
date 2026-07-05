import { useState } from "react";
import { loginWithPasskey, setupPasskey, type User } from "../../lib/auth";

export function Login({ onAuthed }: { onAuthed: (user: User) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<User>) {
    setError(null);
    setBusy(true);
    try {
      onAuthed(await action());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-8 px-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Household Finance OS</h1>
        <p className="mt-1 text-sm text-zinc-400">Sign in with your passkey.</p>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => run(loginWithPasskey)}
        className="w-full max-w-xs rounded-lg bg-zinc-50 px-4 py-3 font-medium text-zinc-950 disabled:opacity-50"
      >
        Log in with passkey
      </button>

      <div className="w-full max-w-xs border-t border-zinc-800 pt-6">
        <p className="text-xs text-zinc-500">First time on this device</p>
        <div className="mt-3 flex gap-3">
          {(["Eimer", "Ashley"] as const).map((name) => (
            <button
              key={name}
              type="button"
              disabled={busy}
              onClick={() => run(() => setupPasskey(name))}
              className="flex-1 rounded-lg border border-zinc-700 px-3 py-2 text-sm disabled:opacity-50"
            >
              Set up {name}&rsquo;s passkey
            </button>
          ))}
        </div>
      </div>

      {error && <p className="max-w-xs text-sm text-red-400">{error}</p>}
    </div>
  );
}
