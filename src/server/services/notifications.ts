import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, type Executor } from "../db";
import { notifications, roles, users } from "../db/schema";
import type { Actor } from "../auth/rbac";
import { isUuid } from "./validation";

export interface NotificationInput {
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
  dedupeKey: string;
}

/** Создаёт уведомление каждому получателю; повтор с тем же ключом игнорируется. */
export async function notify(db: Executor, userIds: string[], n: NotificationInput): Promise<number> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return 0;
  const rows = await db
    .insert(notifications)
    .values(ids.map((userId) => ({ userId, kind: n.kind, title: n.title.slice(0, 300), body: n.body?.slice(0, 2000) ?? null, link: n.link ?? null, dedupeKey: n.dedupeKey })))
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  return rows.length;
}

/** Активные пользователи с указанными ролями. */
export async function usersWithRoles(db: Executor, codes: string[]): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(and(eq(users.isActive, true), inArray(roles.code, codes)));
  return rows.map((r) => r.id);
}

export async function listNotifications(actor: Actor, limit = 100) {
  return getDb()
    .select()
    .from(notifications)
    .where(eq(notifications.userId, actor.id))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadCount(actor: Actor): Promise<number> {
  const [r] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt)));
  return r?.n ?? 0;
}

/** Пользователь отмечает только свои уведомления — фильтр по user_id в SQL. */
export async function markRead(actor: Actor, id: string | "all") {
  const db = getDb();
  if (id === "all") {
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt)));
    return;
  }
  if (!isUuid(id)) return;
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, actor.id)));
}
