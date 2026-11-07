import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "eai_session";
const PUBLIC = ["/login"];

/**
 * Быстрая проверка наличия cookie сессии. Настоящая проверка сессии и прав
 * выполняется на сервере в каждой странице и функции сервиса.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (!hasSession && !PUBLIC.some((p) => pathname.startsWith(p))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
