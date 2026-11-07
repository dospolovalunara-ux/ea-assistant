"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Alert, Button, Field, inputCls } from "@/components/ui";
import { EVENT_STATUSES, EVENT_TYPES, IMPORTANCE } from "@/lib/labels";
import type { ActionState } from "@/lib/action-state";

export interface EventFormDefaults {
  title?: string;
  type?: string;
  calendarKind?: string;
  status?: string;
  allDay?: boolean;
  start?: string; // yyyy-MM-ddTHH:mm
  end?: string;
  timezone?: string;
  location?: string;
  videoUrl?: string;
  organizer?: string;
  agenda?: string;
  importance?: string;
  participants?: string;
}

const fmtOverlap = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso));

export function EventForm({
  action,
  defaults,
  submitLabel,
  cancelHref,
  tz,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  defaults: EventFormDefaults;
  submitLabel: string;
  cancelHref: string;
  tz: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const v = { ...defaults, ...(state.values ?? {}) } as Record<string, string | boolean | undefined>;
  const [allDay, setAllDay] = useState(state.values ? state.values.allDay === "on" : Boolean(defaults.allDay));
  const fe = state.fieldErrors ?? {};
  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : "");
  const dateOnly = (s: string) => s.slice(0, 10);
  // key заставляет форму перерисоваться значениями из ответа сервера
  const formKey = JSON.stringify(state.values ?? {});

  return (
    <form action={formAction} key={formKey} className="space-y-6" noValidate>
      {state.error && !state.overlaps && <Alert>{state.error}</Alert>}
      {state.overlaps && (
        <Alert tone="warn">
          <p className="font-medium">Время пересекается с другими событиями руководителя:</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {state.overlaps.map((o) => (
              <li key={o.id}>
                {o.title} — {fmtOverlap(o.startsAt, tz)} – {fmtOverlap(o.endsAt, tz)} ({o.calendarKind === "work" ? "рабочий" : "личный"})
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button type="submit" name="confirmOverlap" value="1" variant="secondary" disabled={pending}>
              Всё равно сохранить
            </Button>
            <span className="self-center text-xs">или измените время и сохраните снова</span>
          </div>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Название" error={fe.title} className="md:col-span-2">
          <input name="title" defaultValue={str("title")} className={inputCls} aria-invalid={!!fe.title} required maxLength={200} />
        </Field>
        <Field label="Календарь" error={fe.calendarKind}>
          <select name="calendarKind" defaultValue={str("calendarKind") || "work"} className={inputCls}>
            <option value="work">Рабочий</option>
            <option value="personal">Личный</option>
          </select>
        </Field>
        <Field label="Тип" error={fe.type}>
          <select name="type" defaultValue={str("type") || "work_meeting"} className={inputCls}>
            {Object.entries(EVENT_TYPES).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="rounded-xl border border-border p-4">
        <legend className="px-1 text-sm font-medium">Время</legend>
        <label className="mb-4 inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4" />
          Весь день
        </label>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={allDay ? "Первый день" : "Начало"} error={fe.start}>
            <input
              name="start"
              type={allDay ? "date" : "datetime-local"}
              defaultValue={allDay ? dateOnly(str("start")) : str("start")}
              className={inputCls}
              aria-invalid={!!fe.start}
              required
            />
          </Field>
          <Field label={allDay ? "Последний день" : "Окончание"} error={fe.end}>
            <input
              name="end"
              type={allDay ? "date" : "datetime-local"}
              defaultValue={allDay ? dateOnly(str("end")) : str("end")}
              className={inputCls}
              aria-invalid={!!fe.end}
              required
            />
          </Field>
          <Field label="Часовой пояс" error={fe.timezone}>
            <select name="timezone" defaultValue={str("timezone") || "Asia/Almaty"} className={inputCls}>
              {["Asia/Almaty", "Asia/Aqtobe", "Europe/Moscow", "Asia/Dubai", "Europe/Istanbul", "Europe/London", "UTC"].map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </Field>
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Место" error={fe.location}>
          <input name="location" defaultValue={str("location")} className={inputCls} maxLength={300} />
        </Field>
        <Field label="Ссылка на видеоконференцию" error={fe.videoUrl} hint="Только http:// или https://">
          <input name="videoUrl" type="url" defaultValue={str("videoUrl")} className={inputCls} aria-invalid={!!fe.videoUrl} placeholder="https://" />
        </Field>
        <Field label="Организатор" error={fe.organizer}>
          <input name="organizer" defaultValue={str("organizer")} className={inputCls} maxLength={200} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Статус" error={fe.status}>
            <select name="status" defaultValue={str("status") || "confirmed"} className={inputCls}>
              {Object.entries(EVENT_STATUSES)
                .filter(([k]) => k !== "cancelled")
                .map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
            </select>
          </Field>
          <Field label="Важность" error={fe.importance}>
            <select name="importance" defaultValue={str("importance") || "normal"} className={inputCls}>
              {Object.entries(IMPORTANCE).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Участники" error={fe.participants} hint="По одному в строке: «Имя <email>» или просто имя">
          <textarea name="participants" defaultValue={str("participants")} rows={4} className={`${inputCls} h-auto py-2`} />
        </Field>
        <Field label="Повестка" error={fe.agenda}>
          <textarea name="agenda" defaultValue={str("agenda")} rows={4} className={`${inputCls} h-auto py-2`} maxLength={5000} />
        </Field>
      </div>

      <div className="flex gap-3 border-t border-border pt-5">
        <Button type="submit" disabled={pending}>{pending ? "Сохранение…" : submitLabel}</Button>
        <Link href={cancelHref} className="inline-flex h-9 items-center px-3 text-sm text-muted hover:text-text">
          Отмена
        </Link>
      </div>
    </form>
  );
}
