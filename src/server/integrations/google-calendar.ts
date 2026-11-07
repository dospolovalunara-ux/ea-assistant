import { createHash, randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { getDb } from "../db";
import { calendarEvents, calendars, integrations, oauthStates } from "../db/schema";
import { decryptSecret, encryptSecret, encryptionConfigured, sha256 } from "../crypto";
import { writeAudit } from "../services/audit";

/**
 * Адаптер Google Calendar: OAuth 2.0 + PKCE, минимальный scope calendar.events.
 * Пароль Google приложение не получает никогда. Refresh-token хранится зашифрованным.
 * Синхронизируется только рабочий календарь с основным календарём Google-аккаунта.
 */
export const PROVIDER = "google_calendar";
export const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.APP_URL;
  const missing = [
    !clientId && "GOOGLE_CLIENT_ID",
    !clientSecret && "GOOGLE_CLIENT_SECRET",
    !appUrl && "APP_URL",
    !encryptionConfigured() && "APP_ENCRYPTION_KEY",
  ].filter(Boolean) as string[];
  return { clientId, clientSecret, redirectUri: appUrl ? `${appUrl.replace(/\/$/, "")}/api/integrations/google/callback` : null, missing };
}

export function pkcePair() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** Начало подключения: state и verifier сохраняются (verifier — зашифрованным), срок 10 минут. */
export async function startGoogleAuth(userId: string): Promise<string> {
  const cfg = googleConfig();
  if (cfg.missing.length) throw new Error(`Не настроено: ${cfg.missing.join(", ")}`);
  const state = randomBytes(32).toString("base64url");
  const { verifier, challenge } = pkcePair();
  const db = getDb();
  await db.delete(oauthStates).where(lt(oauthStates.expiresAt, new Date()));
  await db.insert(oauthStates).values({ stateHash: sha256(state), verifierEnc: encryptSecret(verifier), userId, expiresAt: new Date(Date.now() + 600_000) });
  const p = new URLSearchParams({
    client_id: cfg.clientId!,
    redirect_uri: cfg.redirectUri!,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_URL}?${p}`;
}

export async function finishGoogleAuth(userId: string, state: string, code: string, ip: string | null) {
  const cfg = googleConfig();
  const db = getDb();
  const [row] = await db.select().from(oauthStates).where(eq(oauthStates.stateHash, sha256(state)));
  await db.delete(oauthStates).where(eq(oauthStates.stateHash, sha256(state)));
  if (!row || row.userId !== userId || row.expiresAt < new Date()) throw new Error("Неверный или устаревший параметр state");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId!,
      client_secret: cfg.clientSecret!,
      redirect_uri: cfg.redirectUri!,
      grant_type: "authorization_code",
      code_verifier: decryptSecret(row.verifierEnc),
    }),
  });
  const json = (await res.json()) as { refresh_token?: string; scope?: string; error?: string };
  if (!res.ok || !json.refresh_token) throw new Error(`Google не выдал refresh-token: ${json.error ?? res.status}`);
  const values = {
    provider: PROVIDER,
    status: "connected",
    refreshTokenEnc: encryptSecret(json.refresh_token),
    scope: json.scope ?? SCOPE,
    syncToken: null,
    lastError: null,
    connectedBy: userId,
    updatedAt: new Date(),
  };
  await db.insert(integrations).values(values).onConflictDoUpdate({ target: integrations.provider, set: values });
  await writeAudit(db, { userId, action: "integration.connect", entityType: "integration", entityId: PROVIDER, ip, metadata: { scope: values.scope } });
}

export async function disconnectGoogle(userId: string, ip: string | null) {
  const db = getDb();
  await db
    .update(integrations)
    .set({ status: "disconnected", refreshTokenEnc: null, syncToken: null, updatedAt: new Date() })
    .where(eq(integrations.provider, PROVIDER));
  await writeAudit(db, { userId, action: "integration.disconnect", entityType: "integration", entityId: PROVIDER, ip });
}

export async function getGoogleStatus() {
  const [row] = await getDb().select().from(integrations).where(eq(integrations.provider, PROVIDER));
  return {
    configured: googleConfig().missing.length === 0,
    missing: googleConfig().missing,
    status: (row?.status ?? "disconnected") as "connected" | "error" | "disconnected",
    lastSyncAt: row?.lastSyncAt ?? null,
    lastError: row?.lastError ?? null,
  };
}

async function recordError(message: string) {
  await getDb()
    .update(integrations)
    .set({ status: "error", lastError: message.slice(0, 500), updatedAt: new Date() })
    .where(eq(integrations.provider, PROVIDER));
}

async function accessToken(): Promise<string | null> {
  const [row] = await getDb().select().from(integrations).where(eq(integrations.provider, PROVIDER));
  if (!row?.refreshTokenEnc || row.status === "disconnected") return null;
  const cfg = googleConfig();
  if (cfg.missing.length) return null;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId!,
      client_secret: cfg.clientSecret!,
      refresh_token: decryptSecret(row.refreshTokenEnc),
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !json.access_token) {
    await recordError(`Обновление токена не удалось: ${json.error ?? res.status}`);
    return null;
  }
  return json.access_token;
}

/** Преобразование события в формат Google. */
export function toGoogleEvent(e: { title: string; startsAt: Date; endsAt: Date; allDay: boolean; timezone: string; location: string | null; agenda: string | null; videoUrl: string | null; status: string }) {
  const day = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: e.timezone }).format(d);
  return {
    summary: e.title,
    location: e.location ?? undefined,
    description: [e.agenda, e.videoUrl].filter(Boolean).join("\n\n") || undefined,
    start: e.allDay ? { date: day(e.startsAt) } : { dateTime: e.startsAt.toISOString(), timeZone: e.timezone },
    end: e.allDay ? { date: day(e.endsAt) } : { dateTime: e.endsAt.toISOString(), timeZone: e.timezone },
    status: e.status === "cancelled" ? "cancelled" : e.status === "pending" || e.status === "draft" ? "tentative" : "confirmed",
  };
}

/** Отправка события рабочего календаря в Google. Без подключения — ничего не делает. */
export async function pushEventToGoogle(eventId: string): Promise<void> {
  const db = getDb();
  const [e] = await db
    .select({ ev: calendarEvents, kind: calendars.kind })
    .from(calendarEvents)
    .innerJoin(calendars, eq(calendarEvents.calendarId, calendars.id))
    .where(eq(calendarEvents.id, eventId));
  if (!e || e.kind !== "work" || e.ev.status === "draft" || e.ev.source === "google") return;
  const token = await accessToken();
  if (!token) return;
  const body = JSON.stringify(toGoogleEvent(e.ev));
  const url = e.ev.externalId ? `${API}/${encodeURIComponent(e.ev.externalId)}` : API;
  const res = await fetch(url, {
    method: e.ev.externalId ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; etag?: string; error?: { message?: string } };
  if (!res.ok || !json.id) {
    await recordError(`Отправка события не удалась: ${json.error?.message ?? res.status}`);
    return;
  }
  await db.update(calendarEvents).set({ externalId: json.id, externalEtag: json.etag ?? null }).where(eq(calendarEvents.id, eventId));
}

interface GoogleEvent {
  id: string;
  etag?: string;
  status?: string;
  summary?: string;
  location?: string;
  description?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string };
}

/** Входящие изменения из Google через syncToken. Новые события попадают в рабочий календарь с источником google. */
export async function pullFromGoogle(): Promise<{ changed: number } | null> {
  const token = await accessToken();
  if (!token) return null;
  const db = getDb();
  const [row] = await db.select().from(integrations).where(eq(integrations.provider, PROVIDER));
  const [work] = await db.select().from(calendars).where(eq(calendars.kind, "work")).limit(1);
  if (!row || !work) return null;
  let pageToken: string | undefined;
  let nextSync: string | undefined;
  let changed = 0;
  do {
    const p = new URLSearchParams({ maxResults: "250", singleEvents: "true", showDeleted: "true" });
    if (row.syncToken) p.set("syncToken", row.syncToken);
    else p.set("timeMin", new Date(Date.now() - 30 * 86400_000).toISOString());
    if (pageToken) p.set("pageToken", pageToken);
    const res = await fetch(`${API}?${p}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 410) {
      await db.update(integrations).set({ syncToken: null }).where(eq(integrations.provider, PROVIDER));
      return pullFromGoogle();
    }
    const json = (await res.json()) as { items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string; error?: { message?: string } };
    if (!res.ok) {
      await recordError(`Получение изменений не удалось: ${json.error?.message ?? res.status}`);
      return null;
    }
    for (const g of json.items ?? []) {
      const [existing] = await db.select().from(calendarEvents).where(eq(calendarEvents.externalId, g.id));
      if (g.status === "cancelled") {
        if (existing && existing.status !== "cancelled") {
          await db.update(calendarEvents).set({ status: "cancelled", updatedAt: new Date() }).where(eq(calendarEvents.id, existing.id));
          changed++;
        }
        continue;
      }
      const allDay = Boolean(g.start?.date);
      const startsAt = new Date(g.start?.dateTime ?? `${g.start?.date}T00:00:00+05:00`);
      const endsAt = new Date(g.end?.dateTime ?? `${g.end?.date}T00:00:00+05:00`);
      if (!(endsAt > startsAt)) continue;
      const values = { title: g.summary?.slice(0, 200) || "(без названия)", startsAt, endsAt, allDay, location: g.location?.slice(0, 300) ?? null, agenda: g.description?.slice(0, 5000) ?? null, externalEtag: g.etag ?? null, updatedAt: new Date() };
      if (existing) {
        if (existing.externalEtag !== g.etag) {
          await db.update(calendarEvents).set(values).where(eq(calendarEvents.id, existing.id));
          changed++;
        }
      } else {
        await db.insert(calendarEvents).values({ ...values, calendarId: work.id, type: "work_meeting", status: "confirmed", source: "google", externalId: g.id, timezone: g.start?.timeZone ?? "Asia/Almaty" });
        changed++;
      }
    }
    pageToken = json.nextPageToken;
    nextSync = json.nextSyncToken ?? nextSync;
  } while (pageToken);
  await db
    .update(integrations)
    .set({ syncToken: nextSync ?? row.syncToken, lastSyncAt: new Date(), status: "connected", lastError: null })
    .where(eq(integrations.provider, PROVIDER));
  return { changed };
}

