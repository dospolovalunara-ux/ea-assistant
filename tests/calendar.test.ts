import { beforeAll, describe, expect, it } from "vitest";
import { freshDb, eventInput, type TestCtx } from "./helpers";
import { cancelEvent, createEvent, getEvent, getEventHistory, listEvents, parseParticipants, updateEvent } from "@/server/services/calendar";
import { OverlapError, ValidationError } from "@/server/errors";

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await freshDb();
});

const range = { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-12-01T00:00:00Z") };

describe("Календарь: создание и проверка ввода", () => {
  it("создаёт рабочее и личное событие; оба видны вместе и фильтруются", async () => {
    await createEvent(ctx.assistant, eventInput({ title: "Работа", start: "2026-11-02T10:00", end: "2026-11-02T11:00" }));
    await createEvent(ctx.assistant, eventInput({ title: "Личное", calendarKind: "personal", type: "personal", start: "2026-11-02T19:00", end: "2026-11-02T20:00" }));
    const all = await listEvents(ctx.assistant, range);
    expect(all.map((e) => e.title)).toEqual(["Работа", "Личное"]);
    expect((await listEvents(ctx.assistant, { ...range, kinds: ["personal"] })).map((e) => e.title)).toEqual(["Личное"]);
  });

  it("хранит время в UTC, ввод — в поясе Алматы", async () => {
    const { id } = await createEvent(ctx.assistant, eventInput({ start: "2026-11-03T09:00", end: "2026-11-03T09:30" }));
    const e = await getEvent(ctx.assistant, id);
    expect(e.startsAt.toISOString()).toBe("2026-11-03T04:00:00.000Z");
  });

  it("окончание должно быть позже начала", async () => {
    const err = await createEvent(ctx.assistant, eventInput({ start: "2026-11-04T10:00", end: "2026-11-04T10:00" })).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.fieldErrors.end).toMatch(/позже начала/);
  });

  it("принимает ссылки только http/https (защита от XSS)", async () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,<script>", "ftp://x.y", "zoom.us/j/1"]) {
      const err = await createEvent(ctx.assistant, eventInput({ videoUrl: bad, start: "2026-11-05T01:00", end: "2026-11-05T02:00" })).catch((e) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.fieldErrors.videoUrl).toBeTruthy();
    }
    await expect(createEvent(ctx.assistant, eventInput({ videoUrl: "https://meet.example.com/abc", start: "2026-11-05T01:00", end: "2026-11-05T02:00" }))).resolves.toHaveProperty("id");
  });

  it("возвращает понятные ошибки для неверных полей", async () => {
    const err = await createEvent(ctx.assistant, { title: "", type: "nope", calendarKind: "x", start: "", end: "" }).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(Object.keys(err.fieldErrors)).toEqual(expect.arrayContaining(["title", "type", "calendarKind"]));
  });

  it("событие на весь день занимает целые местные сутки", async () => {
    const { id } = await createEvent(ctx.assistant, eventInput({ allDay: "on", start: "2026-11-06", end: "2026-11-07" }));
    const e = await getEvent(ctx.assistant, id);
    expect(e.startsAt.toISOString()).toBe("2026-11-05T19:00:00.000Z");
    expect(e.endsAt.toISOString()).toBe("2026-11-07T19:00:00.000Z");
  });

  it("разбирает участников «Имя <email>»", () => {
    expect(parseParticipants("Иван <ivan@example.com>\nОльга\nanna@example.com")).toEqual([
      { name: "Иван", email: "ivan@example.com" },
      { name: "Ольга", email: null },
      { name: "anna@example.com", email: "anna@example.com" },
    ]);
  });
});

describe("Календарь: пересечения", () => {
  it("находит пересечение между рабочим и личным календарём", async () => {
    await createEvent(ctx.assistant, eventInput({ title: "Обед", start: "2026-11-12T13:00", end: "2026-11-12T14:00" }));
    const err = await createEvent(ctx.assistant, eventInput({ title: "Врач", calendarKind: "personal", type: "personal", start: "2026-11-12T13:30", end: "2026-11-12T14:30" })).catch((e) => e);
    expect(err).toBeInstanceOf(OverlapError);
    expect(err.overlaps[0].title).toBe("Обед");
  });

  it("сохраняет с пересечением только после явного подтверждения", async () => {
    const r = await createEvent(ctx.assistant, eventInput({ title: "Врач", start: "2026-11-12T13:30", end: "2026-11-12T14:30" }), { confirmOverlap: true });
    const history = await getEventHistory(ctx.assistant, r.id);
    expect((history[0]!.metadata as { overlapConfirmed: boolean }).overlapConfirmed).toBe(true);
  });

  it("соседние события (конец = началу) не пересекаются", async () => {
    await expect(createEvent(ctx.assistant, eventInput({ start: "2026-11-12T14:30", end: "2026-11-12T15:00" }))).resolves.toHaveProperty("id");
  });

  it("черновики и отменённые события не учитываются", async () => {
    await createEvent(ctx.assistant, eventInput({ title: "Черновик", status: "draft", start: "2026-11-13T10:00", end: "2026-11-13T11:00" }));
    const c = await createEvent(ctx.assistant, eventInput({ title: "Отменим", start: "2026-11-13T12:00", end: "2026-11-13T13:00" }));
    await cancelEvent(ctx.assistant, c.id);
    await expect(createEvent(ctx.assistant, eventInput({ start: "2026-11-13T10:00", end: "2026-11-13T13:00" }))).resolves.toHaveProperty("id");
  });

  it("при изменении событие не пересекается само с собой", async () => {
    const { id } = await createEvent(ctx.assistant, eventInput({ start: "2026-11-14T10:00", end: "2026-11-14T11:00" }));
    await expect(updateEvent(ctx.assistant, id, eventInput({ start: "2026-11-14T10:00", end: "2026-11-14T11:30" }))).resolves.toBeUndefined();
  });
});

describe("Календарь: отмена и история", () => {
  it("отменённое событие остаётся в базе со статусом «Отменено»", async () => {
    const { id } = await createEvent(ctx.assistant, eventInput({ start: "2026-11-15T10:00", end: "2026-11-15T11:00" }));
    await cancelEvent(ctx.assistant, id, "перенос");
    expect((await getEvent(ctx.assistant, id)).status).toBe("cancelled");
    const visible = await listEvents(ctx.assistant, range);
    expect(visible.find((e) => e.id === id)).toBeUndefined();
    const withCancelled = await listEvents(ctx.assistant, { ...range, includeCancelled: true });
    expect(withCancelled.find((e) => e.id === id)).toBeDefined();
    await expect(updateEvent(ctx.assistant, id, eventInput())).rejects.toBeInstanceOf(ValidationError);
  });

  it("история содержит создание, изменения (что было → стало) и отмену", async () => {
    const { id } = await createEvent(ctx.assistant, eventInput({ start: "2026-11-16T10:00", end: "2026-11-16T11:00" }));
    await updateEvent(ctx.assistant, id, eventInput({ title: "Новое название", start: "2026-11-16T10:00", end: "2026-11-16T11:00" }));
    await cancelEvent(ctx.assistant, id);
    const h = await getEventHistory(ctx.assistant, id);
    expect(h.map((x) => x.action)).toEqual(["event.cancel", "event.update", "event.create"]);
    expect((h[1]!.metadata as { changes: Record<string, { from: unknown; to: unknown }> }).changes.title).toEqual({
      from: "Тестовая встреча",
      to: "Новое название",
    });
  });
});
