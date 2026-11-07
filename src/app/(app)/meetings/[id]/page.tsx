import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/auth/rbac";
import { getMeeting, protocolToForm } from "@/server/services/protocols";
import { aiStatus } from "@/server/integrations/ai";
import { signedFileUrl } from "@/server/services/files";
import { orNotFound } from "@/server/page-guard";
import { actionItemAction, aiDraftAction, approveProtocolAction, saveProtocolAction } from "@/server/actions/modules";
import { ActionForm } from "@/components/action-form";
import { Alert, Badge, Card, CardHeader, Empty, Field, PageHeader, inputCls } from "@/components/ui";
import { fmt } from "@/lib/time";

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const m = await orNotFound(getMeeting(actor, id));
  const tz = actor.timezone;
  const write = can(actor, "protocols.write");
  const ai = aiStatus();
  const c = m.content;
  const f = protocolToForm(c);
  const approved = m.protocol.status === "approved";
  const ta = `${inputCls} h-auto py-2`;
  return (
    <>
      <div className="mb-3 text-sm"><Link href="/meetings" className="text-muted hover:text-text">← Совещания</Link></div>
      <PageHeader
        title={m.meeting.title}
        subtitle={`${fmt(m.meeting.heldAt, "d MMMM yyyy, HH:mm", tz)}${m.meeting.location ? ` · ${m.meeting.location}` : ""}${m.eventTitle ? ` · событие: ${m.eventTitle}` : ""}`}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={approved ? "ok" : "warn"}>{approved ? "Утверждён" : "Черновик — не утверждён"}</Badge>
            {m.protocol.currentVersion > 0 && (
              <>
                <a className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm" href={`/api/export/protocol?format=docx&meeting=${m.meeting.id}`}>DOCX</a>
                <a className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm" href={`/api/export/protocol?format=pdf&meeting=${m.meeting.id}`}>PDF</a>
              </>
            )}
          </span>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          {!approved && m.protocol.currentVersion > 0 && <Alert tone="warn">Это черновик. Он не является утверждённым протоколом. Отправка внешним адресатам не подключена — используйте экспорт после утверждения.</Alert>}
          {write ? (
            <Card>
              <CardHeader title={`Протокол · версия ${m.protocol.currentVersion || "—"}`} subtitle={m.currentSource === "ai" ? "Черновик подготовлен AI — проверьте каждый пункт. Строки с ⚠ требуют проверки." : "Строки, начинающиеся с ⚠, помечены «требует проверки»."} />
              <div className="p-5">
                <ActionForm action={saveProtocolAction.bind(null, m.meeting.id)} submitLabel="Сохранить новую версию" successText="Сохранено. Протокол снова в статусе черновика.">
                  <Field label="Участники (по одному в строке)"><textarea name="participants" rows={3} defaultValue={f.participants} className={ta} /></Field>
                  <Field label="Повестка"><textarea name="agenda" rows={3} defaultValue={f.agenda} className={ta} /></Field>
                  <Field label="Краткое содержание"><textarea name="summary" rows={5} defaultValue={f.summary} className={ta} /></Field>
                  <Field label="Решения (по одному в строке)"><textarea name="decisions" rows={4} defaultValue={f.decisions} className={ta} /></Field>
                  <Field label="Поручения" hint="Формат: Что сделать | Ответственный | ГГГГ-ММ-ДД"><textarea name="actionItems" rows={4} defaultValue={f.actionItems} className={ta} /></Field>
                  <Field label="Вопросы на уточнение"><textarea name="questions" rows={2} defaultValue={f.questions} className={ta} /></Field>
                </ActionForm>
              </div>
            </Card>
          ) : (
            <Card className="space-y-4 p-5 text-[15px]">
              <section><h3 className="font-semibold">Участники</h3><p>{c.participants.join(", ") || "—"}</p></section>
              <section><h3 className="font-semibold">Повестка</h3><ol className="list-decimal pl-5">{c.agenda.map((a) => <li key={a}>{a}</li>)}</ol></section>
              <section><h3 className="font-semibold">Краткое содержание</h3><p className="whitespace-pre-wrap">{c.summary || "—"}</p></section>
              <section><h3 className="font-semibold">Решения</h3><ol className="list-decimal pl-5">{c.decisions.map((d) => <li key={d.text}>{d.text}</li>)}</ol></section>
              <section><h3 className="font-semibold">Поручения</h3><ul className="list-disc pl-5">{c.actionItems.map((a) => <li key={a.title}>{a.title} — {a.assignee ?? "не указан"}, срок {a.due ?? "не указан"}</li>)}</ul></section>
            </Card>
          )}
          {m.actionItems.length > 0 && (
            <Card>
              <CardHeader title="Поручения из утверждённого протокола" subtitle="Подтвердите каждое — тогда оно станет задачей, связанной со встречей" />
              <ul className="divide-y divide-border">
                {m.actionItems.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <span><span className="font-medium">{a.title}</span><span className="block text-muted">{a.assigneeName ?? "ответственный не указан"} · {a.dueAt ? fmt(a.dueAt, "d MMM yyyy", tz) : "без срока"}</span></span>
                    {a.status === "proposed" && write ? (
                      <ActionForm action={actionItemAction.bind(null, m.meeting.id, a.id)} submitLabel="Создать задачу" extraButtons={<button name="decision" value="reject" className="text-sm text-muted hover:text-danger">Отклонить</button>} />
                    ) : a.taskId ? (
                      <Link href={`/tasks/${a.taskId}`} className="text-primary hover:underline">Задача создана</Link>
                    ) : (
                      <Badge>{a.status === "rejected" ? "Отклонено" : "Ожидает"}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="min-w-0 space-y-6">
          {write && (
            <Card className="space-y-3 p-5">
              <p className="text-sm font-medium">Действия</p>
              {ai.enabled ? (
                <ActionForm action={aiDraftAction.bind(null, m.meeting.id)} submitLabel="Подготовить черновик с AI" pendingLabel="AI готовит черновик…" variant="secondary" successText="Черновик готов — проверьте" />
              ) : (
                <p className="text-sm text-muted">AI выключен: {ai.reason}. Заполните протокол вручную.</p>
              )}
              {!approved && m.protocol.currentVersion > 0 && (
                <ActionForm action={approveProtocolAction.bind(null, m.meeting.id)} submitLabel="Утвердить протокол" confirmText="Утвердить протокол? Поручения появятся для подтверждения." />
              )}
            </Card>
          )}
          {write && (
            <Card>
              <CardHeader title="Исходная расшифровка" />
              {m.transcript ? (
                <div className="max-h-[420px] overflow-y-auto px-5 py-3 text-sm">
                  {m.transcript.fileId && <p className="mb-2"><a href={signedFileUrl(actor, m.transcript.fileId)} className="text-primary hover:underline">Скачать исходный файл</a></p>}
                  <pre className="whitespace-pre-wrap font-sans">{m.transcript.text || "Текста нет — только файл."}</pre>
                </div>
              ) : <Empty>Расшифровки нет</Empty>}
            </Card>
          )}
          <Card>
            <CardHeader title="Версии" />
            {m.versions.length ? (
              <ul className="divide-y divide-border text-sm">{m.versions.map((v) => <li key={v.id} className="px-5 py-2">Версия {v.version} · {v.source === "ai" ? "AI-черновик" : "вручную"} · {v.author ?? "—"} · {fmt(v.createdAt, "d MMM HH:mm", tz)}</li>)}</ul>
            ) : <Empty>Версий нет</Empty>}
          </Card>
        </div>
      </div>
    </>
  );
}
