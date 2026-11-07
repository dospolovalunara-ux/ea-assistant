import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/auth/rbac";
import { getOwnProfile } from "@/server/services/users";
import { getGoogleStatus } from "@/server/integrations/google-calendar";
import { aiStatus } from "@/server/integrations/ai";
import { encryptionConfigured } from "@/server/crypto";
import { listVaultRefs } from "@/server/services/vault";
import { googleDisconnectAction, settingsAction, vaultRefAction } from "@/server/actions/modules";
import { ActionForm } from "@/components/action-form";
import { MfaSettings } from "@/components/settings/mfa";
import { Alert, Badge, ButtonLink, Card, CardHeader, Field, PageHeader, inputCls } from "@/components/ui";
import { fmt } from "@/lib/time";

export const metadata = { title: "Настройки и доступы" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ google?: string; google_error?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const profile = await getOwnProfile(actor);
  const manage = can(actor, "integrations.manage");
  const [google, vault] = manage ? await Promise.all([getGoogleStatus(), listVaultRefs(actor)]) : [null, []];
  const ai = aiStatus();
  return (
    <>
      <PageHeader title="Настройки и доступы" subtitle={`${actor.fullName} · ${actor.roleName}`} actions={can(actor, "users.manage") && <ButtonLink href="/settings/users">Пользователи</ButtonLink>} />
      {sp.google && <div className="mb-4"><Alert tone="ok">Google Calendar подключён</Alert></div>}
      {sp.google_error && <div className="mb-4"><Alert>Google Calendar: {sp.google_error}</Alert></div>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Профиль" />
            <div className="p-5">
              <ActionForm action={settingsAction} submitLabel="Сохранить" successText="Сохранено">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Часовой пояс"><select name="timezone" defaultValue={profile.timezone} className={inputCls}>{["Asia/Almaty", "Asia/Aqtobe", "Europe/Moscow", "Asia/Dubai", "Europe/London", "UTC"].map((t) => <option key={t}>{t}</option>)}</select></Field>
                  {can(actor, "dashboard.view") && <Field label="Утренний брифинг" hint="Пусто — не присылать"><input type="time" name="briefingTime" defaultValue={profile.briefingTime ?? ""} className={inputCls} /></Field>}
                </div>
              </ActionForm>
            </div>
          </Card>
          <Card>
            <CardHeader title="Двухфакторная аутентификация (TOTP)" />
            <div className="p-5"><MfaSettings enabled={profile.mfaEnabled} available={encryptionConfigured()} /></div>
          </Card>
        </div>
        <div className="min-w-0 space-y-6">
          {manage && google && (
            <Card>
              <CardHeader title="Google Calendar" subtitle="Синхронизация рабочего календаря. Scope: calendar.events. Пароль Google приложение не получает." />
              <div className="space-y-3 p-5 text-sm">
                {google.status === "connected" ? <Badge tone="ok">Подключено</Badge> : google.status === "error" ? <Badge tone="danger">Ошибка синхронизации</Badge> : <Badge>Не подключено</Badge>}
                {google.lastSyncAt && <p className="text-muted">Последняя синхронизация: {fmt(google.lastSyncAt, "d MMM, HH:mm", actor.timezone)}</p>}
                {google.lastError && <Alert>{google.lastError}</Alert>}
                {!google.configured ? (
                  <p className="text-muted">Не настроено на сервере. Нужны переменные окружения: {google.missing.join(", ")}. Создайте OAuth Client в тестовом проекте Google Cloud с redirect URI <code>/api/integrations/google/callback</code>.</p>
                ) : google.status === "disconnected" ? (
                  <a href="/api/integrations/google/start" className="inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-fg">Подключить Google Calendar</a>
                ) : (
                  <ActionForm action={googleDisconnectAction} submitLabel="Отключить" variant="secondary" />
                )}
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title="AI" />
            <div className="p-5 text-sm">
              {ai.enabled ? <Badge tone="ok">Включён: {ai.reason}</Badge> : <Badge tone="warn">Выключен</Badge>}
              <p className="mt-2 text-muted">{ai.enabled ? "AI только предлагает: создаёт черновики, которые подтверждает человек." : `${ai.reason}. Включается переменными AI_PROVIDER=anthropic и ANTHROPIC_API_KEY после согласования с ИБ. Без AI все функции работают вручную.`}</p>
            </div>
          </Card>
          {manage && (
            <Card>
              <CardHeader title="Менеджер паролей" subtitle="Приложение не хранит пароли, PIN, коды 2FA и recovery codes. Здесь — только ссылки на записи в корпоративном менеджере паролей." />
              {vault.length > 0 && <ul className="divide-y divide-border text-sm">{vault.map((v) => <li key={v.id} className="px-5 py-2"><a href={v.vaultUrl} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-primary hover:underline">{v.title}</a>{v.ownerHint && <span className="text-muted"> · {v.ownerHint}</span>}</li>)}</ul>}
              <div className="border-t border-border p-5">
                <ActionForm action={vaultRefAction} submitLabel="Добавить ссылку" resetOnSuccess>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Название"><input name="title" className={inputCls} placeholder="Интернет-банк (демо)" /></Field>
                    <Field label="Подсказка о владельце" hint="Без секретов"><input name="ownerHint" className={inputCls} placeholder="Учётная запись руководителя" /></Field>
                    <Field label="Ссылка на запись в менеджере" className="sm:col-span-2"><input name="vaultUrl" type="url" className={inputCls} placeholder="https://" /></Field>
                  </div>
                </ActionForm>
              </div>
            </Card>
          )}
          <p className="text-xs text-muted">Каналы уведомлений email и Telegram подключаются после согласования (раздел 9.3 PRD). <Link href="/notifications" className="underline">Уведомления в приложении</Link> работают.</p>
        </div>
      </div>
    </>
  );
}
