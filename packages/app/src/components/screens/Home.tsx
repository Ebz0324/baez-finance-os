import { useState } from "react";
import type { User } from "../../lib/auth";
import { useScope } from "../../lib/scope";
import { useSafeToSpend } from "../../lib/queries";
import { formatMinorString } from "../../lib/format";
import { HeroNumber } from "../HeroNumber";
import { ScopeSwitcher } from "../ScopeSwitcher";
import { FxRateForm } from "../sheets/FxRateForm";

export function Home({ user }: { user: User }) {
  const { scope } = useScope();
  const safeToSpend = useSafeToSpend(scope);
  const [settingRate, setSettingRate] = useState(false);

  const data = safeToSpend.data;
  const value = data ? formatMinorString(data.availableMinor, data.baseCurrency) : "—";

  let trustLine = "no accounts yet";
  if (data) {
    if (data.accountCount === 0) trustLine = "no accounts yet";
    else if (data.dataThrough) trustLine = `data through ${data.dataThrough}`;
    else trustLine = "no transactions yet";
  }

  let statusLine = `Welcome, ${user.name}. Add your first account to start tracking.`;
  if (data && data.accountCount > 0) {
    statusLine = data.needsRate
      ? `Not counting ${data.excludedAccounts[0]!.name} — add today's exchange rate to include it.`
      : "Everything here is up to date.";
  }

  return (
    <div>
      <ScopeSwitcher />
      <HeroNumber
        value={value}
        label="Safe to spend this week"
        trustLine={trustLine}
        statusLine={statusLine}
      />
      {data?.needsRate && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setSettingRate(true)}
            className="mt-2 text-sm text-zinc-300 underline underline-offset-2"
          >
            Add today&rsquo;s rate
          </button>
        </div>
      )}
      {settingRate && <FxRateForm onClose={() => setSettingRate(false)} />}
    </div>
  );
}
