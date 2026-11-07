import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { freshDb } from "./helpers";
import { getDb } from "@/server/db";
import { auditLogs } from "@/server/db/schema";
import { sanitizeMetadata, writeAudit, normalizeIp } from "@/server/services/audit";

beforeAll(async () => {
  await freshDb();
  await writeAudit(getDb(), { action: "test.entry", metadata: { a: 1 } });
});

describe("Журнал действий неизменяем", () => {
  it("UPDATE запрещён триггером базы", async () => {
    await expect(getDb().update(auditLogs).set({ action: "hacked" })).rejects.toThrow();
  });
  it("DELETE запрещён триггером базы", async () => {
    await expect(getDb().delete(auditLogs)).rejects.toThrow();
  });
  it("TRUNCATE запрещён триггером базы", async () => {
    await expect(getDb().execute(sql`truncate audit_logs`)).rejects.toThrow();
    const rows = await getDb().select().from(auditLogs);
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("Метаданные журнала", () => {
  it("скрывают пароли, токены и секреты", () => {
    const out = sanitizeMetadata({ email: "a@b.c", password: "x", nested: { accessToken: "t", client_secret: "s" } });
    expect(out).toEqual({ email: "a@b.c", password: "[скрыто]", nested: { accessToken: "[скрыто]", client_secret: "[скрыто]" } });
  });
  it("нормализует IP для поля inet", () => {
    expect(normalizeIp("1.2.3.4, 5.6.7.8")).toBe("1.2.3.4");
    expect(normalizeIp("::ffff:10.0.0.1")).toBe("10.0.0.1");
    expect(normalizeIp("::1")).toBe("::1");
    expect(normalizeIp("garbage<script>")).toBeNull();
  });
});
