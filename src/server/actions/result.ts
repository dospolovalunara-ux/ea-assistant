import "server-only";
import { ForbiddenError, NotFoundError, OverlapError, ValidationError } from "../errors";
import type { ActionState } from "@/lib/action-state";
import { AiUnavailableError } from "../integrations/ai/types";
import { DuplicateWarning } from "../services/corporate-expenses";

export function formToObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$")) out[k] = v;
  return out;
}

/** Переводит ошибки бизнес-логики в состояние формы. Неожиданные ошибки не раскрываются. */
export function toActionState(e: unknown, values?: Record<string, string>): ActionState {
  if (e instanceof ValidationError) return { error: e.message, fieldErrors: e.fieldErrors, values };
  if (e instanceof OverlapError)
    return {
      error: e.message,
      values,
      overlaps: e.overlaps.map((o) => ({ ...o, startsAt: o.startsAt.toISOString(), endsAt: o.endsAt.toISOString() })),
    };
  if (e instanceof NotFoundError) return { error: e.message, values };
  if (e instanceof AiUnavailableError) return { error: e.message, values };
  if (e instanceof DuplicateWarning)
    return { error: e.message, values, duplicates: e.duplicates.map((d) => ({ ...d, spentAt: d.spentAt.toISOString() })) };
  if (e instanceof ForbiddenError) return { error: e.message, values };
  console.error("[action] unexpected error", e instanceof Error ? e.name + ": " + e.message : "unknown");
  return { error: "Не удалось выполнить действие. Попробуйте ещё раз.", values };
}
