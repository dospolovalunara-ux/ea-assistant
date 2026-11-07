import { z } from "zod";
import { ValidationError } from "../errors";

/** Пустая строка из формы → undefined. */
export const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim() : v),
    z.string().max(max, `Не длиннее ${max} символов`).optional(),
  );

export const requiredText = (max: number, label = "Поле") =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string({ error: `${label}: обязательно` }).min(1, `${label}: обязательно`).max(max, `Не длиннее ${max} символов`),
  );

/** Ссылка только с http:// или https:// — защита от javascript: и прочих схем. */
export const safeUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim() : v),
  z
    .string()
    .max(1000, "Слишком длинная ссылка")
    .refine((s) => {
      try {
        const u = new URL(s);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    }, "Ссылка должна начинаться с http:// или https://")
    .optional(),
);

export const checkbox = z.preprocess((v) => v === true || v === "on" || v === "true" || v === "1", z.boolean());

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("ru-RU", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function parseOrThrow<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  throw new ValidationError(fieldErrors);
}

export const uuidSchema = z.string().uuid();
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && uuidSchema.safeParse(v).success;
}
