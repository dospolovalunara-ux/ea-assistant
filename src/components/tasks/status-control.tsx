"use client";

import { useActionState } from "react";
import { cx } from "@/components/ui";
import { TASK_STATUSES } from "@/lib/labels";
import type { ActionState } from "@/lib/action-state";

/** Быстрая смена статуса одним нажатием. */
export function StatusControl({ current, action }: { current: string; action: (prev: ActionState, fd: FormData) => Promise<ActionState> }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  return (
    <form action={formAction}>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Статус задачи">
        {Object.entries(TASK_STATUSES).map(([k, l]) => (
          <button
            key={k}
            type="submit"
            name="status"
            value={k}
            disabled={pending || k === current}
            aria-pressed={k === current}
            className={cx(
              "h-8 rounded-lg border px-3 text-sm transition",
              k === current ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface hover:bg-surface-2 disabled:opacity-50",
            )}
          >
            {l}
          </button>
        ))}
      </div>
      {state.error && <p className="mt-2 text-sm text-danger" role="alert">{state.error}</p>}
    </form>
  );
}
