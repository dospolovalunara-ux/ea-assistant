import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { dailyReport, weeklyReport } from "@/server/services/reports";
import { orNotFound } from "@/server/page-guard";
import { PageHeader, cx } from "@/components/ui";
import { ReportView } from "@/components/report-view";

export const metadata = { title: "Отчёты" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const actor = await requireActor();
  const { r } = await searchParams;
  const kind = r === "daily" ? "daily" : "weekly";
  const doc = await orNotFound(kind === "daily" ? dailyReport(actor) : weeklyReport(actor));
  const pill = (on: boolean) => cx("rounded-lg border px-3 py-1.5 text-sm", on ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface hover:bg-surface-2");
  return (
    <>
      <PageHeader
        title="Отчёты"
        subtitle="Суммы и даты берутся из базы данных. Отчёт содержит только разделы, доступные вашей роли."
        actions={
          <span className="flex flex-wrap gap-2">
            {(["pdf", "docx", "xlsx"] as const).map((f) => <a key={f} href={`/api/export/${kind}?format=${f}`} className={pill(false)}>{f.toUpperCase()}</a>)}
          </span>
        }
      />
      <div className="mb-4 flex gap-2">
        <Link href="/reports" className={pill(kind === "weekly")}>Недельная сводка</Link>
        <Link href="/reports?r=daily" className={pill(kind === "daily")}>План на день</Link>
      </div>
      <h2 className="text-lg font-semibold">{doc.title}</h2>
      <p className="mb-4 text-sm text-muted">{doc.subtitle}</p>
      <ReportView doc={doc} />
    </>
  );
}
