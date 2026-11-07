export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SCHEDULER_ENABLED !== "false" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startScheduler } = await import("./server/scheduler/runner");
    startScheduler();
  }
}
