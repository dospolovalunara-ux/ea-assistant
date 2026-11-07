import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb } from "../db";
import { sessions } from "../db/schema";
import { normalizeIp } from "../services/audit";

export const SESSION_COOKIE = "eai_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 часов

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Создаёт сессию. Возвращает токен для cookie; в базе хранится только его SHA-256. */
export async function createSession(userId: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const token = randomBytes(32).toString("base64url"); // 256 бит
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await getDb()
    .insert(sessions)
    .values({
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: normalizeIp(meta.ip),
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    });
  return { token, expiresAt };
}

export async function findSessionUser(token: string): Promise<{ userId: string; sessionId: string } | null> {
  if (!token || token.length > 200) return null;
  const [row] = await getDb()
    .select({ userId: sessions.userId, sessionId: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())));
  return row ?? null;
}

export async function deleteSession(token: string): Promise<string | null> {
  const [row] = await getDb()
    .delete(sessions)
    .where(eq(sessions.tokenHash, hashToken(token)))
    .returning({ userId: sessions.userId });
  return row?.userId ?? null;
}

export async function purgeExpiredSessions() {
  await getDb().delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
