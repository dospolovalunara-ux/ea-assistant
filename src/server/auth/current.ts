import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { findSessionUser, SESSION_COOKIE } from "./session";
import { loadActor, type Actor } from "./rbac";

/** IP клиента. За обратным прокси берётся первый адрес из X-Forwarded-For. */
export async function clientMeta() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent") };
}

export const getActor = cache(async (): Promise<Actor | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await findSessionUser(token);
  if (!s) return null;
  const { ip } = await clientMeta();
  return loadActor(s.userId, ip);
});

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return actor;
}
