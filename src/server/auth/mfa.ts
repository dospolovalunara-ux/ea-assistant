import { randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";
import { getDb } from "../db";
import { mfaChallenges, users } from "../db/schema";
import { decryptSecret, encryptSecret, encryptionConfigured, sha256 } from "../crypto";
import { writeAudit, normalizeIp } from "../services/audit";
import { ValidationError } from "../errors";
import { createSession } from "./session";
import type { Actor } from "./rbac";

export const MFA_CHALLENGE_TTL_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;

export function verifyTotp(secret: string, code: string): boolean {
  const token = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(token)) return false;
  try {
    return verifySync({ secret, token, epochTolerance: 30 }).valid;
  } catch {
    return false;
  }
}

export async function createMfaChallenge(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const db = getDb();
  await db.delete(mfaChallenges).where(lt(mfaChallenges.expiresAt, new Date()));
  await db.insert(mfaChallenges).values({ userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + MFA_CHALLENGE_TTL_MS) });
  return token;
}

/** Второй шаг входа: проверка кода TOTP. После 5 ошибок вызов аннулируется. */
export async function completeMfaLogin(challenge: string, code: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const db = getDb();
  const ip = normalizeIp(meta.ip);
  const [c] = await db.select().from(mfaChallenges).where(eq(mfaChallenges.tokenHash, sha256(challenge)));
  if (!c || c.expiresAt < new Date() || c.attempts >= MAX_ATTEMPTS) return { ok: false as const, reason: "mfa_expired" as const };
  const [u] = await db.select().from(users).where(eq(users.id, c.userId));
  if (!u || !u.isActive || !u.mfaEnabled || !u.mfaSecretEnc) return { ok: false as const, reason: "mfa_expired" as const };
  if (!verifyTotp(decryptSecret(u.mfaSecretEnc), code)) {
    await db.update(mfaChallenges).set({ attempts: c.attempts + 1 }).where(eq(mfaChallenges.id, c.id));
    await writeAudit(db, { userId: u.id, action: "auth.mfa_failed", entityType: "user", entityId: u.id, ip });
    return { ok: false as const, reason: "mfa_invalid" as const };
  }
  await db.delete(mfaChallenges).where(eq(mfaChallenges.id, c.id));
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
  const session = await createSession(u.id, { ip, userAgent: meta.userAgent });
  await writeAudit(db, { userId: u.id, action: "auth.login", entityType: "user", entityId: u.id, ip, metadata: { mfa: true } });
  return { ok: true as const, ...session };
}

/** Начало подключения MFA: секрет хранится зашифрованным, включается только после проверки кода. */
export async function beginMfaEnrollment(actor: Actor) {
  if (!encryptionConfigured()) throw new ValidationError({ _form: "MFA недоступна: не задан APP_ENCRYPTION_KEY" });
  const secret = generateSecret();
  await getDb().update(users).set({ mfaSecretEnc: encryptSecret(secret), mfaEnabled: false }).where(eq(users.id, actor.id));
  const uri = generateURI({ issuer: "EXECUTIVE AI", label: actor.email, secret });
  return { secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
}

export async function confirmMfaEnrollment(actor: Actor, code: string) {
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.id, actor.id));
  if (!u?.mfaSecretEnc) throw new ValidationError({ code: "Сначала начните подключение" });
  if (!verifyTotp(decryptSecret(u.mfaSecretEnc), code)) throw new ValidationError({ code: "Неверный код" });
  await db.update(users).set({ mfaEnabled: true }).where(eq(users.id, actor.id));
  await writeAudit(db, { userId: actor.id, action: "auth.mfa_enabled", entityType: "user", entityId: actor.id, ip: actor.ip });
}

export async function disableMfa(actor: Actor, code: string) {
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.id, actor.id));
  if (!u?.mfaEnabled || !u.mfaSecretEnc) return;
  if (!verifyTotp(decryptSecret(u.mfaSecretEnc), code)) throw new ValidationError({ code: "Неверный код" });
  await db.update(users).set({ mfaEnabled: false, mfaSecretEnc: null }).where(eq(users.id, actor.id));
  await writeAudit(db, { userId: actor.id, action: "auth.mfa_disabled", entityType: "user", entityId: actor.id, ip: actor.ip });
}
