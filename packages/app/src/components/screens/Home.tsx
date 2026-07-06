import type { User } from "../../lib/auth";
import { HeroNumber } from "../HeroNumber";
import { ScopeSwitcher } from "../ScopeSwitcher";

export function Home({ user }: { user: User }) {
  return (
    <div>
      <ScopeSwitcher />
      <HeroNumber
        value="—"
        label="Safe to spend this week"
        trustLine="no accounts yet"
        statusLine={`Welcome, ${user.name}. Add your first account to start tracking.`}
      />
    </div>
  );
}
