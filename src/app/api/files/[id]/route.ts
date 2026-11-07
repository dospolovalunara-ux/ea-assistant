import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/server/auth/current";
import { checkFileLink, readFileForDownload } from "@/server/services/files";
import { NotFoundError } from "@/server/errors";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return new NextResponse("Не найдено", { status: 404 });
  const { id } = await params;
  const sp = req.nextUrl.searchParams;
  if (!checkFileLink(actor, id, sp.get("exp"), sp.get("sig"))) {
    return new NextResponse("Ссылка недействительна или устарела. Обновите страницу.", { status: 403 });
  }
  try {
    const f = await readFileForDownload(actor, id);
    return new NextResponse(new Uint8Array(f.data), {
      headers: {
        "Content-Type": f.mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof NotFoundError) return new NextResponse("Не найдено", { status: 404 });
    throw e;
  }
}
