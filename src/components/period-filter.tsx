import { Button, inputCls } from "./ui";

/** Фильтр периода (GET-форма, без JavaScript). */
export function PeriodFilter({ from, to, extra }: { from: string; to: string; extra?: Record<string, string> }) {
  return (
    <form className="flex flex-wrap items-end gap-2" method="get">
      {Object.entries(extra ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="text-sm">
        <span className="mb-1 block text-muted">С</span>
        <input type="date" name="from" defaultValue={from} className={`${inputCls} h-9 w-40`} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-muted">По</span>
        <input type="date" name="to" defaultValue={to} className={`${inputCls} h-9 w-40`} />
      </label>
      <Button type="submit" variant="secondary">Показать</Button>
    </form>
  );
}
