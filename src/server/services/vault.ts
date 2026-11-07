import { desc } from "drizzle-orm";
import { getDb } from "../db";
import { vaultReferences } from "../db/schema";
import { requirePermission, type Actor } from "../auth/rbac";
import { ValidationError } from "../errors";
import { writeAudit } from "./audit";
import { safeUrl } from "./validation";

/** Только ссылки на записи в корпоративном менеджере паролей. Сами пароли здесь не хранятся. */
const SECRETISH = /(pass(word)?|пароль|pin|пин|код|token|секрет|secret)\s*[:=]/i;

export async function listVaultRefs(actor: Actor) {
  await requirePermission(actor, "integrations.manage", { entityType: "vault_reference" });
  return getDb().select().from(vaultReferences).orderBy(desc(vaultReferences.createdAt));
}

export async function addVaultRef(actor: Actor, raw: Record<string, unknown>) {
  await requirePermission(actor, "integrations.manage", { entityType: "vault_reference" });
  const title = String(raw.title ?? "").trim().slice(0, 200);
  const ownerHint = String(raw.ownerHint ?? "").trim().slice(0, 200) || null;
  const url = safeUrl.safeParse(raw.vaultUrl);
  const errors: Record<string, string> = {};
  if (!title) errors.title = "Укажите название";
  if (!url.success || !url.data) errors.vaultUrl = "Ссылка на запись в менеджере паролей (https://…)";
  if (SECRETISH.test(title) || (ownerHint && SECRETISH.test(ownerHint))) errors.ownerHint = "Похоже на секрет. Пароли и коды здесь не хранятся — только ссылка и несекретная подсказка.";
  if (Object.keys(errors).length) throw new ValidationError(errors);
  const [row] = await getDb().insert(vaultReferences).values({ title, vaultUrl: url.data!, ownerHint, createdBy: actor.id }).returning({ id: vaultReferences.id });
  await writeAudit(getDb(), { userId: actor.id, action: "vault.ref_add", entityType: "vault_reference", entityId: row!.id, ip: actor.ip, metadata: { title } });
}
