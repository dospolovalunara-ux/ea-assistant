export const EVENT_TYPES = {
  work_meeting: "Рабочая встреча",
  video_call: "Совещание / Zoom",
  business_lunch: "Деловой обед",
  business_trip: "Командировка",
  personal: "Личное событие",
  family: "Семейное событие",
  reminder: "Напоминание",
  busy: "Занято",
} as const;
export type EventTypeCode = keyof typeof EVENT_TYPES;

export const EVENT_STATUSES = {
  draft: "Черновик",
  pending: "Ожидает подтверждения",
  confirmed: "Подтверждено",
  rescheduled: "Перенесено",
  cancelled: "Отменено",
  completed: "Завершено",
} as const;
export type EventStatusCode = keyof typeof EVENT_STATUSES;

export const IMPORTANCE = { low: "Низкая", normal: "Обычная", high: "Высокая" } as const;
export type ImportanceCode = keyof typeof IMPORTANCE;

export const CALENDAR_KINDS = { work: "Рабочий", personal: "Личный" } as const;
export type CalendarKindCode = keyof typeof CALENDAR_KINDS;

export const TASK_STATUSES = {
  new: "Новая",
  in_progress: "В работе",
  waiting: "Ожидает ответа",
  review: "На проверке",
  done: "Выполнена",
  cancelled: "Отменена",
} as const;
export type TaskStatusCode = keyof typeof TASK_STATUSES;

export const TASK_PRIORITIES = { low: "Низкий", normal: "Обычный", high: "Высокий", urgent: "Срочный" } as const;
export type TaskPriorityCode = keyof typeof TASK_PRIORITIES;

export const TASK_VISIBILITY = {
  private: "Только помощник",
  shared: "Видна руководителю",
} as const;
export type TaskVisibilityCode = keyof typeof TASK_VISIBILITY;

export const TASK_SECTIONS = {
  open: "Все открытые",
  today: "Сегодня",
  week: "На неделе",
  overdue: "Просрочено",
  waiting: "Ожидает ответа",
  done: "Завершено",
} as const;
export type TaskSection = keyof typeof TASK_SECTIONS;

export const CLOSED_TASK_STATUSES: TaskStatusCode[] = ["done", "cancelled"];

export const AUDIT_ACTIONS: Record<string, string> = {
  "auth.login": "Вход",
  "auth.logout": "Выход",
  "auth.login_failed": "Неудачная попытка входа",
  "auth.locked": "Блокировка входа",
  "auth.login_blocked": "Попытка входа при блокировке",
  "access.denied": "Отказ в доступе",
  "event.create": "Создание события",
  "event.update": "Изменение события",
  "event.cancel": "Отмена события",
  "task.create": "Создание задачи",
  "task.update": "Изменение задачи",
  "task.status": "Смена статуса задачи",
  "task.comment": "Комментарий к задаче",
};

export const FIELD_LABELS: Record<string, string> = {
  title: "Название",
  type: "Тип",
  status: "Статус",
  calendarKind: "Календарь",
  startsAt: "Начало",
  endsAt: "Окончание",
  allDay: "Весь день",
  timezone: "Часовой пояс",
  location: "Место",
  videoUrl: "Видеоконференция",
  organizer: "Организатор",
  agenda: "Повестка",
  importance: "Важность",
  participants: "Участники",
  description: "Описание",
  source: "Источник",
  assignee: "Ответственный",
  dueAt: "Срок",
  priority: "Приоритет",
  visibility: "Видимость",
  relatedEventId: "Связанное событие",
};
