"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button, inputCls } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";

export function CommentForm({ action }: { action: (prev: ActionState, fd: FormData) => Promise<ActionState> }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={formAction} className="space-y-2 px-5 py-4">
      <textarea
        name="body"
        rows={3}
        required
        maxLength={5000}
        defaultValue={state.values?.body}
        placeholder="Написать комментарий…"
        className={`${inputCls} h-auto py-2`}
        aria-label="Комментарий"
      />
      {state.fieldErrors?.body && <p className="text-sm text-danger">{state.fieldErrors.body}</p>}
      {state.error && !state.fieldErrors && <p className="text-sm text-danger">{state.error}</p>}
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Отправка…" : "Добавить комментарий"}</Button>
    </form>
  );
}
