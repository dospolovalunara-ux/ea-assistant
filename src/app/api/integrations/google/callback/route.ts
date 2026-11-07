import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/server/auth/current";
import { can } from "@/server/auth/rbac";
import { finishGoogleAuth } from "@/server/integrations/google-calendar";

export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor || !can(actor, "integrations.manage")) return new NextResponse("Не найдено", { status: 404 });
  const sp = req.nextUrl.searchParams;
  const back = (q: string) => NextResponse.redirect(new URL(`/settings?${q}`, req.url));
  if (sp.get("error")) return back(`google_error=${encodeURIComponent("Доступ не выдан: " + sp.get("error"))}`);
  try {
    await finishGoogleAuth(actor.id, sp.get("state") ?? "", sp.get("code") ?? "", actor.ip);
    return back("google=connected");
  } catch (e) {
    return back(`google_error=${encodeURIComponent(e instanceof Error ? e.message : "Ошибка подключения")}`);
  }
}
