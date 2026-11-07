import { and, asc, desc, eq, gte, inArray, isNotNull, lt, notInArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { auditLogs, calendarEvents, roles, taskComments, tasks, users } from "../db/schema";
import { can, logDenied, requirePermission, type Actor } from "../auth/rbac";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { writeAudit } from "./audit";
import { isUuid, optionalText, parseOrThrow, requiredText } from "./validation";
import {
  CLOSED_TASK_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_VISIBILITY,
  type TaskSection,
  type TaskStatusCode,
} from "@/lib/labels";
import { addLocalDays, localDayEnd, localDayStart, parseLocalDateTime } from "@/lib/time";

// ---------- Видимость ----------
/**
 * Фильтр видимости прямо в SQL: недоступные задачи не попадают в выборку вовсе.
 * - tasks.read_all — все задачи;
 * - tasks.read_shared — согласованные (shared) и назначенные на себя.
 */
function visibilityFilter(actor: Actor): SQL | undefined {
  if (can(actor, "tasks.read_all")) return undefined;
  return or(eq(tasks.visibility, "shared"), eq(tasks.assigneeUserId, actor.id));
}

const isOpen = notInArray(tasks.status, CLOSED_TASK_STATUSES);

/** «Просрочена» не хранится: срок прошёл, а задача не выполнена и не отменена. */
export function isOverdue(t: { dueAt: Date | null; status: string }, now = new Date()): boolean {
  return Boolean(t.dueAt && t.dueAt < now && !CLOSED_TASK_STATUSES.includes(t.status as TaskStatusCode));
}

function sectionFilter(section: TaskSection, tz: string, now: Date): SQL {
  const dayStart = localDayStart(now, tz);
  const dayEnd = localDayEnd(now, tz);
  switch (section) {
    case "open":
      return isOpen;
    case "today":
      return and(isOpen, isNotNull(tasks.dueAt), gte(tasks.dueAt, dayStart), lt(tasks.dueAt, dayEnd))!;
    case "week":
      return and(isOpen, isNotNull(tasks.dueAt), gte(tasks.dueAt, dayStart), lt(tasks.dueAt, addLocalDays(dayStart, 7, tz)))!;
    case "overdue":
      return and(isOpen, isNotNull(tasks.dueAt), lt(tasks.dueAt, now))!;
    case "waiting":
      return eq(tasks.status, "waiting");
    case "done":
      return inArray(tasks.status, CLOSED_TASK_STATUSES);
  }
}

const assigneeUser = users;

const taskColumns = {
  id: tasks.id,
  title: tasks.title,
  description: tasks.description,
  source: tasks.source,
  assigneeUserId: tasks.assigneeUserId,
  assigneeName: tasks.assigneeName,
  assigneeUserName: assigneeUser.fullName,
  creatorId: tasks.creatorId,
  dueAt: tasks.dueAt,
  priority: tasks.priority,
  status: tasks.status,
  visibility: tasks.visibility,
  relatedEventId: tasks.relatedEventId,
  completedAt: tasks.completedAt,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
};

async function requireTaskRead(actor: Actor, entityId?: string) {
  await requirePermission(actor, ["tasks.read_all", "tasks.read_shared"], { entityType: "task", entityId });
}

export async function listTasks(actor: Actor, section: TaskSection, now = new Date()) {
  await requireTaskRead(actor);
  const priorityOrder = sql`case ${tasks.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`;
  return getDb()
    .select(taskColumns)
    .from(tasks)
    .leftJoin(assigneeUser, eq(tasks.assigneeUserId, assigneeUser.id))
    .where(and(sectionFilter(section, actor.timezone, now), visibilityFilter(actor)))
    .orderBy(
      section === "done" ? desc(tasks.updatedAt) : sql`${tasks.dueAt} asc nulls last`,
      asc(priorityOrder),
      desc(tasks.createdAt),
    )
    .limit(500);
}

export async function countTasksBySection(actor: Actor, now = new Date()): Promise<Record<TaskSection, number>> {
  await requireTaskRead(actor);
  const tz = actor.timezone;
  const n = (f: SQL) => sql<number>`count(*) filter (where ${f})::int`;
  const [row] = await getDb()
    .select({
      open: n(sectionFilter("open", tz, now)),
      today: n(sectionFilter("today", tz, now)),
      week: n(sectionFilter("week", tz, now)),
      overdue: n(sectionFilter("overdue", tz, now)),
      waiting: n(sectionFilter("waiting", tz, now)),
      done: n(sectionFilter("done", tz, now)),
    })
    .from(tasks)
    .where(visibilityFilter(actor));
  return row ?? { open: 0, today: 0, week: 0, overdue: 0, waiting: 0, done: 0 };
}

export async function getTask(actor: Actor, id: string) {
  await requireTaskRead(actor, String(id));
  if (!isUuid(id)) throw new NotFoundError();
  const [task] = await getDb()
    .select({
      ...taskColumns,
      relatedEventTitle: calendarEvents.title,
      relatedEventStartsAt: calendarEvents.startsAt,
    })
    .from(tasks)
    .leftJoin(assigneeUser, eq(tasks.assigneeUserId, assigneeUser.id))
    .leftJoin(calendarEvents, eq(tasks.relatedEventId, calendarEvents.id))
    .where(and(eq(tasks.id, id), visibilityFilter(actor)));
  if (!task) {
    await logDenied(actor, { entityType: "task", entityId: id, reason: "not_visible_or_missing" });
    throw new NotFoundError();
  }
  return task;
}

/** Что текущий пользователь может делать с конкретной задачей (для интерфейса). */
export function taskAbilities(actor: Actor, task: { assigneeUserId: string | null }) {
  const canEdit = can(actor, "tasks.write");
  return {
    canEdit,
    canChangeStatus: canEdit || (can(actor, "tasks.update_status_assigned") && task.assigneeUserId === actor.id),
    canComment: can(actor, "tasks.comment"),
  };
}

// ---------- Проверка ввода ----------
const taskInputSchema = z.object({
  title: requiredText(300, "Название"),
  description: optionalText(10000),
  source: optionalText(300),
  assignee: z.string().default(""), // "user:<uuid>" | "name" | ""
  assigneeName: optionalText(200),
  dueAt: optionalText(20),
  priority: z.enum(Object.keys(TASK_PRIORITIES) as [keyof typeof TASK_PRIORITIES]).default("normal"),
  status: z.enum(Object.keys(TASK_STATUSES) as [TaskStatusCode]).default("new"),
  visibility: z.enum(Object.keys(TASK_VISIBILITY) as [keyof typeof TASK_VISIBILITY]).default("private"),
  relatedEventId: optionalText(40),
});

async function validateTaskInput(actor: Actor, raw: Record<string, unknown>) {
  const v = parseOrThrow(taskInputSchema, raw);
  const errors: Record<string, string> = {};
  const db = getDb();

  let assigneeUserId: string | null = null;
  let assigneeName: string | null = null;
  if (v.assignee.startsWith("user:")) {
    const uid = v.assignee.slice(5);
    const ok = isUuid(uid) && (await db.select({ id: users.id }).from(users).where(and(eq(users.id, uid), eq(users.isActive, true)))).length;
    if (!ok) errors.assignee = "Пользователь не найден";
    else assigneeUserId = uid;
  } else if (v.assignee === "name") {
    if (!v.assigneeName) errors.assigneeName = "Впишите ответственного";
    else assigneeName = v.assigneeName;
  } else if (v.assignee !== "") {
    errors.assignee = "Неверный ответственный";
  }

  let dueAt: Date | null = null;
  if (v.dueAt) {
    dueAt = parseLocalDateTime(v.dueAt, actor.timezone);
    if (!dueAt) errors.dueAt = "Неверная дата срока";
  }

  let relatedEventId: string | null = null;
  if (v.relatedEventId) {
    const exists =
      isUuid(v.relatedEventId) &&
      can(actor, "calendar.read") &&
      (await db.select({ id: calendarEvents.id }).from(calendarEvents).where(eq(calendarEvents.id, v.relatedEventId))).length;
    if (!exists) errors.relatedEventId = "Событие не найдено";
    else relatedEventId = v.relatedEventId;
  }

  // Задача, назначенная на руководителя, видна ему всегда — фиксируем это явно.
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return {
    title: v.title,
    description: v.description ?? null,
    source: v.source ?? null,
    assigneeUserId,
    assigneeName,
    dueAt,
    priority: v.priority,
    status: v.status,
    visibility: v.visibility,
    relatedEventId,
  };
}

type TaskValues = Awaited<ReturnType<typeof validateTaskInput>>;

function snapshot(v: Partial<TaskValues>) {
  return {
    title: v.title,
    description: v.description,
    source: v.source,
    assignee: v.assigneeUserId ? `user:${v.assigneeUserId}` : (v.assigneeName ?? null),
    dueAt: v.dueAt ? v.dueAt.toISOString() : null,
    priority: v.priority,
    status: v.status,
    visibility: v.visibility,
    relatedEventId: v.relatedEventId ?? null,
  };
}

// ---------- Запись ----------
export async function createTask(actor: Actor, raw: Record<string, unknown>): Promise<{ id: string }> {
  await requirePermission(actor, "tasks.write", { entityType: "task" });
  const v = await validateTaskInput(actor, raw);
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .insert(tasks)
      .values({
        ...v,
        creatorId: actor.id,
        createdBy: actor.id,
        completedAt: v.status === "done" ? new Date() : null,
      })
      .returning({ id: tasks.id });
    await writeAudit(tx, {
      userId: actor.id,
      action: "task.create",
      entityType: "task",
      entityId: row!.id,
      ip: actor.ip,
      metadata: { after: snapshot(v) },
    });
    return { id: row!.id };
  });
}

export async function updateTask(actor: Actor, id: string, raw: Record<string, unknown>): Promise<void> {
  await requirePermission(actor, "tasks.write", { entityType: "task", entityId: String(id) });
  const current = await getTask(actor, id);
  const v = await validateTaskInput(actor, raw);
  const before = snapshot(current as unknown as TaskValues);
  const after = snapshot(v);
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(after) as (keyof typeof after)[]) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changes[k] = { from: before[k], to: after[k] };
  }
  if (!Object.keys(changes).length) return;
  await getDb().transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({
        ...v,
        completedAt: v.status === "done" ? (current.completedAt ?? new Date()) : null,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id));
    await writeAudit(tx, {
      userId: actor.id,
      action: "task.update",
      entityType: "task",
      entityId: id,
      ip: actor.ip,
      metadata: { changes },
    });
  });
}

export async function changeTaskStatus(actor: Actor, id: string, status: string): Promise<void> {
  await requirePermission(actor, ["tasks.write", "tasks.update_status_assigned"], { entityType: "task", entityId: String(id) });
  if (!(status in TASK_STATUSES)) throw new ValidationError({ status: "Недопустимый статус" });
  const task = await getTask(actor, id);
  if (!taskAbilities(actor, task).canChangeStatus) {
    await logDenied(actor, { permission: "tasks.update_status_assigned", entityType: "task", entityId: id, reason: "not_assignee" });
    throw new ForbiddenError("Менять статус можно только у задач, назначенных на вас");
  }
  if (task.status === status) return;
  await getDb().transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({
        status: status as TaskStatusCode,
        completedAt: status === "done" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id));
    await writeAudit(tx, {
      userId: actor.id,
      action: "task.status",
      entityType: "task",
      entityId: id,
      ip: actor.ip,
      metadata: { changes: { status: { from: task.status, to: status } } },
    });
  });
}

// ---------- Комментарии и история ----------
export async function addTaskComment(actor: Actor, id: string, body: string): Promise<void> {
  await requirePermission(actor, "tasks.comment", { entityType: "task", entityId: String(id) });
  await getTask(actor, id);
  const text = (body ?? "").trim();
  if (!text) throw new ValidationError({ body: "Комментарий пуст" });
  if (text.length > 5000) throw new ValidationError({ body: "Не длиннее 5000 символов" });
  await getDb().transaction(async (tx) => {
    const [c] = await tx.insert(taskComments).values({ taskId: id, authorId: actor.id, body: text }).returning({ id: taskComments.id });
    await writeAudit(tx, {
      userId: actor.id,
      action: "task.comment",
      entityType: "task",
      entityId: id,
      ip: actor.ip,
      metadata: { commentId: c!.id, length: text.length },
    });
  });
}

export async function listTaskComments(actor: Actor, id: string) {
  await getTask(actor, id);
  return getDb()
    .select({ id: taskComments.id, body: taskComments.body, createdAt: taskComments.createdAt, authorName: users.fullName })
    .from(taskComments)
    .innerJoin(users, eq(taskComments.authorId, users.id))
    .where(eq(taskComments.taskId, id))
    .orderBy(asc(taskComments.createdAt));
}

export async function getTaskHistory(actor: Actor, id: string) {
  await getTask(actor, id);
  return getDb()
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      userName: users.fullName,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(and(eq(auditLogs.entityType, "task"), eq(auditLogs.entityId, id)))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id));
}

/** Пользователи, на которых можно назначить задачу (помощник и руководитель). */
export async function listAssignableUsers(actor: Actor) {
  await requirePermission(actor, "tasks.write", { entityType: "task" });
  return getDb()
    .select({ id: users.id, fullName: users.fullName, roleName: roles.name })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(and(eq(users.isActive, true), inArray(roles.code, ["assistant", "executive"])))
    .orderBy(asc(users.fullName));
}

/** Имена пользователей для показа истории (id → имя). */
export async function userNames(ids: string[]): Promise<Record<string, string>> {
  const clean = ids.filter(isUuid);
  if (!clean.length) return {};
  const rows = await getDb().select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, clean));
  return Object.fromEntries(rows.map((r) => [r.id, r.fullName]));
}
