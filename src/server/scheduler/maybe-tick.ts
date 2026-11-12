import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { appState } from "../db/schema";
import { runTick } from "./tick";

const MIN_INTERVAL_MS = 60_000;

/**
 * Для хостинга без постоянного процесса (Vercel): проход планировщика
 * запускается после ответа на запрос, не чаще раза в минуту на всё приложение.
 * runTick идемпотентен и защищён advisory-lock.
 */
export async function maybeTick(now = new Date()): Promise<boolean> {
  const db = getDb();
  const claimed = await db.execute(sql`
    insert into ${appState} (key, value, updated_at) values ('scheduler_last_tick', ${now.toISOString()}, ${now})
    on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at
    where ${appState}.updated_at < ${new Date(now.getTime() - MIN_INTERVAL_MS)}
    returning key`);
  if (!claimed.rows.length) return false;
  await runTick(now);
  return true;
}
