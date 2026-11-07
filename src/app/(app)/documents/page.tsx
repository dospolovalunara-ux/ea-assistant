import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/auth/rbac";
import { DOCUMENT_CATEGORIES, daysUntil, listDocuments, listOwners } from "@/server/services/documents";
import { orNotFound } from "@/server/page-guard";
import { Badge, Button, ButtonLink, Card, Empty, PageHeader, inputCls } from "@/components/ui";

export const metadata = { title: "Семейные документы" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ q?: string; owner?: string; category?: string; expiring?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const [docs, owners] = await orNotFound(Promise.all([listDocuments(actor, { q: sp.q, owner: sp.owner, category: sp.category, expiring: sp.expiring === "1" }), listOwners(actor)]));
  return (
    <>
      <PageHeader
        title="Семейные документы"
        subtitle="Каталог метаданных. Содержимое документов AI не передаётся. Каждый просмотр и скачивание записываются в журнал."
        actions={can(actor, "documents.write") && <ButtonLink href="/documents/new">+ Документ</ButtonLink>}
      />
      <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
        <input name="q" defaultValue={sp.q} placeholder="Поиск по названию и типу" className={`${inputCls} h-9 w-64`} />
        <select name="owner" defaultValue={sp.owner ?? ""} className={`${inputCls} h-9 w-48`}><option value="">Все владельцы</option>{owners.map((o) => <option key={o}>{o}</option>)}</select>
        <select name="category" defaultValue={sp.category ?? ""} className={`${inputCls} h-9 w-56`}><option value="">Все категории</option>{DOCUMENT_CATEGORIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
        <label className="inline-flex h-9 items-center gap-2 text-sm"><input type="checkbox" name="expiring" value="1" defaultChecked={sp.expiring === "1"} /> срок ≤ 60 дней</label>
        <Button type="submit" variant="secondary">Найти</Button>
      </form>
      <Card>
        {docs.length ? (
          <ul className="divide-y divide-border">
            {docs.map((d) => {
              const days = daysUntil(d.expiresOn, actor.timezone);
              return (
                <li key={d.id}>
                  <Link href={`/documents/${d.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-surface-2">
                    <span><span className="block font-medium">{d.title}</span><span className="text-sm text-muted">{d.ownerName} · {d.categoryName}{d.docType ? ` · ${d.docType}` : ""}</span></span>
                    <span className="flex flex-wrap gap-1.5">
                      {d.confidentiality === "high" && <Badge tone="primary">Высокая конфиденциальность</Badge>}
                      {!d.hasFile && <Badge>Без файла</Badge>}
                      {days !== null && <Badge tone={days < 0 ? "danger" : days <= 30 ? "warn" : "neutral"}>{days < 0 ? "Срок истёк" : `до ${d.expiresOn} (${days} дн.)`}</Badge>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : <Empty>Документов нет</Empty>}
      </Card>
    </>
  );
}
