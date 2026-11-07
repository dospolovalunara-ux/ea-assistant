import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  index,
  inet,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------- Общие поля ----------
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const timestamps = {
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
};

// ---------- Перечисления ----------
export const calendarKind = pgEnum("calendar_kind", ["work", "personal"]);

export const eventType = pgEnum("event_type", [
  "work_meeting",
  "video_call",
  "business_lunch",
  "business_trip",
  "personal",
  "family",
  "reminder",
  "busy",
]);

export const eventStatus = pgEnum("event_status", [
  "draft",
  "pending",
  "confirmed",
  "rescheduled",
  "cancelled",
  "completed",
]);

export const importance = pgEnum("importance", ["low", "normal", "high"]);

export const taskStatus = pgEnum("task_status", [
  "new",
  "in_progress",
  "waiting",
  "review",
  "done",
  "cancelled",
]);

export const taskPriority = pgEnum("task_priority", ["low", "normal", "high", "urgent"]);
export const taskVisibility = pgEnum("task_visibility", ["private", "shared"]);

// ---------- Роли и права ----------
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  ...timestamps,
});

export const permissions = pgTable("permissions", {
  code: text("code").primaryKey(),
  description: text("description").notNull(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionCode: text("permission_code")
      .notNull()
      .references(() => permissions.code, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionCode] })],
);

// ---------- Пользователи и сессии ----------
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    timezone: text("timezone").notNull().default("Asia/Almaty"),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: ts("last_login_at"),
    createdBy: uuid("created_by"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
  ],
);

export const userPermissions = pgTable(
  "user_permissions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permissionCode: text("permission_code")
      .notNull()
      .references(() => permissions.code, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.permissionCode] })],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sessions_token_hash_unique").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    email: text("email").notNull(),
    ip: inet("ip"),
    success: boolean("success").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("login_attempts_email_idx").on(t.email, t.createdAt),
    index("login_attempts_ip_idx").on(t.ip, t.createdAt),
  ],
);

// ---------- Календарь ----------
export const calendars = pgTable("calendars", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: calendarKind("kind").notNull(),
  name: text("name").notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  createdBy: uuid("created_by").references(() => users.id),
  ...timestamps,
});

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id),
    title: text("title").notNull(),
    type: eventType("type").notNull(),
    status: eventStatus("status").notNull().default("confirmed"),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    allDay: boolean("all_day").notNull().default(false),
    timezone: text("timezone").notNull().default("Asia/Almaty"),
    location: text("location"),
    videoUrl: text("video_url"),
    organizer: text("organizer"),
    agenda: text("agenda"),
    source: text("source").notNull().default("manual"),
    importance: importance("importance").notNull().default("normal"),
    externalId: text("external_id"),
    externalEtag: text("external_etag"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    check("calendar_events_time_order", sql`${t.endsAt} > ${t.startsAt}`),
    index("calendar_events_time_idx").on(t.startsAt, t.endsAt),
    index("calendar_events_calendar_idx").on(t.calendarId),
  ],
);

export const eventParticipants = pgTable(
  "event_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    userId: uuid("user_id").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("event_participants_event_idx").on(t.eventId)],
);

// ---------- Задачи ----------
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    source: text("source"),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id),
    assigneeName: text("assignee_name"),
    creatorId: uuid("creator_id").references(() => users.id),
    dueAt: ts("due_at"),
    priority: taskPriority("priority").notNull().default("normal"),
    status: taskStatus("status").notNull().default("new"),
    visibility: taskVisibility("visibility").notNull().default("private"),
    relatedEventId: uuid("related_event_id").references(() => calendarEvents.id),
    completedAt: ts("completed_at"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("tasks_status_idx").on(t.status),
    index("tasks_due_idx").on(t.dueAt),
    index("tasks_assignee_idx").on(t.assigneeUserId),
  ],
);

export const taskComments = pgTable(
  "task_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("task_comments_task_idx").on(t.taskId, t.createdAt)],
);

// ---------- Журнал действий (только добавление) ----------
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    ip: inet("ip"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_created_idx").on(t.createdAt),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_action_idx").on(t.action),
  ],
);

export type User = typeof users.$inferSelect;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
