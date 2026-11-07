import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { listAuditLogs } from "@/server/services/audit-read";
import { orNotFound } from "@/server/page-guard";
import { Card, Empty, PageHeader, cx } from "@/components/ui";
import { AUDIT_ACTIONS } from "@/lib/labels";
import { fmt } from "@/lib/time";

export const metadata = { title: "Журнал действий" };

const FILTERS = [
  { key: "", label: "Все" },
  { key: "auth.", label: "Входы и выходы" },
  { key: "access.", label: "Отказы в доступе" },
  { key: "event.", label: "Календарь" },
  { key: "task.", label: "Задачи" },
  { key: "ai.", label: "AI" },
  { key: "expense.", label: "Расходы" },
  { key: "document.", label: "Документы" },
  { key: "protocol.", label: "Протоколы" },
  { key: "export.", label: "Экспорт" },
  { key: "user.", label: "Пользователи" },
];

const ENTITY_LINK: Record<string, string> = { calendar_event: "/calendar/", task: "/tasks/", inbox_item: "/inbox/", corporate_expense: "/expenses/corporate/", meeting: "/meetings/", family_document: "/documents/" };

function summary(meta: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof meta.email === "string") parts.push(meta.email);
  if (typeof meta.permission === "string") parts.push(`право: ${meta.permission}`);
  if (meta.changes && typeof meta.changes === "object") parts.push(`поля: ${Object.keys(meta.changes).join(", ")}`);
  if (meta.after && typeof meta.after === "object" && typeof (meta.after as { title?: unknown }).title === "string")
    parts.push(`«${(meta.after as { title: string }).title}»`);
  if (meta.overlapConfirmed) parts.push("с пересечением");
  return parts.join(" · ");
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ f?: string; before?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const f = FILTERS.some((x) => x.key === sp.f) ? sp.f! : "";
  const before = sp.before ? Number(sp.before) : undefined;
  const { rows, nextBefore } = await orNotFound(listAuditLogs(actor, { actionPrefix: f || undefined, before }));
  const tz = actor.timezone;

  return (
    <>
      <PageHeader title="Журнал действий" subtitle="Записи нельзя изменить или удалить — это запрещено на уровне базы данных" />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((x) => (
          <Link
            key={x.key}
            href={x.key ? `/audit?f=${x.key}` : "/audit"}
            className={cx(
              "h-8 rounded-lg border px-3 text-sm leading-8 transition",
              x.key === f ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface hover:bg-surface-2",
            )}
          >
            {x.label}
          </Link>
        ))}
      </div>
      <Card className="overflow-x-auto">
        {rows.length ? (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="px-5 py-2.5 font-medium">Время</th>
                <th className="px-3 py-2.5 font-medium">Пользователь</th>
                <th className="px-3 py-2.5 font-medium">Действие</th>
                <th className="px-3 py-2.5 font-medium">Подробности</th>
                <th className="px-5 py-2.5 font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const link = r.entityType && r.entityId && ENTITY_LINK[r.entityType] && r.action !== "access.denied" ? ENTITY_LINK[r.entityType] + r.entityId : null;
                return (
                  <tr key={r.id} className={r.action === "access.denied" || r.action.startsWith("auth.lock") ? "bg-danger-bg/40" : ""}>
                    <td className="whitespace-nowrap px-5 py-2.5 tabular-nums text-muted">{fmt(r.createdAt, "dd.MM.yyyy HH:mm:ss", tz)}</td>
                    <td className="px-3 py-2.5">{r.userName ?? <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2.5">
                      {link ? <Link href={link} className="text-primary hover:underline">{AUDIT_ACTIONS[r.action] ?? r.action}</Link> : (AUDIT_ACTIONS[r.action] ?? r.action)}
                    </td>
                    <td className="max-w-[360px] truncate px-3 py-2.5 text-muted">{summary(r.metadata)}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 tabular-nums text-muted">{r.ip ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <Empty>Записей нет</Empty>
        )}
      </Card>
      {nextBefore && (
        <div className="mt-4">
          <Link href={`/audit?${new URLSearchParams({ ...(f ? { f } : {}), before: String(nextBefore) })}`} className="text-sm text-primary hover:underline">
            Показать более ранние →
          </Link>
        </div>
      )}
    </>
  );
}
