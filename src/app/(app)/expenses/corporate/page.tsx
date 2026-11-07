import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/auth/rbac";
import { corporateTotals, listCorporateExpenses } from "@/server/services/corporate-expenses";
import { orNotFound } from "@/server/page-guard";
import { Badge, ButtonLink, Card, Empty, PageHeader, cx } from "@/components/ui";
import { PeriodFilter } from "@/components/period-filter";
import { CORPORATE_CATEGORIES, EXPENSE_DOC_TYPES } from "@/lib/expense-labels";
import { formatMoney } from "@/lib/money";
import { addLocalDays, fmt, localDayStart, parseLocalDate } from "@/lib/time";

export const metadata = { title: "Корпоративные расходы" };

export default async function CorporatePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; missing?: string }> }) {
  const actor = await requireActor();
  const tz = actor.timezone;
  const sp = await searchParams;
  const today = localDayStart(new Date(), tz);
  const from = (sp.from && parseLocalDate(sp.from, tz)) || parseLocalDate(fmt(today, "yyyy-MM-01", tz), tz)!;
  const toDay = (sp.to && parseLocalDate(sp.to, tz)) || today;
  const range = { from, to: addLocalDays(toDay, 1, tz) };
  const onlyMissing = sp.missing === "1";
  const [rows, totals] = await orNotFound(Promise.all([listCorporateExpenses(actor, onlyMissing ? { from: addLocalDays(today, -365, tz), to: addLocalDays(today, 1, tz) } : range, { onlyMissing }), corporateTotals(actor, range)]));
  const qs = `from=${fmt(from, "yyyy-MM-dd", tz)}&to=${fmt(toDay, "yyyy-MM-dd", tz)}`;
  return (
    <>
      <PageHeader
        title="Корпоративные расходы"
        subtitle="Реестр по корпоративной карте. Не смешивается с личными расходами."
        actions={can(actor, "expenses.corporate.write") && <ButtonLink href="/expenses/corporate/new">+ Расход</ButtonLink>}
      />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <PeriodFilter from={fmt(from, "yyyy-MM-dd", tz)} to={fmt(toDay, "yyyy-MM-dd", tz)} />
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href={onlyMissing ? "/expenses/corporate" : "/expenses/corporate?missing=1"} className={cx("inline-flex h-9 items-center rounded-lg border px-3", onlyMissing ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface")}>Только без документов</Link>
          <a className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3 hover:bg-surface-2" href={`/api/export/corporate?format=xlsx&${qs}`}>XLSX</a>
          <a className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3 hover:bg-surface-2" href={`/api/export/corporate?format=pdf&${qs}`}>PDF</a>
          <a className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3 hover:bg-surface-2" href={`/api/export/corporate?format=zip&${qs}`}>Комплект для бухгалтерии (ZIP)</a>
        </div>
      </div>
      {!onlyMissing && (
        <div className="mb-4 flex flex-wrap gap-3">
          {totals.length ? totals.map((t) => (
            <Card key={t.currency} className="px-4 py-3"><p className="text-sm text-muted">Итого, {t.currency} · {t.count} опер.</p><p className="text-2xl font-semibold tabular-nums">{formatMoney(t.total, t.currency)}</p></Card>
          )) : <p className="text-sm text-muted">За период расходов нет.</p>}
        </div>
      )}
      <Card className="overflow-x-auto">
        {rows.length ? (
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-border text-left text-muted"><th className="px-5 py-2.5 font-medium">Дата</th><th className="px-3 font-medium">Организация</th><th className="px-3 font-medium">Категория</th><th className="px-3 text-right font-medium">Сумма</th><th className="px-5 font-medium">Документы</th></tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className={r.status === "void" ? "opacity-50" : ""}>
                  <td className="whitespace-nowrap px-5 py-2.5 tabular-nums">{fmt(r.spentAt, "dd.MM.yyyy", tz)}</td>
                  <td className="px-3"><Link href={`/expenses/corporate/${r.id}`} className="font-medium text-primary hover:underline">{r.organization}</Link>{r.relatedEventTitle && <span className="block text-xs text-muted">{r.relatedEventTitle}</span>}</td>
                  <td className="px-3">{CORPORATE_CATEGORIES[r.category as keyof typeof CORPORATE_CATEGORIES] ?? r.category}</td>
                  <td className={cx("whitespace-nowrap px-3 text-right tabular-nums", r.status === "void" && "line-through")}>{formatMoney(r.amount, r.currency)}</td>
                  <td className="px-5">{r.status === "void" ? <Badge>Аннулирован</Badge> : r.missingDocs.length ? <Badge tone="danger">Нет: {r.missingDocs.map((d) => EXPENSE_DOC_TYPES[d].toLowerCase()).join(", ")}</Badge> : <Badge tone="ok">Комплект</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>Расходов нет</Empty>}
      </Card>
      <p className="mt-3 text-xs text-muted">Система не гарантирует принятие авансового отчёта и не утверждает расходы.</p>
    </>
  );
}
