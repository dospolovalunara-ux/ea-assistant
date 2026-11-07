import { and, asc, desc, eq, ilike, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import { auditLogs, documentAccess, documentCategories, familyDocumentFiles, familyDocuments, files, users } from "../db/schema";
import { can, logDenied, requirePermission, type Actor } from "../auth/rbac";
import { NotFoundError, ValidationError } from "../errors";
import { writeAudit } from "./audit";
import { storeFile } from "./files";
import { isUuid } from "./validation";
import { fmt } from "@/lib/time";

export const DOCUMENT_CATEGORIES: [string, string][] = [
  ["executive", "Документы руководителя"],
  ["spouse", "Документы супруга"],
  ["children", "Документы детей"],
  ["family_certificates", "Семейные свидетельства"],
  ["real_estate", "Недвижимость"],
  ["vehicles", "Автомобили"],
  ["insurance", "Страхование"],
  ["powers_of_attorney", "Доверенности"],
  ["certificates", "Справки"],
  ["education", "Образование"],
  ["travel_visas", "Поездки и визы"],
  ["other", "Прочее"],
];

/** Номер документа хранится только в минимально необходимом виде: последние 4 символа. */
export function maskNumber(n: string): string | null {
  const s = n.replace(/\s/g, "");
  if (!s) return null;
  return s.length <= 4 ? "•".repeat(s.length) : `••••${s.slice(-4)}`;
}

/** Документы высокой конфиденциальности видят только редакторы и пользователи с точечным доступом. */
function visibility(actor: Actor): SQL | undefined {
  if (can(actor, "documents.write")) return undefined;
  return or(
    eq(familyDocuments.confidentiality, "normal"),
    sql`exists (select 1 from document_access a where a.document_id = ${familyDocuments.id} and a.user_id = ${actor.id})`,
  );
}

export async function listCategories() {
  return getDb().select().from(documentCategories).orderBy(asc(documentCategories.sortOrder));
}

export async function listDocuments(actor: Actor, f: { q?: string; owner?: string; category?: string; expiring?: boolean } = {}) {
  await requirePermission(actor, "documents.read", { entityType: "family_document" });
  const conds: (SQL | undefined)[] = [eq(familyDocuments.status, "active"), visibility(actor)];
  if (f.q) conds.push(or(ilike(familyDocuments.title, `%${f.q.slice(0, 100)}%`), ilike(familyDocuments.docType, `%${f.q.slice(0, 100)}%`)));
  if (f.owner) conds.push(eq(familyDocuments.ownerName, f.owner));
  if (f.category) conds.push(eq(familyDocuments.categoryCode, f.category));
  if (f.expiring) conds.push(isNotNull(familyDocuments.expiresOn), lte(familyDocuments.expiresOn, sql`current_date + 60`));
  return getDb()
    .select({
      id: familyDocuments.id,
      title: familyDocuments.title,
      categoryCode: familyDocuments.categoryCode,
      categoryName: documentCategories.name,
      ownerName: familyDocuments.ownerName,
      docType: familyDocuments.docType,
      expiresOn: familyDocuments.expiresOn,
      confidentiality: familyDocuments.confidentiality,
      hasFile: sql<boolean>`${familyDocuments.currentVersion} > 0`,
    })
    .from(familyDocuments)
    .innerJoin(documentCategories, eq(familyDocuments.categoryCode, documentCategories.code))
    .where(and(...conds))
    .orderBy(sql`${familyDocuments.expiresOn} asc nulls last`, asc(familyDocuments.title));
}

export async function listOwners(actor: Actor) {
  await requirePermission(actor, "documents.read", { entityType: "family_document" });
  const rows = await getDb().selectDistinct({ o: familyDocuments.ownerName }).from(familyDocuments).where(and(eq(familyDocuments.status, "active"), visibility(actor)));
  return rows.map((r) => r.o).sort();
}

export async function countExpiringDocuments(actor: Actor, days = 30) {
  if (!can(actor, "documents.read")) return null;
  const [r] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(familyDocuments)
    .where(and(eq(familyDocuments.status, "active"), visibility(actor), isNotNull(familyDocuments.expiresOn), lte(familyDocuments.expiresOn, sql`current_date + ${days}::int`)));
  return r?.n ?? 0;
}

/** Просмотр карточки документа журналируется. */
export async function getDocument(actor: Actor, id: string) {
  await requirePermission(actor, "documents.read", { entityType: "family_document", entityId: String(id) });
  if (!isUuid(id)) throw new NotFoundError();
  const db = getDb();
  const [d] = await db
    .select({ d: familyDocuments, categoryName: documentCategories.name })
    .from(familyDocuments)
    .innerJoin(documentCategories, eq(familyDocuments.categoryCode, documentCategories.code))
    .where(and(eq(familyDocuments.id, id), visibility(actor)));
  if (!d) {
    await logDenied(actor, { entityType: "family_document", entityId: id, reason: "not_visible_or_missing" });
    throw new NotFoundError();
  }
  const versions = await db
    .select({ id: familyDocumentFiles.id, version: familyDocumentFiles.version, fileId: files.id, name: files.originalName, size: files.size, scanStatus: files.scanStatus, createdAt: familyDocumentFiles.createdAt, author: users.fullName })
    .from(familyDocumentFiles)
    .innerJoin(files, eq(familyDocumentFiles.fileId, files.id))
    .leftJoin(users, eq(familyDocumentFiles.createdBy, users.id))
    .where(eq(familyDocumentFiles.documentId, id))
    .orderBy(desc(familyDocumentFiles.version));
  let canDownload = can(actor, "documents.download");
  if (canDownload && d.d.confidentiality === "high" && !can(actor, "documents.write")) {
    const [a] = await db.select().from(documentAccess).where(and(eq(documentAccess.documentId, id), eq(documentAccess.userId, actor.id)));
    canDownload = Boolean(a?.canDownload);
  }
  await writeAudit(db, { userId: actor.id, action: "document.view", entityType: "family_document", entityId: id, ip: actor.ip });
  return { ...d.d, categoryName: d.categoryName, versions, canDownload };
}

function validateDoc(raw: Record<string, unknown>) {
  const s = (k: string, max: number) => String(raw[k] ?? "").trim().slice(0, max);
  const errors: Record<string, string> = {};
  const title = s("title", 200);
  const categoryCode = s("categoryCode", 40);
  const ownerName = s("ownerName", 200);
  const issuedOn = s("issuedOn", 10) || null;
  const expiresOn = s("expiresOn", 10) || null;
  const confidentiality = s("confidentiality", 10) || "normal";
  if (!title) errors.title = "Укажите название";
  if (!DOCUMENT_CATEGORIES.some(([c]) => c === categoryCode)) errors.categoryCode = "Выберите категорию";
  if (!ownerName) errors.ownerName = "Укажите владельца";
  for (const [k, v] of [["issuedOn", issuedOn], ["expiresOn", expiresOn]] as const) if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) errors[k] = "Дата в формате ГГГГ-ММ-ДД";
  if (issuedOn && expiresOn && expiresOn < issuedOn) errors.expiresOn = "Срок действия раньше даты выдачи";
  if (!["normal", "high"].includes(confidentiality)) errors.confidentiality = "Неверный уровень";
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return {
    title,
    categoryCode,
    ownerName,
    docType: s("docType", 100) || null,
    issuedOn,
    expiresOn,
    issuer: s("issuer", 200) || null,
    confidentiality,
  };
}

export async function createDocument(actor: Actor, raw: Record<string, unknown>, file?: File | null) {
  await requirePermission(actor, "documents.write", { entityType: "family_document" });
  const v = validateDoc(raw);
  const numberMasked = maskNumber(String(raw.number ?? ""));
  return getDb().transaction(async (tx) => {
    const [row] = await tx.insert(familyDocuments).values({ ...v, numberMasked, createdBy: actor.id }).returning({ id: familyDocuments.id });
    if (file && file.size > 0) {
      const fileId = await storeFile(tx, actor, "document", file);
      await tx.insert(familyDocumentFiles).values({ documentId: row!.id, version: 1, fileId, createdBy: actor.id });
      await tx.update(familyDocuments).set({ currentVersion: 1 }).where(eq(familyDocuments.id, row!.id));
    }
    await writeAudit(tx, { userId: actor.id, action: "document.create", entityType: "family_document", entityId: row!.id, ip: actor.ip, metadata: { title: v.title, category: v.categoryCode, withFile: Boolean(file?.size) } });
    return { id: row!.id };
  });
}

export async function updateDocument(actor: Actor, id: string, raw: Record<string, unknown>) {
  await requirePermission(actor, "documents.write", { entityType: "family_document", entityId: String(id) });
  const cur = await getDocument(actor, id);
  const v = validateDoc(raw);
  const number = String(raw.number ?? "").trim();
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(v) as (keyof typeof v)[]) if ((cur[k] ?? null) !== (v[k] ?? null)) changes[k] = { from: cur[k] ?? null, to: v[k] ?? null };
  if (number) changes.numberMasked = { from: cur.numberMasked, to: maskNumber(number) };
  if (!Object.keys(changes).length) return;
  await getDb().transaction(async (tx) => {
    await tx.update(familyDocuments).set({ ...v, ...(number ? { numberMasked: maskNumber(number) } : {}), updatedAt: new Date() }).where(eq(familyDocuments.id, id));
    await writeAudit(tx, { userId: actor.id, action: "document.update", entityType: "family_document", entityId: id, ip: actor.ip, metadata: { changes } });
  });
}

/** Новая версия файла: старые версии сохраняются. */
export async function addDocumentVersion(actor: Actor, id: string, file: File) {
  await requirePermission(actor, "documents.write", { entityType: "family_document", entityId: String(id) });
  const cur = await getDocument(actor, id);
  await getDb().transaction(async (tx) => {
    const fileId = await storeFile(tx, actor, "document", file);
    const version = cur.currentVersion + 1;
    await tx.insert(familyDocumentFiles).values({ documentId: id, version, fileId, createdBy: actor.id });
    await tx.update(familyDocuments).set({ currentVersion: version, updatedAt: new Date() }).where(eq(familyDocuments.id, id));
    await writeAudit(tx, { userId: actor.id, action: "document.version", entityType: "family_document", entityId: id, ip: actor.ip, metadata: { version, fileId } });
  });
}

export async function archiveDocument(actor: Actor, id: string) {
  await requirePermission(actor, "documents.write", { entityType: "family_document", entityId: String(id) });
  await getDocument(actor, id);
  await getDb().transaction(async (tx) => {
    await tx.update(familyDocuments).set({ status: "archived", updatedAt: new Date() }).where(eq(familyDocuments.id, id));
    await writeAudit(tx, { userId: actor.id, action: "document.archive", entityType: "family_document", entityId: id, ip: actor.ip });
  });
}

/** Точечный доступ к документу высокой конфиденциальности. */
export async function setDocumentAccess(actor: Actor, id: string, userId: string, mode: "none" | "view" | "download") {
  await requirePermission(actor, "documents.write", { entityType: "family_document", entityId: String(id) });
  await getDocument(actor, id);
  if (!isUuid(userId)) throw new ValidationError({ userId: "Неверный пользователь" });
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(documentAccess).where(and(eq(documentAccess.documentId, id), eq(documentAccess.userId, userId)));
    if (mode !== "none") await tx.insert(documentAccess).values({ documentId: id, userId, canDownload: mode === "download" });
    await writeAudit(tx, { userId: actor.id, action: "document.access", entityType: "family_document", entityId: id, ip: actor.ip, metadata: { targetUserId: userId, mode } });
  });
}

export async function getDocumentAccessList(actor: Actor, id: string) {
  await requirePermission(actor, "documents.write", { entityType: "family_document", entityId: String(id) });
  return getDb()
    .select({ userId: documentAccess.userId, canDownload: documentAccess.canDownload, name: users.fullName })
    .from(documentAccess)
    .innerJoin(users, eq(documentAccess.userId, users.id))
    .where(eq(documentAccess.documentId, id));
}

/** Журнал просмотров, скачиваний и изменений документа. */
export async function getDocumentAudit(actor: Actor, id: string) {
  await requirePermission(actor, "documents.write", { entityType: "family_document", entityId: String(id) });
  return getDb()
    .select({ id: auditLogs.id, action: auditLogs.action, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt, userName: users.fullName })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(and(eq(auditLogs.entityType, "family_document"), eq(auditLogs.entityId, id)))
    .orderBy(desc(auditLogs.id))
    .limit(200);
}

export function daysUntil(dateStr: string | null, tz: string, now = new Date()): number | null {
  if (!dateStr) return null;
  const today = fmt(now, "yyyy-MM-dd", tz);
  return Math.round((Date.parse(dateStr) - Date.parse(today)) / 86400_000);
}
