"use client";

import { useActionState } from "react";
import { mfaAction } from "@/server/actions/auth";
import { Alert, Button, Field, inputCls } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";

export function MfaForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(mfaAction, {});
  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="Код">
        <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus className={`${inputCls} text-center text-lg tracking-[0.4em]`} />
      </Field>
      <Button type="submit" className="h-11 w-full" disabled={pending}>{pending ? "Проверка…" : "Подтвердить"}</Button>
      <a href="/login" className="block text-center text-sm text-muted hover:text-text">Вернуться ко входу</a>
    </form>
  );
}
