import { and, eq, gt, isNotNull, isNull, lte, notInArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { calendarEvents, eventReminders, familyDocuments, tasks, users } from "../db/schema";
import { notify, usersWithRoles } from "../services/notifications";
import { loadActor } from "../auth/rbac";
import { getDashboard } from "../services/dashboard";
import { CLOSED_TASK_STATUSES, EVENT_TYPES } from "@/lib/labels";
import { fmt } from "@/lib/time";

const TZ = "Asia/Almaty";
export const DOC_EXPIRY_OFFSETS = [30, 14, 3, 0];

function minutesLabel(m: number) {
  return m >= 1440 ? `через ${m / 1440} д.` : m >= 60 ? `через ${m / 60} ч` : `через ${m} мин`;
}

/**
 * Один проход фонового планировщика. Идемпотентен: каждое уведомление
 * имеет ключ, повтор не создаёт дубль. Защищён advisory-lock от параллельного запуска.
 */
export async function runTick(now = new Date()): Promise<Record<string, number>> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(724001) as ok`);
    if (!(lock.rows[0] as { ok: boolean }).ok) return { skipped: 1 };
    const stats = { eventReminders: 0, businessLunch: 0, taskDue: 0, taskOverdue: 0, briefings: 0, documents: 0 };
    const team = await usersWithRoles(tx, ["assistant", "executive"]);
    const assistants = await usersWithRoles(tx, ["assistant"]);

    // 1. Напоминания о встречах
    const due = await tx
      .select({ r: eventReminders, e: calendarEvents })
      .from(eventReminders)
      .innerJoin(calendarEvents, eq(eventReminders.eventId, calendarEvents.id))
      .where(and(isNull(eventReminders.sentAt), lte(eventReminders.fireAt, now)));
    for (const { r, e } of due) {
      if (e.status !== "cancelled" && e.status !== "draft" && e.startsAt > new Date(now.getTime() - 3600_000)) {
        stats.eventReminders += await notify(tx, team, {
          kind: "event_reminder",
          title: `${e.title} — ${minutesLabel(r.minutesBefore)}`,
          body: `${fmt(e.startsAt, "d MMM, HH:mm", TZ)}${e.location ? ` · ${e.location}` : ""}`,
          link: `/calendar/${e.id}`,
          dedupeKey: `event:${e.id}:${r.minutesBefore}:${e.startsAt.toISOString()}`,
        });
      }
      await tx.update(eventReminders).set({ sentAt: now }).where(eq(eventReminders.id, r.id));
    }

    // 2. Деловые обеды: напомнить собрать документы за 2 часа
    const lunches = await tx
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.type, "business_lunch"),
          notInArray(calendarEvents.status, ["cancelled", "draft"]),
          gt(calendarEvents.startsAt, now),
          lte(calendarEvents.startsAt, new Date(now.getTime() + 2 * 3600_000)),
        ),
      );
    for (const e of lunches) {
      stats.businessLunch += await notify(tx, assistants, {
        kind: "expense_docs",
        title: `${EVENT_TYPES.business_lunch}: соберите документы`,
        body: `«${e.title}» в ${fmt(e.startsAt, "HH:mm", TZ)}. Нужны фискальный чек (QR) и подтверждение оплаты.`,
        link: `/expenses/corporate/new?event=${e.id}`,
        dedupeKey: `lunch:${e.id}:${e.startsAt.toISOString()}`,
      });
    }

    // 3. Задачи: за час до срока и при просрочке
    const open = await tx
      .select()
      .from(tasks)
      .where(and(notInArray(tasks.status, CLOSED_TASK_STATUSES), isNotNull(tasks.dueAt), lte(tasks.dueAt, new Date(now.getTime() + 3600_000))));
    for (const t of open) {
      const who = [t.assigneeUserId, t.creatorId].filter(Boolean) as string[];
      const recipients = t.visibility === "private" ? who.filter((id) => assistants.includes(id) || id === t.assigneeUserId) : who;
      if (t.dueAt! > now) {
        stats.taskDue += await notify(tx, recipients, {
          kind: "task_due",
          title: `Срок задачи через час: ${t.title}`,
          body: `Срок: ${fmt(t.dueAt!, "d MMM, HH:mm", TZ)}`,
          link: `/tasks/${t.id}`,
          dedupeKey: `task:${t.id}:due:${t.dueAt!.toISOString()}`,
        });
      } else {
        stats.taskOverdue += await notify(tx, recipients, {
          kind: "task_overdue",
          title: `Задача просрочена: ${t.title}`,
          body: `Срок был ${fmt(t.dueAt!, "d MMM, HH:mm", TZ)}`,
          link: `/tasks/${t.id}`,
          dedupeKey: `task:${t.id}:overdue:${t.dueAt!.toISOString()}`,
        });
      }
    }

    // 4. Утренний брифинг — время задаёт пользователь
    const withBriefing = await tx.select().from(users).where(and(eq(users.isActive, true), isNotNull(users.briefingTime)));
    for (const u of withBriefing) {
      const local = fmt(now, "HH:mm", u.timezone);
      if (local < u.briefingTime!) continue;
      const dayKey = fmt(now, "yyyy-MM-dd", u.timezone);
      const actor = await loadActor(u.id);
      if (!actor || !actor.permissions.has("dashboard.view")) continue;
      const d = await getDashboard(actor, now);
      const parts = [
        d.canCalendar && `встреч сегодня: ${d.eventsToday.length}`,
        d.taskCounts && `задач на сегодня: ${d.taskCounts.today}`,
        d.taskCounts && `просрочено: ${d.taskCounts.overdue}`,
        d.taskCounts && `ожидает ответа: ${d.taskCounts.waiting}`,
      ].filter(Boolean);
      const first = d.eventsToday[0];
      stats.briefings += await notify(tx, [u.id], {
        kind: "briefing",
        title: `Утренний брифинг на ${fmt(now, "d MMMM", u.timezone)}`,
        body: parts.join(", ") + (first ? `. Первая встреча: ${fmt(first.startsAt, "HH:mm", u.timezone)} — ${first.title}` : ""),
        link: "/",
        dedupeKey: `briefing:${dayKey}`,
      });
    }

    // 5. Сроки документов: за 30, 14, 3 дня и в день окончания
    const docReaders = await usersWithRoles(tx, ["assistant", "executive"]);
    const today = fmt(now, "yyyy-MM-dd", TZ);
    const docs = await tx
      .select({ id: familyDocuments.id, title: familyDocuments.title, ownerName: familyDocuments.ownerName, expiresOn: familyDocuments.expiresOn, days: sql<number>`(${familyDocuments.expiresOn} - ${today}::date)` })
      .from(familyDocuments)
      .where(and(eq(familyDocuments.status, "active"), isNotNull(familyDocuments.expiresOn), lte(familyDocuments.expiresOn, sql`${today}::date + 30`)));
    for (const doc of docs) {
      const offset = DOC_EXPIRY_OFFSETS.find((o) => doc.days <= o && doc.days > (DOC_EXPIRY_OFFSETS[DOC_EXPIRY_OFFSETS.indexOf(o) + 1] ?? -Infinity));
      if (offset === undefined) continue;
      // В уведомлении — без номера и содержимого документа
      stats.documents += await notify(tx, docReaders, {
        kind: "document_expiry",
        title: doc.days <= 0 ? `Истёк срок документа: ${doc.title}` : `Срок документа истекает через ${doc.days} дн.: ${doc.title}`,
        body: `Владелец: ${doc.ownerName}. Действует до ${doc.expiresOn}`,
        link: `/documents/${doc.id}`,
        dedupeKey: `doc:${doc.id}:${offset}:${doc.expiresOn}`,
      });
    }
    return stats;
  });
}
