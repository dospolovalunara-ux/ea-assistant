import { and, asc, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { auditLogs, calendarEvents, corporateExpenses, expenseDocuments, files, users } from "../db/schema";
import { requirePermission, type Actor } from "../auth/rbac";
import { NotFoundError, ValidationError } from "../errors";
import { writeAudit } from "./audit";
import { storeFile } from "./files";
import { isUuid, optionalText, parseOrThrow, requiredText } from "./validation";
import { parseAmount } from "@/lib/money";
import { CORPORATE_CATEGORIES, EXPENSE_DOC_TYPES, PAYMENT_METHODS, REQUIRED_DOCS, type ExpenseDocType } from "@/lib/expense-labels";
import { parseLocalDateTime } from "@/lib/time";

const schema = z.object({
  spentAt: z.string({ error: "Укажите дату" }).min(1, "Укажите дату"),
  amount: z.string({ error: "Укажите сумму" }).min(1, "Укажите сумму"),
  currency: z.enum(["KZT", "USD", "EUR", "RUB"]).default("KZT"),
  organization: requiredText(200, "Организация"),
  category: z.enum(Object.keys(CORPORATE_CATEGORIES) as [keyof typeof CORPORATE_CATEGORIES], { error: "Выберите категорию" }),
  description: optionalText(1000),
  relatedEventId: optionalText(40),
  paymentMethod: z.enum(Object.keys(PAYMENT_METHODS) as [keyof typeof PAYMENT_METHODS]).default("corporate_card"),
  comment: optionalText(1000),
});

async function validate(actor: Actor, raw: Record<string, unknown>) {
  const v = parseOrThrow(schema, raw);
  const errors: Record<string, string> = {};
  const amount = parseAmount(v.amount);
  if (!amount || amount.startsWith("-") || amount === "0.00") errors.amount = "Сумма — положительное число, например 4500 или 4500,50";
  const spentAt = parseLocalDateTime(v.spentAt, actor.timezone);
  if (!spentAt) errors.spentAt = "Неверная дата";
  let relatedEventId: string | null = null;
  if (v.relatedEventId) {
    const ok = isUuid(v.relatedEventId) && (await getDb().select({ id: calendarEvents.id }).from(calendarEvents).where(eq(calendarEvents.id, v.relatedEventId))).length;
    if (!ok) errors.relatedEventId = "Событие не найдено";
    else relatedEventId = v.relatedEventId;
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return { ...v, amount: amount!, spentAt: spentAt!, relatedEventId, description: v.description ?? null, comment: v.comment ?? null };
}

export interface ExpenseRow {
  id: string;
  spentAt: Date;
  amount: string;
  currency: string;
  organization: string;
  category: string;
  description: string | null;
  paymentMethod: string;
  status: string;
  docTypes: string[];
  missingDocs: ExpenseDocType[];
  relatedEventTitle: string | null;
}

function missing(docTypes: string[]): ExpenseDocType[] {
  return REQUIRED_DOCS.filter((d) => !docTypes.includes(d));
}

export async function listCorporateExpenses(actor: Actor, range: { from: Date; to: Date }, opts: { onlyMissing?: boolean } = {}): Promise<ExpenseRow[]> {
  await requirePermission(actor, "expenses.corporate.read", { entityType: "corporate_expense" });
  const rows = await getDb()
    .select({
      id: corporateExpenses.id,
      spentAt: corporateExpenses.spentAt,
      amount: corporateExpenses.amount,
      currency: corporateExpenses.currency,
      organization: corporateExpenses.organization,
      category: corporateExpenses.category,
      description: corporateExpenses.description,
      paymentMethod: corporateExpenses.paymentMethod,
      status: corporateExpenses.status,
      relatedEventTitle: calendarEvents.title,
      docTypes: sql<string[]>`coalesce((select array_agg(distinct d.doc_type) from expense_documents d where d.expense_id = ${corporateExpenses.id}), '{}')`,
    })
    .from(corporateExpenses)
    .leftJoin(calendarEvents, eq(corporateExpenses.relatedEventId, calendarEvents.id))
    .where(and(gte(corporateExpenses.spentAt, range.from), lt(corporateExpenses.spentAt, range.to)))
    .orderBy(desc(corporateExpenses.spentAt));
  const out = rows.map((r) => ({ ...r, missingDocs: r.status === "active" ? missing(r.docTypes) : [] }));
  return opts.onlyMissing ? out.filter((r) => r.missingDocs.length) : out;
}

/** Итоги по валютам — только SQL. */
export async function corporateTotals(actor: Actor, range: { from: Date; to: Date }) {
  await requirePermission(actor, "expenses.corporate.read", { entityType: "corporate_expense" });
  return getDb()
    .select({ currency: corporateExpenses.currency, total: sql<string>`sum(${corporateExpenses.amount})::text`, count: sql<number>`count(*)::int` })
    .from(corporateExpenses)
    .where(and(eq(corporateExpenses.status, "active"), gte(corporateExpenses.spentAt, range.from), lt(corporateExpenses.spentAt, range.to)))
    .groupBy(corporateExpenses.currency);
}

export async function countMissingDocs(actor: Actor): Promise<number> {
  await requirePermission(actor, "expenses.corporate.read", { entityType: "corporate_expense" });
  const [r] = await getDb().execute(sql`
    select count(*)::int as n from corporate_expenses e
    where e.status = 'active' and (
      select count(distinct d.doc_type) from expense_documents d
      where d.expense_id = e.id and d.doc_type in ('fiscal_receipt','payment_confirmation')
    ) < 2`).then((r) => r.rows as { n: number }[]);
  return r?.n ?? 0;
}

export async function getCorporateExpense(actor: Actor, id: string) {
  await requirePermission(actor, "expenses.corporate.read", { entityType: "corporate_expense", entityId: String(id) });
  if (!isUuid(id)) throw new NotFoundError();
  const db = getDb();
  const [e] = await db
    .select({ e: corporateExpenses, eventTitle: calendarEvents.title })
    .from(corporateExpenses)
    .leftJoin(calendarEvents, eq(corporateExpenses.relatedEventId, calendarEvents.id))
    .where(eq(corporateExpenses.id, id));
  if (!e) throw new NotFoundError();
  const docs = await db
    .select({ id: expenseDocuments.id, docType: expenseDocuments.docType, fileId: files.id, name: files.originalName, size: files.size, scanStatus: files.scanStatus, createdAt: expenseDocuments.createdAt })
    .from(expenseDocuments)
    .innerJoin(files, eq(expenseDocuments.fileId, files.id))
    .where(eq(expenseDocuments.expenseId, id))
    .orderBy(asc(expenseDocuments.createdAt));
  return { ...e.e, eventTitle: e.eventTitle, docs, missingDocs: e.e.status === "active" ? missing(docs.map((d) => d.docType)) : [] };
}

/** Возможные дубликаты: та же сумма и валюта в пределах суток. Решение принимает человек. */
export async function findDuplicates(actor: Actor, v: { amount: string; currency: string; spentAt: Date; excludeId?: string }) {
  await requirePermission(actor, "expenses.corporate.read", { entityType: "corporate_expense" });
  const conds = [
    eq(corporateExpenses.amount, v.amount),
    eq(corporateExpenses.currency, v.currency),
    eq(corporateExpenses.status, "active"),
    gte(corporateExpenses.spentAt, new Date(v.spentAt.getTime() - 86400_000)),
    lt(corporateExpenses.spentAt, new Date(v.spentAt.getTime() + 86400_000)),
  ];
  if (v.excludeId) conds.push(ne(corporateExpenses.id, v.excludeId));
  return getDb()
    .select({ id: corporateExpenses.id, organization: corporateExpenses.organization, spentAt: corporateExpenses.spentAt, amount: corporateExpenses.amount })
    .from(corporateExpenses)
    .where(and(...conds))
    .limit(10);
}

export class DuplicateWarning extends Error {
  constructor(public duplicates: { id: string; organization: string; spentAt: Date; amount: string }[]) {
    super("Похоже на дубликат");
  }
}

export async function createCorporateExpense(actor: Actor, raw: Record<string, unknown>, opts: { confirmDuplicate?: boolean } = {}) {
  await requirePermission(actor, "expenses.corporate.write", { entityType: "corporate_expense" });
  const v = await validate(actor, raw);
  if (!opts.confirmDuplicate) {
    const d = await findDuplicates(actor, { amount: v.amount, currency: v.currency, spentAt: v.spentAt });
    if (d.length) throw new DuplicateWarning(d);
  }
  return getDb().transaction(async (tx) => {
    const [row] = await tx.insert(corporateExpenses).values({ ...v, createdBy: actor.id }).returning({ id: corporateExpenses.id });
    await writeAudit(tx, {
      userId: actor.id,
      action: "expense.corporate.create",
      entityType: "corporate_expense",
      entityId: row!.id,
      ip: actor.ip,
      metadata: { amount: v.amount, currency: v.currency, organization: v.organization, duplicateConfirmed: Boolean(opts.confirmDuplicate) },
    });
    return { id: row!.id };
  });
}

export async function updateCorporateExpense(actor: Actor, id: string, raw: Record<string, unknown>) {
  await requirePermission(actor, "expenses.corporate.write", { entityType: "corporate_expense", entityId: String(id) });
  const cur = await getCorporateExpense(actor, id);
  if (cur.status !== "active") throw new ValidationError({ _form: "Аннулированный расход нельзя изменить" });
  const v = await validate(actor, raw);
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of ["amount", "currency", "organization", "category", "description", "paymentMethod", "comment", "relatedEventId"] as const) {
    if ((cur[k] ?? null) !== (v[k] ?? null)) changes[k] = { from: cur[k] ?? null, to: v[k] ?? null };
  }
  if (cur.spentAt.getTime() !== v.spentAt.getTime()) changes.spentAt = { from: cur.spentAt.toISOString(), to: v.spentAt.toISOString() };
  if (!Object.keys(changes).length) return;
  await getDb().transaction(async (tx) => {
    await tx.update(corporateExpenses).set({ ...v, updatedAt: new Date() }).where(eq(corporateExpenses.id, id));
    await writeAudit(tx, { userId: actor.id, action: "expense.corporate.update", entityType: "corporate_expense", entityId: id, ip: actor.ip, metadata: { changes } });
  });
}

/** Финансовые записи не удаляются: только аннулирование с причиной. */
export async function voidCorporateExpense(actor: Actor, id: string, reason: string) {
  await requirePermission(actor, "expenses.corporate.write", { entityType: "corporate_expense", entityId: String(id) });
  const cur = await getCorporateExpense(actor, id);
  if (!reason?.trim()) throw new ValidationError({ reason: "Укажите причину" });
  if (cur.status !== "active") return;
  await getDb().transaction(async (tx) => {
    await tx.update(corporateExpenses).set({ status: "void", updatedAt: new Date() }).where(eq(corporateExpenses.id, id));
    await writeAudit(tx, { userId: actor.id, action: "expense.corporate.void", entityType: "corporate_expense", entityId: id, ip: actor.ip, metadata: { reason: reason.slice(0, 500), changes: { status: { from: "active", to: "void" } } } });
  });
}

export async function addExpenseDocument(actor: Actor, id: string, docType: string, file: File) {
  await requirePermission(actor, "expenses.corporate.write", { entityType: "corporate_expense", entityId: String(id) });
  await getCorporateExpense(actor, id);
  if (!(docType in EXPENSE_DOC_TYPES)) throw new ValidationError({ docType: "Выберите тип документа" });
  await getDb().transaction(async (tx) => {
    const fileId = await storeFile(tx, actor, "expense", file);
    await tx.insert(expenseDocuments).values({ expenseId: id, docType, fileId, createdBy: actor.id });
    await writeAudit(tx, { userId: actor.id, action: "expense.document.add", entityType: "corporate_expense", entityId: id, ip: actor.ip, metadata: { docType, fileId } });
  });
}

export async function getExpenseHistory(actor: Actor, id: string) {
  await getCorporateExpense(actor, id);
  return getDb()
    .select({ id: auditLogs.id, action: auditLogs.action, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt, userName: users.fullName })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(and(eq(auditLogs.entityType, "corporate_expense"), eq(auditLogs.entityId, id)))
    .orderBy(desc(auditLogs.id));
}

/** Файлы документов за период — для комплекта бухгалтерии. */
export async function expenseFilesForPeriod(actor: Actor, range: { from: Date; to: Date }) {
  await requirePermission(actor, "expenses.corporate.read", { entityType: "corporate_expense" });
  return getDb()
    .select({ expenseId: corporateExpenses.id, spentAt: corporateExpenses.spentAt, organization: corporateExpenses.organization, docType: expenseDocuments.docType, storageKey: files.storageKey, name: files.originalName })
    .from(expenseDocuments)
    .innerJoin(corporateExpenses, eq(expenseDocuments.expenseId, corporateExpenses.id))
    .innerJoin(files, eq(expenseDocuments.fileId, files.id))
    .where(and(eq(corporateExpenses.status, "active"), gte(corporateExpenses.spentAt, range.from), lt(corporateExpenses.spentAt, range.to)));
}
