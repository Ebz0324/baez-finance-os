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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/accounts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });
}

export function useUpdateMe() {
  return useMutation({
    mutationFn: (body: { defaultScope?: Scope; quickAddCurrency?: "USD" | "DOP" }) =>
      apiPatch<{ ok: true }>("/me", body),
  });
}
