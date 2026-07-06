export type Tab = "home" | "money" | "goals" | "household";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "home", label: "Home" },
  { id: "money", label: "Money" },
  { id: "goals", label: "Goals" },
  { id: "household", label: "Household" },
];

type TabBarProps = {
  active: Tab;
  onChange: (tab: Tab) => void;
  onAdd: () => void;
};

export function TabBar({ active, onChange, onAdd }: TabBarProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 flex items-center justify-around border-t border-zinc-800 bg-zinc-950/95 py-2 backdrop-blur">
      {TABS.slice(0, 2).map((tab) => (
        <TabButton key={tab.id} tab={tab} active={active} onChange={onChange} />
      ))}
      <button
        type="button"
        onClick={onAdd}
        aria-label="Add"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-2xl text-zinc-900"
      >
        +
      </button>
      {TABS.slice(2).map((tab) => (
        <TabButton key={tab.id} tab={tab} active={active} onChange={onChange} />
      ))}
    </nav>
  );
}

function TabButton({
  tab,
  active,
  onChange,
}: {
  tab: { id: Tab; label: string };
  active: Tab;
  onChange: (tab: Tab) => void;
}) {
  const isActive = tab.id === active;
  return (
    <button
      type="button"
      onClick={() => onChange(tab.id)}
      className={`text-sm ${isActive ? "text-zinc-50" : "text-zinc-500"}`}
    >
      {tab.label}
    </button>
  );
}
