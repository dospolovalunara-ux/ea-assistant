import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { freshDb, eventInput, taskInput, type TestCtx } from "./helpers";
import { getDb } from "@/server/db";
import { auditLogs, userPermissions } from "@/server/db/schema";
import { loadActor } from "@/server/auth/rbac";
import { createEvent, listEvents, updateEvent, cancelEvent, getEvent } from "@/server/services/calendar";
import { createTask, getTask, listTasks, updateTask, changeTaskStatus, addTaskComment } from "@/server/services/tasks";
import { listAuditLogs } from "@/server/services/audit-read";
import { getDashboard } from "@/server/services/dashboard";
import { ForbiddenError, NotFoundError } from "@/server/errors";

let ctx: TestCtx;
let eventId: string;
let privateTaskId: string;
let sharedTaskId: string;

beforeAll(async () => {
  ctx = await freshDb();
  eventId = (await createEvent(ctx.assistant, eventInput())).id;
  privateTaskId = (await createTask(ctx.assistant, taskInput({ title: "Личная", visibility: "private" }))).id;
  sharedTaskId = (await createTask(ctx.assistant, taskInput({ title: "Общая", visibility: "shared" }))).id;
});

async function deniedCount(userId: string) {
  const rows = await getDb().select().from(auditLogs).where(and(eq(auditLogs.userId, userId), eq(auditLogs.action, "access.denied")));
  return rows.length;
}

describe("RBAC: руководитель", () => {
  it("видит календарь, но не может создавать, менять и отменять события", async () => {
    expect((await listEvents(ctx.executive, { from: new Date("2026-11-01"), to: new Date("2026-12-01") })).length).toBe(1);
    await expect(createEvent(ctx.executive, eventInput())).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateEvent(ctx.executive, eventId, eventInput({ title: "x" }))).rejects.toBeInstanceOf(NotFoundError);
    await expect(cancelEvent(ctx.executive, eventId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("не может создавать и редактировать задачи", async () => {
    await expect(createTask(ctx.executive, taskInput())).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateTask(ctx.executive, sharedTaskId, taskInput({ title: "x" }))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("не видит личную задачу помощника ни в списке, ни по id (IDOR)", async () => {
    const list = await listTasks(ctx.executive, "open");
    expect(list.map((t) => t.id)).toContain(sharedTaskId);
    expect(list.map((t) => t.id)).not.toContain(privateTaskId);
    await expect(getTask(ctx.executive, privateTaskId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(addTaskComment(ctx.executive, privateTaskId, "привет")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("не может менять статус задачи, назначенной не на него", async () => {
    await expect(changeTaskStatus(ctx.executive, sharedTaskId, "done")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("не имеет доступа к журналу действий", async () => {
    await expect(listAuditLogs(ctx.executive)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("RBAC: технический администратор", () => {
  it("не видит календарь, задачи и главную", async () => {
    await expect(listEvents(ctx.techAdmin, { from: new Date(0), to: new Date() })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getEvent(ctx.techAdmin, eventId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(listTasks(ctx.techAdmin, "open")).rejects.toBeInstanceOf(NotFoundError);
    await expect(getTask(ctx.techAdmin, sharedTaskId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getDashboard(ctx.techAdmin)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("читает журнал действий", async () => {
    const { rows } = await listAuditLogs(ctx.techAdmin);
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("RBAC: журналирование и точечные права", () => {
  it("каждый отказ записывается в журнал как access.denied", async () => {
    const before = await deniedCount(ctx.techAdmin.id);
    await expect(listTasks(ctx.techAdmin, "open")).rejects.toThrow();
    await expect(createEvent(ctx.techAdmin, eventInput())).rejects.toThrow();
    expect(await deniedCount(ctx.techAdmin.id)).toBe(before + 2);
  });

  it("несуществующий id и чужая запись дают одинаковый ответ «не найдено»", async () => {
    const e1 = await getTask(ctx.executive, privateTaskId).catch((e) => e);
    const e2 = await getTask(ctx.executive, "00000000-0000-0000-0000-000000000000").catch((e) => e);
    const e3 = await getTask(ctx.executive, "not-a-uuid").catch((e) => e);
    expect(e1).toBeInstanceOf(NotFoundError);
    expect(e2.message).toBe(e1.message);
    expect(e3.message).toBe(e1.message);
  });

  it("право можно выдать пользователю точечно (user_permissions)", async () => {
    await getDb().insert(userPermissions).values({ userId: ctx.ids.executive, permissionCode: "audit.read" });
    const exec = (await loadActor(ctx.ids.executive))!;
    await expect(listAuditLogs(exec)).resolves.toBeDefined();
    await getDb().delete(userPermissions).where(eq(userPermissions.userId, ctx.ids.executive));
  });

  it("помощник имеет все рабочие права", async () => {
    await expect(getDashboard(ctx.assistant)).resolves.toBeDefined();
    await expect(listAuditLogs(ctx.assistant)).resolves.toBeDefined();
    await expect(getTask(ctx.assistant, privateTaskId)).resolves.toBeDefined();
  });
});
