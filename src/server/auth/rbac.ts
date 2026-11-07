import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { rolePermissions, roles, userPermissions, users } from "../db/schema";
import { NotFoundError } from "../errors";
import { writeAudit } from "../services/audit";
import type { Permission, RoleCode } from "./permissions";

/** Текущий пользователь, от имени которого выполняется действие. */
export interface Actor {
  id: string;
  email: string;
  fullName: string;
  role: RoleCode;
  roleName: string;
  permissions: ReadonlySet<Permission>;
  timezone: string;
  ip: string | null;
}

export async function loadActor(userId: string, ip: string | null = null): Promise<Actor | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      timezone: users.timezone,
      isActive: users.isActive,
      roleId: roles.id,
      roleCode: roles.code,
      roleName: roles.name,
    })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, userId));
  if (!row || !row.isActive) return null;

  const [fromRole, fromUser] = await Promise.all([
    db.select({ code: rolePermissions.permissionCode }).from(rolePermissions).where(eq(rolePermissions.roleId, row.roleId)),
    db.select({ code: userPermissions.permissionCode }).from(userPermissions).where(eq(userPermissions.userId, userId)),
  ]);

  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    role: row.roleCode as RoleCode,
    roleName: row.roleName,
    permissions: new Set([...fromRole, ...fromUser].map((p) => p.code as Permission)),
    timezone: row.timezone,
    ip,
  };
}

export function can(actor: Actor, permission: Permission): boolean {
  return actor.permissions.has(permission);
}

export function canAny(actor: Actor, ...perms: Permission[]): boolean {
  return perms.some((p) => actor.permissions.has(p));
}

/** Записывает отказ в доступе в журнал. Пишется вне транзакции, чтобы не потеряться при откате. */
export async function logDenied(actor: Actor, detail: { permission?: string; entityType?: string; entityId?: string; reason?: string }) {
  await writeAudit(getDb(), {
    userId: actor.id,
    action: "access.denied",
    entityType: detail.entityType ?? null,
    entityId: detail.entityId ?? null,
    ip: actor.ip,
    metadata: { permission: detail.permission, reason: detail.reason },
  });
}

/**
 * Проверка права. При отказе — запись в журнал и «не найдено»,
 * чтобы не раскрывать существование данных.
 */
export async function requirePermission(
  actor: Actor,
  permission: Permission | Permission[],
  ctx: { entityType?: string; entityId?: string } = {},
): Promise<void> {
  const list = Array.isArray(permission) ? permission : [permission];
  if (list.some((p) => actor.permissions.has(p))) return;
  await logDenied(actor, { permission: list.join("|"), ...ctx });
  throw new NotFoundError();
}
