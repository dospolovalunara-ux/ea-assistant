import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/auth/rbac";
import { getTask, getTaskHistory, isOverdue, listTaskComments, taskAbilities, userNames } from "@/server/services/tasks";
import { orNotFound } from "@/server/page-guard";
import { addCommentAction, changeTaskStatusAction } from "@/server/actions/tasks";
import { ButtonLink, Card, CardHeader, Empty, PageHeader } from "@/components/ui";
import { PriorityBadge, TaskStatusBadge } from "@/components/display";
import { History } from "@/components/common/history";
import { StatusControl } from "@/components/tasks/status-control";
import { CommentForm } from "@/components/tasks/comment-form";
import { TASK_PRIORITIES, TASK_VISIBILITY } from "@/lib/labels";
import { fmt } from "@/lib/time";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const t = await orNotFound(getTask(actor, id));
  const [comments, history] = await Promise.all([listTaskComments(actor, id), getTaskHistory(actor, id)]);
  const tz = actor.timezone;
  const ab = taskAbilities(actor, t);
  const ids = history.flatMap((h) =>
    Object.values(((h.metadata as { changes?: Record<string, { from: unknown; to: unknown }> }).changes ?? {}) as Record<string, { from: unknown; to: unknown }>)
      .flatMap((c) => [c.from, c.to])
      .filter((x): x is string => typeof x === "string" && x.startsWith("user:"))
      .map((x) => x.slice(5)),
  );
  const names = await userNames(ids);

  const rows: [string, React.ReactNode][] = [
    ["Ответственный", t.assigneeUserName ?? t.assigneeName ?? "Не назначен"],
    ["Срок", t.dueAt ? <span className={isOverdue(t) ? "text-danger" : ""}>{fmt(t.dueAt, "EEEE, d MMMM yyyy, HH:mm", tz)}</span> : "Без срока"],
    ["Приоритет", TASK_PRIORITIES[t.priority]],
    ["Видимость", TASK_VISIBILITY[t.visibility]],
    ["Источник", t.source],
    [
      "Связанное событие",
      t.relatedEventId && can(actor, "calendar.read") ? (
        <Link href={`/calendar/${t.relatedEventId}`} className="text-primary hover:underline">
          {t.relatedEventTitle} {t.relatedEventStartsAt && `(${fmt(t.relatedEventStartsAt, "d MMM, HH:mm", tz)})`}
        </Link>
      ) : null,
    ],
    ["Выполнена", t.completedAt ? fmt(t.completedAt, "d MMM yyyy, HH:mm", tz) : null],
    ["Создана", fmt(t.createdAt, "d MMM yyyy, HH:mm", tz)],
  ];

  return (
    <>
      <div className="mb-3 text-sm">
        <Link href="/tasks" className="text-muted hover:text-text">← Задачи</Link>
      </div>
      <PageHeader
        title={t.title}
        subtitle={
          <span className="mt-1 flex flex-wrap gap-2">
            <TaskStatusBadge status={t.status} overdue={isOverdue(t)} />
            <PriorityBadge priority={t.priority} />
          </span>
        }
        actions={ab.canEdit && <ButtonLink href={`/tasks/${t.id}/edit`} variant="secondary">Изменить</ButtonLink>}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-6">
          {ab.canChangeStatus && (
            <Card className="p-5">
              <p className="mb-3 text-sm font-medium">Статус</p>
              <StatusControl current={t.status} action={changeTaskStatusAction.bind(null, t.id)} />
            </Card>
          )}
          <Card>
            <dl className="divide-y divide-border">
              {rows
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="grid gap-1 px-5 py-3 sm:grid-cols-[200px_1fr]">
                    <dt className="text-sm text-muted">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
          </Card>
          {t.description && (
            <Card>
              <CardHeader title="Описание" />
              <p className="whitespace-pre-wrap px-5 py-4">{t.description}</p>
            </Card>
          )}
          <Card>
            <CardHeader title={`Комментарии (${comments.length})`} />
            {comments.length ? (
              <ul className="divide-y divide-border">
                {comments.map((c) => (
                  <li key={c.id} className="px-5 py-3">
                    <p className="text-sm">
                      <span className="font-medium">{c.authorName}</span>{" "}
                      <span className="text-muted">· {fmt(c.createdAt, "d MMM, HH:mm", tz)}</span>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Комментариев пока нет</Empty>
            )}
            {ab.canComment && (
              <div className="border-t border-border">
                <CommentForm action={addCommentAction.bind(null, t.id)} />
              </div>
            )}
          </Card>
        </div>
        <Card className="self-start">
          <CardHeader title="История изменений" />
          <History rows={history} tz={tz} names={names} />
        </Card>
      </div>
    </>
  );
}
