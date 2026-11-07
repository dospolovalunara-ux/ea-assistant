"use client";

import { useActionState, useRef, useTransition, useEffect, type ReactNode } from "react";
import { Alert, Button, cx } from "./ui";
import type { ActionState } from "@/lib/action-state";

/**
 * Форма на Server Action с показом ошибок. Отправка через onSubmit,
 * поэтому введённые значения не сбрасываются при ошибке.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Сохранение…",
  className,
  variant = "primary",
  resetOnSuccess = false,
  successText,
  confirmText,
  extraButtons,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  variant?: "primary" | "secondary" | "danger";
  resetOnSuccess?: boolean;
  successText?: string;
  confirmText?: string;
  extraButtons?: ReactNode;
}) {
  const [state, run] = useActionState<ActionState, FormData>(action, {});
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  const fe = Object.entries(state.fieldErrors ?? {}).filter(([k]) => k !== "_form");
  return (
    <form
      ref={ref}
      className={cx("space-y-4", className)}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (confirmText && !window.confirm(confirmText)) return;
        const fd = new FormData(e.currentTarget);
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.name) fd.set(submitter.name, submitter.value);
        start(() => run(fd));
      }}
    >
      {state.error && (
        <Alert>
          <p>{state.fieldErrors?._form ?? state.error}</p>
          {fe.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {fe.map(([k, v]) => (
                <li key={k}>{v}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      {state.ok && successText && <Alert tone="ok">{successText}</Alert>}
      {children}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={variant} disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        {extraButtons}
      </div>
    </form>
  );
}
