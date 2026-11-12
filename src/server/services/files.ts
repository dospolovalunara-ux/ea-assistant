import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { getDb, type Executor } from "../db";
import { documentAccess, expenseDocuments, familyDocumentFiles, familyDocuments, files, inboxItems, meetingTranscripts } from "../db/schema";
import { can, logDenied, requirePermission, type Actor } from "../auth/rbac";
import { NotFoundError, ValidationError } from "../errors";
import { sha256, signPayload, verifySignature } from "../crypto";
import { writeAudit } from "./audit";
import { isUuid } from "./validation";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export type FileScope = "inbox" | "expense" | "document" | "meeting";

/** Разрешённые типы определяются по содержимому (сигнатуре), а не по расширению. */
const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "application/pdf", ext: "pdf", test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "application/zip-office", ext: "office", test: (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 },
];

const OFFICE: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function detectFileType(buf: Buffer, name: string): { mime: string; ext: string } | null {
  const lower = name.toLowerCase();
  for (const s of SIGNATURES) {
    if (!s.test(buf)) continue;
    if (s.ext === "office") {
      const ext = lower.split(".").pop() ?? "";
      return OFFICE[ext] ? { mime: OFFICE[ext]!, ext } : null;
    }
    return { mime: s.mime, ext: s.ext };
  }
  if (lower.endsWith(".txt")) {
    const text = buf.toString("utf8");
    if (!text.includes("\u0000") && !text.includes("�")) return { mime: "text/plain; charset=utf-8", ext: "txt" };
  }
  return null;
}

/** На хостинге без постоянного диска (Vercel) файлы хранятся в PostgreSQL. */
export function useDbStorage(): boolean {
  return process.env.FILE_STORAGE === "db";
}

/** Содержимое файла по ключу хранилища — из базы или с диска. */
export async function readStored(f: { storageKey: string; content?: Buffer | null }): Promise<Buffer> {
  if (f.content) return Buffer.from(f.content);
  if (useDbStorage()) {
    const [row] = await getDb().select({ content: files.content }).from(files).where(eq(files.storageKey, f.storageKey));
    if (row?.content) return Buffer.from(row.content);
    throw new NotFoundError();
  }
  return readFile(storagePath(f.storageKey));
}

export function storageDir(): string {
  const dir = process.env.FILE_STORAGE_DIR || "storage";
  return dir.startsWith("/") ? dir : `${process.cwd()}/${dir}`;
}

/** Путь к файлу внутри хранилища. Ключ генерируется сервером (uuid), не пользователем. */
export function storagePath(key: string): string {
  if (key.includes("..")) throw new Error("bad storage key");
  return `${storageDir()}/${key}`;
}

/**
 * Сохраняет файл в приватное хранилище (вне public, напрямую не отдаётся).
 * Антивирус не подключён: статус «не проверен» хранится и показывается честно.
 */
export async function storeFile(db: Executor, actor: Actor, scope: FileScope, file: File): Promise<string> {
  if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) throw new ValidationError({ file: "Файл не выбран" });
  if (file.size > MAX_FILE_BYTES) throw new ValidationError({ file: "Файл больше 10 МБ" });
  const buf = Buffer.from(await file.arrayBuffer());
  const type = detectFileType(buf, file.name);
  if (!type) throw new ValidationError({ file: "Недопустимый тип файла. Разрешены PDF, JPG, PNG, DOCX, XLSX, PPTX, TXT" });
  const key = `${scope}/${randomUUID()}.${type.ext}`;
  const inDb = useDbStorage();
  if (!inDb) {
    await mkdir(storagePath(scope), { recursive: true });
    await writeFile(storagePath(key), buf, { mode: 0o600 });
  }
  const safeName = file.name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 150) || `file.${type.ext}`;
  const [row] = await db
    .insert(files)
    .values({ scope, storageKey: key, originalName: safeName, mime: type.mime, size: buf.length, sha256: sha256(buf), uploadedBy: actor.id, content: inDb ? buf : null })
    .returning({ id: files.id });
  return row!.id;
}

export const LINK_TTL_SECONDS = 300;

/** Короткоживущая подписанная ссылка, привязанная к пользователю. */
export function signedFileUrl(actor: Actor, fileId: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + LINK_TTL_SECONDS;
  const sig = signPayload(`${fileId}.${actor.id}.${exp}`);
  return `/api/files/${fileId}?exp=${exp}&sig=${sig}`;
}

export function checkFileLink(actor: Actor, fileId: string, exp: string | null, sig: string | null, now = Date.now()): boolean {
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) * 1000 < now) return false;
  return verifySignature(`${fileId}.${actor.id}.${exp}`, sig);
}

/** Проверяет право на конкретный файл по его области и пишет журнал скачивания. */
export async function readFileForDownload(actor: Actor, fileId: string) {
  if (!isUuid(fileId)) throw new NotFoundError();
  const db = getDb();
  const [f] = await db.select().from(files).where(eq(files.id, fileId));
  if (!f) throw new NotFoundError();
  let entity: { type: string; id: string } | null = null;

  if (f.scope === "inbox") {
    await requirePermission(actor, "inbox.read", { entityType: "file", entityId: fileId });
    const [i] = await db.select({ id: inboxItems.id }).from(inboxItems).where(eq(inboxItems.fileId, fileId));
    entity = i ? { type: "inbox_item", id: i.id } : null;
  } else if (f.scope === "expense") {
    await requirePermission(actor, "expenses.corporate.read", { entityType: "file", entityId: fileId });
    const [d] = await db.select({ id: expenseDocuments.expenseId }).from(expenseDocuments).where(eq(expenseDocuments.fileId, fileId));
    entity = d ? { type: "corporate_expense", id: d.id } : null;
  } else if (f.scope === "meeting") {
    await requirePermission(actor, "protocols.write", { entityType: "file", entityId: fileId });
    const [m] = await db.select({ id: meetingTranscripts.meetingId }).from(meetingTranscripts).where(eq(meetingTranscripts.fileId, fileId));
    entity = m ? { type: "meeting", id: m.id } : null;
  } else if (f.scope === "document") {
    await requirePermission(actor, "documents.download", { entityType: "file", entityId: fileId });
    const [d] = await db
      .select({ id: familyDocuments.id, confidentiality: familyDocuments.confidentiality })
      .from(familyDocumentFiles)
      .innerJoin(familyDocuments, eq(familyDocumentFiles.documentId, familyDocuments.id))
      .where(eq(familyDocumentFiles.fileId, fileId));
    if (!d) throw new NotFoundError();
    if (d.confidentiality === "high" && !can(actor, "documents.write")) {
      const [acc] = await db
        .select()
        .from(documentAccess)
        .where(and(eq(documentAccess.documentId, d.id), eq(documentAccess.userId, actor.id), eq(documentAccess.canDownload, true)));
      if (!acc) {
        await logDenied(actor, { entityType: "family_document", entityId: d.id, reason: "high_confidentiality" });
        throw new NotFoundError();
      }
    }
    entity = { type: "family_document", id: d.id };
  } else throw new NotFoundError();

  const data = await readStored(f);
  await writeAudit(db, {
    userId: actor.id,
    action: f.scope === "document" ? "document.download" : "file.download",
    entityType: entity?.type ?? "file",
    entityId: entity?.id ?? fileId,
    ip: actor.ip,
    metadata: { fileId, name: f.originalName, size: f.size },
  });
  return { data, mime: f.mime, name: f.originalName };
}

export async function fileMeta(ids: string[]) {
  if (!ids.length) return [];
  const db = getDb();
  const rows = await Promise.all(ids.filter(isUuid).map((id) => db.select().from(files).where(eq(files.id, id))));
  return rows.flat();
}
