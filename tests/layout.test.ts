import { describe, expect, it } from "vitest";
import { layoutDay } from "@/components/calendar/layout";

describe("Раскладка пересекающихся событий", () => {
  it("пересекающиеся встают рядом, непересекающиеся — во всю ширину", () => {
    const r = layoutDay([
      { id: "a", start: 600, end: 720 },
      { id: "b", start: 690, end: 735 },
      { id: "c", start: 800, end: 860 },
    ]);
    const by = Object.fromEntries(r.map((p) => [p.item.id, p]));
    expect(by.a).toMatchObject({ col: 0, cols: 2 });
    expect(by.b).toMatchObject({ col: 1, cols: 2 });
    expect(by.c).toMatchObject({ col: 0, cols: 1 });
  });
  it("освободившаяся колонка используется повторно", () => {
    const r = layoutDay([
      { id: "a", start: 0, end: 100 },
      { id: "b", start: 10, end: 30 },
      { id: "c", start: 40, end: 60 },
    ]);
    const by = Object.fromEntries(r.map((p) => [p.item.id, p]));
    expect(by.c!.col).toBe(1);
    expect(by.a!.cols).toBe(2);
  });
});
