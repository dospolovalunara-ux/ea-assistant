import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/auth/rbac";
import { listMeetings } from "@/server/services/protocols";
import { orNotFound } from "@/server/page-guard";
import { Badge, ButtonLink, Card, Empty, PageHeader } from "@/components/ui";
import { fmt } from "@/lib/time";

export const metadata = { title: "Совещания и протоколы" };

export default async function MeetingsPage() {
  const actor = await requireActor();
  const rows = await orNotFound(listMeetings(actor));
  return (
    <>
      <PageHeader
        title="Совещания и протоколы"
        subtitle={can(actor, "protocols.write") ? "Черновики и утверждённые протоколы" : "Утверждённые протоколы"}
        actions={can(actor, "protocols.write") && <ButtonLink href="/meetings/new">+ Совещание</ButtonLink>}
      />
      <Card>
        {rows.length ? (
          <ul className="divide-y divide-border">
            {rows.map((m) => (
              <li key={m.id}>
                <Link href={`/meetings/${m.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-surface-2">
                  <span>
                    <span className="block font-medium">{m.title}</span>
                    <span className="text-sm text-muted">{fmt(m.heldAt, "d MMMM yyyy, HH:mm", actor.timezone)}{m.location ? ` · ${m.location}` : ""}</span>
                  </span>
                  <span className="flex gap-2">
                    {m.openItems > 0 && <Badge tone="warn">поручений к подтверждению: {m.openItems}</Badge>}
                    <Badge tone={m.status === "approved" ? "ok" : "warn"}>{m.status === "approved" ? "Утверждён" : m.version ? "Черновик" : "Нет протокола"}</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Совещаний пока нет</Empty>
        )}
      </Card>
    </>
  );
}
