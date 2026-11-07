"use client";

import { useActionState, useState, useTransition } from "react";
import { Alert, Button, Field, inputCls } from "@/components/ui";
import { previewPersonalAction, savePersonalAction } from "@/server/actions/modules";
import { PERSONAL_CATEGORIES } from "@/lib/expense-labels";
import type { ActionState } from "@/lib/action-state";

const GUESS: [RegExp, keyof typeof PERSONAL_CATEGORIES][] = [
  [/обед|ужин|завтрак|кофе|еда|продукт|ресторан|кафе/i, "food"],
  [/такси|бензин|парков|транспорт/i, "transport"],
  [/аптек|врач|клиник/i, "health"],
  [/школ|сад|кружок|дет/i, "children"],
  [/подар|цвет/i, "gifts"],
];

/** Два шага: разбор текста → проверка и подтверждение каждой операции. */
export function QuickPersonal({ transfers, defaultDate, initialText }: { transfers: { id: string; label: string }[]; defaultDate: string; initialText?: string }) {
  const [preview, runPreview] = useActionState<ActionState, FormData>(previewPersonalAction, {});
  const [save, runSave] = useActionState<ActionState, FormData>(savePersonalAction, {});
  const [pending, start] = useTransition();
  const [text, setText] = useState(initialText ?? "");
  const items = (preview.data?.items as { description: string; amount: string }[] | undefined) ?? [];
  const errors = (preview.data?.errors as string[] | undefined) ?? [];
  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(() => runPreview(fd)); }} className="space-y-3">
        <Field label="Быстрый ввод" hint="Например: обед 4500, кофе 1200, такси 2300">
          <textarea name="text" rows={2} value={text} onChange={(e) => setText(e.target.value)} className={`${inputCls} h-auto py-2`} />
        </Field>
        {preview.error && <Alert>{preview.error}</Alert>}
        <Button type="submit" variant="secondary" disabled={pending}>Разобрать</Button>
      </form>
      {items.length > 0 && (
        <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(() => runSave(fd)); }} className="space-y-3 rounded-xl border border-border p-4">
          <p className="text-sm font-medium">Проверьте операции перед сохранением</p>
          {errors.length > 0 && <Alert tone="warn">{errors.join("; ")}</Alert>}
          {save.error && <Alert>{save.error}</Alert>}
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-[24px_1fr_120px_150px] items-center gap-2">
              <input type="checkbox" name={`items.${i}.include`} defaultChecked className="h-4 w-4" aria-label="Сохранить" />
              <input name={`items.${i}.description`} defaultValue={it.description} className={`${inputCls} h-9`} />
              <input name={`items.${i}.amount`} defaultValue={it.amount} className={`${inputCls} h-9 text-right tabular-nums`} />
              <select name={`items.${i}.category`} defaultValue={GUESS.find(([r]) => r.test(it.description))?.[1] ?? "other"} className={`${inputCls} h-9`}>
                {Object.entries(PERSONAL_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Дата"><input type="datetime-local" name="spentAt" defaultValue={defaultDate} className={inputCls} /></Field>
            <Field label="Из какой передачи"><select name="transferId" className={inputCls}><option value="">Не указывать</option>{transfers.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></Field>
          </div>
          <Button type="submit" disabled={pending}>Подтвердить и сохранить ({items.length})</Button>
        </form>
      )}
    </div>
  );
}
