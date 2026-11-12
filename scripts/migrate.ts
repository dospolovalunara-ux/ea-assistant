import { requireEnv } from "./env";
import { runMigrations } from "../src/server/db/migrate";

requireEnv("DATABASE_URL");
// Для пула соединений (pgbouncer) миграции идут по прямому подключению, если оно задано
await runMigrations(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!);
console.log("✓ Миграции применены");
