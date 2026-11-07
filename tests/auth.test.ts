import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { freshDb, TEST_PASSWORD, type TestCtx } from "./helpers";
import { authenticate, MAX_FAILS_PER_EMAIL, MAX_FAILS_PER_IP } from "@/server/auth/login";
import { deleteSession, findSessionUser, hashToken } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { auditLogs, sessions, users } from "@/server/db/schema";

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await freshDb();
});

describe("Вход и сессии", () => {
  it("успешный вход создаёт сессию; в базе хранится только хеш токена", async () => {
    const r = await authenticate("Assistant@Demo.Local ", TEST_PASSWORD, { ip: "192.0.2.1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.token.length).toBeGreaterThanOrEqual(43); // 256 бит в base64url
    const rows = await getDb().select().from(sessions).where(eq(sessions.userId, ctx.ids.assistant));
    expect(rows.some((s) => s.tokenHash === hashToken(r.token))).toBe(true);
    expect(rows.some((s) => s.tokenHash === r.token)).toBe(false);
    expect(r.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(12 * 3600_000);
    expect((await findSessionUser(r.token))?.userId).toBe(ctx.ids.assistant);
  });

  it("выход удаляет сессию", async () => {
    const r = await authenticate("assistant@demo.local", TEST_PASSWORD, { ip: "192.0.2.1" });
    if (!r.ok) throw new Error("login failed");
    await deleteSession(r.token);
    expect(await findSessionUser(r.token)).toBeNull();
  });

  it("истёкшая сессия недействительна", async () => {
    const r = await authenticate("assistant@demo.local", TEST_PASSWORD, { ip: "192.0.2.1" });
    if (!r.ok) throw new Error("login failed");
    await getDb().update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.tokenHash, hashToken(r.token)));
    expect(await findSessionUser(r.token)).toBeNull();
  });

  it("одинаковый ответ для неверного пароля и несуществующего email", async () => {
    const a = await authenticate("executive@demo.local", "wrong-password", { ip: "192.0.2.2" });
    const b = await authenticate("nobody@demo.local", "wrong-password", { ip: "192.0.2.2" });
    expect(a).toEqual({ ok: false, reason: "invalid" });
    expect(b).toEqual(a);
  });

  it("блокирует вход по email после 5 неудачных попыток за 15 минут", async () => {
    for (let i = 0; i < MAX_FAILS_PER_EMAIL; i++) {
      expect((await authenticate("techadmin@demo.local", "bad", { ip: `198.51.100.${i + 1}` })).ok).toBe(false);
    }
    // даже верный пароль не пускает, пока действует блокировка
    expect(await authenticate("techadmin@demo.local", TEST_PASSWORD, { ip: "198.51.100.99" })).toEqual({ ok: false, reason: "locked" });
    const locked = await getDb().select().from(auditLogs).where(eq(auditLogs.action, "auth.locked"));
    expect(locked.length).toBe(1);
  }, 60000);

  it("блокирует вход по IP после 20 неудачных попыток", async () => {
    for (let i = 0; i < MAX_FAILS_PER_IP; i++) {
      await authenticate(`ghost${i}@demo.local`, "bad", { ip: "203.0.113.7" });
    }
    expect(await authenticate("assistant@demo.local", TEST_PASSWORD, { ip: "203.0.113.7" })).toEqual({ ok: false, reason: "locked" });
    expect((await authenticate("assistant@demo.local", TEST_PASSWORD, { ip: "203.0.113.8" })).ok).toBe(true);
  }, 120000);

  it("отключённый пользователь не может войти", async () => {
    await getDb().update(users).set({ isActive: false }).where(eq(users.id, ctx.ids.executive));
    expect((await authenticate("executive@demo.local", TEST_PASSWORD, { ip: "192.0.2.50" })).ok).toBe(false);
    await getDb().update(users).set({ isActive: true }).where(eq(users.id, ctx.ids.executive));
  });

  it("пароль не попадает в журнал", async () => {
    await authenticate("executive@demo.local", "SuperSecretGuess", { ip: "192.0.2.60" });
    const rows = await getDb().select().from(auditLogs);
    expect(JSON.stringify(rows)).not.toContain("SuperSecretGuess");
  });
});
