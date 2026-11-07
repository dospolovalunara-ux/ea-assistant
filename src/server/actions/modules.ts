"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "../auth/current";
import { formToObject, toActionState } from "./result";
import type { ActionState } from "@/lib/action-state";
import { markRead } from "../services/notifications";
import { analyzeInboxItem, archiveInboxItem, confirmInboxItem, createInboxItem, finishItem, rejectExtraction } from "../services/inbox";
import { addExpenseDocument, createCorporateExpense, updateCorporateExpense, voidCorporateExpense } from "../services/corporate-expenses";
import { createPersonalExpenses, createTransfer } from "../services/personal-expenses";
import { approveProtocol, confirmActionItem, createMeeting, draftProtocolWithAi, saveProtocol } from "../services/protocols";
import { addDocumentVersion, archiveDocument, createDocument, setDocumentAccess, updateDocument } from "../services/documents";
import { createUser, updateOwnSettings, updateUser } from "../services/users";
import { beginMfaEnrollment, confirmMfaEnrollment, disableMfa } from "../auth/mfa";
import { disconnectGoogle } from "../integrations/google-calendar";
import { addVaultRef } from "../services/vault";
import { parseExpenseText } from "@/lib/money";

const refresh = () => revalidatePath("/", "layout");
const file = (fd: FormData, k = "file") => {
  const f = fd.get(k);
  return f instanceof File && f.size > 0 ? f : null;
};

// ---------- Уведомления ----------
export async function markReadAction(fd: FormData) {
  const actor = await requireActor();
  await markRead(actor, String(fd.get("id") ?? "all") as string);
  refresh();
}

// ---------- Входящие ----------
export async function createInboxAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let id: string;
  try {
    ({ id } = await createInboxItem(actor, { kind: String(fd.get("kind")), text: String(fd.get("text") ?? ""), url: String(fd.get("url") ?? ""), sourceNote: String(fd.get("sourceNote") ?? ""), file: file(fd) }));
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  redirect(`/inbox/${id}`);
}

export async function analyzeInboxAction(itemId: string, _p: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await analyzeInboxItem(actor, itemId);
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  return { ok: true };
}

export async function confirmInboxAction(itemId: string, target: "event" | "task", extractionId: string | undefined, _p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(fd);
  let res;
  try {
    res = await confirmInboxItem(actor, itemId, target, values, { extractionId, confirmOverlap: fd.get("confirmOverlap") === "1" });
  } catch (e) {
    return toActionState(e, values);
  }
  refresh();
  redirect(res.entityType === "task" ? `/tasks/${res.id}` : `/calendar/${res.id}`);
}

export async function rejectExtractionAction(itemId: string, extractionId: string, _p: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await rejectExtraction(actor, itemId, extractionId);
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  return { ok: true };
}

export async function archiveInboxAction(itemId: string, _p: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await archiveInboxItem(actor, itemId);
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  redirect("/inbox");
}

// ---------- Корпоративные расходы ----------
export async function createCorporateAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(fd);
  let id: string;
  try {
    ({ id } = await createCorporateExpense(actor, values, { confirmDuplicate: fd.get("confirmDuplicate") === "1" }));
    const receipt = file(fd);
    if (receipt) await addExpenseDocument(actor, id, String(fd.get("docType") || "fiscal_receipt"), receipt);
    const inboxId = String(fd.get("inboxItemId") ?? "");
    if (inboxId) await finishItem(actor, inboxId, String(fd.get("extractionId") ?? "") || null, "corporate_expense", id, "corporate_expense", values);
  } catch (e) {
    return toActionState(e, values);
  }
  refresh();
  redirect(`/expenses/corporate/${id}`);
}

export async function updateCorporateAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(fd);
  try {
    await updateCorporateExpense(actor, id, values);
  } catch (e) {
    return toActionState(e, values);
  }
  refresh();
  redirect(`/expenses/corporate/${id}`);
}

export async function addExpenseDocAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const f = file(fd);
    if (!f) return { error: "Выберите файл" };
    await addExpenseDocument(actor, id, String(fd.get("docType") ?? ""), f);
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  return { ok: true };
}

export async function voidCorporateAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await voidCorporateExpense(actor, id, String(fd.get("reason") ?? ""));
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  return { ok: true };
}

// ---------- Личные расходы ----------
export async function createTransferAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await createTransfer(actor, formToObject(fd));
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  return { ok: true };
}

/** Шаг 1: разбор текста — только предпросмотр, ничего не сохраняется. */
export async function previewPersonalAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await requireActor();
  const parsed = parseExpenseText(String(fd.get("text") ?? ""));
  if (!parsed.items.length) return { error: parsed.errors[0] ?? "Введите операции, например: обед 4500, кофе 1200" };
  return { ok: true, data: { items: parsed.items, errors: parsed.errors } };
}

/** Шаг 2: пользователь подтвердил список операций. */
export async function savePersonalAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const items: { description: string; amount: string; category: string }[] = [];
  for (let i = 0; i < 50; i++) {
    if (!fd.has(`items.${i}.amount`)) break;
    if (fd.get(`items.${i}.include`) !== "on") continue;
    items.push({ description: String(fd.get(`items.${i}.description`) ?? ""), amount: String(fd.get(`items.${i}.amount`) ?? ""), category: String(fd.get(`items.${i}.category`) ?? "other") });
  }
  try {
    await createPersonalExpenses(actor, items, { spentAt: String(fd.get("spentAt") ?? ""), transferId: String(fd.get("transferId") ?? "") || undefined });
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  redirect("/expenses/personal?saved=1");
}

// ---------- Совещания и протоколы ----------
export async function createMeetingAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let id: string;
  try {
    ({ id } = await createMeeting(actor, formToObject(fd), file(fd)));
  } catch (e) {
    return toActionState(e, formToObject(fd));
  }
  refresh();
  redirect(`/meetings/${id}`);
}

export async function saveProtocolAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await saveProtocol(actor, id, formToObject(fd));
  } catch (e) {
    return toActionState(e, formToObject(fd));
  }
  refresh();
  return { ok: true };
}

export async function aiDraftAction(id: string, _p: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await draftProtocolWithAi(actor, id);
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  return { ok: true };
}

export async function approveProtocolAction(id: string, _p: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await approveProtocol(actor, id);
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  return { ok: true };
}

export async function actionItemAction(meetingId: string, itemId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await confirmActionItem(actor, meetingId, itemId, fd.get("decision") === "reject" ? "reject" : "confirm");
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  return { ok: true };
}

// ---------- Семейные документы ----------
export async function createDocumentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let id: string;
  try {
    ({ id } = await createDocument(actor, formToObject(fd), file(fd)));
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  redirect(`/documents/${id}`);
}

export async function updateDocumentAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await updateDocument(actor, id, formToObject(fd));
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  redirect(`/documents/${id}`);
}

export async function addDocumentVersionAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const f = file(fd);
    if (!f) return { error: "Выберите файл" };
    await addDocumentVersion(actor, id, f);
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  return { ok: true };
}

export async function documentAccessAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await setDocumentAccess(actor, id, String(fd.get("userId") ?? ""), (String(fd.get("mode")) as "none" | "view" | "download") ?? "none");
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  return { ok: true };
}

export async function archiveDocumentAction(id: string, _p: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await archiveDocument(actor, id);
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  redirect("/documents");
}

// ---------- Настройки и пользователи ----------
export async function settingsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await updateOwnSettings(actor, { timezone: String(fd.get("timezone") ?? ""), briefingTime: String(fd.get("briefingTime") ?? "") });
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  return { ok: true };
}

export async function mfaBeginAction(_p: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const r = await beginMfaEnrollment(actor);
    return { ok: true, data: r };
  } catch (e) {
    return toActionState(e);
  }
}

export async function mfaConfirmAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await confirmMfaEnrollment(actor, String(fd.get("code") ?? ""));
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  return { ok: true };
}

export async function mfaDisableAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await disableMfa(actor, String(fd.get("code") ?? ""));
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  return { ok: true };
}

export async function googleDisconnectAction(_p: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  if (!actor.permissions.has("integrations.manage")) return { error: "Недостаточно прав" };
  await disconnectGoogle(actor.id, actor.ip);
  refresh();
  return { ok: true };
}

export async function vaultRefAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await addVaultRef(actor, formToObject(fd));
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  return { ok: true };
}

export async function createUserAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await createUser(actor, formToObject(fd));
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  return { ok: true };
}

export async function updateUserAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const op = String(fd.get("op") ?? "");
  try {
    if (op === "role") await updateUser(actor, id, { role: String(fd.get("role") ?? "") });
    else if (op === "deactivate") await updateUser(actor, id, { isActive: false });
    else if (op === "activate") await updateUser(actor, id, { isActive: true });
    else if (op === "password") await updateUser(actor, id, { password: String(fd.get("password") ?? "") });
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  return { ok: true };
}
