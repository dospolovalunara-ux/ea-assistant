import Link from "next/link";
import { Badge } from "./ui";
import { fmt } from "@/lib/time";
import {
  CALENDAR_KINDS,
  EVENT_STATUSES,
  EVENT_TYPES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type CalendarKindCode,
  type EventStatusCode,
  type TaskPriorityCode,
  type TaskStatusCode,
} from "@/lib/labels";

export function CalendarBadge({ kind }: { kind: CalendarKindCode }) {
  return <Badge tone={kind === "work" ? "work" : "personal"}>{CALENDAR_KINDS[kind]}</Badge>;
}

export function EventStatusBadge({ status }: { status: EventStatusCode }) {
  const tone = ({ draft: "neutral", pending: "warn", confirmed: "ok", rescheduled: "warn", cancelled: "danger", completed: "neutral" } as const)[status];
  return <Badge tone={tone}>{EVENT_STATUSES[status]}</Badge>;
}

export function TaskStatusBadge({ status, overdue }: { status: TaskStatusCode; overdue?: boolean }) {
  const tone = ({ new: "primary", in_progress: "work", waiting: "warn", review: "warn", done: "ok", cancelled: "neutral" } as const)[status];
  return (
    <span className="inline-flex gap-1">
      <Badge tone={tone}>{TASK_STATUSES[status]}</Badge>
      {overdue && <Badge tone="danger">Просрочена</Badge>}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TaskPriorityCode }) {
  if (priority === "normal") return null;
  const tone = ({ low: "neutral", normal: "neutral", high: "warn", urgent: "danger" } as const)[priority];
  return <Badge tone={tone}>{TASK_PRIORITIES[priority]}</Badge>;
}

export function eventTimeLabel(e: { startsAt: Date; endsAt: Date; allDay: boolean }, tz: string, withDate = false) {
  if (e.allDay) {
    const lastDay = new Date(e.endsAt.getTime() - 1);
    const same = fmt(e.startsAt, "yyyy-MM-dd", tz) === fmt(lastDay, "yyyy-MM-dd", tz);
    return same ? `${withDate ? fmt(e.startsAt, "d MMM, ", tz) : ""}весь день` : `${fmt(e.startsAt, "d MMM", tz)} – ${fmt(lastDay, "d MMM", tz)}, весь день`;
  }
  const sameDay = fmt(e.startsAt, "yyyy-MM-dd", tz) === fmt(e.endsAt, "yyyy-MM-dd", tz);
  if (sameDay) return `${withDate ? fmt(e.startsAt, "d MMM, ", tz) : ""}${fmt(e.startsAt, "HH:mm", tz)} – ${fmt(e.endsAt, "HH:mm", tz)}`;
  return `${fmt(e.startsAt, "d MMM HH:mm", tz)} – ${fmt(e.endsAt, "d MMM HH:mm", tz)}`;
}

export function EventLine({
  e,
  tz,
  withDate,
}: {
  e: { id: string; title: string; startsAt: Date; endsAt: Date; allDay: boolean; calendarKind: CalendarKindCode; status: EventStatusCode; type: keyof typeof EVENT_TYPES; location: string | null };
  tz: string;
  withDate?: boolean;
}) {
  return (
    <Link href={`/calendar/${e.id}`} className="flex items-start gap-3 px-5 py-3 transition hover:bg-surface-2">
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${e.calendarKind === "work" ? "bg-work" : "bg-personal"}`} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-medium ${e.status === "cancelled" ? "line-through text-muted" : ""}`}>{e.title}</span>
        <span className="block text-sm text-muted">
          {eventTimeLabel(e, tz, withDate)} · {EVENT_TYPES[e.type]}
          {e.location ? ` · ${e.location}` : ""}
        </span>
      </span>
      {e.status !== "confirmed" && <EventStatusBadge status={e.status} />}
    </Link>
  );
}

export function TaskLine({
  t,
  tz,
  now,
}: {
  t: { id: string; title: string; dueAt: Date | null; status: TaskStatusCode; priority: TaskPriorityCode; assigneeName: string | null; assigneeUserName: string | null };
  tz: string;
  now: Date;
}) {
  const overdue = Boolean(t.dueAt && t.dueAt < now && t.status !== "done" && t.status !== "cancelled");
  return (
    <Link href={`/tasks/${t.id}`} className="flex items-start gap-3 px-5 py-3 transition hover:bg-surface-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{t.title}</span>
        <span className="block text-sm text-muted">
          {t.dueAt ? (
            <span className={overdue ? "text-danger" : ""}>Срок: {fmt(t.dueAt, "d MMM, HH:mm", tz)}</span>
          ) : (
            "Без срока"
          )}
          {(t.assigneeUserName || t.assigneeName) && ` · ${t.assigneeUserName ?? t.assigneeName}`}
        </span>
      </span>
      <span className="flex shrink-0 flex-wrap justify-end gap-1">
        <PriorityBadge priority={t.priority} />
        <TaskStatusBadge status={t.status} overdue={overdue} />
      </span>
    </Link>
  );
}
