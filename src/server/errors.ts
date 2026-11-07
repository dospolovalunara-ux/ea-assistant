/** Ошибки бизнес-логики. Сообщения — для пользователя, по-русски. */
export class NotFoundError extends Error {
  constructor(message = "Запись не найдена") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(
    public fieldErrors: Record<string, string>,
    message = "Проверьте правильность заполнения полей",
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export interface OverlapInfo {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  calendarKind: "work" | "personal";
}

export class OverlapError extends Error {
  constructor(public overlaps: OverlapInfo[]) {
    super("Событие пересекается с другими встречами");
    this.name = "OverlapError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Недостаточно прав для этого действия") {
    super(message);
    this.name = "ForbiddenError";
  }
}
