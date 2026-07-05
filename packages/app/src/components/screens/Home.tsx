import type { User } from "../../lib/auth";
import { HeroNumber } from "../HeroNumber";

export function Home({ user }: { user: User }) {
  return (
    <HeroNumber
      value="—"
      label="Safe to spend this week"
      trustLine="no accounts yet"
      statusLine={`Welcome, ${user.name}. Add your first account to start tracking.`}
    />
  );
}
