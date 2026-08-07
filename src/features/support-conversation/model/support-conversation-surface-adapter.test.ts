import { describe, expect, it } from "vitest";
import type { RequestedMessageTranslation } from "@/features/conversation-translation/model/translation-presentation";
import type { ConversationMessage } from "@/shared/types/domain";
import { adaptSupportConversationMessages } from "./support-conversation-surface-adapter";

describe("Support Conversation Surface adapter", () => {
  it("preserves authoritative ordinal, author snapshot, translation and delivery", () => {
    const translated: RequestedMessageTranslation = {
      state: "COMPLETED",
      translatedText: "Платёж проверен",
    };
    const messages: ConversationMessage[] = [
      {
        id: "support-user-message",
        conversationId: "conversation-1",
        ordinal: 1,
        author: "USER",
        text: "Payment checked",
        status: "COMPLETED",
        createdAt: "2026-08-07T10:00:00.000Z",
      },
      {
        id: "support-admin-message",
        conversationId: "conversation-1",
        ordinal: 2,
        author: "ADMIN",
        authorSnapshot: {
          type: "CMS_USER",
          cmsUserId: "operator-1",
          displayName: "Анна · Support",
          avatarUrl: "https://example.test/anna.png",
        },
        text: "Ответ оператора",
        status: "COMPLETED",
        delivery: { status: "READ", commandIds: ["command-1"] },
        createdAt: "2026-08-07T10:01:00.000Z",
      },
      {
        id: "invalid-realtime-hint",
        conversationId: "conversation-1",
        author: "ASSISTANT",
        text: "Неподтверждённая проекция",
        status: "COMPLETED",
        createdAt: "2026-08-07T10:02:00.000Z",
      },
    ];

    const result = adaptSupportConversationMessages(
      messages,
      new Map([["support-user-message", translated]]),
      { assistantLabel: "Lola" },
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: "support-user-message",
      ordinal: 1,
      placement: "INBOUND",
      author: { displayName: "Пользователь", avatarUrl: null },
      requestedTranslation: translated,
    });
    expect(result[1]).toMatchObject({
      id: "support-admin-message",
      ordinal: 2,
      placement: "OUTBOUND",
      author: {
        displayName: "Анна · Support",
        avatarUrl: "https://example.test/anna.png",
      },
      delivery: { label: "Прочитано", tone: "SUCCESS" },
    });
  });
});
