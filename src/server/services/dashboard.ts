import { can, requirePermission, type Actor } from "../auth/rbac";
import { listEvents } from "./calendar";
import { countTasksBySection, listTasks } from "./tasks";
import { countMissingDocs } from "./corporate-expenses";
import { countExpiringDocuments } from "./documents";
import { countProtocolsInReview } from "./protocols";
import { getDb } from "../db";
import { inboxItems } from "../db/schema";
import { eq, sql } from "drizzle-orm";
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
    extra: { label: string; value: number; href: string; warn?: boolean }[];
  } = {
    extra: [],
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
  if (can(actor, "inbox.read")) {
    const [r] = await getDb().select({ n: sql<number>`count(*)::int` }).from(inboxItems).where(eq(inboxItems.status, "new"));
    result.extra.push({ label: "Новые входящие", value: r?.n ?? 0, href: "/inbox" });
  }
  if (can(actor, "protocols.write")) result.extra.push({ label: "Протоколы на проверке", value: await countProtocolsInReview(actor), href: "/meetings" });
  if (can(actor, "expenses.corporate.read")) {
    const n = await countMissingDocs(actor);
    result.extra.push({ label: "Расходы без документов", value: n, href: "/expenses/corporate?missing=1", warn: n > 0 });
  }
  const docs = await countExpiringDocuments(actor, 30);
  if (docs !== null) result.extra.push({ label: "Документы: срок ≤ 30 дн.", value: docs, href: "/documents?expiring=1", warn: docs > 0 });
  return result;
}
