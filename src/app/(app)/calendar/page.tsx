import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/auth/rbac";
import { listEvents, type EventRow } from "@/server/services/calendar";
import { orNotFound } from "@/server/page-guard";
import { ButtonLink, Card, Empty, PageHeader, cx } from "@/components/ui";
import { EventLine, eventTimeLabel } from "@/components/display";
import { NowLine, ScrollToHour } from "@/components/calendar/now-line";
import { layoutDay } from "@/components/calendar/layout";
import { addLocalDays, fmt, localDayStart, localWeekStart, parseLocalDate } from "@/lib/time";
import type { CalendarKindCode } from "@/lib/labels";

export const metadata = { title: "Календарь" };

const HOUR = 48; // высота часа в пикселях

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function CalendarPage({ searchParams }: { searchParams: SP }) {
  const actor = await requireActor();
  const tz = actor.timezone;
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined;

  const view = one("view") === "list" ? "list" : "week";
  const anchor = (one("date") && parseLocalDate(one("date")!, tz)) || localDayStart(new Date(), tz);
  const calParam = one("cal");
  const kinds: CalendarKindCode[] = calParam === "work" ? ["work"] : calParam === "personal" ? ["personal"] : ["work", "personal"];
  const showCancelled = one("cancelled") === "1";

  const from = view === "week" ? localWeekStart(anchor, tz) : anchor;
  const days = view === "week" ? 7 : 14;
  const to = addLocalDays(from, days, tz);
  const events = await orNotFound(listEvents(actor, { from, to, kinds, includeCancelled: showCancelled }));

  const step = view === "week" ? 7 : 14;
  const q = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { view, date: fmt(anchor, "yyyy-MM-dd", tz), cal: calParam, cancelled: showCancelled ? "1" : undefined, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/calendar?${p.toString()}`;
  };
  const shift = (n: number) => q({ date: fmt(addLocalDays(anchor, n, tz), "yyyy-MM-dd", tz) });
  const title =
    view === "week"
      ? `${fmt(from, "d MMM", tz)} – ${fmt(addLocalDays(from, 6, tz), "d MMM yyyy", tz)}`
      : `${fmt(from, "d MMM", tz)} – ${fmt(addLocalDays(from, 13, tz), "d MMM yyyy", tz)}`;

  const seg = "inline-flex h-9 items-center px-3 text-sm transition first:rounded-l-lg last:rounded-r-lg border border-border -ml-px first:ml-0";
  const segOn = "bg-primary text-primary-fg border-primary relative z-10";
  const segOff = "bg-surface hover:bg-surface-2";

  return (
    <>
      <PageHeader
        title="Календарь"
        subtitle="Рабочий и личный календари руководителя"
        actions={can(actor, "calendar.write") && <ButtonLink href="/calendar/new">+ Новое событие</ButtonLink>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex">
          <Link href={shift(-step)} className={cx(seg, segOff)} aria-label="Назад">‹</Link>
          <Link href={q({ date: undefined })} className={cx(seg, segOff)}>Сегодня</Link>
          <Link href={shift(step)} className={cx(seg, segOff)} aria-label="Вперёд">›</Link>
        </div>
        <span className="text-[15px] font-medium">{title}</span>
        <div className="ml-auto flex flex-wrap gap-3">
          <div className="flex" role="group" aria-label="Вид">
            <Link href={q({ view: "week" })} className={cx(seg, view === "week" ? segOn : segOff)}>Неделя</Link>
            <Link href={q({ view: "list" })} className={cx(seg, view === "list" ? segOn : segOff)}>Список</Link>
            <span className={cx(seg, "cursor-not-allowed bg-surface text-muted/50")} title="В разработке">День</span>
            <span className={cx(seg, "cursor-not-allowed bg-surface text-muted/50")} title="В разработке">Месяц</span>
          </div>
          <div className="flex" role="group" aria-label="Календари">
            <Link href={q({ cal: undefined })} className={cx(seg, !calParam ? segOn : segOff)}>Все</Link>
            <Link href={q({ cal: "work" })} className={cx(seg, calParam === "work" ? segOn : segOff)}>
              <span className="mr-1.5 h-2 w-2 rounded-full bg-work" />Рабочий
            </Link>
            <Link href={q({ cal: "personal" })} className={cx(seg, calParam === "personal" ? segOn : segOff)}>
              <span className="mr-1.5 h-2 w-2 rounded-full bg-personal" />Личный
            </Link>
          </div>
          <Link href={q({ cancelled: showCancelled ? undefined : "1" })} className={cx(seg, "rounded-lg", showCancelled ? segOn : segOff)}>
            {showCancelled ? "✓ " : ""}Отменённые
          </Link>
        </div>
      </div>

      {view === "week" ? <WeekView events={events} from={from} tz={tz} /> : <ListView events={events} from={from} tz={tz} />}
    </>
  );
}

function WeekView({ events, from, tz }: { events: EventRow[]; from: Date; tz: string }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const start = addLocalDays(from, i, tz);
    return { start, end: addLocalDays(start, 1, tz) };
  });
  const todayKey = fmt(new Date(), "yyyy-MM-dd", tz);
  const allDay = events.filter((e) => e.allDay);
  const timed = events.filter((e) => !e.allDay);

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[860px]">
          {/* Заголовки дней */}
          <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-border">
            <div />
            {days.map((d) => {
              const isToday = fmt(d.start, "yyyy-MM-dd", tz) === todayKey;
              return (
                <div key={d.start.toISOString()} className="border-l border-border px-2 py-2 text-center">
                  <div className="text-xs uppercase text-muted">{fmt(d.start, "EEEEEE", tz)}</div>
                  <div className={cx("mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold", isToday && "bg-primary text-primary-fg")}>
                    {fmt(d.start, "d", tz)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* События на весь день */}
          {allDay.length > 0 && (
            <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-border">
              <div className="px-1 py-1.5 text-right text-[10px] text-muted">весь день</div>
              {days.map((d) => (
                <div key={d.start.toISOString()} className="space-y-1 border-l border-border p-1">
                  {allDay
                    .filter((e) => e.startsAt < d.end && e.endsAt > d.start)
                    .map((e) => (
                      <Link
                        key={e.id}
                        href={`/calendar/${e.id}`}
                        className={cx(
                          "block truncate rounded px-1.5 py-0.5 text-xs font-medium",
                          e.calendarKind === "work" ? "bg-work-bg text-work" : "bg-personal-bg text-personal",
                          e.status === "cancelled" && "line-through opacity-60",
                        )}
                      >
                        {e.title}
                      </Link>
                    ))}
                </div>
              ))}
            </div>
          )}

          {/* Сетка по часам */}
          <div id="week-grid" className="relative max-h-[640px] overflow-y-auto">
            <ScrollToHour targetId="week-grid" hour={7} hourHeight={HOUR} />
            <div className="grid grid-cols-[56px_repeat(7,1fr)]" style={{ height: HOUR * 24 }}>
              <div className="relative">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-muted" style={{ top: h * HOUR }}>
                    {h > 0 ? `${String(h).padStart(2, "0")}:00` : ""}
                  </div>
                ))}
              </div>
              {days.map((d) => {
                const dayStartMs = d.start.getTime();
                const dayEndMs = d.end.getTime();
                const items = timed
                  .filter((e) => e.startsAt.getTime() < dayEndMs && e.endsAt.getTime() > dayStartMs)
                  .map((e) => ({
                    e,
                    start: (Math.max(e.startsAt.getTime(), dayStartMs) - dayStartMs) / 60000,
                    end: (Math.min(e.endsAt.getTime(), dayEndMs) - dayStartMs) / 60000,
                  }));
                return (
                  <div key={d.start.toISOString()} className="relative border-l border-border">
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={h} className="absolute inset-x-0 border-t border-border/60" style={{ top: h * HOUR }} />
                    ))}
                    {layoutDay(items).map(({ item, col, cols }) => {
                      const top = (item.start / 60) * HOUR;
                      const height = Math.max(((item.end - item.start) / 60) * HOUR, 20);
                      const e = item.e;
                      return (
                        <Link
                          key={e.id}
                          href={`/calendar/${e.id}`}
                          title={`${e.title} · ${eventTimeLabel(e, tz)}`}
                          className={cx(
                            "absolute z-10 overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-xs leading-tight shadow-sm transition hover:z-30 hover:shadow-md",
                            e.calendarKind === "work" ? "border-work bg-work-bg text-text" : "border-personal bg-personal-bg text-text",
                            e.status === "cancelled" && "line-through opacity-60",
                            (e.status === "draft" || e.status === "pending") && "border-dashed opacity-80",
                          )}
                          style={{ top, height, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)` }}
                        >
                          <span className="block truncate font-semibold">{e.title}</span>
                          {height > 32 && <span className="block truncate text-muted">{eventTimeLabel(e, tz)}</span>}
                        </Link>
                      );
                    })}
                    <NowLine dayStart={dayStartMs} dayEnd={dayEndMs} hourHeight={HOUR} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ListView({ events, from, tz }: { events: EventRow[]; from: Date; tz: string }) {
  const days = Array.from({ length: 14 }, (_, i) => addLocalDays(from, i, tz));
  const groups = days
    .map((d) => {
      const end = addLocalDays(d, 1, tz);
      return { day: d, items: events.filter((e) => e.startsAt < end && e.endsAt > d) };
    })
    .filter((g) => g.items.length);
  if (!groups.length) return <Card><Empty>За эти 14 дней событий нет</Empty></Card>;
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <Card key={g.day.toISOString()}>
          <div className="border-b border-border px-5 py-2.5 text-sm font-semibold capitalize">{fmt(g.day, "EEEE, d MMMM", tz)}</div>
          <div className="divide-y divide-border">
            {g.items.map((e) => <EventLine key={e.id} e={e} tz={tz} />)}
          </div>
        </Card>
      ))}
    </div>
  );
}
