import { asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { roles, sessions, users } from "../db/schema";
import { requirePermission, type Actor } from "../auth/rbac";
import { hashPassword } from "../auth/password";
import { ValidationError } from "../errors";
import { writeAudit } from "./audit";
import { isUuid, isValidTimezone } from "./validation";

/** Минимальные требования к паролю входа. */
export function checkPasswordStrength(p: string): string | null {
  if (p.length < 12) return "Пароль — не короче 12 символов";
  if (p.length > 200) return "Слишком длинный пароль";
  if (!/[a-zа-я]/i.test(p) || !/\d/.test(p)) return "Пароль должен содержать буквы и цифры";
  return null;
}

export async function listUsers(actor: Actor) {
  await requirePermission(actor, "users.manage", { entityType: "user" });
  return getDb()
    .select({ id: users.id, email: users.email, fullName: users.fullName, roleCode: roles.code, roleName: roles.name, isActive: users.isActive, mfaEnabled: users.mfaEnabled, lastLoginAt: users.lastLoginAt })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .orderBy(asc(users.fullName));
}

export async function listRoles(actor: Actor) {
  await requirePermission(actor, "users.manage", { entityType: "role" });
  return getDb().select({ id: roles.id, code: roles.code, name: roles.name }).from(roles).orderBy(asc(roles.name));
}

async function roleId(code: string): Promise<string> {
  const [r] = await getDb().select().from(roles).where(eq(roles.code, code));
  if (!r) throw new ValidationError({ role: "Неизвестная роль" });
  return r.id;
}

export async function createUser(actor: Actor, raw: Record<string, unknown>) {
  await requirePermission(actor, "users.manage", { entityType: "user" });
  const email = String(raw.email ?? "").trim().toLowerCase();
  const fullName = String(raw.fullName ?? "").trim();
  const password = String(raw.password ?? "");
  const errors: Record<string, string> = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) errors.email = "Неверный email";
  if (!fullName) errors.fullName = "Укажите имя";
  const pw = checkPasswordStrength(password);
  if (pw) errors.password = pw;
  if (Object.keys(errors).length) throw new ValidationError(errors);
  const rid = await roleId(String(raw.role ?? ""));
  const db = getDb();
  if ((await db.select({ id: users.id }).from(users).where(eq(users.email, email))).length) throw new ValidationError({ email: "Пользователь с таким email уже есть" });
  return db.transaction(async (tx) => {
    const [u] = await tx.insert(users).values({ email, fullName: fullName.slice(0, 200), passwordHash: await hashPassword(password), roleId: rid, createdBy: actor.id }).returning({ id: users.id });
    await writeAudit(tx, { userId: actor.id, action: "user.create", entityType: "user", entityId: u!.id, ip: actor.ip, metadata: { email, role: raw.role } });
    return { id: u!.id };
  });
}

export async function updateUser(actor: Actor, id: string, raw: { role?: string; isActive?: boolean; password?: string }) {
  await requirePermission(actor, "users.manage", { entityType: "user", entityId: String(id) });
  if (!isUuid(id)) throw new ValidationError({ _form: "Неверный пользователь" });
  if (id === actor.id && (raw.isActive === false || raw.role)) throw new ValidationError({ _form: "Нельзя отключить себя или сменить себе роль" });
  const db = getDb();
  const set: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  const meta: Record<string, unknown> = {};
  if (raw.role) {
    set.roleId = await roleId(raw.role);
    meta.role = raw.role;
  }
  if (raw.isActive !== undefined) {
    set.isActive = raw.isActive;
    meta.isActive = raw.isActive;
  }
  if (raw.password) {
    const pw = checkPasswordStrength(raw.password);
    if (pw) throw new ValidationError({ password: pw });
    set.passwordHash = await hashPassword(raw.password);
    meta.passwordReset = true;
  }
  await db.transaction(async (tx) => {
    await tx.update(users).set(set).where(eq(users.id, id));
    // Отключение, смена роли или пароля завершают все сессии пользователя.
    await tx.delete(sessions).where(eq(sessions.userId, id));
    await writeAudit(tx, { userId: actor.id, action: "user.update", entityType: "user", entityId: id, ip: actor.ip, metadata: meta });
  });
}

/** Личные настройки — доступны каждому для себя. */
export async function updateOwnSettings(actor: Actor, raw: { timezone?: string; briefingTime?: string }) {
  const errors: Record<string, string> = {};
  const tz = raw.timezone?.trim() || actor.timezone;
  if (!isValidTimezone(tz)) errors.timezone = "Неизвестный часовой пояс";
  const bt = raw.briefingTime?.trim() || null;
  if (bt && !/^([01]\d|2[0-3]):[0-5]\d$/.test(bt)) errors.briefingTime = "Время в формате ЧЧ:ММ";
  if (Object.keys(errors).length) throw new ValidationError(errors);
  await getDb().update(users).set({ timezone: tz, briefingTime: bt, updatedAt: new Date() }).where(eq(users.id, actor.id));
  await writeAudit(getDb(), { userId: actor.id, action: "user.settings", entityType: "user", entityId: actor.id, ip: actor.ip, metadata: { timezone: tz, briefingTime: bt } });
}

export async function getOwnProfile(actor: Actor) {
  const [u] = await getDb().select({ mfaEnabled: users.mfaEnabled, briefingTime: users.briefingTime, timezone: users.timezone }).from(users).where(eq(users.id, actor.id));
  return u!;
}
