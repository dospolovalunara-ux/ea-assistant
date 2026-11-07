"use client";

import { useActionState, useTransition } from "react";
import { Alert, Button, Field, inputCls } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { mfaBeginAction, mfaConfirmAction, mfaDisableAction } from "@/server/actions/modules";
import type { ActionState } from "@/lib/action-state";

export function MfaSettings({ enabled, available }: { enabled: boolean; available: boolean }) {
  const [begin, runBegin] = useActionState<ActionState, FormData>(mfaBeginAction, {});
  const [pending, start] = useTransition();
  if (!available) return <p className="text-sm text-muted">MFA недоступна: администратор не задал ключ шифрования APP_ENCRYPTION_KEY.</p>;
  if (enabled)
    return (
      <div className="space-y-3">
        <Alert tone="ok">Двухфакторная аутентификация включена</Alert>
        <ActionForm action={mfaDisableAction} submitLabel="Отключить MFA" variant="danger">
          <Field label="Код из приложения для подтверждения"><input name="code" inputMode="numeric" maxLength={6} className={`${inputCls} w-40`} /></Field>
        </ActionForm>
      </div>
    );
  const data = begin.data as { secret: string; qr: string } | undefined;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Вход будет требовать код из приложения-аутентификатора (Google Authenticator, Microsoft Authenticator и т. п.).</p>
      {begin.error && <Alert>{begin.error}</Alert>}
      {!data ? (
        <Button variant="secondary" disabled={pending} onClick={() => start(() => runBegin(new FormData()))}>Подключить MFA</Button>
      ) : (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.qr} alt="QR-код для приложения-аутентификатора" width={180} height={180} className="rounded-lg bg-white p-2" />
          <p className="text-xs text-muted">Или введите ключ вручную: <code className="select-all">{data.secret}</code></p>
          <ActionForm action={mfaConfirmAction} submitLabel="Подтвердить и включить">
            <Field label="Код из приложения"><input name="code" inputMode="numeric" maxLength={6} className={`${inputCls} w-40`} /></Field>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
