export interface ActionState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  overlaps?: { id: string; title: string; startsAt: string; endsAt: string; calendarKind: "work" | "personal" }[];
  values?: Record<string, string>;
  duplicates?: { id: string; organization: string; spentAt: string; amount: string }[];
  data?: Record<string, unknown>;
}
