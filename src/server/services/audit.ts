import { auditLogs } from "../db/schema";
import type { Executor } from "../db";

const SECRET_KEY = /pass(word)?|token|secret|hash|cookie|otp|code_verifier|authorization/i;
const MAX_STRING = 500;

/** Убирает из метаданных всё, что похоже на секреты, и обрезает длинные строки. */
export function sanitizeMetadata(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[…]";
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value.length > MAX_STRING ? value.slice(0, MAX_STRING) + "…" : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitizeMetadata(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? "[скрыто]" : sanitizeMetadata(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown>;
}

export async function writeAudit(db: Executor, entry: AuditEntry) {
  await db.insert(auditLogs).values({
    userId: entry.userId ?? null,
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    ip: normalizeIp(entry.ip),
    metadata: (sanitizeMetadata(entry.metadata ?? {}) as Record<string, unknown>) ?? {},
  });
}

/** Оставляет только корректный IPv4/IPv6, иначе null (поле inet). */
export function normalizeIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const first = ip.split(",")[0]!.trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(first)) return first;
  if (/^[0-9a-f:]+$/i.test(first) && first.includes(":")) return first;
  const mapped = /^::ffff:(\d{1,3}(\.\d{1,3}){3})$/i.exec(first);
  return mapped ? mapped[1]! : null;
}
