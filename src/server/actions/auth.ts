"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate, LOGIN_MESSAGES } from "../auth/login";
import { clientMeta } from "../auth/current";
import { deleteSession, SESSION_COOKIE } from "../auth/session";
import { getDb } from "../db";
import { writeAudit } from "../services/audit";
import type { ActionState } from "@/lib/action-state";

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "");
  const password = String(fd.get("password") ?? "");
  if (!email.trim() || !password) return { error: "Введите email и пароль", values: { email } };
  if (password.length > 200) return { error: LOGIN_MESSAGES.invalid, values: { email } };

  const meta = await clientMeta();
  const result = await authenticate(email, password, meta);
  if (!result.ok) return { error: LOGIN_MESSAGES[result.reason], values: { email } };

  (await cookies()).set(SESSION_COOKIE, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: result.expiresAt,
  });
  redirect("/");
}

export async function logoutAction() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const userId = await deleteSession(token);
    const { ip } = await clientMeta();
    if (userId) await writeAudit(getDb(), { userId, action: "auth.logout", entityType: "user", entityId: userId, ip });
  }
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
