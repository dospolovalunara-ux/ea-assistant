import { requireEnv } from "./env";
import { runMigrations } from "../src/server/db/migrate";

await runMigrations(requireEnv("DATABASE_URL"));
console.log("✓ Миграции применены");
