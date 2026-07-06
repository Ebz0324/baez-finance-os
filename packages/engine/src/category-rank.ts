import type { IsoDate } from "./types.js";

export type CategoryUse = { categoryId: string; postedOn: IsoDate };

export type RankOptions = {
  limit: number;
  windowDays: number;
  /** "Today" for the recency window — injected, engine has no clock. */
  today: IsoDate;
};

/**
 * Most-used categories within the window, count desc, ties broken by most
 * recent use. Powers the six quick-add chips.
 */
export function rankFrequentCategories(
  uses: readonly CategoryUse[],
  options: RankOptions,
): string[] {
  const cutoff = shiftIsoDate(options.today, -options.windowDays);

  const stats = new Map<string, { count: number; lastUsed: string }>();
  for (const use of uses) {
    if (use.postedOn < cutoff || use.postedOn > options.today) continue;
    const entry = stats.get(use.categoryId);
    if (entry) {
      entry.count += 1;
      if (use.postedOn > entry.lastUsed) entry.lastUsed = use.postedOn;
    } else {
      stats.set(use.categoryId, { count: 1, lastUsed: use.postedOn });
    }
  }

  return [...stats.entries()]
    .sort(([, a], [, b]) => b.count - a.count || (b.lastUsed < a.lastUsed ? -1 : 1))
    .slice(0, options.limit)
    .map(([categoryId]) => categoryId);
}

function shiftIsoDate(date: IsoDate, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}
