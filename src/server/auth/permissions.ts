/** Все права системы. Формат: `модуль.действие`. */
export const PERMISSIONS = {
  "dashboard.view": "Просмотр главной страницы",
  "calendar.read": "Просмотр календарей",
  "calendar.write": "Создание и изменение событий",
  "tasks.read_all": "Просмотр всех задач, включая личные задачи помощника",
  "tasks.read_shared": "Просмотр согласованных задач и задач, назначенных на себя",
  "tasks.write": "Создание и изменение задач",
  "tasks.update_status_assigned": "Смена статуса задач, назначенных на себя",
  "tasks.comment": "Комментирование доступных задач",
  "audit.read": "Просмотр журнала действий",
  "users.manage": "Управление пользователями",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ROLES = {
  assistant: {
    name: "Помощник",
    permissions: [
      "dashboard.view",
      "calendar.read",
      "calendar.write",
      "tasks.read_all",
      "tasks.read_shared",
      "tasks.write",
      "tasks.update_status_assigned",
      "tasks.comment",
      "audit.read",
    ],
  },
  executive: {
    name: "Руководитель",
    permissions: [
      "dashboard.view",
      "calendar.read",
      "tasks.read_shared",
      "tasks.update_status_assigned",
      "tasks.comment",
    ],
  },
  tech_admin: {
    name: "Технический администратор",
    permissions: ["audit.read", "users.manage"],
  },
} as const satisfies Record<string, { name: string; permissions: readonly Permission[] }>;

export type RoleCode = keyof typeof ROLES;
