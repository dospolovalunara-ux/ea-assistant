import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runTick } from "@/server/scheduler/tick";

/** Плановый вызов (Vercel Cron). Доступ только с секретом CRON_SECRET. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want)) {
    return new NextResponse("Не найдено", { status: 404 });
  }
  const stats = await runTick();
  try {
    const { pullFromGoogle } = await import("@/server/integrations/google-calendar");
    await pullFromGoogle();
  } catch {
    // ошибка синхронизации записывается в integrations и показывается в настройках
  }
  return NextResponse.json({ ok: true, stats });
}
