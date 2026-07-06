import { describe, expect, it } from "vitest";
import { rankFrequentCategories, isoDate, type CategoryUse } from "../src/index.js";

const TODAY = isoDate("2026-07-06");

function uses(spec: Record<string, string[]>): CategoryUse[] {
  return Object.entries(spec).flatMap(([categoryId, dates]) =>
    dates.map((d) => ({ categoryId, postedOn: isoDate(d) })),
  );
}

describe("rankFrequentCategories", () => {
  it("ranks by count descending", () => {
    const result = rankFrequentCategories(
      uses({
        groceries: ["2026-07-01", "2026-07-02", "2026-07-03"],
        fuel: ["2026-07-01", "2026-07-02"],
        restaurants: ["2026-07-01"],
      }),
      { limit: 6, windowDays: 90, today: TODAY },
    );
    expect(result).toEqual(["groceries", "fuel", "restaurants"]);
  });

  it("breaks count ties by most recent use", () => {
    const result = rankFrequentCategories(
      uses({
        older: ["2026-06-01", "2026-06-02"],
        newer: ["2026-06-01", "2026-07-05"],
      }),
      { limit: 6, windowDays: 90, today: TODAY },
    );
    expect(result).toEqual(["newer", "older"]);
  });

  it("ignores uses outside the window", () => {
    const result = rankFrequentCategories(
      uses({
        stale: ["2025-01-01", "2025-01-02", "2025-01-03"],
        current: ["2026-07-01"],
      }),
      { limit: 6, windowDays: 90, today: TODAY },
    );
    expect(result).toEqual(["current"]);
  });

  it("caps at the limit", () => {
    const spec: Record<string, string[]> = {};
    for (let i = 0; i < 10; i++) spec[`cat${i}`] = ["2026-07-01"];
    const result = rankFrequentCategories(uses(spec), { limit: 6, windowDays: 90, today: TODAY });
    expect(result).toHaveLength(6);
  });

  it("returns empty for no uses", () => {
    expect(rankFrequentCategories([], { limit: 6, windowDays: 90, today: TODAY })).toEqual([]);
  });
});
