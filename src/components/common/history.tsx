import { AUDIT_ACTIONS, FIELD_LABELS, EVENT_STATUSES, EVENT_TYPES, TASK_STATUSES, TASK_PRIORITIES, TASK_VISIBILITY, CALENDAR_KINDS, IMPORTANCE } from "@/lib/labels";
import { fmt } from "@/lib/time";
import { Empty } from "@/components/ui";

const VALUE_LABELS: Record<string, Record<string, string>> = {
  status: { ...EVENT_STATUSES, ...TASK_STATUSES },
  type: EVENT_TYPES,
  priority: TASK_PRIORITIES,
  visibility: TASK_VISIBILITY,
  calendarKind: CALENDAR_KINDS,
  importance: IMPORTANCE,
};

function show(field: string, v: unknown, tz: string, names: Record<string, string>): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "да" : "нет";
  if (typeof v === "string") {
    if (VALUE_LABELS[field]?.[v]) return VALUE_LABELS[field]![v]!;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) return fmt(new Date(v), "d MMM yyyy, HH:mm", tz);
    if (v.startsWith("user:")) return names[v.slice(5)] ?? "пользователь";
    return v.length > 120 ? v.slice(0, 120) + "…" : v;
  }
  return String(v);
}

export interface HistoryRow {
  id: number;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  userName: string | null;
}

/** История изменений записи из журнала действий: кто, когда, что было → что стало. */
export function History({ rows, tz, names = {} }: { rows: HistoryRow[]; tz: string; names?: Record<string, string> }) {
  if (!rows.length) return <Empty>Изменений пока нет</Empty>;
  return (
    <ol className="divide-y divide-border">
      {rows.map((r) => {
        const changes = (r.metadata?.changes ?? {}) as Record<string, { from: unknown; to: unknown }>;
        return (
          <li key={r.id} className="px-5 py-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="font-medium">{AUDIT_ACTIONS[r.action] ?? r.action}</span>
              <span className="text-muted">
                {r.userName ?? "Система"} · {fmt(r.createdAt, "d MMM yyyy, HH:mm", tz)}
              </span>
            </div>
            {Object.keys(changes).length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-muted">
                {Object.entries(changes).map(([k, c]) => (
                  <li key={k}>
                    <span className="text-text">{FIELD_LABELS[k] ?? k}:</span> {show(k, c.from, tz, names)} → {show(k, c.to, tz, names)}
                  </li>
                ))}
              </ul>
            )}
            {Boolean(r.metadata?.overlapConfirmed) && <p className="mt-1 text-warn">Сохранено с подтверждённым пересечением</p>}
            {typeof r.metadata?.reason === "string" && r.metadata.reason && <p className="mt-1 text-muted">Причина: {r.metadata.reason}</p>}
          </li>
        );
      })}
    </ol>
  );
}
