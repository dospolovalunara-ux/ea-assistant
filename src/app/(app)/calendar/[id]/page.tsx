import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/auth/rbac";
import { getEvent, getEventHistory } from "@/server/services/calendar";
import { orNotFound } from "@/server/page-guard";
import { cancelEventAction } from "@/server/actions/calendar";
import { ButtonLink, Card, CardHeader, PageHeader } from "@/components/ui";
import { CalendarBadge, EventStatusBadge, eventTimeLabel } from "@/components/display";
import { History } from "@/components/common/history";
import { CancelEvent } from "@/components/calendar/cancel-event";
import { EVENT_TYPES, IMPORTANCE } from "@/lib/labels";
import { fmt } from "@/lib/time";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const e = await orNotFound(getEvent(actor, id));
  const history = await getEventHistory(actor, id);
  const tz = actor.timezone;
  const canWrite = can(actor, "calendar.write") && e.status !== "cancelled";

  const rows: [string, React.ReactNode][] = [
    ["Когда", <>{fmt(e.startsAt, "EEEE, d MMMM yyyy", tz)}, {eventTimeLabel(e, tz)}</>],
    ["Часовой пояс события", e.timezone],
    ["Тип", EVENT_TYPES[e.type]],
    ["Важность", IMPORTANCE[e.importance]],
    ["Место", e.location],
    [
      "Видеоконференция",
      e.videoUrl && (
        <a href={e.videoUrl} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-primary hover:underline">
          {e.videoUrl}
        </a>
      ),
    ],
    ["Организатор", e.organizer],
    ["Участники", e.participants.length ? e.participants.map((p) => (p.email ? `${p.name} <${p.email}>` : p.name)).join(", ") : null],
    ["Источник", e.source === "manual" ? "Вручную" : e.source === "demo" ? "Демо-данные" : e.source],
  ];

  return (
    <>
      <div className="mb-3 text-sm">
        <Link href="/calendar" className="text-muted hover:text-text">← Календарь</Link>
      </div>
      <PageHeader
        title={e.title}
        subtitle={
          <span className="mt-1 flex flex-wrap gap-2">
            <CalendarBadge kind={e.calendarKind} />
            <EventStatusBadge status={e.status} />
          </span>
        }
        actions={
          <>
            {can(actor, "tasks.write") && (
              <ButtonLink href={`/tasks/new?event=${e.id}`} variant="secondary">+ Задача по событию</ButtonLink>
            )}
            {canWrite && <ButtonLink href={`/calendar/${e.id}/edit`} variant="secondary">Изменить</ButtonLink>}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <dl className="divide-y divide-border">
              {rows
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="grid gap-1 px-5 py-3 sm:grid-cols-[200px_1fr]">
                    <dt className="text-sm text-muted">{k}</dt>
                    <dd className="text-[15px]">{v}</dd>
                  </div>
                ))}
            </dl>
          </Card>
          {e.agenda && (
            <Card>
              <CardHeader title="Повестка" />
              <p className="whitespace-pre-wrap px-5 py-4">{e.agenda}</p>
            </Card>
          )}
          {canWrite && <CancelEvent action={cancelEventAction.bind(null, e.id)} />}
        </div>
        <Card className="self-start">
          <CardHeader title="История изменений" />
          <History rows={history} tz={tz} />
        </Card>
      </div>
    </>
  );
}
