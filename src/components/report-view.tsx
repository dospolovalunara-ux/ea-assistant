import type { ReportDoc } from "@/server/exports/render";
import { Card, CardHeader, Empty } from "./ui";

/** Отображение отчёта на экране — те же данные, что и в экспорте. */
export function ReportView({ doc }: { doc: ReportDoc }) {
  return (
    <div className="space-y-4">
      {doc.sections.map((s, i) =>
        s.kind === "text" ? (
          <Card key={i} className="px-5 py-4">
            {s.heading && <h3 className="mb-1 font-semibold">{s.heading}</h3>}
            {s.lines.map((l) => <p key={l} className="text-[15px]">{l}</p>)}
          </Card>
        ) : (
          <Card key={i} className="overflow-x-auto">
            {s.title && <CardHeader title={s.title} />}
            {s.rows.length ? (
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="border-b border-border text-left text-muted">{s.columns.map((c) => <th key={c} className="px-5 py-2 font-medium">{c}</th>)}</tr></thead>
                <tbody className="divide-y divide-border">{s.rows.map((r, ri) => <tr key={ri}>{r.map((v, ci) => <td key={ci} className="px-5 py-2">{v ?? ""}</td>)}</tr>)}</tbody>
              </table>
            ) : <Empty>Нет данных</Empty>}
          </Card>
        ),
      )}
    </div>
  );
}
