import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { freshDb, type TestCtx } from "./helpers";
import { getDb } from "@/server/db";
import { aiExtractions, calendarEvents, inboxItems, notifications, tasks } from "@/server/db/schema";
import { ValidationError } from "@/server/errors";
import { AiUnavailableError, setAiProviderForTests, type AiProvider } from "@/server/integrations/ai";
import { analyzeInboxItem, confirmInboxItem, createInboxItem, getInboxItem, rejectExtraction } from "@/server/services/inbox";
import { DuplicateWarning, createCorporateExpense, getCorporateExpense, listCorporateExpenses, voidCorporateExpense, addExpenseDocument } from "@/server/services/corporate-expenses";
import { createPersonalExpenses, createTransfer, listTransfers, personalBalance } from "@/server/services/personal-expenses";
import { approveProtocol, confirmActionItem, createMeeting, draftProtocolWithAi, getMeeting, protocolFromForm, saveProtocol } from "@/server/services/protocols";
import { createDocument, maskNumber } from "@/server/services/documents";
import { createEvent } from "@/server/services/calendar";
import { runTick } from "@/server/scheduler/tick";
import { computeFreeSlots } from "@/server/services/calendar";
import { detectFileType } from "@/server/services/files";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import { parseAmount, parseExpenseText, toMinor, fromMinor } from "@/lib/money";
import { toGoogleEvent } from "@/server/integrations/google-calendar";
import { toXlsx, toPdf, toDocx } from "@/server/exports/render";
import { corporateRegister } from "@/server/services/reports";

let ctx: TestCtx;
const fake: AiProvider = {
  name: "test",
  model: "test-model",
  async extractInbox() {
    return {
      category: "meeting",
      confidence: 0.82,
      fields: { title: { value: "Встреча с банком", source: "встретимся с банком", kind: "fact" }, start: { value: "2026-11-10T15:00", source: "во вторник в 15:00", kind: "inference" } },
      questions: ["Кто ещё участвует?"],
    };
  },
  async draftProtocol() {
    return { participants: ["Динара"], agenda: ["Итоги"], summary: "Обсудили итоги", decisions: [{ text: "Утвердить план", source: "утверждаем", needsReview: false }], actionItems: [{ title: "Отчёт", assignee: "Ерлан", due: "2026-11-20", source: "к 20 числу", needsReview: true }], questions: [] };
  },
};

beforeAll(async () => {
  ctx = await freshDb();
});
afterAll(() => setAiProviderForTests(undefined));

describe("Входящие и AI", () => {
  it("AI пишет только в ai_extractions; рабочие таблицы не меняются до подтверждения", async () => {
    setAiProviderForTests(fake);
    const { id } = await createInboxItem(ctx.assistant, { kind: "text", text: "Давайте встретимся с банком во вторник в 15:00" });
    const before = (await getDb().select().from(calendarEvents)).length;
    await analyzeInboxItem(ctx.assistant, id);
    expect((await getDb().select().from(calendarEvents)).length).toBe(before);
    const ext = await getDb().select().from(aiExtractions).where(eq(aiExtractions.inboxItemId, id));
    expect(ext).toHaveLength(1);
    expect(ext[0]!.status).toBe("proposed");
    // подтверждение человеком
    const r = await confirmInboxItem(ctx.assistant, id, "event", { title: "Встреча с банком", type: "work_meeting", calendarKind: "work", start: "2026-11-10T15:00", end: "2026-11-10T16:00" }, { extractionId: ext[0]!.id });
    const [after] = await getDb().select().from(aiExtractions).where(eq(aiExtractions.id, ext[0]!.id));
    expect(after!.status).toBe("confirmed");
    expect(after!.resultEntityId).toBe(r.id);
    expect((await getInboxItem(ctx.assistant, id)).status).toBe("processed");
  });

  it("предложение можно отклонить; повторно подтвердить нельзя", async () => {
    setAiProviderForTests(fake);
    const { id } = await createInboxItem(ctx.assistant, { kind: "text", text: "встреча" });
    await analyzeInboxItem(ctx.assistant, id);
    const [ext] = await getDb().select().from(aiExtractions).where(eq(aiExtractions.inboxItemId, id));
    await rejectExtraction(ctx.assistant, id, ext!.id);
    await expect(confirmInboxItem(ctx.assistant, id, "task", { title: "x" }, { extractionId: ext!.id })).rejects.toBeInstanceOf(ValidationError);
  });

  it("при недоступном AI — понятная ошибка, ручной режим работает", async () => {
    setAiProviderForTests(null);
    const { id } = await createInboxItem(ctx.assistant, { kind: "text", text: "Подготовить справку до пятницы" });
    await expect(analyzeInboxItem(ctx.assistant, id)).rejects.toBeInstanceOf(AiUnavailableError);
    const r = await confirmInboxItem(ctx.assistant, id, "task", { title: "Подготовить справку" });
    const [t] = await getDb().select().from(tasks).where(eq(tasks.id, r.id));
    expect(t!.source).toMatch(/^Входящие/);
    const [m] = await getDb().select().from(aiExtractions).where(eq(aiExtractions.inboxItemId, id));
    expect(m!.provider).toBe("manual");
  });

  it("ссылка принимается только http/https", async () => {
    await expect(createInboxItem(ctx.assistant, { kind: "link", url: "javascript:alert(1)" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createInboxItem(ctx.assistant, { kind: "link", url: "https://example.com/a" })).resolves.toHaveProperty("id");
    expect((await getDb().select().from(inboxItems)).length).toBeGreaterThan(0);
  });
});

describe("Деньги — только детерминированный код", () => {
  it("разбирает суммы без float", () => {
    expect(parseAmount("4 500,50")).toBe("4500.50");
    expect(parseAmount("1200")).toBe("1200.00");
    expect(parseAmount("12тг")).toBe("12.00");
    expect(parseAmount("abc")).toBeNull();
    expect(fromMinor(toMinor("0.10") + toMinor("0.20"))).toBe("0.30");
  });
  it("«обед 4500, кофе 1200» → две операции", () => {
    expect(parseExpenseText("обед 4500, кофе 1200")).toEqual({ items: [{ description: "обед", amount: "4500.00" }, { description: "кофе", amount: "1200.00" }], errors: [] });
    expect(parseExpenseText("непонятно").errors).toHaveLength(1);
  });
});

describe("Корпоративные расходы", () => {
  it("находит возможный дубликат и сохраняет только после подтверждения", async () => {
    await createCorporateExpense(ctx.assistant, { spentAt: "2026-11-03T13:00", amount: "15000", organization: "Кафе", category: "business_lunch" });
    await expect(createCorporateExpense(ctx.assistant, { spentAt: "2026-11-03T20:00", amount: "15000,00", organization: "Кафе 2", category: "business_lunch" })).rejects.toBeInstanceOf(DuplicateWarning);
    await expect(createCorporateExpense(ctx.assistant, { spentAt: "2026-11-03T20:00", amount: "15000", organization: "Кафе 2", category: "business_lunch" }, { confirmDuplicate: true })).resolves.toHaveProperty("id");
  });
  it("чек-лист документов и аннулирование без удаления", async () => {
    const { id } = await createCorporateExpense(ctx.assistant, { spentAt: "2026-11-04T13:00", amount: "777", organization: "Такси", category: "taxi" });
    expect((await getCorporateExpense(ctx.assistant, id)).missingDocs).toEqual(["fiscal_receipt", "payment_confirmation"]);
    await addExpenseDocument(ctx.assistant, id, "fiscal_receipt", new File([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2])], "чек.jpg"));
    expect((await getCorporateExpense(ctx.assistant, id)).missingDocs).toEqual(["payment_confirmation"]);
    await expect(voidCorporateExpense(ctx.assistant, id, "")).rejects.toBeInstanceOf(ValidationError);
    await voidCorporateExpense(ctx.assistant, id, "ошибочный");
    const list = await listCorporateExpenses(ctx.assistant, { from: new Date("2026-11-01"), to: new Date("2026-12-01") });
    expect(list.find((e) => e.id === id)?.status).toBe("void");
  });
  it("файл проверяется по содержимому, а не по расширению", async () => {
    expect(detectFileType(Buffer.from("MZ\x90\x00"), "чек.pdf")).toBeNull();
    expect(detectFileType(Buffer.from("%PDF-1.7"), "a.pdf")?.mime).toBe("application/pdf");
    const { id } = await createCorporateExpense(ctx.assistant, { spentAt: "2026-11-06T10:00", amount: "1", organization: "x", category: "other" });
    await expect(addExpenseDocument(ctx.assistant, id, "other", new File([Buffer.from("<script>alert(1)</script>")], "x.pdf"))).rejects.toBeInstanceOf(ValidationError);
  });
  it("реестр экспортируется в XLSX, PDF и DOCX", async () => {
    const doc = await corporateRegister(ctx.assistant, { from: new Date("2026-11-01"), to: new Date("2026-12-01") });
    const [x, p, d] = await Promise.all([toXlsx(doc), toPdf(doc), toDocx(doc)]);
    expect(x.subarray(0, 2).toString()).toBe("PK");
    expect(p.subarray(0, 5).toString()).toBe("%PDF-");
    expect(d.subarray(0, 2).toString()).toBe("PK");
  });
});

describe("Личные расходы", () => {
  it("баланс по передаче и общий считаются верно", async () => {
    const { id } = await createTransfer(ctx.assistant, { kind: "income", amount: "100000", occurredAt: "2026-11-01T10:00" });
    await createPersonalExpenses(ctx.assistant, [{ description: "обед", amount: "4500", category: "food" }, { description: "кофе", amount: "1200,50", category: "food" }], { spentAt: "2026-11-02T13:00", transferId: id });
    await createTransfer(ctx.assistant, { kind: "refund", amount: "10000", occurredAt: "2026-11-03T10:00", parentId: id });
    await createTransfer(ctx.assistant, { kind: "adjustment", amount: "-99.50", occurredAt: "2026-11-03T11:00", parentId: id, reason: "сверка" });
    const t = (await listTransfers(ctx.assistant)).find((x) => x.id === id)!;
    expect(t.remaining).toBe("84200.00"); // 100000 − 5700.50 − 10000 − 99.50
    const b = await personalBalance(ctx.assistant);
    expect(b.balance).toBe("84200.00");
  });
  it("корректировка без причины и возврат без передачи отклоняются", async () => {
    await expect(createTransfer(ctx.assistant, { kind: "adjustment", amount: "10", occurredAt: "2026-11-03T10:00" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createTransfer(ctx.assistant, { kind: "refund", amount: "10", occurredAt: "2026-11-03T10:00" })).rejects.toBeInstanceOf(ValidationError);
  });
  it("корпоративные и личные расходы не объединяются", async () => {
    const corp = await listCorporateExpenses(ctx.assistant, { from: new Date("2026-01-01"), to: new Date("2027-01-01") });
    expect(corp.some((c) => c.organization === "обед")).toBe(false);
  });
});

describe("Протоколы", () => {
  it("AI-черновик → проверка → утверждение → поручение становится задачей", async () => {
    setAiProviderForTests(fake);
    const ev = await createEvent(ctx.assistant, { title: "Совет", type: "work_meeting", calendarKind: "work", start: "2026-11-20T10:00", end: "2026-11-20T11:00" });
    const { id } = await createMeeting(ctx.assistant, { title: "Совет", heldAt: "2026-11-20T10:00", transcript: "Ерлан, отчёт к 20 числу", eventId: ev.id });
    await draftProtocolWithAi(ctx.assistant, id);
    let m = await getMeeting(ctx.assistant, id);
    expect(m.currentSource).toBe("ai");
    // пункт с «требует проверки» не даёт утвердить
    await expect(approveProtocol(ctx.assistant, id)).rejects.toBeInstanceOf(ValidationError);
    await saveProtocol(ctx.assistant, id, { participants: "Динара", decisions: "Утвердить план", actionItems: "Отчёт | Ерлан | 2026-11-20" });
    await approveProtocol(ctx.assistant, id);
    m = await getMeeting(ctx.assistant, id);
    expect(m.protocol.status).toBe("approved");
    expect(m.versions).toHaveLength(2);
    const taskId = await confirmActionItem(ctx.assistant, id, m.actionItems[0]!.id, "confirm");
    const [t] = await getDb().select().from(tasks).where(eq(tasks.id, taskId!));
    expect(t!.relatedEventId).toBe(ev.id);
    expect(t!.assigneeName).toBe("Ерлан");
  });
  it("неверный срок поручения отклоняется", () => {
    expect(() => protocolFromForm({ actionItems: "Отчёт | Ерлан | завтра" })).toThrow(ValidationError);
  });
});

describe("Документы, планировщик, интеграции", () => {
  it("номер документа хранится только маской", () => {
    expect(maskNumber("N 1234 5678")).toBe("••••5678");
  });
  it("планировщик создаёт уведомления один раз (идемпотентно)", async () => {
    await createDocument(ctx.assistant, { title: "Полис", categoryCode: "insurance", ownerName: "Динара", expiresOn: "2026-11-20" });
    const now = new Date("2026-11-07T06:00:00Z");
    const a = await runTick(now);
    const b = await runTick(now);
    expect(a.documents).toBeGreaterThan(0);
    expect(b.documents).toBe(0);
    const n = await getDb().select().from(notifications).where(eq(notifications.kind, "document_expiry"));
    expect(n.every((x) => !x.body?.includes("••••"))).toBe(true);
  });
  it("свободные интервалы вычисляются по занятому времени", () => {
    const d = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 10, h, m));
    const free = computeFreeSlots([{ startsAt: d(5), endsAt: d(6) }, { startsAt: d(5, 30), endsAt: d(7) }], d(4), d(9), 30);
    expect(free.map((f) => [f.start.getUTCHours(), f.end.getUTCHours()])).toEqual([[4, 5], [7, 9]]);
  });
  it("секреты шифруются AES-256-GCM и не читаются без ключа", () => {
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const enc = encryptSecret("refresh-token-demo");
    expect(enc).not.toContain("refresh");
    expect(decryptSecret(enc)).toBe("refresh-token-demo");
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    expect(() => decryptSecret(enc)).toThrow();
  });
  it("событие корректно переводится в формат Google", () => {
    const g = toGoogleEvent({ title: "T", startsAt: new Date("2026-11-10T05:00:00Z"), endsAt: new Date("2026-11-10T06:00:00Z"), allDay: false, timezone: "Asia/Almaty", location: null, agenda: null, videoUrl: null, status: "pending" });
    expect(g.start).toEqual({ dateTime: "2026-11-10T05:00:00.000Z", timeZone: "Asia/Almaty" });
    expect(g.status).toBe("tentative");
  });
});
