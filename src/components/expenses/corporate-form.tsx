"use client";

import { useActionState, useTransition } from "react";
import Link from "next/link";
import { Alert, Button, Field, inputCls } from "@/components/ui";
import { CORPORATE_CATEGORIES, EXPENSE_DOC_TYPES, PAYMENT_METHODS } from "@/lib/expense-labels";
import type { ActionState } from "@/lib/action-state";

export function CorporateForm({
  action,
  defaults,
  events,
  withFile,
  hidden,
  submitLabel,
  cancelHref,
}: {
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
  defaults: Record<string, string>;
  events: { id: string; label: string }[];
  withFile?: boolean;
  hidden?: Record<string, string>;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, run] = useActionState<ActionState, FormData>(action, {});
  const [pending, start] = useTransition();
  const fe = state.fieldErrors ?? {};
  const v = { ...defaults, ...(state.values ?? {}) };
  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const s = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (s?.name) fd.set(s.name, s.value);
        start(() => run(fd));
      }}
    >
      {state.error && !state.duplicates && <Alert>{state.fieldErrors?._form ?? state.error}</Alert>}
      {state.duplicates && (
        <Alert tone="warn">
          <p className="font-medium">Возможный дубликат — такая же сумма в пределах суток:</p>
          <ul className="mt-1 list-disc pl-5">
            {state.duplicates.map((d) => (
              <li key={d.id}>
                <Link href={`/expenses/corporate/${d.id}`} className="underline" target="_blank">{d.organization}</Link> — {new Date(d.spentAt).toLocaleString("ru-RU")}
              </li>
            ))}
          </ul>
          <Button type="submit" name="confirmDuplicate" value="1" variant="secondary" className="mt-2" disabled={pending}>Это другой расход — сохранить</Button>
        </Alert>
      )}
      {Object.entries(hidden ?? {}).map(([k, val]) => <input key={k} type="hidden" name={k} value={val} />)}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Дата и время" error={fe.spentAt}><input name="spentAt" type="datetime-local" defaultValue={v.spentAt} className={inputCls} /></Field>
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Field label="Сумма" error={fe.amount} hint="Например 4500 или 4500,50"><input name="amount" inputMode="decimal" defaultValue={v.amount} className={inputCls} /></Field>
          <Field label="Валюта"><select name="currency" defaultValue={v.currency || "KZT"} className={inputCls}>{["KZT", "USD", "EUR", "RUB"].map((c) => <option key={c}>{c}</option>)}</select></Field>
        </div>
        <Field label="Организация" error={fe.organization}><input name="organization" defaultValue={v.organization} maxLength={200} className={inputCls} /></Field>
        <Field label="Категория" error={fe.category}>
          <select name="category" defaultValue={v.category || "business_lunch"} className={inputCls}>{Object.entries(CORPORATE_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </Field>
        <Field label="Способ оплаты"><select name="paymentMethod" defaultValue={v.paymentMethod || "corporate_card"} className={inputCls}>{Object.entries(PAYMENT_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Связанное событие" error={fe.relatedEventId}>
          <select name="relatedEventId" defaultValue={v.relatedEventId || ""} className={inputCls}><option value="">Нет</option>{events.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select>
        </Field>
        <Field label="Описание" className="md:col-span-2"><input name="description" defaultValue={v.description} maxLength={1000} className={inputCls} /></Field>
        <Field label="Комментарий" className="md:col-span-2"><input name="comment" defaultValue={v.comment} maxLength={1000} className={inputCls} /></Field>
        {withFile && (
          <>
            <Field label="Чек или документ (необязательно)" hint="Фото или PDF до 10 МБ. Поля заполняются вручную — OCR не подключён."><input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png" className="block text-sm" /></Field>
            <Field label="Тип документа"><select name="docType" className={inputCls}>{Object.entries(EXPENSE_DOC_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          </>
        )}
      </div>
      <div className="flex gap-3 border-t border-border pt-5">
        <Button type="submit" disabled={pending}>{pending ? "Сохранение…" : submitLabel}</Button>
        <Link href={cancelHref} className="inline-flex h-9 items-center px-3 text-sm text-muted hover:text-text">Отмена</Link>
      </div>
    </form>
  );
}
