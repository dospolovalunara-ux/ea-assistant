import "./env";
import { runTick } from "../src/server/scheduler/tick";
import { closeDb } from "../src/server/db";

// Отдельный запуск одного прохода планировщика (например, из cron): npm run worker
const stats = await runTick();
console.log("✓ Проход планировщика:", stats);
await closeDb();
