import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { personalCashTransfers, personalExpenses, users } from "../db/schema";
import { requirePermission, type Actor } from "../auth/rbac";
import { ValidationError } from "../errors";
import { writeAudit } from "./audit";
import { isUuid } from "./validation";
import { parseAmount } from "@/lib/money";
import { PERSONAL_CATEGORIES, TRANSFER_KINDS } from "@/lib/expense-labels";
import { parseLocalDateTime } from "@/lib/time";

/**
 * Отдельный финансовый контур: свои таблицы и права, с корпоративными расходами не смешивается.
 * Все суммы и балансы — numeric в PostgreSQL.
 */

export async function personalBalance(actor: Actor) {
  await requirePermission(actor, "expenses.personal.read", { entityType: "personal_expense" });
  const [r] = await getDb().execute(sql`
    select
      coalesce((select sum(case kind when 'income' then amount else 0 end) from personal_cash_transfers), 0)::text as received,
      coalesce((select sum(case kind when 'refund' then amount else 0 end) from personal_cash_transfers), 0)::text as refunded,
      coalesce((select sum(case kind when 'adjustment' then amount else 0 end) from personal_cash_transfers), 0)::text as adjusted,
      coalesce((select sum(amount) from personal_expenses), 0)::text as spent,
      (coalesce((select sum(case kind when 'refund' then -amount else amount end) from personal_cash_transfers), 0)
        - coalesce((select sum(amount) from personal_expenses), 0))::text as balance
  `).then((x) => x.rows as { received: string; refunded: string; adjusted: string; spent: string; balance: string }[]);
  return r!;
}

/** Поступления с остатком по каждой передаче. */
export async function listTransfers(actor: Actor) {
  await requirePermission(actor, "expenses.personal.read", { entityType: "personal_expense" });
  return getDb()
    .select({
      id: personalCashTransfers.id,
      kind: personalCashTransfers.kind,
      parentId: personalCashTransfers.parentId,
      amount: personalCashTransfers.amount,
      occurredAt: personalCashTransfers.occurredAt,
      description: personalCashTransfers.description,
      reason: personalCashTransfers.reason,
      createdByName: users.fullName,
      spent: sql<string>`coalesce((select sum(e.amount) from personal_expenses e where e.transfer_id = ${personalCashTransfers.id}), 0)::text`,
      remaining: sql<string>`case when ${personalCashTransfers.kind} = 'income' then (${personalCashTransfers.amount}
        - coalesce((select sum(e.amount) from personal_expenses e where e.transfer_id = ${personalCashTransfers.id}), 0)
        - coalesce((select sum(c.amount) from personal_cash_transfers c where c.parent_id = ${personalCashTransfers.id} and c.kind = 'refund'), 0)
        + coalesce((select sum(c.amount) from personal_cash_transfers c where c.parent_id = ${personalCashTransfers.id} and c.kind = 'adjustment'), 0))::text else null end`,
    })
    .from(personalCashTransfers)
    .leftJoin(users, eq(personalCashTransfers.createdBy, users.id))
    .orderBy(desc(personalCashTransfers.occurredAt));
}

export async function listPersonalExpenses(actor: Actor, range: { from: Date; to: Date }) {
  await requirePermission(actor, "expenses.personal.read", { entityType: "personal_expense" });
  return getDb()
    .select()
    .from(personalExpenses)
    .where(and(gte(personalExpenses.spentAt, range.from), lt(personalExpenses.spentAt, range.to)))
    .orderBy(desc(personalExpenses.spentAt));
}

/** Отчёт по дням или месяцам и по категориям — группировка в SQL по местному времени. */
export async function personalReport(actor: Actor, range: { from: Date; to: Date }, by: "day" | "month") {
  await requirePermission(actor, "expenses.personal.read", { entityType: "personal_expense" });
  const tz = actor.timezone;
  const unit = by === "day" ? "day" : "month";
  const rows = await getDb().execute(sql`
    select to_char(date_trunc(${unit}, spent_at at time zone ${tz}), ${by === "day" ? "YYYY-MM-DD" : "YYYY-MM"}) as period,
           category, sum(amount)::text as total, count(*)::int as count
    from personal_expenses
    where spent_at >= ${range.from} and spent_at < ${range.to}
    group by 1, 2 order by 1 desc, 2`);
  return rows.rows as { period: string; category: string; total: string; count: number }[];
}

export async function createTransfer(actor: Actor, raw: Record<string, unknown>) {
  await requirePermission(actor, "expenses.personal.write", { entityType: "personal_transfer" });
  const kind = String(raw.kind ?? "");
  const errors: Record<string, string> = {};
  if (!(kind in TRANSFER_KINDS)) errors.kind = "Выберите тип операции";
  const amount = parseAmount(String(raw.amount ?? ""));
  if (!amount || amount === "0.00") errors.amount = "Укажите сумму";
  else if (kind !== "adjustment" && amount.startsWith("-")) errors.amount = "Сумма должна быть положительной";
  const occurredAt = parseLocalDateTime(String(raw.occurredAt ?? ""), actor.timezone);
  if (!occurredAt) errors.occurredAt = "Неверная дата";
  const reason = String(raw.reason ?? "").trim().slice(0, 500) || null;
  if (kind === "adjustment" && !reason) errors.reason = "Для корректировки причина обязательна";
  const parentId = String(raw.parentId ?? "") || null;
  if (parentId && !isUuid(parentId)) errors.parentId = "Неверная передача";
  if (kind === "refund" && !parentId) errors.parentId = "Выберите передачу, по которой возвращается остаток";
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return getDb().transaction(async (tx) => {
    if (parentId) {
      const [p] = await tx.select().from(personalCashTransfers).where(and(eq(personalCashTransfers.id, parentId), eq(personalCashTransfers.kind, "income")));
      if (!p) throw new ValidationError({ parentId: "Передача не найдена" });
    }
    const [row] = await tx
      .insert(personalCashTransfers)
      .values({ kind, amount: amount!, occurredAt: occurredAt!, parentId, reason, description: String(raw.description ?? "").trim().slice(0, 500) || null, createdBy: actor.id })
      .returning({ id: personalCashTransfers.id });
    await writeAudit(tx, { userId: actor.id, action: "expense.personal.transfer", entityType: "personal_transfer", entityId: row!.id, ip: actor.ip, metadata: { kind, amount, reason } });
    return { id: row!.id };
  });
}

export interface PersonalExpenseInput {
  description: string;
  amount: string;
  category: string;
}

/** Сохраняет одну или несколько подтверждённых операций — всё или ничего. */
export async function createPersonalExpenses(actor: Actor, items: PersonalExpenseInput[], meta: { spentAt: string; transferId?: string }) {
  await requirePermission(actor, "expenses.personal.write", { entityType: "personal_expense" });
  if (!items.length) throw new ValidationError({ _form: "Нет операций для сохранения" });
  if (items.length > 50) throw new ValidationError({ _form: "Не более 50 операций за раз" });
  const spentAt = parseLocalDateTime(meta.spentAt, actor.timezone);
  if (!spentAt) throw new ValidationError({ spentAt: "Неверная дата" });
  const transferId = meta.transferId || null;
  if (transferId && !isUuid(transferId)) throw new ValidationError({ transferId: "Неверная передача" });
  const clean = items.map((it, i) => {
    const amount = parseAmount(it.amount);
    if (!amount || amount.startsWith("-") || amount === "0.00") throw new ValidationError({ [`items.${i}.amount`]: `Строка ${i + 1}: неверная сумма` });
    if (!it.description.trim()) throw new ValidationError({ [`items.${i}.description`]: `Строка ${i + 1}: укажите описание` });
    const category = it.category in PERSONAL_CATEGORIES ? it.category : "other";
    return { amount, description: it.description.trim().slice(0, 200), category };
  });
  return getDb().transaction(async (tx) => {
    if (transferId) {
      const [p] = await tx.select().from(personalCashTransfers).where(and(eq(personalCashTransfers.id, transferId), eq(personalCashTransfers.kind, "income")));
      if (!p) throw new ValidationError({ transferId: "Передача не найдена" });
    }
    const rows = await tx
      .insert(personalExpenses)
      .values(clean.map((c) => ({ ...c, spentAt, transferId, createdBy: actor.id })))
      .returning({ id: personalExpenses.id });
    await writeAudit(tx, {
      userId: actor.id,
      action: "expense.personal.create",
      entityType: "personal_expense",
      entityId: rows[0]!.id,
      ip: actor.ip,
      metadata: { count: rows.length, ids: rows.map((r) => r.id), amounts: clean.map((c) => c.amount) },
    });
    return rows.map((r) => r.id);
  });
}

