import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "./api";
import type { Scope } from "./auth";

export type AccountKind =
  | "checking"
  | "savings"
  | "cash"
  | "card"
  | "cd"
  | "brokerage"
  | "retirement"
  | "property"
  | "vehicle"
  | "liability"
  | "custom";

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  currency: "USD" | "DOP";
  scope: Scope;
  ownerId: string;
  csvMapping: string | null;
  balanceMinor: string;
  lastActivityOn: string | null;
};

export function useAccounts(scope: Scope) {
  return useQuery({
    queryKey: ["accounts", scope],
    queryFn: () => apiGet<{ accounts: Account[] }>(`/accounts?scope=${scope}`),
    select: (data) => data.accounts,
  });
}

export type NewAccount = {
  name: string;
  kind: AccountKind;
  currency: "USD" | "DOP";
  whose: "me" | "partner" | "shared";
  openingBalanceMinor?: string;
};

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NewAccount) => apiPost<{ id: string }>("/accounts", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["safe-to-spend"] });
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/accounts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["safe-to-spend"] });
    },
  });
}

export function useUpdateMe() {
  return useMutation({
    mutationFn: (body: { defaultScope?: Scope; quickAddCurrency?: "USD" | "DOP" }) =>
      apiPatch<{ ok: true }>("/me", body),
  });
}

export type Transaction = {
  id: string;
  accountId: string;
  categoryId: string | null;
  postedOn: string;
  amountMinor: string;
  currency: "USD" | "DOP";
  merchantRaw: string | null;
  catSource: "rule" | "ai" | "user" | null;
  accountName: string;
  categoryName: string | null;
  /** Client-only: true while the row is still waiting in the offline outbox. */
  pending?: boolean;
};

export function useTransactions(scope: Scope) {
  return useQuery({
    queryKey: ["transactions", scope],
    queryFn: () =>
      apiGet<{ transactions: Transaction[]; nextCursor: string | null }>(
        `/transactions?scope=${scope}&limit=30`,
      ),
    select: (data) => data.transactions,
  });
}

export type Category = {
  id: string;
  parentId: string | null;
  name: string;
  kind: "expense" | "income" | "transfer";
};

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<{ categories: Category[] }>("/categories"),
    select: (data) => data.categories,
    staleTime: 60 * 60 * 1000, // the tree changes rarely
  });
}

export function useFrequentCategories() {
  return useQuery({
    queryKey: ["categories", "frequent"],
    queryFn: () =>
      apiGet<{ categories: Array<Pick<Category, "id" | "name" | "kind">> }>("/categories/frequent"),
    select: (data) => data.categories,
  });
}

export function useCategorize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, categoryId }: { id: string; categoryId: string }) =>
      apiPatch<{ ok: true }>(`/transactions/${id}`, { categoryId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["categories", "frequent"] });
    },
  });
}

export type SafeToSpend = {
  availableMinor: string;
  baseCurrency: "USD" | "DOP";
  accountCount: number;
  dataThrough: string | null;
  needsRate: boolean;
  excludedAccounts: Array<{ id: string; name: string; currency: "USD" | "DOP" }>;
};

export function useSafeToSpend(scope: Scope) {
  return useQuery({
    queryKey: ["safe-to-spend", scope],
    queryFn: () => apiGet<SafeToSpend>(`/safe-to-spend?scope=${scope}`),
  });
}

export type FxRate = { rate: string | null; rateDate: string | null; source: string | null };

export function useFxRate() {
  return useQuery({
    queryKey: ["fx-rate"],
    queryFn: () => apiGet<FxRate>("/fx/rate"),
  });
}

export function useSetFxRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rate: string) => apiPost<{ ok: true }>("/fx/rate", { rate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fx-rate"] });
      qc.invalidateQueries({ queryKey: ["safe-to-spend"] });
    },
  });
}
