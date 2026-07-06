import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "./client.js";
import { categories, households, users } from "./schema.js";

/** Reserved category for statement-opening anchor rows (excluded from spending). */
export const OPENING_BALANCE_CATEGORY = "opening balance";

type CategorySpec = { name: string; kind: "expense" | "income" | "transfer"; children?: string[] };

const DEFAULT_CATEGORIES: CategorySpec[] = [
  { name: "salary", kind: "income" },
  { name: "business income", kind: "income" },
  { name: "interest", kind: "income" },
  { name: "other income", kind: "income" },
  { name: "food", kind: "expense", children: ["groceries", "restaurants"] },
  { name: "housing", kind: "expense", children: ["rent", "utilities", "internet & phone"] },
  { name: "transport", kind: "expense", children: ["fuel", "taxis & rideshare", "vehicle"] },
  { name: "health", kind: "expense", children: ["medical", "pharmacy"] },
  { name: "personal", kind: "expense", children: ["clothing", "personal care"] },
  { name: "home", kind: "expense", children: ["supplies", "maintenance"] },
  { name: "family & gifts", kind: "expense" },
  { name: "entertainment", kind: "expense", children: ["subscriptions", "fun & outings"] },
  { name: "travel", kind: "expense" },
  { name: "education", kind: "expense" },
  { name: "fees & charges", kind: "expense", children: ["bank fees", "government & taxes"] },
  { name: "other", kind: "expense" },
  { name: "transfer", kind: "transfer" },
  { name: OPENING_BALANCE_CATEGORY, kind: "transfer" },
];

export function seed(db: Db) {
  let household = db.select().from(households).get();
  if (!household) {
    household = { id: randomUUID(), name: "Baez Household", baseCurrency: "USD" };
    db.insert(households).values(household).run();
  }

  const seedUsers: Array<{ name: string; role: "operator" | "partner" }> = [
    { name: "Eimer", role: "operator" },
    { name: "Ashley", role: "partner" },
  ];

  for (const u of seedUsers) {
    const existing = db.select().from(users).where(eq(users.name, u.name)).get();
    if (!existing) {
      db.insert(users)
        .values({
          id: randomUUID(),
          householdId: household.id,
          name: u.name,
          role: u.role,
          createdAt: new Date().toISOString(),
        })
        .run();
    }
  }

  const hasCategories = db.select().from(categories).limit(1).get();
  if (!hasCategories) {
    for (const spec of DEFAULT_CATEGORIES) {
      const parentId = randomUUID();
      db.insert(categories)
        .values({ id: parentId, parentId: null, name: spec.name, kind: spec.kind })
        .run();
      for (const child of spec.children ?? []) {
        db.insert(categories)
          .values({ id: randomUUID(), parentId, name: child, kind: spec.kind })
          .run();
      }
    }
  }
}
