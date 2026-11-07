"use client";

import { useActionState, useState } from "react";
import { Alert, Button, inputCls } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";

export function CancelEvent({ action }: { action: (prev: ActionState, fd: FormData) => Promise<ActionState> }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  if (!open) return <Button variant="danger" onClick={() => setOpen(true)}>Отменить событие</Button>;
  return (
    <form action={formAction} className="w-full space-y-3 rounded-xl border border-danger/30 bg-danger-bg/40 p-4">
      {state.error && <Alert>{state.error}</Alert>}
      <p className="text-sm">Событие останется в истории со статусом «Отменено». Продолжить?</p>
      <input name="reason" placeholder="Причина (необязательно)" className={inputCls} maxLength={500} />
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending}>{pending ? "Отмена…" : "Да, отменить"}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Нет</Button>
      </div>
    </form>
  );
}
