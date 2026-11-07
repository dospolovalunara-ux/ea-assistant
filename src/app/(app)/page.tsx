import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/auth/rbac";
import { getDashboard } from "@/server/services/dashboard";
import { Card, CardHeader, Empty, PageHeader, ButtonLink } from "@/components/ui";
import { EventLine, TaskLine } from "@/components/display";
import { fmt } from "@/lib/time";

export const metadata = { title: "Главная" };

export default async function DashboardPage() {
  const actor = await requireActor();
  if (!can(actor, "dashboard.view")) redirect(can(actor, "audit.read") ? "/audit" : "/login");
  const now = new Date();
  const tz = actor.timezone;
  const d = await getDashboard(actor, now);

  const stats = [
    d.canCalendar && { label: "Встреч сегодня", value: d.eventsToday.length, href: "/calendar?view=list" },
    d.canCalendar && { label: "Событий на неделе", value: d.eventsThisWeek ?? 0, href: "/calendar" },
    d.taskCounts && { label: "Открытых задач", value: d.taskCounts.open, href: "/tasks?section=open" },
    d.taskCounts && { label: "Просрочено", value: d.taskCounts.overdue, href: "/tasks?section=overdue", danger: d.taskCounts.overdue > 0 },
    d.taskCounts && { label: "Ожидает ответа", value: d.taskCounts.waiting, href: "/tasks?section=waiting" },
    ...d.extra.map((x) => ({ label: x.label, value: x.value, href: x.href, danger: x.warn })),
  ].filter(Boolean) as { label: string; value: number; href: string; danger?: boolean }[];

  return (
    <>
      <PageHeader
        title={`Добрый день, ${actor.fullName.split(" ")[0]}`}
        subtitle={fmt(now, "EEEE, d MMMM yyyy", tz)}
        actions={
          can(actor, "calendar.write") || can(actor, "tasks.write") ? (
            <>
              {can(actor, "calendar.write") && <ButtonLink href="/calendar/new" variant="secondary">+ Событие</ButtonLink>}
              {can(actor, "tasks.write") && <ButtonLink href="/tasks/new">+ Задача</ButtonLink>}
            </>
          ) : undefined
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-xl border border-border bg-surface px-4 py-4 transition hover:border-primary/40">
            <p className="text-sm text-muted">{s.label}</p>
            <p className={`mt-1 text-3xl font-semibold tabular-nums ${s.danger ? "text-danger" : ""}`}>{s.value}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {d.canCalendar && (
          <div className="min-w-0 space-y-6">
            <Card>
              <CardHeader title="Встречи сегодня" action={<Link href="/calendar" className="text-sm text-primary hover:underline">Календарь</Link>} />
              {d.eventsToday.length ? (
                <div className="divide-y divide-border">{d.eventsToday.map((e) => <EventLine key={e.id} e={e} tz={tz} />)}</div>
              ) : (
                <Empty>На сегодня встреч нет</Empty>
              )}
            </Card>
            <Card>
              <CardHeader title="Ближайшие 3 дня" />
              {d.eventsNext3Days.length ? (
                <div className="divide-y divide-border">{d.eventsNext3Days.map((e) => <EventLine key={e.id} e={e} tz={tz} withDate />)}</div>
              ) : (
                <Empty>Событий нет</Empty>
              )}
            </Card>
          </div>
        )}
        {d.canTasks && (
          <div className="min-w-0 space-y-6">
            <Card>
              <CardHeader title="Задачи на сегодня" action={<Link href="/tasks?section=today" className="text-sm text-primary hover:underline">Все</Link>} />
              {d.tasksToday.length ? (
                <div className="divide-y divide-border">{d.tasksToday.map((t) => <TaskLine key={t.id} t={t} tz={tz} now={now} />)}</div>
              ) : (
                <Empty>На сегодня задач нет</Empty>
              )}
            </Card>
            <Card>
              <CardHeader title="Просроченные" />
              {d.tasksOverdue.length ? (
                <div className="divide-y divide-border">{d.tasksOverdue.map((t) => <TaskLine key={t.id} t={t} tz={tz} now={now} />)}</div>
              ) : (
                <Empty>Просроченных задач нет</Empty>
              )}
            </Card>
            <Card>
              <CardHeader title="Ожидают ответа" />
              {d.tasksWaiting.length ? (
                <div className="divide-y divide-border">{d.tasksWaiting.map((t) => <TaskLine key={t.id} t={t} tz={tz} now={now} />)}</div>
              ) : (
                <Empty>Нет задач в ожидании</Empty>
              )}
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
