import { requireActor } from "@/server/auth/current";
import { requirePermission } from "@/server/auth/rbac";
import { orNotFound } from "@/server/page-guard";
import { createMeetingAction } from "@/server/actions/modules";
import { listEventsForPicker } from "@/server/services/calendar";
import { ActionForm } from "@/components/action-form";
import { Card, Field, PageHeader, inputCls } from "@/components/ui";
import { fmt, toLocalInput } from "@/lib/time";

export const metadata = { title: "Новое совещание" };

export default async function NewMeetingPage() {
  const actor = await requireActor();
  await orNotFound(requirePermission(actor, "protocols.write", { entityType: "meeting" }));
  const tz = actor.timezone;
  const events = await listEventsForPicker(actor, new Date());
  return (
    <>
      <PageHeader title="Новое совещание" subtitle="Расшифровка — текстом или файлом .txt. Распознавание аудио подключается после согласования сервиса." />
      <Card className="max-w-3xl p-6">
        <ActionForm action={createMeetingAction} submitLabel="Создать">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Название" className="md:col-span-2"><input name="title" maxLength={300} className={inputCls} /></Field>
            <Field label="Дата и время"><input type="datetime-local" name="heldAt" defaultValue={toLocalInput(new Date(), tz)} className={inputCls} /></Field>
            <Field label="Место / формат"><input name="location" maxLength={300} className={inputCls} /></Field>
            <Field label="Связанное событие календаря" className="md:col-span-2">
              <select name="eventId" className={inputCls}><option value="">Нет</option>{events.map((e) => <option key={e.id} value={e.id}>{fmt(e.startsAt, "d MMM HH:mm", tz)} — {e.title}</option>)}</select>
            </Field>
            <Field label="Расшифровка (текст)" className="md:col-span-2"><textarea name="transcript" rows={10} className={`${inputCls} h-auto py-2`} /></Field>
            <Field label="Или файл расшифровки" hint=".txt, .docx или .pdf до 10 МБ (AI читает только .txt)"><input type="file" name="file" accept=".txt,.docx,.pdf" className="block text-sm" /></Field>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
