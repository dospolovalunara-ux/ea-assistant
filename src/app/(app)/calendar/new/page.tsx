import { requireActor } from "@/server/auth/current";
import { requirePermission } from "@/server/auth/rbac";
import { orNotFound } from "@/server/page-guard";
import { createEventAction } from "@/server/actions/calendar";
import { EventForm } from "@/components/calendar/event-form";
import { Card, PageHeader } from "@/components/ui";
import { addLocalDays, localDayStart, parseLocalDate, toLocalInput } from "@/lib/time";

export const metadata = { title: "Новое событие" };

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const actor = await requireActor();
  await orNotFound(requirePermission(actor, "calendar.write", { entityType: "calendar_event" }));
  const { date } = await searchParams;
  const tz = actor.timezone;
  const day = (date && parseLocalDate(date, tz)) || addLocalDays(localDayStart(new Date(), tz), 1, tz);
  const start = new Date(day.getTime() + 10 * 3600_000);
  const end = new Date(start.getTime() + 3600_000);
  return (
    <>
      <PageHeader title="Новое событие" />
      <Card className="max-w-4xl p-6">
        <EventForm
          action={createEventAction}
          defaults={{ start: toLocalInput(start, tz), end: toLocalInput(end, tz), timezone: tz }}
          submitLabel="Создать событие"
          cancelHref="/calendar"
          tz={tz}
        />
      </Card>
    </>
  );
}
