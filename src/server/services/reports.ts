import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { meetings, protocols } from "../db/schema";
import { can, canAny, requirePermission, type Actor } from "../auth/rbac";
import { listEvents } from "./calendar";
import { countTasksBySection, listTasks } from "./tasks";
import { corporateTotals, listCorporateExpenses } from "./corporate-expenses";
import { personalBalance, personalReport } from "./personal-expenses";
import { listDocuments } from "./documents";
import type { ReportDoc } from "../exports/render";
import { EVENT_TYPES, TASK_STATUSES } from "@/lib/labels";
import { CORPORATE_CATEGORIES, EXPENSE_DOC_TYPES, PERSONAL_CATEGORIES } from "@/lib/expense-labels";
import { formatMoney } from "@/lib/money";
import { addLocalDays, fmt, localDayStart, localWeekStart } from "@/lib/time";

/**
 * Отчёты собираются только из базы. Каждый блок включается, если у пользователя есть право
 * на соответствующий раздел — руководитель видит только согласованные сведения.
 */
export async function weeklyReport(actor: Actor, now = new Date()): Promise<ReportDoc> {
  await requirePermission(actor, "reports.view", { entityType: "report" });
  const tz = actor.timezone;
  const from = localWeekStart(now, tz);
  const to = addLocalDays(from, 7, tz);
  const range = { from, to };
  const doc: ReportDoc = {
    title: "Недельная сводка",
    subtitle: `${fmt(from, "d MMMM", tz)} – ${fmt(addLocalDays(from, 6, tz), "d MMMM yyyy", tz)} · сформировано ${fmt(now, "d MMM yyyy, HH:mm", tz)} · ${actor.fullName}`,
    sections: [],
  };

  if (can(actor, "calendar.read")) {
    const ev = await listEvents(actor, { from, to, includeDrafts: false });
    doc.sections.push({
      kind: "table",
      title: `Встречи недели (${ev.length})`,
      columns: ["Дата", "Время", "Событие", "Тип", "Календарь"],
      rows: ev.map((e) => [fmt(e.startsAt, "dd.MM EEEEEE", tz), e.allDay ? "весь день" : `${fmt(e.startsAt, "HH:mm", tz)}–${fmt(e.endsAt, "HH:mm", tz)}`, e.title, EVENT_TYPES[e.type], e.calendarKind === "work" ? "рабочий" : "личный"]),
    });
  }
  if (canAny(actor, "tasks.read_all", "tasks.read_shared")) {
    const counts = await countTasksBySection(actor, now);
    const open = await listTasks(actor, "week", now);
    const overdue = await listTasks(actor, "overdue", now);
    doc.sections.push({ kind: "text", heading: "Задачи и поручения", lines: [`Открытых: ${counts.open}; на этой неделе: ${counts.week}; просрочено: ${counts.overdue}; ожидает ответа: ${counts.waiting}.`] });
    doc.sections.push({
      kind: "table",
      title: "Сроки на 7 дней и просроченные",
      columns: ["Срок", "Задача", "Ответственный", "Статус"],
      rows: [...overdue, ...open.filter((t) => !overdue.some((o) => o.id === t.id))].map((t) => [t.dueAt ? fmt(t.dueAt, "dd.MM HH:mm", tz) : "—", t.title, t.assigneeUserName ?? t.assigneeName ?? "—", TASK_STATUSES[t.status] + (t.dueAt && t.dueAt < now ? " (просрочена)" : "")]),
    });
  }
  if (canAny(actor, "protocols.read", "protocols.write")) {
    const db = getDb();
    const rows = await db
      .select({ title: meetings.title, heldAt: meetings.heldAt, status: protocols.status, open: sql<number>`(select count(*)::int from action_items a where a.protocol_id = ${protocols.id} and a.status = 'proposed')` })
      .from(meetings)
      .innerJoin(protocols, eq(protocols.meetingId, meetings.id))
      .where(and(gte(meetings.heldAt, from), lt(meetings.heldAt, to), can(actor, "protocols.write") ? undefined : eq(protocols.status, "approved")));
    doc.sections.push({ kind: "table", title: "Протоколы недели", columns: ["Дата", "Совещание", "Статус", "Неподтверждённых поручений"], rows: rows.map((r) => [fmt(r.heldAt, "dd.MM", tz), r.title, r.status === "approved" ? "утверждён" : "черновик", r.open]) });
  }
  if (can(actor, "expenses.corporate.read")) {
    const totals = await corporateTotals(actor, range);
    const missing = await listCorporateExpenses(actor, { from: addLocalDays(from, -60, tz), to }, { onlyMissing: true });
    doc.sections.push({ kind: "text", heading: "Корпоративные расходы", lines: totals.length ? totals.map((t) => `Итого за неделю: ${formatMoney(t.total, t.currency)} (${t.count} операций)`) : ["Расходов за неделю нет."] });
    doc.sections.push({
      kind: "table",
      title: `Не хватает документов (${missing.length})`,
      columns: ["Дата", "Организация", "Сумма", "Не хватает"],
      rows: missing.map((m) => [fmt(m.spentAt, "dd.MM", tz), m.organization, formatMoney(m.amount, m.currency), m.missingDocs.map((d) => EXPENSE_DOC_TYPES[d]).join(", ")]),
    });
  }
  if (can(actor, "expenses.personal.read")) {
    const b = await personalBalance(actor);
    const rep = await personalReport(actor, range, "day");
    doc.sections.push({ kind: "text", heading: "Личные расходы", lines: [`Текущий остаток: ${formatMoney(b.balance)}. Получено всего: ${formatMoney(b.received)}, израсходовано: ${formatMoney(b.spent)}, возвращено: ${formatMoney(b.refunded)}.`] });
    if (rep.length) doc.sections.push({ kind: "table", title: "Личные расходы по дням", columns: ["День", "Категория", "Сумма", "Операций"], rows: rep.map((r) => [r.period, PERSONAL_CATEGORIES[r.category as keyof typeof PERSONAL_CATEGORIES] ?? r.category, formatMoney(r.total), r.count]) });
  }
  if (can(actor, "documents.read")) {
    const docs = (await listDocuments(actor, { expiring: true })).filter((d) => d.expiresOn);
    doc.sections.push({ kind: "table", title: "Сроки документов (60 дней)", columns: ["Документ", "Владелец", "Действует до"], rows: docs.map((d) => [d.title, d.ownerName, d.expiresOn]) });
  }
  return doc;
}

/** Задачи на день для помощника. */
export async function dailyReport(actor: Actor, now = new Date()): Promise<ReportDoc> {
  await requirePermission(actor, "reports.view", { entityType: "report" });
  const tz = actor.timezone;
  const day = localDayStart(now, tz);
  const doc: ReportDoc = { title: `План на ${fmt(now, "d MMMM yyyy, EEEE", tz)}`, subtitle: actor.fullName, sections: [] };
  if (can(actor, "calendar.read")) {
    const ev = await listEvents(actor, { from: day, to: addLocalDays(day, 1, tz), includeDrafts: false });
    doc.sections.push({ kind: "table", title: "Расписание", columns: ["Время", "Событие", "Место"], rows: ev.map((e) => [e.allDay ? "весь день" : `${fmt(e.startsAt, "HH:mm", tz)}–${fmt(e.endsAt, "HH:mm", tz)}`, e.title, e.location ?? ""]) });
  }
  if (canAny(actor, "tasks.read_all", "tasks.read_shared")) {
    const t = [...(await listTasks(actor, "overdue", now)), ...(await listTasks(actor, "today", now))];
    const uniq = t.filter((x, i) => t.findIndex((y) => y.id === x.id) === i);
    doc.sections.push({ kind: "table", title: "Задачи на сегодня и просроченные", columns: ["Срок", "Задача", "Статус"], rows: uniq.map((x) => [x.dueAt ? fmt(x.dueAt, "dd.MM HH:mm", tz) : "—", x.title, TASK_STATUSES[x.status]]) });
  }
  return doc;
}

export async function corporateRegister(actor: Actor, range: { from: Date; to: Date }): Promise<ReportDoc> {
  const rows = await listCorporateExpenses(actor, range);
  const totals = await corporateTotals(actor, range);
  const tz = actor.timezone;
  return {
    title: "Реестр корпоративных расходов",
    subtitle: `${fmt(range.from, "d MMM yyyy", tz)} – ${fmt(addLocalDays(range.to, -1, tz), "d MMM yyyy", tz)}`,
    sections: [
      {
        kind: "table",
        title: "Реестр",
        columns: ["Дата", "Организация", "Категория", "Описание", "Сумма", "Валюта", "Статус", "Документы", "Не хватает"],
        moneyColumns: [4],
        rows: rows.map((r) => [fmt(r.spentAt, "dd.MM.yyyy HH:mm", tz), r.organization, CORPORATE_CATEGORIES[r.category as keyof typeof CORPORATE_CATEGORIES] ?? r.category, r.description ?? "", r.amount, r.currency, r.status === "void" ? "аннулирован" : "активен", r.docTypes.map((d) => EXPENSE_DOC_TYPES[d as keyof typeof EXPENSE_DOC_TYPES] ?? d).join(", "), r.missingDocs.map((d) => EXPENSE_DOC_TYPES[d]).join(", ")]),
      },
      { kind: "text", heading: "Итого (без аннулированных)", lines: totals.map((t) => `${t.currency}: ${formatMoney(t.total, t.currency)} — ${t.count} операций`) },
      { kind: "text", lines: ["Реестр сформирован автоматически по данным системы. Принятие авансового отчёта решает бухгалтерия."] },
    ],
  };
}

export async function personalRegister(actor: Actor, range: { from: Date; to: Date }, by: "day" | "month"): Promise<ReportDoc> {
  const rep = await personalReport(actor, range, by);
  const b = await personalBalance(actor);
  const tz = actor.timezone;
  return {
    title: by === "day" ? "Личные расходы — по дням" : "Личные расходы — по месяцам",
    subtitle: `${fmt(range.from, "d MMM yyyy", tz)} – ${fmt(addLocalDays(range.to, -1, tz), "d MMM yyyy", tz)}`,
    sections: [
      { kind: "table", title: "Расходы", columns: ["Период", "Категория", "Сумма", "Операций"], moneyColumns: [2], rows: rep.map((r) => [r.period, PERSONAL_CATEGORIES[r.category as keyof typeof PERSONAL_CATEGORIES] ?? r.category, r.total, r.count]) },
      { kind: "text", heading: "Баланс", lines: [`Получено: ${formatMoney(b.received)}`, `Израсходовано: ${formatMoney(b.spent)}`, `Возвращено: ${formatMoney(b.refunded)}`, `Корректировки: ${formatMoney(b.adjusted)}`, `Остаток: ${formatMoney(b.balance)}`] },
    ],
  };
}

