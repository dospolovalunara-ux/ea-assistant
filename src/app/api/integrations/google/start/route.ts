import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/server/auth/current";
import { can, logDenied } from "@/server/auth/rbac";
import { startGoogleAuth } from "@/server/integrations/google-calendar";

export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.redirect(new URL("/login", req.url));
  if (!can(actor, "integrations.manage")) {
    await logDenied(actor, { permission: "integrations.manage", entityType: "integration" });
    return new NextResponse("Не найдено", { status: 404 });
  }
  try {
    return NextResponse.redirect(await startGoogleAuth(actor.id));
  } catch (e) {
    const msg = encodeURIComponent(e instanceof Error ? e.message : "Ошибка");
    return NextResponse.redirect(new URL(`/settings?google_error=${msg}`, req.url));
  }
}
