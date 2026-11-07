import { createAnthropicProvider } from "./anthropic";
import type { AiProvider } from "./types";

export * from "./types";

let override: AiProvider | null | undefined;

/** Только для автотестов: подмена провайдера. */
export function setAiProviderForTests(p: AiProvider | null | undefined) {
  override = p;
}

/**
 * AI включается только явно: AI_PROVIDER=anthropic и ключ в окружении.
 * По PRD передача текстов внешнему провайдеру требует согласования ИБ — до него AI выключен,
 * а интерфейс предлагает ручной режим.
 */
export function getAiProvider(): AiProvider | null {
  if (override !== undefined) return override;
  if (process.env.AI_PROVIDER === "anthropic" && (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)) {
    return createAnthropicProvider();
  }
  return null;
}

export function aiStatus(): { enabled: boolean; reason: string } {
  if (override !== undefined) return { enabled: Boolean(override), reason: override ? "тестовый провайдер" : "отключён" };
  if (process.env.AI_PROVIDER !== "anthropic") return { enabled: false, reason: "AI-провайдер не согласован и не включён (AI_PROVIDER)" };
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return { enabled: false, reason: "не задан ключ доступа ANTHROPIC_API_KEY" };
  return { enabled: true, reason: `Anthropic, модель ${process.env.AI_MODEL || "claude-opus-5-5"}` };
}
