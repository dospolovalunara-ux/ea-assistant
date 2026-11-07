import { sql } from "drizzle-orm";
import {
  bigserial,
  date,
  integer,
  numeric,
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
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    mfaSecretEnc: text("mfa_secret_enc"),
    briefingTime: text("briefing_time"), // "08:30" местного времени или null
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

// ---------- MFA: незавершённый вход ----------
export const mfaChallenges = pgTable("mfa_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// ---------- Напоминания и уведомления (Sprint 2b) ----------
export const eventReminders = pgTable(
  "event_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull().references(() => calendarEvents.id, { onDelete: "cascade" }),
    minutesBefore: integer("minutes_before").notNull(),
    fireAt: ts("fire_at").notNull(),
    sentAt: ts("sent_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("event_reminders_unique").on(t.eventId, t.minutesBefore), index("event_reminders_fire_idx").on(t.fireAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    dedupeKey: text("dedupe_key").notNull(),
    readAt: ts("read_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("notifications_dedupe").on(t.userId, t.dedupeKey), index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull().unique(),
  status: text("status").notNull().default("disconnected"), // connected | error | disconnected
  accountEmail: text("account_email"),
  refreshTokenEnc: text("refresh_token_enc"),
  scope: text("scope"),
  syncToken: text("sync_token"),
  lastSyncAt: ts("last_sync_at"),
  lastError: text("last_error"),
  connectedBy: uuid("connected_by").references(() => users.id),
  ...timestamps,
});

export const oauthStates = pgTable("oauth_states", {
  id: uuid("id").primaryKey().defaultRandom(),
  stateHash: text("state_hash").notNull().unique(),
  verifierEnc: text("verifier_enc").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at").notNull(),
});

// ---------- Файлы (приватное хранилище) ----------
export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  scope: text("scope").notNull(), // inbox | expense | document | meeting
  storageKey: text("storage_key").notNull().unique(),
  originalName: text("original_name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  sha256: text("sha256").notNull(),
  scanStatus: text("scan_status").notNull().default("not_scanned"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// ---------- Входящие и AI (Sprint 3b) ----------
export const inboxItems = pgTable(
  "inbox_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(), // text | file | link
    textContent: text("text_content"),
    url: text("url"),
    fileId: uuid("file_id").references(() => files.id),
    sourceNote: text("source_note"),
    status: text("status").notNull().default("new"), // new | processed | archived
    receivedAt: ts("received_at").notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("inbox_items_status_idx").on(t.status, t.receivedAt)],
);

export const aiExtractions = pgTable(
  "ai_extractions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inboxItemId: uuid("inbox_item_id").references(() => inboxItems.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // anthropic | manual
    model: text("model"),
    category: text("category").notNull(),
    fields: jsonb("fields").$type<Record<string, unknown>>().notNull().default({}),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    questions: jsonb("questions").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("proposed"), // proposed | confirmed | rejected
    resultEntityType: text("result_entity_type"),
    resultEntityId: text("result_entity_id"),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: ts("decided_at"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("ai_extractions_item_idx").on(t.inboxItemId)],
);

// ---------- Корпоративные расходы (Sprint 4) ----------
export const corporateExpenses = pgTable(
  "corporate_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spentAt: ts("spent_at").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("KZT"),
    organization: text("organization").notNull(),
    category: text("category").notNull(),
    description: text("description"),
    relatedEventId: uuid("related_event_id").references(() => calendarEvents.id),
    paymentMethod: text("payment_method").notNull().default("corporate_card"),
    comment: text("comment"),
    status: text("status").notNull().default("active"), // active | void
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [check("corporate_amount_positive", sql`${t.amount} > 0`), index("corporate_spent_idx").on(t.spentAt)],
);

export const expenseDocuments = pgTable("expense_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  expenseId: uuid("expense_id").notNull().references(() => corporateExpenses.id, { onDelete: "cascade" }),
  docType: text("doc_type").notNull(),
  fileId: uuid("file_id").notNull().references(() => files.id),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// ---------- Личные расходы (отдельный контур) ----------
export const personalCashTransfers = pgTable(
  "personal_cash_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(), // income | refund | adjustment
    parentId: uuid("parent_id"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(), // для корректировки может быть отрицательной
    currency: text("currency").notNull().default("KZT"),
    occurredAt: ts("occurred_at").notNull(),
    description: text("description"),
    reason: text("reason"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("personal_transfer_reason", sql`${t.kind} <> 'adjustment' OR (${t.reason} IS NOT NULL AND length(${t.reason}) > 0)`),
    check("personal_transfer_sign", sql`${t.kind} = 'adjustment' OR ${t.amount} > 0`),
  ],
);

export const personalExpenses = pgTable(
  "personal_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transferId: uuid("transfer_id").references(() => personalCashTransfers.id),
    spentAt: ts("spent_at").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("KZT"),
    category: text("category").notNull(),
    description: text("description"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [check("personal_amount_positive", sql`${t.amount} > 0`), index("personal_spent_idx").on(t.spentAt)],
);

// ---------- Совещания и протоколы (Sprint 5) ----------
export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  heldAt: ts("held_at").notNull(),
  location: text("location"),
  eventId: uuid("event_id").references(() => calendarEvents.id),
  createdBy: uuid("created_by").references(() => users.id),
  ...timestamps,
});

export const meetingTranscripts = pgTable("meeting_transcripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  fileId: uuid("file_id").references(() => files.id),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const protocols = pgTable("protocols", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id").notNull().unique().references(() => meetings.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("draft"), // draft | approved
  currentVersion: integer("current_version").notNull().default(0),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: ts("approved_at"),
  ...timestamps,
});

export const protocolVersions = pgTable(
  "protocol_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    protocolId: uuid("protocol_id").notNull().references(() => protocols.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    source: text("source").notNull(), // ai | manual
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("protocol_versions_unique").on(t.protocolId, t.version)],
);

export const actionItems = pgTable("action_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  protocolId: uuid("protocol_id").notNull().references(() => protocols.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  assigneeName: text("assignee_name"),
  dueAt: ts("due_at"),
  needsReview: boolean("needs_review").notNull().default(false),
  status: text("status").notNull().default("proposed"), // proposed | confirmed | rejected
  taskId: uuid("task_id").references(() => tasks.id),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// ---------- Семейные документы ----------
export const documentCategories = pgTable("document_categories", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const familyDocuments = pgTable(
  "family_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    categoryCode: text("category_code").notNull().references(() => documentCategories.code),
    ownerName: text("owner_name").notNull(),
    docType: text("doc_type"),
    issuedOn: date("issued_on"),
    expiresOn: date("expires_on"),
    issuer: text("issuer"),
    numberMasked: text("number_masked"),
    confidentiality: text("confidentiality").notNull().default("normal"), // normal | high
    status: text("status").notNull().default("active"), // active | archived
    currentVersion: integer("current_version").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("family_documents_expires_idx").on(t.expiresOn)],
);

export const familyDocumentFiles = pgTable(
  "family_document_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").notNull().references(() => familyDocuments.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    fileId: uuid("file_id").notNull().references(() => files.id),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("family_document_files_unique").on(t.documentId, t.version)],
);

/** Дополнительный точечный доступ к документу с высокой конфиденциальностью. */
export const documentAccess = pgTable(
  "document_access",
  {
    documentId: uuid("document_id").notNull().references(() => familyDocuments.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    canDownload: boolean("can_download").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.userId] })],
);

// ---------- Ссылки на менеджер паролей (без секретов) ----------
export const vaultReferences = pgTable("vault_references", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  vaultUrl: text("vault_url").notNull(),
  ownerHint: text("owner_hint"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
