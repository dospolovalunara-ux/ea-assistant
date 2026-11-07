import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/auth/rbac";
import { countTasksBySection, listTasks } from "@/server/services/tasks";
import { orNotFound } from "@/server/page-guard";
import { ButtonLink, Card, Empty, PageHeader, cx } from "@/components/ui";
import { TaskLine } from "@/components/display";
import { TASK_SECTIONS, type TaskSection } from "@/lib/labels";

export const metadata = { title: "Задачи и поручения" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const section: TaskSection = sp.section && sp.section in TASK_SECTIONS ? (sp.section as TaskSection) : "open";
  const now = new Date();
  const [list, counts] = await orNotFound(Promise.all([listTasks(actor, section, now), countTasksBySection(actor, now)]));

  return (
    <>
      <PageHeader
        title="Задачи и поручения"
        subtitle={can(actor, "tasks.read_all") ? "Все задачи, включая личные" : "Согласованные задачи и назначенные на вас"}
        actions={can(actor, "tasks.write") && <ButtonLink href="/tasks/new">+ Новая задача</ButtonLink>}
      />
      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-border" aria-label="Разделы задач">
        {(Object.keys(TASK_SECTIONS) as TaskSection[]).map((s) => (
          <Link
            key={s}
            href={`/tasks?section=${s}`}
            aria-current={s === section ? "page" : undefined}
            className={cx(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition",
              s === section ? "border-primary font-medium text-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {TASK_SECTIONS[s]}
            <span className={cx("rounded-full px-1.5 text-xs tabular-nums", s === "overdue" && counts[s] > 0 ? "bg-danger-bg text-danger" : "bg-surface-2 text-muted")}>
              {counts[s]}
            </span>
          </Link>
        ))}
      </nav>
      <Card>
        {list.length ? (
          <div className="divide-y divide-border">
            {list.map((t) => <TaskLine key={t.id} t={t} tz={actor.timezone} now={now} />)}
          </div>
        ) : (
          <Empty>В этом разделе задач нет</Empty>
        )}
      </Card>
    </>
  );
}
