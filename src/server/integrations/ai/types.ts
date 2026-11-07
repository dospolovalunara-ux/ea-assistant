export const INBOX_CATEGORIES = {
  meeting: "Встреча",
  task: "Задача / поручение",
  protocol: "Протокол",
  corporate_expense: "Корпоративный расход",
  personal_expense: "Личный расход",
  receipt: "Чек",
  family_document: "Семейный документ",
  trip: "Поездка",
  reference: "Справочная информация",
  unknown: "Неизвестно / нужна ручная обработка",
} as const;
export type InboxCategory = keyof typeof INBOX_CATEGORIES;

/** Каждое извлечённое значение несёт источник (цитату) и тип: факт, вывод или предположение. */
export interface ExtractedField {
  value: string;
  source: string;
  kind: "fact" | "inference" | "assumption";
}

export interface InboxExtraction {
  category: InboxCategory;
  confidence: number;
  fields: Record<string, ExtractedField>;
  questions: string[];
}

export interface ProtocolDraft {
  participants: string[];
  agenda: string[];
  summary: string;
  decisions: { text: string; source: string; needsReview: boolean }[];
  actionItems: { title: string; assignee: string | null; due: string | null; source: string; needsReview: boolean }[];
  questions: string[];
}

export interface AiProvider {
  name: string;
  model: string;
  extractInbox(text: string, context: { today: string; timezone: string }): Promise<InboxExtraction>;
  draftProtocol(transcript: string, context: { title: string; date: string }): Promise<ProtocolDraft>;
}

export class AiUnavailableError extends Error {
  constructor(message = "AI недоступен. Заполните данные вручную.") {
    super(message);
    this.name = "AiUnavailableError";
  }
}
