import { TZDate } from "@date-fns/tz";
import { addDays, format, startOfDay, startOfWeek } from "date-fns";
import { ru } from "date-fns/locale";

export const DEFAULT_TZ = "Asia/Almaty";

/** "2026-11-07T10:30" в заданном поясе → момент времени (UTC). */
export function parseLocalDateTime(value: string, tz: string = DEFAULT_TZ): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00"] = m;
  const date = new TZDate(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0, tz);
  if (date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) return null;
  return new Date(date.getTime());
}

/** "2026-11-07" → полночь этого дня в заданном поясе. */
export function parseLocalDate(value: string, tz: string = DEFAULT_TZ): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  return parseLocalDateTime(value, tz);
}

export function inTz(date: Date, tz: string = DEFAULT_TZ): TZDate {
  return new TZDate(date.getTime(), tz);
}

export function fmt(date: Date, pattern: string, tz: string = DEFAULT_TZ): string {
  return format(inTz(date, tz), pattern, { locale: ru });
}

/** Значение для <input type="datetime-local">. */
export function toLocalInput(date: Date | null | undefined, tz: string = DEFAULT_TZ): string {
  return date ? fmt(date, "yyyy-MM-dd'T'HH:mm", tz) : "";
}

export function toLocalDateInput(date: Date | null | undefined, tz: string = DEFAULT_TZ): string {
  return date ? fmt(date, "yyyy-MM-dd", tz) : "";
}

/** Начало местного дня (как момент UTC). */
export function localDayStart(date: Date, tz: string = DEFAULT_TZ): Date {
  return new Date(startOfDay(inTz(date, tz)).getTime());
}

export function localDayEnd(date: Date, tz: string = DEFAULT_TZ): Date {
  return new Date(addDays(startOfDay(inTz(date, tz)), 1).getTime());
}

/** Начало местной недели (понедельник). */
export function localWeekStart(date: Date, tz: string = DEFAULT_TZ): Date {
  return new Date(startOfWeek(inTz(date, tz), { weekStartsOn: 1 }).getTime());
}

export function addLocalDays(date: Date, days: number, tz: string = DEFAULT_TZ): Date {
  return new Date(addDays(inTz(date, tz), days).getTime());
}

/** Минуты от начала местного дня. */
export function minutesOfLocalDay(date: Date, tz: string = DEFAULT_TZ): number {
  const z = inTz(date, tz);
  return z.getHours() * 60 + z.getMinutes();
}
