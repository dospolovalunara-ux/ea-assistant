import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb, type TestCtx } from "./helpers";
import { addExpenseDocument, createCorporateExpense, getCorporateExpense } from "@/server/services/corporate-expenses";
import { readFileForDownload } from "@/server/services/files";
import { maybeTick } from "@/server/scheduler/maybe-tick";

let ctx: TestCtx;
beforeAll(async () => {
  process.env.FILE_STORAGE = "db";
  ctx = await freshDb();
});
afterAll(() => {
  delete process.env.FILE_STORAGE;
});

describe("Хостинг без диска", () => {
  it("файл сохраняется в базе и выдаётся с проверкой прав", async () => {
    const { id } = await createCorporateExpense(ctx.assistant, { spentAt: "2026-11-05T13:00", amount: "100", organization: "Кафе", category: "other" });
    await addExpenseDocument(ctx.assistant, id, "fiscal_receipt", new File([Buffer.from("%PDF-1.4 db")], "чек.pdf"));
    const e = await getCorporateExpense(ctx.assistant, id);
    const f = await readFileForDownload(ctx.assistant, e.docs[0]!.fileId);
    expect(f.data.toString()).toBe("%PDF-1.4 db");
  });
  it("проход планировщика по запросам — не чаще раза в минуту", async () => {
    const now = new Date();
    expect(await maybeTick(now)).toBe(true);
    expect(await maybeTick(new Date(now.getTime() + 10_000))).toBe(false);
    expect(await maybeTick(new Date(now.getTime() + 61_000))).toBe(true);
  });
});
