import { createStore, del, entries, get, set, update } from "idb-keyval";
import { apiPost } from "./api";
import { ApiError } from "./api";

/**
 * Offline outbox for quick add ONLY (DESIGN §5/§7): dedicated IndexedDB
 * store, separate from the TanStack query cache. The outbox IS the durable
 * queue — entries survive app restarts and replay FIFO when connectivity
 * returns. The server upserts by client UUID, so replays are always safe.
 */

export type QuickAddPayload = {
  id: string;
  amountMinor: string;
  currency: "USD" | "DOP";
  direction: "expense" | "income";
  categoryId?: string;
  occurredOn?: string;
};

type OutboxEntry = {
  id: string;
  payload: QuickAddPayload;
  createdAt: string;
  attempts: number;
  lastError?: string;
};

const store = createStore("finance-os", "outbox");

let flushing = false;
let onChange: (() => void) | null = null;

/** UI hook point: called after every enqueue/flush mutation of the queue. */
export function setOutboxListener(listener: (() => void) | null) {
  onChange = listener;
}

export async function enqueueQuickAdd(payload: QuickAddPayload): Promise<void> {
  const entry: OutboxEntry = {
    id: payload.id,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  await set(payload.id, entry, store);
  onChange?.();
  void flushOutbox();
}

export async function pendingCount(): Promise<number> {
  return (await entries(store)).length;
}

/**
 * FIFO replay. A network failure stops the pass (retried on the next
 * trigger); a 4xx parks the entry with lastError rather than blocking the
 * rest — client-side validation makes that near-impossible in practice.
 */
export async function flushOutbox(): Promise<void> {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    const all = (await entries<string, OutboxEntry>(store))
      .map(([, entry]) => entry)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

    for (const entry of all) {
      if (entry.lastError) continue; // parked — needs code changes, not retries
      try {
        const result = await apiPost<{ transaction?: { id?: string } }>(
          "/transactions/quick-add",
          entry.payload,
        );
        // Belt-and-suspenders: only drop the durable copy once the server has
        // confirmed THIS row. Anything unexpected parks the entry instead.
        if (result?.transaction?.id !== entry.payload.id) {
          throw new ApiError("server did not confirm the transaction", 422);
        }
        await del(entry.id, store);
        onChange?.();
      } catch (err) {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          const message = err.message;
          await update<OutboxEntry>(
            entry.id,
            (old) =>
              old
                ? { ...old, attempts: old.attempts + 1, lastError: message }
                : { ...entry, attempts: entry.attempts + 1, lastError: message },
            store,
          );
          onChange?.();
          continue;
        }
        // Network/server trouble: stop, keep order, retry on next trigger.
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

export function startOutbox(): () => void {
  const flush = () => void flushOutbox();
  window.addEventListener("online", flush);
  void flushOutbox(); // app-mount replay
  return () => window.removeEventListener("online", flush);
}

/** Test/debug helper. */
export async function peekOutbox(): Promise<OutboxEntry[]> {
  return (await entries<string, OutboxEntry>(store)).map(([, e]) => e);
}

export async function getEntry(id: string): Promise<OutboxEntry | undefined> {
  return get(id, store);
}
