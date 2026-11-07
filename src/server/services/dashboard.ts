import { can, requirePermission, type Actor } from "../auth/rbac";
import { listEvents } from "./calendar";
import { countTasksBySection, listTasks } from "./tasks";
import { addLocalDays, localDayEnd, localDayStart, localWeekStart } from "@/lib/time";

/** Все показатели главной страницы считаются запросами к базе. */
export async function getDashboard(actor: Actor, now = new Date()) {
  await requirePermission(actor, "dashboard.view", { entityType: "dashboard" });
  const tz = actor.timezone;
  const dayStart = localDayStart(now, tz);
  const result: {
    eventsToday: Awaited<ReturnType<typeof listEvents>>;
    eventsNext3Days: Awaited<ReturnType<typeof listEvents>>;
    eventsThisWeek: number | null;
    tasksToday: Awaited<ReturnType<typeof listTasks>>;
    tasksOverdue: Awaited<ReturnType<typeof listTasks>>;
    tasksWaiting: Awaited<ReturnType<typeof listTasks>>;
    taskCounts: Awaited<ReturnType<typeof countTasksBySection>> | null;
    canCalendar: boolean;
    canTasks: boolean;
  } = {
    eventsToday: [],
    eventsNext3Days: [],
    eventsThisWeek: null,
    tasksToday: [],
    tasksOverdue: [],
    tasksWaiting: [],
    taskCounts: null,
    canCalendar: can(actor, "calendar.read"),
    canTasks: can(actor, "tasks.read_all") || can(actor, "tasks.read_shared"),
  };

  if (result.canCalendar) {
    const [today, next, week] = await Promise.all([
      listEvents(actor, { from: dayStart, to: localDayEnd(now, tz), includeDrafts: false }),
      listEvents(actor, { from: localDayEnd(now, tz), to: addLocalDays(dayStart, 4, tz), includeDrafts: false }),
      listEvents(actor, {
        from: localWeekStart(now, tz),
        to: addLocalDays(localWeekStart(now, tz), 7, tz),
        includeDrafts: false,
      }),
    ]);
    result.eventsToday = today;
    result.eventsNext3Days = next;
    result.eventsThisWeek = week.length;
  }
  if (result.canTasks) {
    const [today, overdue, waiting, counts] = await Promise.all([
      listTasks(actor, "today", now),
      listTasks(actor, "overdue", now),
      listTasks(actor, "waiting", now),
      countTasksBySection(actor, now),
    ]);
    result.tasksToday = today;
    result.tasksOverdue = overdue;
    result.tasksWaiting = waiting;
    result.taskCounts = counts;
  }
  return result;
}
