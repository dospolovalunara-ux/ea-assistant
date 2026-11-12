import { requireActor } from "@/server/auth/current";
import { can, canAny } from "@/server/auth/rbac";
import { logoutAction } from "@/server/actions/auth";
import { NavList, type NavItem } from "@/components/nav";
import { unreadCount } from "@/server/services/notifications";
import { after } from "next/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();

  // Пункты без прав не показываются. Нереализованные модули — серые, без перехода.
  if (process.env.SCHEDULER_MODE === "on-request") {
    after(async () => {
      const { maybeTick } = await import("@/server/scheduler/maybe-tick");
      await maybeTick().catch((e) => console.error("[scheduler]", e instanceof Error ? e.message : e));
    });
  }
  const unread = await unreadCount(actor);
  // Пункты без прав не показываются.
  const items: (NavItem & { visible: boolean })[] = [
    { href: "/", label: "Главная", enabled: true, visible: can(actor, "dashboard.view") },
    { href: "/calendar", label: "Календарь", enabled: true, visible: can(actor, "calendar.read") },
    { href: "/inbox", label: "Входящие", enabled: true, visible: can(actor, "inbox.read") },
    { href: "/tasks", label: "Задачи и поручения", enabled: true, visible: canAny(actor, "tasks.read_all", "tasks.read_shared") },
    { href: "/meetings", label: "Совещания и протоколы", enabled: true, visible: canAny(actor, "protocols.read", "protocols.write") },
    { href: "/expenses/corporate", label: "Корпоративные расходы", enabled: true, visible: can(actor, "expenses.corporate.read") },
    { href: "/expenses/personal", label: "Личные расходы", enabled: true, visible: can(actor, "expenses.personal.read") },
    { href: "/documents", label: "Семейные документы", enabled: true, visible: can(actor, "documents.read") },
    { href: "/reports", label: "Отчёты", enabled: true, visible: can(actor, "reports.view") },
    { href: "/notifications", label: unread ? `Уведомления · ${unread}` : "Уведомления", enabled: true, visible: true },
    { href: "/settings", label: "Настройки и доступы", enabled: true, visible: true },
    { href: "/audit", label: "Журнал действий", enabled: true, visible: can(actor, "audit.read") },
  ];
  const nav = items.filter((i) => i.visible);

  const userBlock = (
    <div className="border-t border-white/10 p-4">
      <p className="truncate text-sm font-medium text-white">{actor.fullName}</p>
      <p className="truncate text-xs text-sidebar-fg/70">{actor.roleName}</p>
      <form action={logoutAction} className="mt-3">
        <button type="submit" className="text-xs text-sidebar-fg/80 underline-offset-2 hover:text-white hover:underline">
          Выйти
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen md:flex">
      {/* Десктоп */}
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar md:flex md:sticky md:top-0 md:h-screen">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">E</div>
          <span className="text-sm font-semibold tracking-wide text-white">EXECUTIVE AI</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3" aria-label="Основное меню">
          <NavList items={nav} />
        </nav>
        {userBlock}
      </aside>

      {/* Телефон */}
      <details className="group bg-sidebar md:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-white">
          <span className="text-sm font-semibold tracking-wide">EXECUTIVE AI</span>
          <span className="text-sm text-sidebar-fg">Меню</span>
        </summary>
        <nav className="px-3 pb-2" aria-label="Основное меню">
          <NavList items={nav} />
        </nav>
        {userBlock}
      </details>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}
