import { describe, expect, it } from "vitest";
import { isFrontendTranslationCandidate } from "./translation-eligibility";
import type { ConversationMessage } from "@/shared/types/domain";

function message(text: string): ConversationMessage {
  return {
    id: "message-1",
    conversationId: "conversation-1",
    author: "USER",
    status: "COMPLETED",
    text,
    createdAt: "2026-07-30T10:00:00.000Z",
  };
}

describe("frontend translation eligibility", () => {
  it.each(["", "   ", "👋✨", "?!…"])(
    "исключает очевидный noise %j",
    (text) => {
      expect(isFrontendTranslationCandidate(message(text), "ru")).toBe(false);
    },
  );

  it("исключает уверенно русский текст для русского working locale", () => {
    expect(
      isFrontendTranslationCandidate(
        message("Спасибо, возврат уже пришёл"),
        "ru",
      ),
    ).toBe(false);
  });

  it.each(["Danke!", "ok", "ID 42", "Привет, invoice attached"])(
    "оставляет кандидатом неопределённый или иностранный текст %j",
    (text) => {
      expect(isFrontendTranslationCandidate(message(text), "ru")).toBe(true);
    },
  );
});
