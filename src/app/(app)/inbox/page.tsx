import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/auth/rbac";
import { listInbox } from "@/server/services/inbox";
import { aiStatus } from "@/server/integrations/ai";
import { orNotFound } from "@/server/page-guard";
import { Badge, Card, CardHeader, Empty, PageHeader, cx } from "@/components/ui";
import { NewInboxItem } from "@/components/inbox/new-item";
import { fmt } from "@/lib/time";

export const metadata = { title: "Входящие" };

const TABS = { new: "Новые", processed: "Обработанные", archived: "Архив" } as const;

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const actor = await requireActor();
  const { s } = await searchParams;
  const status = (s && s in TABS ? s : "new") as keyof typeof TABS;
  const items = await orNotFound(listInbox(actor, status));
  const ai = aiStatus();
  return (
    <>
      <PageHeader title="Входящие" subtitle="Материалы для разбора: AI предлагает, человек подтверждает" />
      <div className="mb-4">
        {ai.enabled ? <Badge tone="ok">AI включён: {ai.reason}</Badge> : <Badge tone="warn">AI выключен — {ai.reason}. Доступен ручной разбор.</Badge>}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_420px]">
        <div className="min-w-0">
          <nav className="mb-3 flex gap-1 border-b border-border">
            {(Object.keys(TABS) as (keyof typeof TABS)[]).map((k) => (
              <Link key={k} href={`/inbox?s=${k}`} className={cx("-mb-px border-b-2 px-3 py-2 text-sm", k === status ? "border-primary font-medium" : "border-transparent text-muted hover:text-text")}>
                {TABS[k]}
              </Link>
            ))}
          </nav>
          <Card>
            {items.length ? (
              <ul className="divide-y divide-border">
                {items.map((i) => (
                  <li key={i.id}>
                    <Link href={`/inbox/${i.id}`} className="block px-5 py-3 hover:bg-surface-2">
                      <p className="line-clamp-2 font-medium">{i.textContent ?? i.url ?? i.fileName ?? "Материал"}</p>
                      <p className="mt-0.5 text-sm text-muted">
                        {fmt(i.receivedAt, "d MMM, HH:mm", actor.timezone)} · {i.kind === "text" ? "текст" : i.kind === "file" ? "файл" : "ссылка"}
                        {i.sourceNote ? ` · ${i.sourceNote}` : ""}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Здесь пусто</Empty>
            )}
          </Card>
        </div>
        {can(actor, "inbox.write") && (
          <Card className="self-start">
            <CardHeader title="Добавить материал" subtitle="Ручная вставка и загрузка. Мессенджеры подключаются только официально." />
            <div className="p-5"><NewInboxItem /></div>
          </Card>
        )}
      </div>
    </>
  );
}
