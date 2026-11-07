"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Alert, Button, Field, inputCls } from "@/components/ui";
import { TASK_PRIORITIES, TASK_STATUSES, TASK_VISIBILITY } from "@/lib/labels";
import type { ActionState } from "@/lib/action-state";

export interface TaskFormDefaults {
  title?: string;
  description?: string;
  source?: string;
  assignee?: string; // "user:<id>" | "name" | ""
  assigneeName?: string;
  dueAt?: string;
  priority?: string;
  status?: string;
  visibility?: string;
  relatedEventId?: string;
}

export function TaskForm({
  action,
  defaults,
  users,
  events,
  submitLabel,
  cancelHref,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  defaults: TaskFormDefaults;
  users: { id: string; fullName: string; roleName: string }[];
  events: { id: string; label: string }[];
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const v: Record<string, string | undefined> = { ...defaults, ...(state.values ?? {}) };
  const [assignee, setAssignee] = useState(v.assignee ?? "");
  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} key={JSON.stringify(state.values ?? {})} className="space-y-6" noValidate>
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="Название" error={fe.title}>
        <input name="title" defaultValue={v.title} className={inputCls} aria-invalid={!!fe.title} required maxLength={300} />
      </Field>
      <Field label="Описание" error={fe.description}>
        <textarea name="description" defaultValue={v.description} rows={4} className={`${inputCls} h-auto py-2`} />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Ответственный" error={fe.assignee}>
          <select name="assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} className={inputCls}>
            <option value="">Не назначен</option>
            {users.map((u) => (
              <option key={u.id} value={`user:${u.id}`}>
                {u.fullName} ({u.roleName.toLowerCase()})
              </option>
            ))}
            <option value="name">Вписать вручную…</option>
          </select>
        </Field>
        {assignee === "name" ? (
          <Field label="Кто ответственный" error={fe.assigneeName} hint="Например: «Юридический отдел»">
            <input name="assigneeName" defaultValue={v.assigneeName} className={inputCls} aria-invalid={!!fe.assigneeName} maxLength={200} />
          </Field>
        ) : (
          <div className="hidden md:block" />
        )}
        <Field label="Срок" error={fe.dueAt}>
          <input name="dueAt" type="datetime-local" defaultValue={v.dueAt} className={inputCls} aria-invalid={!!fe.dueAt} />
        </Field>
        <Field label="Приоритет" error={fe.priority}>
          <select name="priority" defaultValue={v.priority || "normal"} className={inputCls}>
            {Object.entries(TASK_PRIORITIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Статус" error={fe.status}>
          <select name="status" defaultValue={v.status || "new"} className={inputCls}>
            {Object.entries(TASK_STATUSES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Видимость" error={fe.visibility} hint="Задачи, назначенные на руководителя, видны ему всегда">
          <select name="visibility" defaultValue={v.visibility || "private"} className={inputCls}>
            {Object.entries(TASK_VISIBILITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Источник" error={fe.source} hint="Откуда поручение: совещание, письмо, звонок…">
          <input name="source" defaultValue={v.source} className={inputCls} maxLength={300} />
        </Field>
        <Field label="Связанное событие" error={fe.relatedEventId}>
          <select name="relatedEventId" defaultValue={v.relatedEventId || ""} className={inputCls}>
            <option value="">Нет</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="flex gap-3 border-t border-border pt-5">
        <Button type="submit" disabled={pending}>{pending ? "Сохранение…" : submitLabel}</Button>
        <Link href={cancelHref} className="inline-flex h-9 items-center px-3 text-sm text-muted hover:text-text">Отмена</Link>
      </div>
    </form>
  );
}
