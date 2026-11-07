"use client";

import { useActionState } from "react";
import { loginAction } from "@/server/actions/auth";
import { Alert, Button, Field, inputCls } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";

export function LoginForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="Email">
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.values?.email}
          className={inputCls}
          autoFocus
        />
      </Field>
      <Field label="Пароль">
        <input name="password" type="password" autoComplete="current-password" required className={inputCls} />
      </Field>
      <Button type="submit" className="h-11 w-full" disabled={pending}>
        {pending ? "Проверка…" : "Войти"}
      </Button>
    </form>
  );
}
