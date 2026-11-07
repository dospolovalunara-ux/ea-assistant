import { requireActor } from "@/server/auth/current";
import { can } from "@/server/auth/rbac";
import { listPersonalExpenses, listTransfers, personalBalance, personalReport } from "@/server/services/personal-expenses";
import { orNotFound } from "@/server/page-guard";
import { createTransferAction } from "@/server/actions/modules";
import { ActionForm } from "@/components/action-form";
import { QuickPersonal } from "@/components/expenses/quick-personal";
import { PeriodFilter } from "@/components/period-filter";
import { Alert, Badge, Card, CardHeader, Empty, Field, PageHeader, inputCls, cx } from "@/components/ui";
import { PERSONAL_CATEGORIES, TRANSFER_KINDS } from "@/lib/expense-labels";
import { formatMoney } from "@/lib/money";
import { addLocalDays, fmt, localDayStart, parseLocalDate, toLocalInput } from "@/lib/time";

export const metadata = { title: "Личные расходы" };

export default async function PersonalPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; by?: string; saved?: string; text?: string }> }) {
  const actor = await requireActor();
  const tz = actor.timezone;
  const sp = await searchParams;
  const today = localDayStart(new Date(), tz);
  const from = (sp.from && parseLocalDate(sp.from, tz)) || parseLocalDate(fmt(today, "yyyy-MM-01", tz), tz)!;
  const toDay = (sp.to && parseLocalDate(sp.to, tz)) || today;
  const range = { from, to: addLocalDays(toDay, 1, tz) };
  const by = sp.by === "month" ? "month" : "day";
  const [balance, transfers, expenses, report] = await orNotFound(
    Promise.all([personalBalance(actor), listTransfers(actor), listPersonalExpenses(actor, range), personalReport(actor, range, by)]),
  );
  const canWrite = can(actor, "expenses.personal.write");
  const incomes = transfers.filter((t) => t.kind === "income");
  const base = `from=${fmt(from, "yyyy-MM-dd", tz)}&to=${fmt(toDay, "yyyy-MM-dd", tz)}`;
  const qs = `${base}&by=${by}`;
  const stat = (label: string, v: string, strong = false) => (
    <Card className="px-4 py-3">
      <p className="text-sm text-muted">{label}</p>
      <p className={cx("tabular-nums", strong ? "text-3xl font-semibold" : "text-xl font-medium")}>{formatMoney(v)}</p>
    </Card>
  );
  const pill = (on: boolean) => cx("rounded-lg border px-3 py-1.5", on ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface");
  return (
    <>
      <PageHeader title="Личные расходы" subtitle="Отдельный контур: свои таблицы и права, не смешивается с корпоративной картой. Баланс считает база данных." />
      {sp.saved && (
        <div className="mb-4">
          <Alert tone="ok">Операции сохранены</Alert>
        </div>
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {stat("Остаток", balance.balance, true)}
        {stat("Получено", balance.received)}
        {stat("Израсходовано", balance.spent)}
        {stat("Возвращено", balance.refunded)}
        {stat("Корректировки", balance.adjusted)}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-6">
          {canWrite && (
            <Card>
              <CardHeader title="Добавить расходы" />
              <div className="p-5">
                <QuickPersonal
                  transfers={incomes.map((t) => ({ id: t.id, label: `${fmt(t.occurredAt, "d MMM", tz)} — ${formatMoney(t.amount)} (остаток ${formatMoney(t.remaining)})` }))}
                  defaultDate={toLocalInput(new Date(), tz)}
                  initialText={sp.text}
                />
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title="Передачи и остатки" />
            {transfers.length ? (
              <ul className="divide-y divide-border">
                {transfers.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                    <span>
                      <Badge tone={t.kind === "income" ? "ok" : t.kind === "refund" ? "warn" : "neutral"}>{TRANSFER_KINDS[t.kind as keyof typeof TRANSFER_KINDS]}</Badge>{" "}
                      {fmt(t.occurredAt, "d MMM yyyy", tz)} {t.description && `· ${t.description}`}{" "}
                      {t.reason && <span className="text-muted">· причина: {t.reason}</span>}
                    </span>
                    <span className="tabular-nums">
                      {t.kind === "refund" ? "−" : ""}
                      {formatMoney(t.amount)}
                      {t.remaining !== null && <span className="ml-2 text-muted">остаток {formatMoney(t.remaining)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Передач пока нет</Empty>
            )}
            {canWrite && (
              <div className="border-t border-border p-5">
                <ActionForm action={createTransferAction} submitLabel="Добавить операцию" resetOnSuccess successText="Операция сохранена">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Тип">
                      <select name="kind" className={inputCls}>
                        {Object.entries(TRANSFER_KINDS).map(([k, l]) => (
                          <option key={k} value={k}>{l}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Сумма" hint="Корректировка может быть отрицательной">
                      <input name="amount" inputMode="decimal" className={inputCls} />
                    </Field>
                    <Field label="Дата">
                      <input type="datetime-local" name="occurredAt" defaultValue={toLocalInput(new Date(), tz)} className={inputCls} />
                    </Field>
                    <Field label="К передаче" hint="Для возврата остатка — обязательно">
                      <select name="parentId" className={inputCls}>
                        <option value="">—</option>
                        {incomes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {fmt(t.occurredAt, "d MMM", tz)} — {formatMoney(t.amount)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Описание">
                      <input name="description" maxLength={500} className={inputCls} />
                    </Field>
                    <Field label="Причина" hint="Обязательна для корректировки">
                      <input name="reason" maxLength={500} className={inputCls} />
                    </Field>
                  </div>
                </ActionForm>
              </div>
            )}
          </Card>
        </div>
        <div className="min-w-0 space-y-6">
          <Card className="space-y-3 p-5">
            <PeriodFilter from={fmt(from, "yyyy-MM-dd", tz)} to={fmt(toDay, "yyyy-MM-dd", tz)} extra={{ by }} />
            <div className="flex flex-wrap gap-2 text-sm">
              <a href={`?${base}&by=day`} className={pill(by === "day")}>По дням</a>
              <a href={`?${base}&by=month`} className={pill(by === "month")}>По месяцам</a>
              <a href={`/api/export/personal?format=xlsx&${qs}`} className={pill(false)}>XLSX</a>
              <a href={`/api/export/personal?format=pdf&${qs}`} className={pill(false)}>PDF</a>
            </div>
          </Card>
          <Card>
            <CardHeader title={by === "day" ? "Отчёт по дням" : "Отчёт по месяцам"} />
            {report.length ? (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {report.map((r) => (
                    <tr key={r.period + r.category}>
                      <td className="px-5 py-2 tabular-nums">{r.period}</td>
                      <td className="px-3">{PERSONAL_CATEGORIES[r.category as keyof typeof PERSONAL_CATEGORIES] ?? r.category}</td>
                      <td className="px-5 text-right tabular-nums">{formatMoney(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>Нет расходов за период</Empty>
            )}
          </Card>
          <Card>
            <CardHeader title="История операций" />
            {expenses.length ? (
              <ul className="divide-y divide-border">
                {expenses.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3 px-5 py-2 text-sm">
                    <span>
                      {fmt(e.spentAt, "d MMM, HH:mm", tz)} · {e.description}{" "}
                      <span className="text-muted">· {PERSONAL_CATEGORIES[e.category as keyof typeof PERSONAL_CATEGORIES] ?? e.category}</span>
                    </span>
                    <span className="tabular-nums">{formatMoney(e.amount, e.currency)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Нет операций</Empty>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
