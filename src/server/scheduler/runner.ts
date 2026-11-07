import { runTick } from "./tick";

const g = globalThis as unknown as { __eaiScheduler?: NodeJS.Timeout };

/** Запускает планировщик раз в минуту (один на процесс; между процессами — advisory-lock). */
export function startScheduler(intervalMs = 60_000) {
  if (g.__eaiScheduler) return;
  const run = async () => {
    try {
      await runTick();
      const { pullFromGoogle } = await import("../integrations/google-calendar");
      await pullFromGoogle().catch((e) => console.error("[scheduler] google sync:", e instanceof Error ? e.message : e));
    } catch (e) {
      console.error("[scheduler] tick failed:", e instanceof Error ? e.message : e);
    }
  };
  g.__eaiScheduler = setInterval(run, intervalMs);
  setTimeout(run, 5_000);
  console.log("[scheduler] фоновый планировщик запущен");
}
