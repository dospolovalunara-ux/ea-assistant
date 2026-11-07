import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/auth/rbac";
import { getInboxItem, INBOX_CATEGORIES } from "@/server/services/inbox";
import { aiStatus, type ExtractedField } from "@/server/integrations/ai";
import { signedFileUrl } from "@/server/services/files";
import { orNotFound } from "@/server/page-guard";
import { analyzeInboxAction, archiveInboxAction, confirmInboxAction, rejectExtractionAction } from "@/server/actions/modules";
import { ActionForm } from "@/components/action-form";
import { Badge, ButtonLink, Card, CardHeader, PageHeader } from "@/components/ui";
import { EventForm } from "@/components/calendar/event-form";
import { TaskForm } from "@/components/tasks/task-form";
import { listAssignableUsers } from "@/server/services/tasks";
import { listEventsForPicker } from "@/server/services/calendar";
import { addLocalDays, fmt, localDayStart, parseLocalDateTime, toLocalInput } from "@/lib/time";

const KIND = { fact: "факт", inference: "вывод", assumption: "предположение" } as const;

export default async function InboxItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ as?: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const { as } = await searchParams;
  const item = await orNotFound(getInboxItem(actor, id));
  const tz = actor.timezone;
  const ai = aiStatus();
  const proposed = item.extractions.find((e) => e.status === "proposed");
  const fields = (proposed?.fields ?? {}) as Record<string, ExtractedField>;
  const val = (k: string) => fields[k]?.value ?? "";
  const target = as === "event" || as === "task" ? as : proposed?.category === "meeting" || proposed?.category === "trip" ? "event" : proposed?.category === "task" ? "task" : null;
  const canDecide = can(actor, "inbox.decide") && item.status === "new";

  // Черновик события: неоднозначное время не угадывается — поля остаются пустыми, пока человек не заполнит.
  const startGuess = val("start") && parseLocalDateTime(val("start"), tz) ? val("start") : "";
  const endGuess = val("end") && parseLocalDateTime(val("end"), tz) ? val("end") : startGuess ? toLocalInput(new Date(parseLocalDateTime(startGuess, tz)!.getTime() + 3600_000), tz) : "";
  const tomorrow10 = new Date(addLocalDays(localDayStart(new Date(), tz), 1, tz).getTime() + 10 * 3600_000);

  return (
    <>
      <div className="mb-3 text-sm"><Link href="/inbox" className="text-muted hover:text-text">← Входящие</Link></div>
      <PageHeader
        title="Материал"
        subtitle={`${fmt(item.receivedAt, "d MMMM yyyy, HH:mm", tz)}${item.sourceNote ? ` · ${item.sourceNote}` : ""}`}
        actions={<Badge tone={item.status === "new" ? "primary" : "neutral"}>{item.status === "new" ? "Новый" : item.status === "processed" ? "Обработан" : "В архиве"}</Badge>}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Исходный материал" subtitle="Оригинал не изменяется" />
            <div className="px-5 py-4">
              {item.textContent && <pre className="whitespace-pre-wrap font-sans text-[15px]">{item.textContent}</pre>}
              {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-primary hover:underline">{item.url}</a>}
              {item.fileId && (
                <p>
                  <a href={signedFileUrl(actor, item.fileId)} className="text-primary hover:underline">{item.fileName}</a>
                  <span className="ml-2 text-xs text-muted">антивирусная проверка не подключена</span>
                </p>
              )}
            </div>
          </Card>
          {item.extractions.length > 0 && (
            <Card>
              <CardHeader title="Разбор" />
              <ul className="divide-y divide-border">
                {item.extractions.map((e) => (
                  <li key={e.id} className="px-5 py-4 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={e.status === "proposed" ? "warn" : e.status === "confirmed" ? "ok" : "neutral"}>
                        {e.status === "proposed" ? "Предложено" : e.status === "confirmed" ? "Подтверждено" : "Отклонено"}
                      </Badge>
                      <span className="font-medium">{INBOX_CATEGORIES[e.category as keyof typeof INBOX_CATEGORIES] ?? e.category}</span>
                      {e.confidence && <span className="text-muted">уверенность {Math.round(Number(e.confidence) * 100)}%</span>}
                      <span className="text-muted">· {e.provider === "manual" ? "вручную" : `AI (${e.model})`}</span>
                      {e.decidedByName && <span className="text-muted">· {e.decidedByName}</span>}
                    </div>
                    {Object.keys(e.fields).length > 0 && (
                      <dl className="mt-3 space-y-2">
                        {Object.entries(e.fields as Record<string, ExtractedField>).map(([k, f]) => (
                          <div key={k}>
                            <dt className="text-muted">{k} · <span className={f.kind === "fact" ? "text-ok" : "text-warn"}>{KIND[f.kind]}</span></dt>
                            <dd className="font-medium">{f.value}</dd>
                            <dd className="text-xs text-muted">Источник: «{f.source}»</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {e.questions.length > 0 && (
                      <div className="mt-3 rounded-lg bg-warn-bg p-3 text-warn">
                        <p className="font-medium">Требует уточнения:</p>
                        <ul className="list-disc pl-5">{e.questions.map((q) => <li key={q}>{q}</li>)}</ul>
                      </div>
                    )}
                    {e.status === "proposed" && canDecide && (
                      <div className="mt-3"><ActionForm action={rejectExtractionAction.bind(null, item.id, e.id)} submitLabel="Отклонить предложение" variant="secondary" /></div>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          {item.status === "new" && can(actor, "inbox.write") && (
            <Card className="p-5">
              <p className="mb-3 text-sm font-medium">Обработка</p>
              <div className="flex flex-wrap gap-2">
                {ai.enabled && item.textContent ? (
                  <ActionForm action={analyzeInboxAction.bind(null, item.id)} submitLabel="Разобрать с AI" pendingLabel="AI разбирает…" />
                ) : (
                  <p className="text-sm text-muted">{item.textContent ? `AI выключен: ${ai.reason}.` : "Для файлов и ссылок — ручной разбор."} Выберите, что создать:</p>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <ButtonLink href={`/inbox/${item.id}?as=event`} variant="secondary">Событие</ButtonLink>
                <ButtonLink href={`/inbox/${item.id}?as=task`} variant="secondary">Задача</ButtonLink>
                {can(actor, "expenses.corporate.write") && <ButtonLink href={`/expenses/corporate/new?inbox=${item.id}${proposed ? `&ext=${proposed.id}` : ""}`} variant="secondary">Корпоративный расход</ButtonLink>}
                {can(actor, "expenses.personal.write") && <ButtonLink href={`/expenses/personal?text=${encodeURIComponent(item.textContent?.slice(0, 500) ?? "")}`} variant="secondary">Личный расход</ButtonLink>}
              </div>
              <div className="mt-3"><ActionForm action={archiveInboxAction.bind(null, item.id)} submitLabel="В архив (справочная информация)" variant="secondary" /></div>
            </Card>
          )}
          {item.status === "new" && target === "event" && can(actor, "calendar.write") && (
            <Card>
              <CardHeader title="Черновик события" subtitle="Проверьте поля. В календарь событие попадёт только после подтверждения." />
              <div className="p-5">
                <EventForm
                  action={confirmInboxAction.bind(null, item.id, "event", proposed?.id)}
                  defaults={{
                    title: val("title"),
                    start: startGuess || toLocalInput(tomorrow10, tz),
                    end: endGuess || toLocalInput(new Date(tomorrow10.getTime() + 3600_000), tz),
                    location: val("location"),
                    participants: val("participants").split(/,\s*/).filter(Boolean).join("\n"),
                    agenda: val("description"),
                    timezone: tz,
                    status: startGuess ? "confirmed" : "pending",
                    type: proposed?.category === "trip" ? "business_trip" : "work_meeting",
                  }}
                  submitLabel="Подтвердить и создать событие"
                  cancelHref={`/inbox/${item.id}`}
                  tz={tz}
                />
              </div>
            </Card>
          )}
          {item.status === "new" && target === "task" && can(actor, "tasks.write") && (
            <Card>
              <CardHeader title="Черновик задачи" subtitle="Ответственный и срок не угадываются — проверьте их." />
              <div className="p-5">
                <TaskForm
                  action={confirmInboxAction.bind(null, item.id, "task", proposed?.id)}
                  defaults={{ title: val("title"), description: val("description"), assignee: val("assignee") ? "name" : "", assigneeName: val("assignee"), dueAt: parseLocalDateTime(val("due"), tz) ? val("due").length === 10 ? `${val("due")}T18:00` : val("due") : "" }}
                  users={await listAssignableUsers(actor)}
                  events={(await listEventsForPicker(actor, new Date())).map((e) => ({ id: e.id, label: `${fmt(e.startsAt, "d MMM HH:mm", tz)} — ${e.title}` }))}
                  submitLabel="Подтвердить и создать задачу"
                  cancelHref={`/inbox/${item.id}`}
                />
              </div>
            </Card>
          )}
          {item.status === "new" && target && !can(actor, target === "event" ? "calendar.write" : "tasks.write") && (
            <Card className="p-5 text-sm text-muted">Запись по этому предложению создаёт помощник. Вы можете отклонить предложение.</Card>
          )}
        </div>
      </div>
    </>
  );
}
