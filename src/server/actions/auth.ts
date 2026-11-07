"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate, LOGIN_MESSAGES } from "../auth/login";
import { completeMfaLogin, MFA_CHALLENGE_TTL_MS } from "../auth/mfa";
import { clientMeta } from "../auth/current";
import { deleteSession, SESSION_COOKIE } from "../auth/session";
import { getDb } from "../db";
import { writeAudit } from "../services/audit";
import type { ActionState } from "@/lib/action-state";

const MFA_COOKIE = "eai_mfa";
const secure = process.env.NODE_ENV === "production";

async function setSessionCookie(token: string, expires: Date) {
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", expires });
}

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "");
  const password = String(fd.get("password") ?? "");
  if (!email.trim() || !password) return { error: "Введите email и пароль", values: { email } };
  if (password.length > 200) return { error: LOGIN_MESSAGES.invalid, values: { email } };

  const meta = await clientMeta();
  const result = await authenticate(email, password, meta);
  if (!result.ok) {
    if (result.reason === "mfa_required") {
      (await cookies()).set(MFA_COOKIE, result.challenge, { httpOnly: true, secure, sameSite: "strict", path: "/login", maxAge: MFA_CHALLENGE_TTL_MS / 1000 });
      redirect("/login/mfa");
    }
    return { error: LOGIN_MESSAGES[result.reason], values: { email } };
  }
  await setSessionCookie(result.token, result.expiresAt);
  redirect("/");
}

export async function mfaAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const jar = await cookies();
  const challenge = jar.get(MFA_COOKIE)?.value;
  if (!challenge) return { error: LOGIN_MESSAGES.mfa_expired };
  const r = await completeMfaLogin(challenge, String(fd.get("code") ?? ""), await clientMeta());
  if (!r.ok) return { error: LOGIN_MESSAGES[r.reason] };
  jar.delete({ name: MFA_COOKIE, path: "/login" });
  await setSessionCookie(r.token, r.expiresAt);
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
