import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { get, set, del } from "idb-keyval";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 24 * 60 * 60 * 1000, // keep a day of cache so Home opens instantly offline
    },
  },
});

// TanStack Query cache persisted to IndexedDB per DESIGN.md §7 — Home should open
// to last-known-good state even offline. There's nothing meaningful to cache yet
// in M0 (no queries exist), but wiring this now is cheaper than retrofitting later.
export const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get(key),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
});
