import { resetSchema, runMigrations } from "@/server/db/migrate";
import { seedCalendars, seedRolesAndPermissions, seedUsers } from "@/server/db/seed";
import { closeDb } from "@/server/db";
import { loadActor, type Actor } from "@/server/auth/rbac";

export const TEST_PASSWORD = "Test-Password-123!";

export interface TestCtx {
  assistant: Actor;
  executive: Actor;
  techAdmin: Actor;
  ids: { assistant: string; executive: string; tech_admin: string };
}

/** Чистая тестовая база: схема, роли, три пользователя, два календаря. Без демо-событий. */
export async function freshDb(): Promise<TestCtx> {
  const url = process.env.TEST_DATABASE_URL!;
  await closeDb();
  await resetSchema(url);
  await runMigrations(url);
  await seedRolesAndPermissions();
  const ids = await seedUsers(TEST_PASSWORD);
  await seedCalendars(ids.executive, ids.assistant);
  return {
    ids,
    assistant: (await loadActor(ids.assistant, "10.0.0.1"))!,
    executive: (await loadActor(ids.executive, "10.0.0.2"))!,
    techAdmin: (await loadActor(ids.tech_admin, "10.0.0.3"))!,
  };
}

export function eventInput(over: Record<string, unknown> = {}) {
  return {
    title: "Тестовая встреча",
    type: "work_meeting",
    calendarKind: "work",
    status: "confirmed",
    start: "2026-11-10T10:00",
    end: "2026-11-10T11:00",
    timezone: "Asia/Almaty",
    ...over,
  };
}

export function taskInput(over: Record<string, unknown> = {}) {
  return { title: "Тестовая задача", priority: "normal", status: "new", visibility: "private", assignee: "", ...over };
}
