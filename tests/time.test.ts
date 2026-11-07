import { describe, expect, it } from "vitest";
import { localDayStart, localWeekStart, parseLocalDateTime, toLocalInput } from "@/lib/time";

describe("Часовой пояс Asia/Almaty", () => {
  it("местное время переводится в UTC (UTC+5)", () => {
    expect(parseLocalDateTime("2026-11-07T10:00", "Asia/Almaty")?.toISOString()).toBe("2026-11-07T05:00:00.000Z");
  });
  it("неверная дата отклоняется", () => {
    expect(parseLocalDateTime("2026-02-30T10:00")).toBeNull();
    expect(parseLocalDateTime("завтра")).toBeNull();
  });
  it("начало местного дня и недели (понедельник)", () => {
    const d = new Date("2026-11-07T21:30:00Z"); // 8 ноября 02:30 в Алматы, воскресенье
    expect(localDayStart(d).toISOString()).toBe("2026-11-07T19:00:00.000Z");
    expect(localWeekStart(d).toISOString()).toBe("2026-11-01T19:00:00.000Z");
  });
  it("значение для поля ввода показывается в местном времени", () => {
    expect(toLocalInput(new Date("2026-11-07T05:00:00Z"))).toBe("2026-11-07T10:00");
  });
});
