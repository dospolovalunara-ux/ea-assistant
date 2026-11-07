import { and, desc, eq, like, lt, sql, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import { auditLogs, users } from "../db/schema";
import { requirePermission, type Actor } from "../auth/rbac";

export const AUDIT_PAGE_SIZE = 50;

export async function listAuditLogs(
  actor: Actor,
  opts: { actionPrefix?: string; before?: number } = {},
) {
  await requirePermission(actor, "audit.read", { entityType: "audit_log" });
  const conds: SQL[] = [];
  if (opts.actionPrefix && /^[a-z_.]{1,40}$/.test(opts.actionPrefix)) {
    conds.push(like(auditLogs.action, `${opts.actionPrefix}%`));
  }
  if (opts.before && Number.isSafeInteger(opts.before)) conds.push(lt(auditLogs.id, opts.before));
  const rows = await getDb()
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      ip: sql<string | null>`host(${auditLogs.ip})`,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      userName: users.fullName,
      userEmail: users.email,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditLogs.id))
    .limit(AUDIT_PAGE_SIZE + 1);
  const hasMore = rows.length > AUDIT_PAGE_SIZE;
  return { rows: rows.slice(0, AUDIT_PAGE_SIZE), nextBefore: hasMore ? rows[AUDIT_PAGE_SIZE - 1]!.id : null };
}
