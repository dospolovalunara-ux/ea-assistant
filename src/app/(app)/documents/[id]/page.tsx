import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/auth/rbac";
import { daysUntil, getDocument, getDocumentAccessList, getDocumentAudit } from "@/server/services/documents";
import { listAssignableUsers } from "@/server/services/tasks";
import { signedFileUrl } from "@/server/services/files";
import { orNotFound } from "@/server/page-guard";
import { addDocumentVersionAction, archiveDocumentAction, documentAccessAction } from "@/server/actions/modules";
import { ActionForm } from "@/components/action-form";
import { Badge, ButtonLink, Card, CardHeader, Empty, Field, PageHeader, inputCls } from "@/components/ui";
import { AUDIT_ACTIONS } from "@/lib/labels";
import { fmt } from "@/lib/time";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const d = await orNotFound(getDocument(actor, id));
  const tz = actor.timezone;
  const write = can(actor, "documents.write");
  const [audit, access, people] = write ? await Promise.all([getDocumentAudit(actor, id), getDocumentAccessList(actor, id), listAssignableUsers(actor)]) : [[], [], []];
  const days = daysUntil(d.expiresOn, tz);
  return (
    <>
      <div className="mb-3 text-sm"><Link href="/documents" className="text-muted hover:text-text">← Документы</Link></div>
      <PageHeader
        title={d.title}
        subtitle={<span className="mt-1 flex flex-wrap gap-2"><Badge>{d.categoryName}</Badge>{d.confidentiality === "high" && <Badge tone="primary">Высокая конфиденциальность</Badge>}{days !== null && <Badge tone={days < 0 ? "danger" : days <= 30 ? "warn" : "ok"}>{days < 0 ? "Срок истёк" : `Действует ещё ${days} дн.`}</Badge>}</span>}
        actions={write && <ButtonLink href={`/documents/${d.id}/edit`} variant="secondary">Изменить</ButtonLink>}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <dl className="divide-y divide-border">
              {([["Владелец", d.ownerName], ["Тип", d.docType], ["Номер", d.numberMasked], ["Орган выдачи", d.issuer], ["Дата выдачи", d.issuedOn], ["Срок действия", d.expiresOn]] as [string, string | null][]).filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="grid gap-1 px-5 py-3 sm:grid-cols-[200px_1fr]"><dt className="text-sm text-muted">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </Card>
          <Card>
            <CardHeader title="Файлы и версии" subtitle="Ссылка на скачивание действует 5 минут и привязана к вашей учётной записи" />
            {d.versions.length ? (
              <ul className="divide-y divide-border">
                {d.versions.map((v) => (
                  <li key={v.id} className="flex flex-wrap justify-between gap-2 px-5 py-2.5 text-sm">
                    <span>Версия {v.version}{v.version === d.currentVersion ? " (текущая)" : ""} · {d.canDownload ? <a href={signedFileUrl(actor, v.fileId)} className="text-primary hover:underline">{v.name}</a> : v.name}</span>
                    <span className="text-muted">{v.author ?? "—"} · {fmt(v.createdAt, "d MMM yyyy", tz)}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty>Файл не загружен</Empty>}
            {!d.canDownload && d.versions.length > 0 && <p className="border-t border-border px-5 py-2.5 text-sm text-muted">Скачивание этого документа вам не разрешено.</p>}
            {write && (
              <div className="border-t border-border p-5">
                <ActionForm action={addDocumentVersionAction.bind(null, d.id)} submitLabel="Загрузить новую версию" resetOnSuccess successText="Версия загружена">
                  <input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" className="block text-sm" />
                </ActionForm>
              </div>
            )}
          </Card>
          {write && d.confidentiality === "high" && (
            <Card>
              <CardHeader title="Точечный доступ" subtitle="Кроме редакторов документ видят только указанные пользователи" />
              {access.length > 0 && <ul className="divide-y divide-border text-sm">{access.map((a) => <li key={a.userId} className="px-5 py-2">{a.name} — {a.canDownload ? "просмотр и скачивание" : "только просмотр"}</li>)}</ul>}
              <div className="border-t border-border p-5">
                <ActionForm action={documentAccessAction.bind(null, d.id)} submitLabel="Сохранить доступ">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Пользователь"><select name="userId" className={inputCls}>{people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}</select></Field>
                    <Field label="Доступ"><select name="mode" className={inputCls}><option value="view">Только просмотр</option><option value="download">Просмотр и скачивание</option><option value="none">Нет доступа</option></select></Field>
                  </div>
                </ActionForm>
              </div>
            </Card>
          )}
          {write && <ActionForm action={archiveDocumentAction.bind(null, d.id)} submitLabel="Перенести в архив" variant="danger" confirmText="Перенести документ в архив?" />}
        </div>
        {write && (
          <Card className="self-start">
            <CardHeader title="Журнал документа" subtitle="Просмотры, скачивания, изменения" />
            {audit.length ? <ul className="divide-y divide-border text-sm">{audit.map((a) => <li key={a.id} className="px-5 py-2"><span className="font-medium">{AUDIT_ACTIONS[a.action] ?? a.action}</span> <span className="text-muted">· {a.userName ?? "—"} · {fmt(a.createdAt, "d MMM HH:mm", tz)}</span></li>)}</ul> : <Empty>Записей нет</Empty>}
          </Card>
        )}
      </div>
    </>
  );
}
