import { useEffect, useState } from "react";
import { getMe, logout, type User } from "./lib/auth";
import { TabBar, type Tab } from "./components/TabBar";
import { Home } from "./components/screens/Home";
import { Stub } from "./components/screens/Stub";
import { Login } from "./components/screens/Login";

export function App() {
  const [user, setUser] = useState<User | null | "loading">("loading");
  const [tab, setTab] = useState<Tab>("home");

  useEffect(() => {
    getMe().then(setUser);
  }, []);

  if (user === "loading") return null;
  if (!user) return <Login onAuthed={setUser} />;

  return (
    <div className="min-h-full pb-20">
      {tab === "home" && <Home user={user} />}
      {tab === "money" && <Stub title="Money" arrives="M1" />}
      {tab === "goals" && <Stub title="Goals" arrives="M4" />}
      {tab === "household" && <Stub title="Household" arrives="M4" />}

      <button
        type="button"
        onClick={() => logout().then(() => setUser(null))}
        className="fixed right-4 top-4 text-xs text-zinc-500"
      >
        Log out
      </button>

      <TabBar active={tab} onChange={setTab} onAdd={() => {}} />
    </div>
  );
}
