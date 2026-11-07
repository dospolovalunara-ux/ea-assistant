import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/auth/rbac";
import { getCorporateExpense, getExpenseHistory } from "@/server/services/corporate-expenses";
import { signedFileUrl } from "@/server/services/files";
import { orNotFound } from "@/server/page-guard";
import { addExpenseDocAction, voidCorporateAction } from "@/server/actions/modules";
import { ActionForm } from "@/components/action-form";
import { Badge, ButtonLink, Card, CardHeader, Field, PageHeader, inputCls } from "@/components/ui";
import { History } from "@/components/common/history";
import { CORPORATE_CATEGORIES, EXPENSE_DOC_TYPES, PAYMENT_METHODS, REQUIRED_DOCS } from "@/lib/expense-labels";
import { formatMoney } from "@/lib/money";
import { fmt } from "@/lib/time";

export default async function CorporateExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const e = await orNotFound(getCorporateExpense(actor, id));
  const history = await getExpenseHistory(actor, id);
  const tz = actor.timezone;
  const canWrite = can(actor, "expenses.corporate.write") && e.status === "active";
  const have = new Set(e.docs.map((d) => d.docType));
  return (
    <>
      <div className="mb-3 text-sm"><Link href="/expenses/corporate" className="text-muted hover:text-text">← Корпоративные расходы</Link></div>
      <PageHeader
        title={`${formatMoney(e.amount, e.currency)} · ${e.organization}`}
        subtitle={<span className="mt-1 flex gap-2">{e.status === "void" ? <Badge tone="danger">Аннулирован</Badge> : e.missingDocs.length ? <Badge tone="warn">Документы не собраны</Badge> : <Badge tone="ok">Документы собраны</Badge>}</span>}
        actions={canWrite && <ButtonLink href={`/expenses/corporate/${e.id}/edit`} variant="secondary">Изменить</ButtonLink>}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <dl className="divide-y divide-border">
              {([
                ["Дата", fmt(e.spentAt, "d MMMM yyyy, HH:mm", tz)],
                ["Категория", CORPORATE_CATEGORIES[e.category as keyof typeof CORPORATE_CATEGORIES] ?? e.category],
                ["Способ оплаты", PAYMENT_METHODS[e.paymentMethod as keyof typeof PAYMENT_METHODS] ?? e.paymentMethod],
                ["Описание", e.description],
                ["Связанное событие", e.relatedEventId ? <Link key="ev" href={`/calendar/${e.relatedEventId}`} className="text-primary hover:underline">{e.eventTitle}</Link> : null],
                ["Комментарий", e.comment],
              ] as [string, React.ReactNode][]).filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="grid gap-1 px-5 py-3 sm:grid-cols-[200px_1fr]"><dt className="text-sm text-muted">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </Card>
          <Card>
            <CardHeader title="Документы" subtitle="Чек-лист для бухгалтерии" />
            <ul className="space-y-1 px-5 py-3 text-sm">
              {REQUIRED_DOCS.map((d) => <li key={d}>{have.has(d) ? "✅" : "⬜"} {EXPENSE_DOC_TYPES[d]} {!have.has(d) && <span className="text-danger">— не хватает</span>}</li>)}
              <li className="text-muted">Товарный чек и QR-подтверждение — при необходимости по правилам бухгалтерии</li>
            </ul>
            {e.docs.length > 0 && (
              <ul className="divide-y divide-border border-t border-border">
                {e.docs.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                    <span><span className="font-medium">{EXPENSE_DOC_TYPES[d.docType as keyof typeof EXPENSE_DOC_TYPES]}</span> · <a href={signedFileUrl(actor, d.fileId)} className="text-primary hover:underline">{d.name}</a></span>
                    <span className="text-xs text-muted">{Math.round(d.size / 1024)} КБ · антивирус не подключён</span>
                  </li>
                ))}
              </ul>
            )}
            {canWrite && (
              <div className="border-t border-border p-5">
                <ActionForm action={addExpenseDocAction.bind(null, e.id)} submitLabel="Прикрепить" resetOnSuccess successText="Документ прикреплён">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Тип"><select name="docType" className={inputCls}>{Object.entries(EXPENSE_DOC_TYPES).map(([k, l]) => <option key={k} value={k} disabled={false}>{l}</option>)}</select></Field>
                    <Field label="Файл (фото или PDF)"><input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" className="block text-sm" /></Field>
                  </div>
                </ActionForm>
              </div>
            )}
          </Card>
          {canWrite && (
            <Card className="p-5">
              <p className="mb-2 text-sm font-medium">Аннулировать расход</p>
              <p className="mb-3 text-sm text-muted">Финансовые записи не удаляются. Аннулированный расход остаётся в реестре и истории.</p>
              <ActionForm action={voidCorporateAction.bind(null, e.id)} submitLabel="Аннулировать" variant="danger" confirmText="Аннулировать этот расход?">
                <input name="reason" placeholder="Причина (обязательно)" className={inputCls} maxLength={500} />
              </ActionForm>
            </Card>
          )}
        </div>
        <Card className="self-start"><CardHeader title="История" /><History rows={history} tz={tz} /></Card>
      </div>
    </>
  );
}
