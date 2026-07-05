import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { openDb, ensureSchema } from "./client.js";
import { households, users } from "./schema.js";

export function seed(db: ReturnType<typeof openDb>) {
  ensureSchema(db);

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
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = openDb();
  seed(db);
  console.log("Seeded household + Eimer (operator) + Ashley (partner).");
}
