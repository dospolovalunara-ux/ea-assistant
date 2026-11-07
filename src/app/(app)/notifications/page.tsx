import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { listNotifications } from "@/server/services/notifications";
import { markReadAction } from "@/server/actions/modules";
import { Button, Card, Empty, PageHeader, cx } from "@/components/ui";
import { fmt } from "@/lib/time";

export const metadata = { title: "Уведомления" };

export default async function NotificationsPage() {
  const actor = await requireActor();
  const rows = await listNotifications(actor);
  return (
    <>
      <PageHeader
        title="Уведомления"
        subtitle="Напоминания о встречах и сроках, утренний брифинг, сроки документов. Каналы email и Telegram — после согласования."
        actions={rows.some((r) => !r.readAt) && <form action={markReadAction}><input type="hidden" name="id" value="all" /><Button variant="secondary">Отметить все прочитанными</Button></form>}
      />
      <Card>
        {rows.length ? (
          <ul className="divide-y divide-border">
            {rows.map((n) => (
              <li key={n.id} className={cx("flex items-start gap-3 px-5 py-3", !n.readAt && "bg-primary/5")}>
                <span className={cx("mt-2 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} />
                <div className="min-w-0 flex-1">
                  {n.link ? <Link href={n.link} className="font-medium hover:underline">{n.title}</Link> : <p className="font-medium">{n.title}</p>}
                  {n.body && <p className="text-sm text-muted">{n.body}</p>}
                  <p className="text-xs text-muted">{fmt(n.createdAt, "d MMM, HH:mm", actor.timezone)}</p>
                </div>
                {!n.readAt && <form action={markReadAction}><input type="hidden" name="id" value={n.id} /><button className="text-xs text-muted hover:text-text">Прочитано</button></form>}
              </li>
            ))}
          </ul>
        ) : <Empty>Уведомлений пока нет. Они появятся, когда наступит время напоминаний.</Empty>}
      </Card>
    </>
  );
}
