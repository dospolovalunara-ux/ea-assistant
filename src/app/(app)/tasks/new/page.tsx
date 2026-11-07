import { requireActor } from "@/server/auth/current";
import { requirePermission } from "@/server/auth/rbac";
import { orNotFound } from "@/server/page-guard";
import { createTaskAction } from "@/server/actions/tasks";
import { TaskForm } from "@/components/tasks/task-form";
import { Card, PageHeader } from "@/components/ui";
import { taskFormOptions } from "../form-data";

export const metadata = { title: "Новая задача" };

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const actor = await requireActor();
  await orNotFound(requirePermission(actor, "tasks.write", { entityType: "task" }));
  const { event } = await searchParams;
  const opts = await taskFormOptions(actor);
  return (
    <>
      <PageHeader title="Новая задача" />
      <Card className="max-w-3xl p-6">
        <TaskForm
          action={createTaskAction}
          defaults={{ relatedEventId: opts.events.some((e) => e.id === event) ? event : undefined }}
          {...opts}
          submitLabel="Создать задачу"
          cancelHref="/tasks"
        />
      </Card>
    </>
  );
}
