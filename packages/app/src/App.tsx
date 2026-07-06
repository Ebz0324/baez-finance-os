import { useEffect, useState } from "react";
import { getMe, logout, type User } from "./lib/auth";
import { ScopeProvider } from "./lib/scope";
import { startOutbox } from "./lib/outbox";
import { TabBar, type Tab } from "./components/TabBar";
import { PlusMenu } from "./components/PlusMenu";
import { Home } from "./components/screens/Home";
import { Money } from "./components/screens/Money";
import { Stub } from "./components/screens/Stub";
import { Login } from "./components/screens/Login";
import { QuickAdd } from "./components/sheets/QuickAdd";

export function App() {
  const [user, setUser] = useState<User | null | "loading">("loading");
  const [tab, setTab] = useState<Tab>("home");
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [quickAdd, setQuickAdd] = useState<"expense" | "income" | null>(null);

  useEffect(() => {
    getMe().then(setUser);
  }, []);

  useEffect(() => {
    if (user && user !== "loading") return startOutbox();
  }, [user]);

  if (user === "loading") return null;
  if (!user) return <Login onAuthed={setUser} />;

  return (
    <ScopeProvider user={user}>
      <div className="min-h-full pb-20">
        {tab === "home" && <Home user={user} />}
        {tab === "money" && <Money />}
        {tab === "goals" && <Stub title="Goals" arrives="M4" />}
        {tab === "household" && <Stub title="Household" arrives="M4" />}

        <button
          type="button"
          onClick={() => logout().then(() => setUser(null))}
          className="fixed right-4 top-4 text-xs text-zinc-500"
        >
          Log out
        </button>

        <TabBar active={tab} onChange={setTab} onAdd={() => setShowPlusMenu(true)} />

        {showPlusMenu && (
          <PlusMenu
            onPick={(action) => {
              setShowPlusMenu(false);
              if (action === "cash-expense") setQuickAdd("expense");
              if (action === "income") setQuickAdd("income");
            }}
            onClose={() => setShowPlusMenu(false)}
          />
        )}

        {quickAdd && (
          <QuickAdd user={user} initialDirection={quickAdd} onClose={() => setQuickAdd(null)} />
        )}
      </div>
    </ScopeProvider>
  );
}
