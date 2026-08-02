import { describe, expect, it } from "vitest";
import { aiErrorMessage, aiLimitationMessage } from "./ai-error-message";

describe("aiErrorMessage", () => {
  it("explains output-token exhaustion without leaking a raw code", () => {
    const message = aiErrorMessage(
      "AI_STRUCTURED_OUTPUT_TOKEN_LIMIT_EXCEEDED",
      "fallback",
    );

    expect(message).toContain("выходных токенов");
    expect(message).toContain("токены рассуждения");
    expect(message).not.toContain("AI_STRUCTURED_OUTPUT_TOKEN_LIMIT_EXCEEDED");
  });

  it("uses the caller fallback for an unknown durable code", () => {
    expect(aiErrorMessage("FUTURE_ERROR", "Проверьте журнал операции.")).toBe(
      "Проверьте журнал операции.",
    );
  });

  it("translates known analysis limitations and hides persisted technical codes", () => {
    const message = aiLimitationMessage(
      "EVENT_RETENTION_LIMIT_REACHED",
      "Запрос неполный: EVENT_RETENTION_LIMIT_REACHED",
    );

    expect(message).toContain("доступной истории событий");
    expect(message).not.toContain("EVENT_RETENTION_LIMIT_REACHED");
  });

  it("uses a safe Russian fallback for an unknown technical limitation", () => {
    expect(aiLimitationMessage("FUTURE_LIMIT", "FUTURE_LIMIT")).toBe(
      "Результат получен с ограничениями и может быть неполным.",
    );
  });
});
