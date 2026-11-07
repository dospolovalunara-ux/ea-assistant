import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { loginAttempts, users } from "../db/schema";
import { normalizeIp, writeAudit } from "../services/audit";
import { dummyVerify, verifyPassword } from "./password";
import { createSession } from "./session";

export const LOCK_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILS_PER_EMAIL = 5;
export const MAX_FAILS_PER_IP = 20;

export type LoginResult =
  | { ok: true; userId: string; token: string; expiresAt: Date }
  | { ok: false; reason: "invalid" | "locked" };

export const LOGIN_MESSAGES = {
  invalid: "Неверный email или пароль",
  locked: "Слишком много неудачных попыток. Попробуйте снова через 15 минут.",
} as const;

async function recentFailures(email: string, ip: string | null) {
  const db = getDb();
  const since = new Date(Date.now() - LOCK_WINDOW_MS);
  const [byEmail] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.email, email), eq(loginAttempts.success, false), gt(loginAttempts.createdAt, since)));
  let byIp = 0;
  if (ip) {
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.ip, ip), eq(loginAttempts.success, false), gt(loginAttempts.createdAt, since)));
    byIp = r?.n ?? 0;
  }
  return { byEmail: byEmail?.n ?? 0, byIp };
}

/**
 * Проверка email и пароля. Для существующего и несуществующего email
 * ответ одинаковый, а время ответа выравнивается сравнением с хешем-заглушкой.
 */
export async function authenticate(
  rawEmail: string,
  password: string,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<LoginResult> {
  const db = getDb();
  const email = rawEmail.trim().toLowerCase().slice(0, 254);
  const ip = normalizeIp(meta.ip);

  const fails = await recentFailures(email, ip);
  if (fails.byEmail >= MAX_FAILS_PER_EMAIL || fails.byIp >= MAX_FAILS_PER_IP) {
    await dummyVerify(password);
    await db.insert(loginAttempts).values({ email, ip, success: false });
    await writeAudit(db, {
      action: "auth.login_blocked",
      ip,
      metadata: { email, byEmail: fails.byEmail, byIp: fails.byIp },
    });
    return { ok: false, reason: "locked" };
  }

  const [user] = await db.select().from(users).where(eq(users.email, email));
  const valid = user && user.isActive ? await verifyPassword(password, user.passwordHash) : await dummyVerify(password);

  if (!user || !user.isActive || !valid) {
    await db.insert(loginAttempts).values({ email, ip, success: false });
    await writeAudit(db, {
      userId: user?.id ?? null,
      action: "auth.login_failed",
      ip,
      metadata: { email },
    });
    if (fails.byEmail + 1 >= MAX_FAILS_PER_EMAIL) {
      await writeAudit(db, { userId: user?.id ?? null, action: "auth.locked", ip, metadata: { email } });
    }
    return { ok: false, reason: "invalid" };
  }

  await db.insert(loginAttempts).values({ email, ip, success: true });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  const session = await createSession(user.id, { ip, userAgent: meta.userAgent });
  await writeAudit(db, { userId: user.id, action: "auth.login", entityType: "user", entityId: user.id, ip });
  return { ok: true, userId: user.id, ...session };
}
