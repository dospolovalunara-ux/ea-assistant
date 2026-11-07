import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/current";
import { requirePermission } from "@/server/auth/rbac";
import { getEvent, getEventReminders } from "@/server/services/calendar";
import { orNotFound } from "@/server/page-guard";
import { updateEventAction } from "@/server/actions/calendar";
import { EventForm } from "@/components/calendar/event-form";
import { Card, PageHeader } from "@/components/ui";
import { addLocalDays, toLocalDateInput, toLocalInput } from "@/lib/time";

export const metadata = { title: "Изменить событие" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  await orNotFound(requirePermission(actor, "calendar.write", { entityType: "calendar_event", entityId: id }));
  const e = await orNotFound(getEvent(actor, id));
  if (e.status === "cancelled") notFound();
  const reminders = await getEventReminders(actor, id);
  const tz = e.timezone;
  return (
    <>
      <PageHeader title="Изменить событие" subtitle={e.title} />
      <Card className="max-w-4xl p-6">
        <EventForm
          action={updateEventAction.bind(null, e.id)}
          defaults={{
            title: e.title,
            type: e.type,
            calendarKind: e.calendarKind,
            status: e.status,
            allDay: e.allDay,
            start: e.allDay ? toLocalDateInput(e.startsAt, tz) : toLocalInput(e.startsAt, tz),
            end: e.allDay ? toLocalDateInput(addLocalDays(e.endsAt, -1, tz), tz) : toLocalInput(e.endsAt, tz),
            timezone: e.timezone,
            location: e.location ?? "",
            videoUrl: e.videoUrl ?? "",
            organizer: e.organizer ?? "",
            agenda: e.agenda ?? "",
            importance: e.importance,
            participants: e.participants.map((p) => (p.email ? `${p.name} <${p.email}>` : p.name)).join("\n"),
            reminders,
          }}
          submitLabel="Сохранить"
          cancelHref={`/calendar/${e.id}`}
          tz={actor.timezone}
        />
      </Card>
    </>
  );
}
