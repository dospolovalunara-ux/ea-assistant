import { beforeAll, describe, expect, it } from "vitest";
import { freshDb, taskInput, eventInput, type TestCtx } from "./helpers";
import {
  addTaskComment,
  changeTaskStatus,
  countTasksBySection,
  createTask,
  getTask,
  getTaskHistory,
  isOverdue,
  listTaskComments,
  listTasks,
  updateTask,
} from "@/server/services/tasks";
import { createEvent } from "@/server/services/calendar";
import { ValidationError } from "@/server/errors";

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await freshDb();
});

describe("Задачи", () => {
  it("создаётся, редактируется и пишет историю изменений", async () => {
    const { id } = await createTask(ctx.assistant, taskInput({ title: "Первая", dueAt: "2026-11-20T12:00" }));
    await updateTask(ctx.assistant, id, taskInput({ title: "Первая (изм.)", dueAt: "2026-11-21T12:00", priority: "high" }));
    const t = await getTask(ctx.assistant, id);
    expect(t.title).toBe("Первая (изм.)");
    expect(t.priority).toBe("high");
    expect(t.dueAt?.toISOString()).toBe("2026-11-21T07:00:00.000Z"); // 12:00 Алматы = 07:00 UTC
    const history = await getTaskHistory(ctx.assistant, id);
    expect(history.map((h) => h.action)).toEqual(["task.update", "task.create"]);
    expect((history[0]!.metadata as { changes: Record<string, unknown> }).changes).toHaveProperty("title");
  });

  it("проверяет обязательное название", async () => {
    await expect(createTask(ctx.assistant, taskInput({ title: "   " }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("ответственный — пользователь системы или вписанное имя", async () => {
    const a = await createTask(ctx.assistant, taskInput({ assignee: `user:${ctx.ids.executive}` }));
    const b = await createTask(ctx.assistant, taskInput({ assignee: "name", assigneeName: "Юридический отдел" }));
    expect((await getTask(ctx.assistant, a.id)).assigneeUserName).toBe("Динара Ахметова");
    expect((await getTask(ctx.assistant, b.id)).assigneeName).toBe("Юридический отдел");
    await expect(createTask(ctx.assistant, taskInput({ assignee: "user:00000000-0000-0000-0000-000000000000" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("задача, назначенная на руководителя, видна ему даже при visibility=private", async () => {
    const { id } = await createTask(ctx.assistant, taskInput({ visibility: "private", assignee: `user:${ctx.ids.executive}` }));
    await expect(getTask(ctx.executive, id)).resolves.toMatchObject({ id });
  });

  it("руководитель меняет статус назначенной на него задачи и комментирует", async () => {
    const { id } = await createTask(ctx.assistant, taskInput({ assignee: `user:${ctx.ids.executive}` }));
    await changeTaskStatus(ctx.executive, id, "done");
    const t = await getTask(ctx.executive, id);
    expect(t.status).toBe("done");
    expect(t.completedAt).toBeInstanceOf(Date);
    await changeTaskStatus(ctx.executive, id, "in_progress");
    expect((await getTask(ctx.executive, id)).completedAt).toBeNull();
    await addTaskComment(ctx.executive, id, "Посмотрю завтра");
    const comments = await listTaskComments(ctx.assistant, id);
    expect(comments).toHaveLength(1);
    expect(comments[0]!.authorName).toBe("Динара Ахметова");
  });

  it("недопустимый статус отклоняется", async () => {
    const { id } = await createTask(ctx.assistant, taskInput());
    await expect(changeTaskStatus(ctx.assistant, id, "overdue")).rejects.toBeInstanceOf(ValidationError);
  });

  it("«просрочена» вычисляется, а не хранится", () => {
    const now = new Date("2026-11-07T10:00:00Z");
    expect(isOverdue({ dueAt: new Date("2026-11-07T09:00:00Z"), status: "in_progress" }, now)).toBe(true);
    expect(isOverdue({ dueAt: new Date("2026-11-07T09:00:00Z"), status: "done" }, now)).toBe(false);
    expect(isOverdue({ dueAt: new Date("2026-11-07T09:00:00Z"), status: "cancelled" }, now)).toBe(false);
    expect(isOverdue({ dueAt: new Date("2026-11-07T11:00:00Z"), status: "new" }, now)).toBe(false);
    expect(isOverdue({ dueAt: null, status: "new" }, now)).toBe(false);
  });

  it("раздел «Сегодня» считается по местному дню (Алматы), а не по UTC", async () => {
    ctx = await freshDb();
    // now = 7 ноября 21:00 UTC = 8 ноября 02:00 в Алматы
    const now = new Date("2026-11-07T21:00:00Z");
    const local8 = await createTask(ctx.assistant, taskInput({ title: "8-го днём", dueAt: "2026-11-08T15:00" }));
    const local7 = await createTask(ctx.assistant, taskInput({ title: "7-го вечером", dueAt: "2026-11-07T23:00" }));
    const today = (await listTasks(ctx.assistant, "today", now)).map((t) => t.id);
    expect(today).toContain(local8.id);
    expect(today).not.toContain(local7.id);
    const overdue = (await listTasks(ctx.assistant, "overdue", now)).map((t) => t.id);
    expect(overdue).toContain(local7.id);
  });

  it("счётчики разделов совпадают со списками", async () => {
    const now = new Date("2026-11-07T21:00:00Z");
    const { id } = await createTask(ctx.assistant, taskInput({ title: "ждём", status: "waiting" }));
    await createTask(ctx.assistant, taskInput({ title: "готово", status: "done" }));
    const counts = await countTasksBySection(ctx.assistant, now);
    for (const s of ["open", "today", "week", "overdue", "waiting", "done"] as const) {
      expect(counts[s]).toBe((await listTasks(ctx.assistant, s, now)).length);
    }
    expect(counts.waiting).toBeGreaterThanOrEqual(1);
    expect(id).toBeTruthy();
  });

  it("задачу можно связать с событием календаря", async () => {
    const ev = await createEvent(ctx.assistant, eventInput({ title: "Связанная встреча" }));
    const { id } = await createTask(ctx.assistant, taskInput({ relatedEventId: ev.id }));
    expect((await getTask(ctx.assistant, id)).relatedEventTitle).toBe("Связанная встреча");
    await expect(createTask(ctx.assistant, taskInput({ relatedEventId: "bad" }))).rejects.toBeInstanceOf(ValidationError);
  });
});
