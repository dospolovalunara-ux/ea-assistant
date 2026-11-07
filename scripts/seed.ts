import { requireEnv } from "./env";
import { seedAll } from "../src/server/db/seed";
import { closeDb } from "../src/server/db";

requireEnv("DATABASE_URL");
const password = requireEnv("SEED_DEMO_PASSWORD");
if (password.length < 12) {
  console.error("SEED_DEMO_PASSWORD должен быть не короче 12 символов");
  process.exit(1);
}
await seedAll(password);
await closeDb();
console.log("✓ Демо-данные загружены (вымышленные). Пользователи: assistant@, executive@, techadmin@demo.local");
