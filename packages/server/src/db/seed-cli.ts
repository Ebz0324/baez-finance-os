import { openDb } from "./client.js";
import { seed } from "./seed.js";

const db = openDb();
seed(db);
console.log("Seeded household + Eimer (operator) + Ashley (partner).");
