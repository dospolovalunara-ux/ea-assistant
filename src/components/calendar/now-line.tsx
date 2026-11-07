"use client";

import { useEffect, useState } from "react";

/** Красная линия текущего времени в колонке дня. Обновляется раз в минуту. */
export function NowLine({ dayStart, dayEnd, hourHeight }: { dayStart: number; dayEnd: number; hourHeight: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  if (now === null || now < dayStart || now >= dayEnd) return null;
  const top = ((now - dayStart) / 3_600_000) * hourHeight;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top }} aria-label="Текущее время">
      <div className="relative h-0.5 bg-red-500">
        <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-red-500" />
      </div>
    </div>
  );
}

/** Прокручивает сетку к рабочему времени при открытии. */
export function ScrollToHour({ targetId, hour, hourHeight }: { targetId: string; hour: number; hourHeight: number }) {
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (el) el.scrollTop = hour * hourHeight;
  }, [targetId, hour, hourHeight]);
  return null;
}
