import { beforeAll, describe, expect, it } from "vitest";
import { freshDb, type TestCtx } from "./helpers";
import { NotFoundError, ForbiddenError } from "@/server/errors";
import { analyzeInboxItem, archiveInboxItem, confirmInboxItem, createInboxItem, listInbox } from "@/server/services/inbox";
import { addExpenseDocument, createCorporateExpense, getCorporateExpense, listCorporateExpenses } from "@/server/services/corporate-expenses";
import { createPersonalExpenses, createTransfer, personalBalance } from "@/server/services/personal-expenses";
import { approveProtocol, createMeeting, getMeeting, listMeetings, saveProtocol } from "@/server/services/protocols";
import { createDocument, getDocument, listDocuments } from "@/server/services/documents";
import { weeklyReport } from "@/server/services/reports";
import { createUser, listUsers, updateUser } from "@/server/services/users";
import { listVaultRefs } from "@/server/services/vault";
import { readFileForDownload } from "@/server/services/files";

let ctx: TestCtx;
let corpId: string;
let meetingId: string;
let docId: string;
let secretDocId: string;
let inboxId: string;

beforeAll(async () => {
  ctx = await freshDb();
  corpId = (await createCorporateExpense(ctx.assistant, { spentAt: "2026-11-05T13:00", amount: "38500", organization: "Ресторан", category: "business_lunch" })).id;
  meetingId = (await createMeeting(ctx.assistant, { title: "Совещание", heldAt: "2026-11-05T10:00", transcript: "текст" })).id;
  docId = (await createDocument(ctx.assistant, { title: "Паспорт", categoryCode: "executive", ownerName: "Динара", expiresOn: "2027-01-01" })).id;
  secretDocId = (await createDocument(ctx.assistant, { title: "Секретный", categoryCode: "children", ownerName: "Алия", confidentiality: "high" })).id;
  inboxId = (await createInboxItem(ctx.assistant, { kind: "text", text: "Встреча завтра" })).id;
});

const nf = (p: Promise<unknown>) => expect(p).rejects.toBeInstanceOf(NotFoundError);
const R = { from: new Date("2026-01-01"), to: new Date("2027-01-01") };

describe("RBAC: входящие (inbox.*)", () => {
  it("тех. админ не видит входящие", async () => {
    await nf(listInbox(ctx.techAdmin));
  });
  it("руководитель видит, но не добавляет и не разбирает", async () => {
    await expect(listInbox(ctx.executive)).resolves.toBeDefined();
    await nf(createInboxItem(ctx.executive, { kind: "text", text: "x" }));
    await nf(analyzeInboxItem(ctx.executive, inboxId));
    await nf(archiveInboxItem(ctx.executive, inboxId));
  });
  it("руководитель с inbox.decide не может создать событие в обход calendar.write", async () => {
    await expect(confirmInboxItem(ctx.executive, inboxId, "event", {})).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("RBAC: корпоративные и личные расходы — раздельные права", () => {
  it("руководитель не видит корпоративные расходы ни списком, ни по id", async () => {
    await nf(listCorporateExpenses(ctx.executive, R));
    await nf(getCorporateExpense(ctx.executive, corpId));
    await nf(createCorporateExpense(ctx.executive, {}));
  });
  it("руководитель видит личные расходы, но не меняет их", async () => {
    await expect(personalBalance(ctx.executive)).resolves.toBeDefined();
    await nf(createTransfer(ctx.executive, { kind: "income", amount: "1", occurredAt: "2026-11-01T10:00" }));
    await nf(createPersonalExpenses(ctx.executive, [{ description: "x", amount: "1", category: "food" }], { spentAt: "2026-11-01T10:00" }));
  });
  it("тех. админ не видит финансы", async () => {
    await nf(personalBalance(ctx.techAdmin));
    await nf(listCorporateExpenses(ctx.techAdmin, R));
  });
  it("файл чека не скачать без права на корпоративные расходы", async () => {
    await addExpenseDocument(ctx.assistant, corpId, "fiscal_receipt", new File([Buffer.from("%PDF-1.4 test")], "check.pdf"));
    const e = await getCorporateExpense(ctx.assistant, corpId);
    await nf(readFileForDownload(ctx.executive, e.docs[0]!.fileId));
    await expect(readFileForDownload(ctx.assistant, e.docs[0]!.fileId)).resolves.toHaveProperty("mime", "application/pdf");
  });
});

describe("RBAC: протоколы (protocols.*)", () => {
  it("руководитель не видит черновик протокола", async () => {
    expect((await listMeetings(ctx.executive)).map((m) => m.id)).not.toContain(meetingId);
    await nf(getMeeting(ctx.executive, meetingId));
    await nf(saveProtocol(ctx.executive, meetingId, {}));
  });
  it("после утверждения — видит, но без расшифровки", async () => {
    await saveProtocol(ctx.assistant, meetingId, { summary: "Итог", decisions: "Решение" });
    await approveProtocol(ctx.assistant, meetingId);
    const m = await getMeeting(ctx.executive, meetingId);
    expect(m.protocol.status).toBe("approved");
    expect(m.transcript).toBeNull();
  });
  it("тех. админ не видит протоколы", async () => {
    await nf(listMeetings(ctx.techAdmin));
  });
});

describe("RBAC: семейные документы (documents.*)", () => {
  it("руководитель видит обычный документ, но не секретный без точечного доступа", async () => {
    await expect(getDocument(ctx.executive, docId)).resolves.toHaveProperty("title", "Паспорт");
    await nf(getDocument(ctx.executive, secretDocId));
    expect((await listDocuments(ctx.executive)).map((d) => d.id)).not.toContain(secretDocId);
  });
  it("руководитель не создаёт документы, тех. админ ничего не видит", async () => {
    await nf(createDocument(ctx.executive, { title: "x", categoryCode: "other", ownerName: "y" }));
    await nf(listDocuments(ctx.techAdmin));
    await nf(getDocument(ctx.techAdmin, docId));
  });
});

describe("RBAC: отчёты, пользователи, интеграции", () => {
  it("тех. админ не получает отчёты", async () => {
    await nf(weeklyReport(ctx.techAdmin));
  });
  it("отчёт руководителя не содержит корпоративных расходов", async () => {
    const r = await weeklyReport(ctx.executive);
    expect(JSON.stringify(r)).not.toContain("Корпоративные расходы");
  });
  it("управлять пользователями может только тех. админ", async () => {
    await nf(listUsers(ctx.assistant));
    await nf(createUser(ctx.executive, {}));
    await expect(listUsers(ctx.techAdmin)).resolves.toHaveLength(3);
  });
  it("тех. админ не может отключить сам себя", async () => {
    await expect(updateUser(ctx.techAdmin, ctx.techAdmin.id, { isActive: false })).rejects.toThrow();
  });
  it("ссылки на менеджер паролей — только с integrations.manage", async () => {
    await nf(listVaultRefs(ctx.executive));
    await nf(listVaultRefs(ctx.techAdmin));
  });
});
