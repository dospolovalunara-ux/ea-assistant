import { requireEnv } from "./env";
import { resetSchema, runMigrations } from "../src/server/db/migrate";

const url = requireEnv("DATABASE_URL");
if (process.env.NODE_ENV === "production") {
  console.error("db:reset запрещён в production");
  process.exit(1);
}
await resetSchema(url);
await runMigrations(url);
console.log("✓ База пересоздана. Запустите npm run db:seed");
