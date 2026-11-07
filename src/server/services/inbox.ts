import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { aiExtractions, files, inboxItems, users } from "../db/schema";
import { can, requirePermission, type Actor } from "../auth/rbac";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { writeAudit } from "./audit";
import { storeFile } from "./files";
import { isUuid, safeUrl } from "./validation";
import { createEvent } from "./calendar";
import { createTask } from "./tasks";
import { AiUnavailableError, getAiProvider, INBOX_CATEGORIES } from "../integrations/ai";
import { fmt } from "@/lib/time";

export async function createInboxItem(
  actor: Actor,
  input: { kind: string; text?: string; url?: string; sourceNote?: string; file?: File | null },
): Promise<{ id: string }> {
  await requirePermission(actor, "inbox.write", { entityType: "inbox_item" });
  const kind = input.kind;
  const text = input.text?.trim() || null;
  const sourceNote = input.sourceNote?.trim().slice(0, 300) || null;
  if (!["text", "file", "link"].includes(kind)) throw new ValidationError({ kind: "Неверный тип материала" });
  if (kind === "text" && !text) throw new ValidationError({ text: "Вставьте текст" });
  if (text && text.length > 50_000) throw new ValidationError({ text: "Текст длиннее 50 000 символов" });
  let url: string | null = null;
  if (kind === "link") {
    const r = safeUrl.safeParse(input.url);
    if (!r.success || !r.data) throw new ValidationError({ url: "Ссылка должна начинаться с http:// или https://" });
    url = r.data;
  }
  return getDb().transaction(async (tx) => {
    const fileId = kind === "file" ? await storeFile(tx, actor, "inbox", input.file as File) : null;
    const [row] = await tx
      .insert(inboxItems)
      .values({ kind, textContent: text, url, fileId, sourceNote, createdBy: actor.id })
      .returning({ id: inboxItems.id });
    await writeAudit(tx, { userId: actor.id, action: "inbox.create", entityType: "inbox_item", entityId: row!.id, ip: actor.ip, metadata: { kind, length: text?.length ?? 0 } });
    return { id: row!.id };
  });
}

export async function listInbox(actor: Actor, status: "new" | "processed" | "archived" = "new") {
  await requirePermission(actor, "inbox.read", { entityType: "inbox_item" });
  return getDb()
    .select({
      id: inboxItems.id,
      kind: inboxItems.kind,
      textContent: inboxItems.textContent,
      url: inboxItems.url,
      sourceNote: inboxItems.sourceNote,
      status: inboxItems.status,
      receivedAt: inboxItems.receivedAt,
      fileName: files.originalName,
    })
    .from(inboxItems)
    .leftJoin(files, eq(inboxItems.fileId, files.id))
    .where(eq(inboxItems.status, status))
    .orderBy(desc(inboxItems.receivedAt))
    .limit(200);
}

export async function getInboxItem(actor: Actor, id: string) {
  await requirePermission(actor, "inbox.read", { entityType: "inbox_item", entityId: String(id) });
  if (!isUuid(id)) throw new NotFoundError();
  const db = getDb();
  const [item] = await db
    .select({ item: inboxItems, fileName: files.originalName, fileMime: files.mime, fileScan: files.scanStatus })
    .from(inboxItems)
    .leftJoin(files, eq(inboxItems.fileId, files.id))
    .where(eq(inboxItems.id, id));
  if (!item) throw new NotFoundError();
  const extractions = await db
    .select({ e: aiExtractions, decidedByName: users.fullName })
    .from(aiExtractions)
    .leftJoin(users, eq(aiExtractions.decidedBy, users.id))
    .where(eq(aiExtractions.inboxItemId, id))
    .orderBy(desc(aiExtractions.createdAt));
  return { ...item.item, fileName: item.fileName, fileMime: item.fileMime, fileScan: item.fileScan, extractions: extractions.map((x) => ({ ...x.e, decidedByName: x.decidedByName })) };
}

/**
 * AI-разбор. AI ничего не создаёт в рабочих таблицах — только запись в ai_extractions
 * со статусом proposed. Если AI недоступен — понятная ошибка, работа продолжается вручную.
 */
export async function analyzeInboxItem(actor: Actor, id: string, now = new Date()) {
  await requirePermission(actor, "inbox.write", { entityType: "inbox_item", entityId: String(id) });
  const item = await getInboxItem(actor, id);
  const text = [item.textContent, item.url ? `Ссылка: ${item.url}` : null].filter(Boolean).join("\n");
  if (!text) throw new AiUnavailableError("Для файлов AI-разбор не используется: OCR/распознавание не согласованы. Заполните вручную.");
  const provider = getAiProvider();
  if (!provider) throw new AiUnavailableError();
  const result = await provider.extractInbox(text, { today: fmt(now, "yyyy-MM-dd (EEEE)", actor.timezone), timezone: actor.timezone });
  const db = getDb();
  const [row] = await db
    .insert(aiExtractions)
    .values({
      inboxItemId: id,
      provider: provider.name,
      model: provider.model,
      category: result.category,
      fields: result.fields as unknown as Record<string, unknown>,
      confidence: String(Math.max(0, Math.min(1, result.confidence)).toFixed(3)),
      questions: result.questions.slice(0, 10),
      createdBy: actor.id,
    })
    .returning({ id: aiExtractions.id });
  await writeAudit(db, {
    userId: actor.id,
    action: "ai.extract",
    entityType: "inbox_item",
    entityId: id,
    ip: actor.ip,
    metadata: { extractionId: row!.id, provider: provider.name, model: provider.model, category: result.category, confidence: result.confidence },
  });
  return { id: row!.id };
}

async function loadProposed(id: string | undefined, itemId: string) {
  if (!id) return null;
  if (!isUuid(id)) throw new NotFoundError();
  const [e] = await getDb().select().from(aiExtractions).where(and(eq(aiExtractions.id, id), eq(aiExtractions.inboxItemId, itemId)));
  if (!e) throw new NotFoundError();
  if (e.status !== "proposed") throw new ValidationError({ _form: "Предложение уже обработано" });
  return e;
}

/**
 * Подтверждение человеком: создаётся событие или задача обычным серверным кодом
 * (со всеми проверками прав и ввода), затем предложение отмечается подтверждённым.
 */
export async function confirmInboxItem(
  actor: Actor,
  itemId: string,
  target: "event" | "task",
  raw: Record<string, unknown>,
  opts: { extractionId?: string; confirmOverlap?: boolean } = {},
): Promise<{ entityType: string; id: string }> {
  await requirePermission(actor, "inbox.decide", { entityType: "inbox_item", entityId: String(itemId) });
  const item = await getInboxItem(actor, itemId);
  const ext = await loadProposed(opts.extractionId, itemId);
  const needed = target === "event" ? "calendar.write" : "tasks.write";
  if (!can(actor, needed)) throw new ForbiddenError("Создать запись может пользователь с правом на этот раздел (помощник)");
  const sourceTag = `Входящие: ${item.sourceNote ?? "материал"} (${fmt(item.receivedAt, "d MMM", actor.timezone)})`;
  const created =
    target === "event"
      ? await createEvent(actor, raw, { confirmOverlap: opts.confirmOverlap })
      : await createTask(actor, { ...raw, source: raw.source || sourceTag });
  const entityType = target === "event" ? "calendar_event" : "task";
  await finishItem(actor, itemId, ext?.id ?? null, entityType, created.id, target === "event" ? "meeting" : "task", raw);
  return { entityType, id: created.id };
}

/** Отмечает материал обработанным после создания записи в другом модуле (например, расхода). */
export async function finishItem(
  actor: Actor,
  itemId: string,
  extractionId: string | null,
  entityType: string,
  entityId: string,
  category: string,
  finalFields: Record<string, unknown>,
) {
  const db = getDb();
  await db.transaction(async (tx) => {
    let extId = extractionId;
    if (extId) {
      await tx
        .update(aiExtractions)
        .set({ status: "confirmed", resultEntityType: entityType, resultEntityId: entityId, decidedBy: actor.id, decidedAt: new Date() })
        .where(eq(aiExtractions.id, extId));
    } else {
      const [m] = await tx
        .insert(aiExtractions)
        .values({ inboxItemId: itemId, provider: "manual", category, fields: {}, status: "confirmed", resultEntityType: entityType, resultEntityId: entityId, decidedBy: actor.id, decidedAt: new Date(), createdBy: actor.id })
        .returning({ id: aiExtractions.id });
      extId = m!.id;
    }
    await tx.update(inboxItems).set({ status: "processed", updatedAt: new Date() }).where(eq(inboxItems.id, itemId));
    await writeAudit(tx, {
      userId: actor.id,
      action: "ai.confirm",
      entityType: "inbox_item",
      entityId: itemId,
      ip: actor.ip,
      metadata: { extractionId: extId, resultEntityType: entityType, resultEntityId: entityId, manual: !extractionId, fieldNames: Object.keys(finalFields) },
    });
  });
}

export async function rejectExtraction(actor: Actor, itemId: string, extractionId: string) {
  await requirePermission(actor, "inbox.decide", { entityType: "inbox_item", entityId: String(itemId) });
  await getInboxItem(actor, itemId);
  const ext = await loadProposed(extractionId, itemId);
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.update(aiExtractions).set({ status: "rejected", decidedBy: actor.id, decidedAt: new Date() }).where(eq(aiExtractions.id, ext!.id));
    await writeAudit(tx, { userId: actor.id, action: "ai.reject", entityType: "inbox_item", entityId: itemId, ip: actor.ip, metadata: { extractionId: ext!.id } });
  });
}

export async function archiveInboxItem(actor: Actor, itemId: string) {
  await requirePermission(actor, "inbox.write", { entityType: "inbox_item", entityId: String(itemId) });
  await getInboxItem(actor, itemId);
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.update(inboxItems).set({ status: "archived", updatedAt: new Date() }).where(eq(inboxItems.id, itemId));
    await writeAudit(tx, { userId: actor.id, action: "inbox.archive", entityType: "inbox_item", entityId: itemId, ip: actor.ip });
  });
}

export { INBOX_CATEGORIES };
