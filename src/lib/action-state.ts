export interface ActionState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  overlaps?: { id: string; title: string; startsAt: string; endsAt: string; calendarKind: "work" | "personal" }[];
  values?: Record<string, string>;
}
