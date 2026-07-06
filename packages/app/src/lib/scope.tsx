import { createContext, useContext, useState, type ReactNode } from "react";
import type { Scope, User } from "./auth";
import { useUpdateMe } from "./queries";

type ScopeContextValue = {
  scope: Scope;
  setScope: (scope: Scope) => void;
};

const ScopeContext = createContext<ScopeContextValue | null>(null);

/** DESIGN §3: the scope switcher is a pure filter, never a mode; persists per user. */
export function ScopeProvider({ user, children }: { user: User; children: ReactNode }) {
  const [scope, setScopeState] = useState<Scope>(user.defaultScope);
  const updateMe = useUpdateMe();

  const setScope = (next: Scope) => {
    setScopeState(next);
    updateMe.mutate({ defaultScope: next }); // fire-and-forget; local state is source of truth
  };

  return <ScopeContext.Provider value={{ scope, setScope }}>{children}</ScopeContext.Provider>;
}

export function useScope(): ScopeContextValue {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error("useScope outside ScopeProvider");
  return ctx;
}
