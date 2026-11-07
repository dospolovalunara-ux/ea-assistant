import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { actionItems, calendarEvents, meetings, meetingTranscripts, protocols, protocolVersions, users } from "../db/schema";
import { can, requirePermission, type Actor } from "../auth/rbac";
import { NotFoundError, ValidationError } from "../errors";
import { writeAudit } from "./audit";
import { storeFile } from "./files";
import { createTask } from "./tasks";
import { isUuid } from "./validation";
import { AiUnavailableError, getAiProvider, type ProtocolDraft } from "../integrations/ai";
import { fmt, parseLocalDate, parseLocalDateTime } from "@/lib/time";

export interface ProtocolContent {
  participants: string[];
  agenda: string[];
  summary: string;
  decisions: { text: string; source?: string; needsReview: boolean }[];
  actionItems: { title: string; assignee: string | null; due: string | null; source?: string; needsReview: boolean }[];
  questions: string[];
}

export const EMPTY_PROTOCOL: ProtocolContent = { participants: [], agenda: [], summary: "", decisions: [], actionItems: [], questions: [] };

const lines = (s: unknown) =>
  String(s ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 200);

/** Строки «⚠ » в начале — пометка «требует проверки». */
const review = (l: string) => ({ needsReview: l.startsWith("⚠"), text: l.replace(/^⚠\s*/, "") });

/** Форма редактора протокола → структура. Поручение: «Что сделать | Ответственный | ГГГГ-ММ-ДД». */
export function protocolFromForm(raw: Record<string, unknown>): ProtocolContent {
  const errors: Record<string, string> = {};
  const items = lines(raw.actionItems).map((l, i) => {
    const r = review(l);
    const [title, assignee, due] = r.text.split("|").map((x) => x.trim());
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) errors.actionItems = `Строка ${i + 1}: срок в формате ГГГГ-ММ-ДД`;
    return { title: title ?? "", assignee: assignee || null, due: due || null, needsReview: r.needsReview };
  });
  if (items.some((i) => !i.title)) errors.actionItems = "У каждого поручения должен быть текст";
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return {
    participants: lines(raw.participants),
    agenda: lines(raw.agenda),
    summary: String(raw.summary ?? "").trim().slice(0, 20000),
    decisions: lines(raw.decisions).map((l) => review(l)),
    actionItems: items,
    questions: lines(raw.questions),
  };
}

export function protocolToForm(c: ProtocolContent) {
  const mark = (x: { needsReview: boolean }) => (x.needsReview ? "⚠ " : "");
  return {
    participants: c.participants.join("\n"),
    agenda: c.agenda.join("\n"),
    summary: c.summary,
    decisions: c.decisions.map((d) => mark(d) + d.text).join("\n"),
    actionItems: c.actionItems.map((a) => mark(a) + [a.title, a.assignee ?? "", a.due ?? ""].join(" | ").replace(/( \| )+$/, "")).join("\n"),
    questions: c.questions.join("\n"),
  };
}

/** Руководитель видит только утверждённые протоколы: черновик нельзя выдавать за утверждённый. */
const visibleStatus = (actor: Actor) => (can(actor, "protocols.write") ? undefined : eq(protocols.status, "approved"));

export async function listMeetings(actor: Actor) {
  await requirePermission(actor, ["protocols.read", "protocols.write"], { entityType: "meeting" });
  return getDb()
    .select({
      id: meetings.id,
      title: meetings.title,
      heldAt: meetings.heldAt,
      location: meetings.location,
      status: protocols.status,
      version: protocols.currentVersion,
      openItems: sql<number>`(select count(*)::int from action_items a where a.protocol_id = ${protocols.id} and a.status = 'proposed')`,
    })
    .from(meetings)
    .innerJoin(protocols, eq(protocols.meetingId, meetings.id))
    .where(visibleStatus(actor))
    .orderBy(desc(meetings.heldAt));
}

export async function createMeeting(actor: Actor, raw: Record<string, unknown>, file?: File | null) {
  await requirePermission(actor, "protocols.write", { entityType: "meeting" });
  const title = String(raw.title ?? "").trim();
  const heldAt = parseLocalDateTime(String(raw.heldAt ?? ""), actor.timezone);
  const transcript = String(raw.transcript ?? "").trim();
  const eventId = String(raw.eventId ?? "") || null;
  const errors: Record<string, string> = {};
  if (!title) errors.title = "Укажите название";
  if (!heldAt) errors.heldAt = "Укажите дату";
  if (transcript.length > 200_000) errors.transcript = "Расшифровка длиннее 200 000 символов";
  if (eventId && !isUuid(eventId)) errors.eventId = "Неверное событие";
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return getDb().transaction(async (tx) => {
    if (eventId && !(await tx.select({ id: calendarEvents.id }).from(calendarEvents).where(eq(calendarEvents.id, eventId))).length)
      throw new ValidationError({ eventId: "Событие не найдено" });
    const [m] = await tx
      .insert(meetings)
      .values({ title: title.slice(0, 300), heldAt: heldAt!, location: String(raw.location ?? "").trim().slice(0, 300) || null, eventId, createdBy: actor.id })
      .returning({ id: meetings.id });
    let fileId: string | null = null;
    let text = transcript;
    if (file && file.size > 0) {
      fileId = await storeFile(tx, actor, "meeting", file);
      if (!text && file.name.toLowerCase().endsWith(".txt")) text = (await file.text()).slice(0, 200_000);
    }
    if (text || fileId) await tx.insert(meetingTranscripts).values({ meetingId: m!.id, text, fileId, createdBy: actor.id });
    await tx.insert(protocols).values({ meetingId: m!.id });
    await writeAudit(tx, { userId: actor.id, action: "meeting.create", entityType: "meeting", entityId: m!.id, ip: actor.ip, metadata: { title, transcriptLength: text.length } });
    return { id: m!.id };
  });
}

export async function getMeeting(actor: Actor, id: string) {
  await requirePermission(actor, ["protocols.read", "protocols.write"], { entityType: "meeting", entityId: String(id) });
  if (!isUuid(id)) throw new NotFoundError();
  const db = getDb();
  const [row] = await db
    .select({ m: meetings, p: protocols, eventTitle: calendarEvents.title })
    .from(meetings)
    .innerJoin(protocols, eq(protocols.meetingId, meetings.id))
    .leftJoin(calendarEvents, eq(meetings.eventId, calendarEvents.id))
    .where(and(eq(meetings.id, id), visibleStatus(actor)));
  if (!row) throw new NotFoundError();
  const versions = await db
    .select({ id: protocolVersions.id, version: protocolVersions.version, source: protocolVersions.source, content: protocolVersions.content, createdAt: protocolVersions.createdAt, author: users.fullName })
    .from(protocolVersions)
    .leftJoin(users, eq(protocolVersions.createdBy, users.id))
    .where(eq(protocolVersions.protocolId, row.p.id))
    .orderBy(desc(protocolVersions.version));
  const transcript = can(actor, "protocols.write")
    ? (await db.select().from(meetingTranscripts).where(eq(meetingTranscripts.meetingId, id)))[0] ?? null
    : null;
  const items = await db.select().from(actionItems).where(eq(actionItems.protocolId, row.p.id)).orderBy(asc(actionItems.createdAt));
  const current = versions.find((v) => v.version === row.p.currentVersion);
  return {
    meeting: row.m,
    protocol: row.p,
    eventTitle: row.eventTitle,
    content: (current?.content as unknown as ProtocolContent) ?? EMPTY_PROTOCOL,
    currentSource: current?.source ?? null,
    versions,
    transcript,
    actionItems: items,
  };
}

async function saveVersion(actor: Actor, protocolId: string, content: ProtocolContent, source: "ai" | "manual") {
  return getDb().transaction(async (tx) => {
    const [p] = await tx.select().from(protocols).where(eq(protocols.id, protocolId));
    const version = p!.currentVersion + 1;
    await tx.insert(protocolVersions).values({ protocolId, version, content: content as unknown as Record<string, unknown>, source, createdBy: actor.id });
    // Любое изменение возвращает протокол в черновик
    await tx.update(protocols).set({ currentVersion: version, status: "draft", approvedAt: null, approvedBy: null, updatedAt: new Date() }).where(eq(protocols.id, protocolId));
    await writeAudit(tx, { userId: actor.id, action: source === "ai" ? "protocol.ai_draft" : "protocol.save", entityType: "meeting", entityId: p!.meetingId, ip: actor.ip, metadata: { version, source } });
    return version;
  });
}

export async function saveProtocol(actor: Actor, meetingId: string, raw: Record<string, unknown>) {
  await requirePermission(actor, "protocols.write", { entityType: "meeting", entityId: String(meetingId) });
  const m = await getMeeting(actor, meetingId);
  return saveVersion(actor, m.protocol.id, protocolFromForm(raw), "manual");
}

/** AI готовит черновик по расшифровке. Без AI — ручной редактор. */
export async function draftProtocolWithAi(actor: Actor, meetingId: string) {
  await requirePermission(actor, "protocols.write", { entityType: "meeting", entityId: String(meetingId) });
  const m = await getMeeting(actor, meetingId);
  if (!m.transcript?.text) throw new AiUnavailableError("Нет текстовой расшифровки. Распознавание речи не согласовано — вставьте текст или заполните протокол вручную.");
  const provider = getAiProvider();
  if (!provider) throw new AiUnavailableError();
  const draft: ProtocolDraft = await provider.draftProtocol(m.transcript.text, { title: m.meeting.title, date: fmt(m.meeting.heldAt, "d MMMM yyyy", actor.timezone) });
  return saveVersion(actor, m.protocol.id, draft, "ai");
}

/** Утверждение: сохраняется финальная версия, поручения становятся предложениями для подтверждения. */
export async function approveProtocol(actor: Actor, meetingId: string) {
  await requirePermission(actor, "protocols.write", { entityType: "meeting", entityId: String(meetingId) });
  const m = await getMeeting(actor, meetingId);
  if (!m.protocol.currentVersion) throw new ValidationError({ _form: "Сначала сохраните протокол" });
  if (m.protocol.status === "approved") return;
  const unresolved = m.content.decisions.some((d) => d.needsReview) || m.content.actionItems.some((a) => a.needsReview);
  if (unresolved) throw new ValidationError({ _form: "Есть пункты с пометкой «требует проверки» (⚠). Проверьте и снимите пометку перед утверждением." });
  await getDb().transaction(async (tx) => {
    await tx.update(protocols).set({ status: "approved", approvedBy: actor.id, approvedAt: new Date(), updatedAt: new Date() }).where(eq(protocols.id, m.protocol.id));
    await tx.delete(actionItems).where(and(eq(actionItems.protocolId, m.protocol.id), eq(actionItems.status, "proposed")));
    const items = m.content.actionItems.map((a) => ({
      protocolId: m.protocol.id,
      title: a.title.slice(0, 300),
      assigneeName: a.assignee,
      dueAt: a.due ? parseLocalDate(a.due, actor.timezone) && new Date(parseLocalDate(a.due, actor.timezone)!.getTime() + 18 * 3600_000) : null,
      needsReview: false,
    }));
    if (items.length) await tx.insert(actionItems).values(items);
    await writeAudit(tx, { userId: actor.id, action: "protocol.approve", entityType: "meeting", entityId: meetingId, ip: actor.ip, metadata: { version: m.protocol.currentVersion, actionItems: items.length } });
  });
}

/** Подтверждённое поручение становится задачей, связанной с исходной встречей. */
export async function confirmActionItem(actor: Actor, meetingId: string, itemId: string, decision: "confirm" | "reject") {
  await requirePermission(actor, "protocols.write", { entityType: "meeting", entityId: String(meetingId) });
  const m = await getMeeting(actor, meetingId);
  const item = m.actionItems.find((a) => a.id === itemId);
  if (!item) throw new NotFoundError();
  if (item.status !== "proposed") return;
  if (decision === "reject") {
    await getDb().update(actionItems).set({ status: "rejected" }).where(eq(actionItems.id, itemId));
    await writeAudit(getDb(), { userId: actor.id, action: "protocol.action_reject", entityType: "meeting", entityId: meetingId, ip: actor.ip, metadata: { itemId } });
    return;
  }
  const task = await createTask(actor, {
    title: item.title,
    assignee: item.assigneeName ? "name" : "",
    assigneeName: item.assigneeName ?? "",
    dueAt: item.dueAt ? fmt(item.dueAt, "yyyy-MM-dd'T'HH:mm", actor.timezone) : "",
    source: `Протокол: ${m.meeting.title} (${fmt(m.meeting.heldAt, "d MMM yyyy", actor.timezone)})`,
    relatedEventId: m.meeting.eventId ?? "",
    visibility: "shared",
    priority: "normal",
    status: "new",
  });
  await getDb().update(actionItems).set({ status: "confirmed", taskId: task.id }).where(eq(actionItems.id, itemId));
  await writeAudit(getDb(), { userId: actor.id, action: "protocol.action_confirm", entityType: "meeting", entityId: meetingId, ip: actor.ip, metadata: { itemId, taskId: task.id } });
  return task.id;
}

export async function countProtocolsInReview(actor: Actor) {
  if (!can(actor, "protocols.write")) return 0;
  const [r] = await getDb().select({ n: sql<number>`count(*)::int` }).from(protocols).where(eq(protocols.status, "draft"));
  return r?.n ?? 0;
}
