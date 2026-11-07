import { and, asc, desc, eq, gt, inArray, lt, ne, notInArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Executor } from "../db";
import { auditLogs, calendarEvents, calendars, eventParticipants, users } from "../db/schema";
import { requirePermission, type Actor } from "../auth/rbac";
import { NotFoundError, OverlapError, ValidationError, type OverlapInfo } from "../errors";
import { writeAudit } from "./audit";
import { checkbox, isUuid, isValidTimezone, optionalText, parseOrThrow, requiredText, safeUrl } from "./validation";
import { EVENT_STATUSES, EVENT_TYPES, IMPORTANCE, type CalendarKindCode } from "@/lib/labels";
import { addLocalDays, parseLocalDate, parseLocalDateTime } from "@/lib/time";

// ---------- Проверка ввода ----------
const editableStatuses = Object.keys(EVENT_STATUSES).filter((s) => s !== "cancelled") as [string, ...string[]];

const eventInputSchema = z.object({
  title: requiredText(200, "Название"),
  type: z.enum(Object.keys(EVENT_TYPES) as [keyof typeof EVENT_TYPES], { error: "Выберите тип события" }),
  calendarKind: z.enum(["work", "personal"], { error: "Выберите календарь" }),
  status: z.enum(editableStatuses as [string, ...string[]], { error: "Недопустимый статус" }).default("confirmed"),
  allDay: checkbox.default(false),
  timezone: z
    .string()
    .default("Asia/Almaty")
    .refine(isValidTimezone, "Неизвестный часовой пояс"),
  start: z.string({ error: "Укажите начало" }).min(1, "Укажите начало"),
  end: z.string({ error: "Укажите окончание" }).min(1, "Укажите окончание"),
  location: optionalText(300),
  videoUrl: safeUrl,
  organizer: optionalText(200),
  agenda: optionalText(5000),
  importance: z.enum(Object.keys(IMPORTANCE) as [keyof typeof IMPORTANCE]).default("normal"),
  participants: optionalText(3000),
});

export interface ParsedParticipant {
  name: string;
  email: string | null;
}

/** Участники: по одному в строке, «Имя <email>» или просто имя. */
export function parseParticipants(text: string | undefined): ParsedParticipant[] {
  if (!text) return [];
  const out: ParsedParticipant[] = [];
  for (const raw of text.split(/\r?\n|;/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(.*?)\s*<([^<>\s]+@[^<>\s]+)>$/.exec(line);
    if (m) out.push({ name: (m[1] || m[2]!).slice(0, 200), email: m[2]!.toLowerCase().slice(0, 254) });
    else if (/^[^\s@]+@[^\s@]+$/.test(line)) out.push({ name: line, email: line.toLowerCase() });
    else out.push({ name: line.slice(0, 200), email: null });
  }
  if (out.length > 100) throw new ValidationError({ participants: "Не более 100 участников" });
  return out;
}

export interface EventValues {
  title: string;
  type: keyof typeof EVENT_TYPES;
  calendarKind: CalendarKindCode;
  status: keyof typeof EVENT_STATUSES;
  allDay: boolean;
  timezone: string;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  videoUrl: string | null;
  organizer: string | null;
  agenda: string | null;
  importance: keyof typeof IMPORTANCE;
  participants: ParsedParticipant[];
}

export function validateEventInput(raw: Record<string, unknown>): EventValues {
  const v = parseOrThrow(eventInputSchema, raw);
  let startsAt: Date | null;
  let endsAt: Date | null;
  if (v.allDay) {
    // Весь день: с полуночи первого дня до полуночи после последнего дня.
    const s = parseLocalDate(v.start.slice(0, 10), v.timezone);
    const e = parseLocalDate(v.end.slice(0, 10), v.timezone);
    startsAt = s;
    endsAt = e ? addLocalDays(e, 1, v.timezone) : null;
  } else {
    startsAt = parseLocalDateTime(v.start, v.timezone);
    endsAt = parseLocalDateTime(v.end, v.timezone);
  }
  const errors: Record<string, string> = {};
  if (!startsAt) errors.start = "Неверная дата начала";
  if (!endsAt) errors.end = "Неверная дата окончания";
  if (startsAt && endsAt && endsAt <= startsAt) errors.end = "Окончание должно быть позже начала";
  if (startsAt && endsAt && endsAt.getTime() - startsAt.getTime() > 60 * 86400_000)
    errors.end = "Событие не может длиться дольше 60 дней";
  if (Object.keys(errors).length) throw new ValidationError(errors);

  return {
    title: v.title,
    type: v.type,
    calendarKind: v.calendarKind,
    status: v.status as keyof typeof EVENT_STATUSES,
    allDay: v.allDay,
    timezone: v.timezone,
    startsAt: startsAt!,
    endsAt: endsAt!,
    location: v.location ?? null,
    videoUrl: v.videoUrl ?? null,
    organizer: v.organizer ?? null,
    agenda: v.agenda ?? null,
    importance: v.importance,
    participants: parseParticipants(v.participants),
  };
}

// ---------- Чтение ----------
export interface EventRow {
  id: string;
  title: string;
  type: keyof typeof EVENT_TYPES;
  status: keyof typeof EVENT_STATUSES;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  timezone: string;
  location: string | null;
  videoUrl: string | null;
  organizer: string | null;
  agenda: string | null;
  importance: keyof typeof IMPORTANCE;
  source: string;
  calendarId: string;
  calendarKind: CalendarKindCode;
  calendarName: string;
}

const eventColumns = {
  id: calendarEvents.id,
  title: calendarEvents.title,
  type: calendarEvents.type,
  status: calendarEvents.status,
  startsAt: calendarEvents.startsAt,
  endsAt: calendarEvents.endsAt,
  allDay: calendarEvents.allDay,
  timezone: calendarEvents.timezone,
  location: calendarEvents.location,
  videoUrl: calendarEvents.videoUrl,
  organizer: calendarEvents.organizer,
  agenda: calendarEvents.agenda,
  importance: calendarEvents.importance,
  source: calendarEvents.source,
  calendarId: calendars.id,
  calendarKind: calendars.kind,
  calendarName: calendars.name,
};

/** Календари, которыми управляет система: оба принадлежат руководителю. */
export async function listCalendars(actor: Actor) {
  await requirePermission(actor, "calendar.read", { entityType: "calendar" });
  return getDb()
    .select({ id: calendars.id, kind: calendars.kind, name: calendars.name, ownerId: calendars.ownerId })
    .from(calendars)
    .orderBy(asc(calendars.kind));
}

export async function listEvents(
  actor: Actor,
  opts: { from: Date; to: Date; kinds?: CalendarKindCode[]; includeCancelled?: boolean; includeDrafts?: boolean },
): Promise<EventRow[]> {
  await requirePermission(actor, "calendar.read", { entityType: "calendar_event" });
  const conds = [lt(calendarEvents.startsAt, opts.to), gt(calendarEvents.endsAt, opts.from)];
  if (opts.kinds && opts.kinds.length) conds.push(inArray(calendars.kind, opts.kinds));
  const hidden: ("cancelled" | "draft")[] = [];
  if (!opts.includeCancelled) hidden.push("cancelled");
  if (opts.includeDrafts === false) hidden.push("draft");
  if (hidden.length) conds.push(notInArray(calendarEvents.status, hidden));
  return getDb()
    .select(eventColumns)
    .from(calendarEvents)
    .innerJoin(calendars, eq(calendarEvents.calendarId, calendars.id))
    .where(and(...conds))
    .orderBy(asc(calendarEvents.startsAt), asc(calendarEvents.endsAt));
}

export async function getEvent(actor: Actor, id: string) {
  await requirePermission(actor, "calendar.read", { entityType: "calendar_event", entityId: String(id) });
  if (!isUuid(id)) throw new NotFoundError();
  const db = getDb();
  const [event] = await db
    .select(eventColumns)
    .from(calendarEvents)
    .innerJoin(calendars, eq(calendarEvents.calendarId, calendars.id))
    .where(eq(calendarEvents.id, id));
  if (!event) throw new NotFoundError();
  const participants = await db
    .select({ id: eventParticipants.id, name: eventParticipants.name, email: eventParticipants.email })
    .from(eventParticipants)
    .where(eq(eventParticipants.eventId, id))
    .orderBy(asc(eventParticipants.createdAt), asc(eventParticipants.name));
  return { ...event, participants };
}

/** История изменений события — из журнала действий. */
export async function getEventHistory(actor: Actor, id: string) {
  await getEvent(actor, id);
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
    .where(and(eq(auditLogs.entityType, "calendar_event"), eq(auditLogs.entityId, id)))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id));
}

// ---------- Пересечения ----------
const NON_BLOCKING: ("draft" | "cancelled")[] = ["draft", "cancelled"];

/**
 * Ищет пересечения сразу по обоим календарям руководителя:
 * у человека одно время. Черновики и отменённые не учитываются.
 */
export async function findOverlaps(
  db: Executor,
  range: { startsAt: Date; endsAt: Date; excludeId?: string },
): Promise<OverlapInfo[]> {
  const conds = [
    lt(calendarEvents.startsAt, range.endsAt),
    gt(calendarEvents.endsAt, range.startsAt),
    notInArray(calendarEvents.status, NON_BLOCKING),
  ];
  if (range.excludeId) conds.push(ne(calendarEvents.id, range.excludeId));
  return db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      startsAt: calendarEvents.startsAt,
      endsAt: calendarEvents.endsAt,
      calendarKind: calendars.kind,
    })
    .from(calendarEvents)
    .innerJoin(calendars, eq(calendarEvents.calendarId, calendars.id))
    .where(and(...conds))
    .orderBy(asc(calendarEvents.startsAt))
    .limit(20);
}

async function resolveCalendarId(db: Executor, kind: CalendarKindCode): Promise<string> {
  const [cal] = await db.select({ id: calendars.id }).from(calendars).where(eq(calendars.kind, kind)).limit(1);
  if (!cal) throw new ValidationError({ calendarKind: "Календарь не настроен" });
  return cal.id;
}

function snapshot(v: EventValues) {
  return {
    title: v.title,
    type: v.type,
    calendarKind: v.calendarKind,
    status: v.status,
    allDay: v.allDay,
    timezone: v.timezone,
    startsAt: v.startsAt.toISOString(),
    endsAt: v.endsAt.toISOString(),
    location: v.location,
    videoUrl: v.videoUrl,
    organizer: v.organizer,
    agenda: v.agenda,
    importance: v.importance,
    participants: v.participants.map((p) => (p.email ? `${p.name} <${p.email}>` : p.name)).join("; "),
  };
}

// ---------- Запись ----------
export async function createEvent(
  actor: Actor,
  raw: Record<string, unknown>,
  opts: { confirmOverlap?: boolean } = {},
): Promise<{ id: string }> {
  await requirePermission(actor, "calendar.write", { entityType: "calendar_event" });
  const v = validateEventInput(raw);
  return getDb().transaction(async (tx) => {
    if (!NON_BLOCKING.includes(v.status as "draft")) {
      const overlaps = await findOverlaps(tx, { startsAt: v.startsAt, endsAt: v.endsAt });
      if (overlaps.length && !opts.confirmOverlap) throw new OverlapError(overlaps);
    }
    const calendarId = await resolveCalendarId(tx, v.calendarKind);
    const [row] = await tx
      .insert(calendarEvents)
      .values({
        calendarId,
        title: v.title,
        type: v.type,
        status: v.status,
        startsAt: v.startsAt,
        endsAt: v.endsAt,
        allDay: v.allDay,
        timezone: v.timezone,
        location: v.location,
        videoUrl: v.videoUrl,
        organizer: v.organizer,
        agenda: v.agenda,
        importance: v.importance,
        source: "manual",
        createdBy: actor.id,
      })
      .returning({ id: calendarEvents.id });
    if (v.participants.length) {
      await tx.insert(eventParticipants).values(v.participants.map((p) => ({ eventId: row!.id, ...p })));
    }
    await writeAudit(tx, {
      userId: actor.id,
      action: "event.create",
      entityType: "calendar_event",
      entityId: row!.id,
      ip: actor.ip,
      metadata: { after: snapshot(v), overlapConfirmed: Boolean(opts.confirmOverlap) },
    });
    return { id: row!.id };
  });
}

export async function updateEvent(
  actor: Actor,
  id: string,
  raw: Record<string, unknown>,
  opts: { confirmOverlap?: boolean } = {},
): Promise<void> {
  await requirePermission(actor, "calendar.write", { entityType: "calendar_event", entityId: String(id) });
  const current = await getEvent(actor, id);
  if (current.status === "cancelled") {
    throw new ValidationError({ _form: "Отменённое событие нельзя изменить" });
  }
  const v = validateEventInput(raw);
  const before = snapshot({
    ...current,
    participants: current.participants.map((p) => ({ name: p.name, email: p.email })),
  } as EventValues);
  const after = snapshot(v);
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(after) as (keyof typeof after)[]) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changes[k] = { from: before[k], to: after[k] };
  }
  if (!Object.keys(changes).length) return;

  await getDb().transaction(async (tx) => {
    if (!NON_BLOCKING.includes(v.status as "draft") && (changes.startsAt || changes.endsAt || changes.status)) {
      const overlaps = await findOverlaps(tx, { startsAt: v.startsAt, endsAt: v.endsAt, excludeId: id });
      if (overlaps.length && !opts.confirmOverlap) throw new OverlapError(overlaps);
    }
    const calendarId = await resolveCalendarId(tx, v.calendarKind);
    await tx
      .update(calendarEvents)
      .set({
        calendarId,
        title: v.title,
        type: v.type,
        status: v.status,
        startsAt: v.startsAt,
        endsAt: v.endsAt,
        allDay: v.allDay,
        timezone: v.timezone,
        location: v.location,
        videoUrl: v.videoUrl,
        organizer: v.organizer,
        agenda: v.agenda,
        importance: v.importance,
        updatedAt: new Date(),
      })
      .where(eq(calendarEvents.id, id));
    if (changes.participants) {
      await tx.delete(eventParticipants).where(eq(eventParticipants.eventId, id));
      if (v.participants.length) {
        await tx.insert(eventParticipants).values(v.participants.map((p) => ({ eventId: id, ...p })));
      }
    }
    await writeAudit(tx, {
      userId: actor.id,
      action: "event.update",
      entityType: "calendar_event",
      entityId: id,
      ip: actor.ip,
      metadata: { changes, overlapConfirmed: Boolean(opts.confirmOverlap) },
    });
  });
}

/** Отмена: событие не удаляется, а остаётся в истории со статусом «Отменено». */
export async function cancelEvent(actor: Actor, id: string, reason?: string): Promise<void> {
  await requirePermission(actor, "calendar.write", { entityType: "calendar_event", entityId: String(id) });
  const current = await getEvent(actor, id);
  if (current.status === "cancelled") return;
  await getDb().transaction(async (tx) => {
    await tx
      .update(calendarEvents)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(calendarEvents.id, id));
    await writeAudit(tx, {
      userId: actor.id,
      action: "event.cancel",
      entityType: "calendar_event",
      entityId: id,
      ip: actor.ip,
      metadata: { changes: { status: { from: current.status, to: "cancelled" } }, reason: reason?.slice(0, 500) },
    });
  });
}

/** Короткий список событий для выбора «связанного события» в задаче. */
export async function listEventsForPicker(actor: Actor, around: Date) {
  await requirePermission(actor, "calendar.read", { entityType: "calendar_event" });
  return getDb()
    .select({ id: calendarEvents.id, title: calendarEvents.title, startsAt: calendarEvents.startsAt })
    .from(calendarEvents)
    .where(
      and(
        gt(calendarEvents.startsAt, new Date(around.getTime() - 30 * 86400_000)),
        lt(calendarEvents.startsAt, new Date(around.getTime() + 60 * 86400_000)),
        ne(calendarEvents.status, "cancelled"),
      ),
    )
    .orderBy(asc(calendarEvents.startsAt))
    .limit(200);
}


