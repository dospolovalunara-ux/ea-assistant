import { eq, sql } from "drizzle-orm";
import { getDb } from "./index";
import {
  calendarEvents,
  calendars,
  eventParticipants,
  permissions,
  rolePermissions,
  roles,
  taskComments,
  tasks,
  users,
} from "./schema";
import { PERMISSIONS, ROLES, type RoleCode } from "../auth/permissions";
import { hashPassword } from "../auth/password";
import { addLocalDays, localDayStart, localWeekStart } from "@/lib/time";

const TZ = "Asia/Almaty";

/** Синхронизирует справочник прав и ролей с кодом. Идемпотентно. */
export async function seedRolesAndPermissions() {
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const [code, description] of Object.entries(PERMISSIONS)) {
      await tx.insert(permissions).values({ code, description }).onConflictDoUpdate({ target: permissions.code, set: { description } });
    }
    for (const [code, role] of Object.entries(ROLES)) {
      const [r] = await tx
        .insert(roles)
        .values({ code, name: role.name })
        .onConflictDoUpdate({ target: roles.code, set: { name: role.name, updatedAt: new Date() } })
        .returning({ id: roles.id });
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, r!.id));
      await tx.insert(rolePermissions).values(role.permissions.map((p) => ({ roleId: r!.id, permissionCode: p })));
    }
  });
}

export const DEMO_USERS: { email: string; fullName: string; role: RoleCode }[] = [
  { email: "assistant@demo.local", fullName: "Айгерим Сапарова", role: "assistant" },
  { email: "executive@demo.local", fullName: "Динара Ахметова", role: "executive" },
  { email: "techadmin@demo.local", fullName: "Тимур Ким", role: "tech_admin" },
];

export async function seedUsers(password: string) {
  const db = getDb();
  const hash = await hashPassword(password);
  const roleRows = await db.select().from(roles);
  const roleId = (code: string) => roleRows.find((r) => r.code === code)!.id;
  const ids: Record<RoleCode, string> = {} as Record<RoleCode, string>;
  for (const u of DEMO_USERS) {
    const [row] = await db
      .insert(users)
      .values({ email: u.email, fullName: u.fullName, passwordHash: hash, roleId: roleId(u.role), timezone: TZ })
      .onConflictDoUpdate({
        target: users.email,
        set: { fullName: u.fullName, passwordHash: hash, roleId: roleId(u.role), isActive: true, updatedAt: new Date() },
      })
      .returning({ id: users.id });
    ids[u.role] = row!.id;
  }
  return ids;
}

export async function seedCalendars(ownerId: string, createdBy: string) {
  const db = getDb();
  const existing = await db.select().from(calendars);
  const get = (kind: "work" | "personal") => existing.find((c) => c.kind === kind);
  const work =
    get("work") ??
    (await db.insert(calendars).values({ kind: "work", name: "Рабочий календарь", ownerId, createdBy }).returning())[0]!;
  const personal =
    get("personal") ??
    (await db.insert(calendars).values({ kind: "personal", name: "Личный календарь", ownerId, createdBy }).returning())[0]!;
  return { work: work.id, personal: personal.id };
}

/** Вымышленные события и задачи вокруг текущей недели. */
export async function seedDemoContent(ids: Record<RoleCode, string>, cal: { work: string; personal: string }) {
  const db = getDb();
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(calendarEvents)) as [{ n: number }];
  if (n > 0) return; // демо-данные уже есть

  const now = new Date();
  const week = localWeekStart(now, TZ);
  const today = localDayStart(now, TZ);
  const at = (base: Date, dayOffset: number, h: number, m = 0) =>
    new Date(addLocalDays(base, dayOffset, TZ).getTime() + (h * 60 + m) * 60_000);

  const ev = async (
    v: Partial<typeof calendarEvents.$inferInsert> & { title: string; startsAt: Date; endsAt: Date },
    people: string[] = [],
  ) => {
    const [row] = await db
      .insert(calendarEvents)
      .values({ calendarId: cal.work, type: "work_meeting", status: "confirmed", source: "demo", createdBy: ids.assistant, ...v })
      .returning({ id: calendarEvents.id });
    if (people.length) await db.insert(eventParticipants).values(people.map((name) => ({ eventId: row!.id, name })));
    return row!.id;
  };

  const board = await ev(
    { title: "Совет директоров (демо)", startsAt: at(week, 0, 10), endsAt: at(week, 0, 12), location: "Переговорная 5", importance: "high", agenda: "Итоги квартала\nБюджет на следующий год" },
    ["Динара Ахметова", "Ерлан Тестов", "Гульнара Примерова"],
  );
  await ev({ title: "Zoom с партнёрами (демо)", type: "video_call", startsAt: at(week, 1, 15), endsAt: at(week, 1, 16), videoUrl: "https://zoom.example.com/j/000000" });
  await ev({ title: "Деловой обед (демо)", type: "business_lunch", startsAt: at(week, 2, 13), endsAt: at(week, 2, 14, 30), location: "Ресторан «Пример»" });
  await ev({ title: "Планёрка (демо)", startsAt: at(today, 0, 9), endsAt: at(today, 0, 9, 30) });
  await ev({ title: "Встреча с юристами (демо)", startsAt: at(today, 0, 11), endsAt: at(today, 0, 12), location: "Кабинет 301" });
  await ev({ title: "Звонок с банком (демо)", type: "video_call", startsAt: at(today, 0, 11, 30), endsAt: at(today, 0, 12, 15) });
  await ev({ title: "Стратегическая сессия (демо)", startsAt: at(today, 1, 14), endsAt: at(today, 1, 17), status: "pending" });
  await ev({ title: "Командировка в Астану (демо)", type: "business_trip", allDay: true, startsAt: at(today, 3, 0), endsAt: at(today, 5, 0) });
  await ev({ calendarId: cal.personal, title: "Фитнес (демо)", type: "personal", startsAt: at(today, 0, 7), endsAt: at(today, 0, 8) });
  await ev({ calendarId: cal.personal, title: "Школьный концерт (демо)", type: "family", startsAt: at(today, 2, 18), endsAt: at(today, 2, 19, 30) });
  await ev({ calendarId: cal.personal, title: "Врач (демо)", type: "personal", startsAt: at(today, 1, 8, 30), endsAt: at(today, 1, 9, 15) });
  await ev({ title: "Черновик: встреча с подрядчиком (демо)", status: "draft", startsAt: at(today, 2, 10), endsAt: at(today, 2, 11) });

  const t = async (v: Partial<typeof tasks.$inferInsert> & { title: string }) => {
    const [row] = await db
      .insert(tasks)
      .values({ creatorId: ids.assistant, createdBy: ids.assistant, source: "демо-данные", ...v })
      .returning({ id: tasks.id });
    return row!.id;
  };
  const t1 = await t({ title: "Подготовить материалы к совету директоров", dueAt: at(today, 0, 18), priority: "high", status: "in_progress", visibility: "shared", relatedEventId: board, assigneeUserId: ids.assistant });
  await t({ title: "Согласовать договор аренды", dueAt: at(today, -2, 17), priority: "urgent", status: "waiting", visibility: "shared", assigneeName: "Юридический отдел" });
  await t({ title: "Подписать доверенность", dueAt: at(today, 1, 12), priority: "high", visibility: "shared", assigneeUserId: ids.executive });
  await t({ title: "Забронировать гостиницу в Астане", dueAt: at(today, 1, 10), priority: "normal", visibility: "private", assigneeUserId: ids.assistant });
  await t({ title: "Личная заметка помощника: уточнить формат отчёта", dueAt: at(today, 0, 16), visibility: "private", assigneeUserId: ids.assistant });
  await t({ title: "Ответить на письмо партнёров", dueAt: at(today, -1, 12), priority: "normal", status: "new", visibility: "private", assigneeUserId: ids.assistant });
  await t({ title: "Утвердить бюджет мероприятия", dueAt: at(today, 4, 15), priority: "normal", status: "review", visibility: "shared", assigneeUserId: ids.executive });
  await t({ title: "Отправить поздравление партнёрам", status: "done", completedAt: at(today, -1, 11), visibility: "shared", assigneeUserId: ids.assistant });

  await db.insert(taskComments).values({ taskId: t1, authorId: ids.assistant, body: "Презентация готова на 80%, жду цифры от финансового отдела." });
}

export async function seedAll(password: string) {
  await seedRolesAndPermissions();
  const ids = await seedUsers(password);
  const cal = await seedCalendars(ids.executive, ids.assistant);
  await seedDemoContent(ids, cal);
  return { ids, cal };
}
