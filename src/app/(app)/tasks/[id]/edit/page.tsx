import { requireActor } from "@/server/auth/current";
import { requirePermission } from "@/server/auth/rbac";
import { getTask } from "@/server/services/tasks";
import { orNotFound } from "@/server/page-guard";
import { updateTaskAction } from "@/server/actions/tasks";
import { TaskForm } from "@/components/tasks/task-form";
import { Card, PageHeader } from "@/components/ui";
import { toLocalInput } from "@/lib/time";
import { taskFormOptions } from "../../form-data";

export const metadata = { title: "Изменить задачу" };

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  await orNotFound(requirePermission(actor, "tasks.write", { entityType: "task", entityId: id }));
  const t = await orNotFound(getTask(actor, id));
  const opts = await taskFormOptions(actor);
  return (
    <>
      <PageHeader title="Изменить задачу" subtitle={t.title} />
      <Card className="max-w-3xl p-6">
        <TaskForm
          action={updateTaskAction.bind(null, t.id)}
          defaults={{
            title: t.title,
            description: t.description ?? "",
            source: t.source ?? "",
            assignee: t.assigneeUserId ? `user:${t.assigneeUserId}` : t.assigneeName ? "name" : "",
            assigneeName: t.assigneeName ?? "",
            dueAt: toLocalInput(t.dueAt, actor.timezone),
            priority: t.priority,
            status: t.status,
            visibility: t.visibility,
            relatedEventId: t.relatedEventId ?? "",
          }}
          {...opts}
          submitLabel="Сохранить"
          cancelHref={`/tasks/${t.id}`}
        />
      </Card>
    </>
  );
}
