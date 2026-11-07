import "server-only";
import type { Actor } from "@/server/auth/rbac";
import { can } from "@/server/auth/rbac";
import { listAssignableUsers } from "@/server/services/tasks";
import { listEventsForPicker } from "@/server/services/calendar";
import { fmt } from "@/lib/time";

export async function taskFormOptions(actor: Actor) {
  const [users, events] = await Promise.all([
    listAssignableUsers(actor),
    can(actor, "calendar.read") ? listEventsForPicker(actor, new Date()) : Promise.resolve([]),
  ]);
  return {
    users,
    events: events.map((e) => ({ id: e.id, label: `${fmt(e.startsAt, "d MMM HH:mm", actor.timezone)} — ${e.title}` })),
  };
}
