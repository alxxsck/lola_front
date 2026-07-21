import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockRepository } from "./mock-repository";

describe("демонстрационное хранилище", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  it("повторяет составную отправку целиком без второго сообщения", async () => {
    const request = {
      text: "Здравствуйте",
      conversationId: "conv_1",
      interactionSessionId: "sess_1",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
      aiSuspension: {
        durationSeconds: 3_600,
        reason: "OPERATOR_TAKEOVER" as const,
      },
    };

    const firstPromise = mockRepository.sendAdminMessage(
      "prj_lola_demo",
      "usr_1",
      request,
    );
    await vi.runAllTimersAsync();
    const first = await firstPromise;
    const replayPromise = mockRepository.sendAdminMessage(
      "prj_lola_demo",
      "usr_1",
      request,
    );
    await vi.runAllTimersAsync();
    const replay = await replayPromise;
    const messagesPromise = mockRepository.getMessages(
      "prj_lola_demo",
      "usr_1",
      "conv_1",
    );
    await vi.runAllTimersAsync();
    const messages = await messagesPromise;

    expect(replay).toMatchObject({
      duplicate: true,
      messageId: first.messageId,
      aiSuspension: { replayed: true },
    });
    expect(
      messages.items.filter((item) => item.id === first.messageId),
    ).toHaveLength(1);
    vi.useRealTimers();
  });

  it("filters active waits by the requested stable Event Definition key", async () => {
    const matchingPromise = mockRepository.getScenarioRunsPage(
      "prj_lola_demo",
      {
        eventDefinitionKeyId: "evt_1",
        limit: 50,
      },
    );
    await vi.runAllTimersAsync();
    const matching = await matchingPromise;
    const unrelatedPromise = mockRepository.getScenarioRunsPage(
      "prj_lola_demo",
      {
        eventDefinitionKeyId: "evt_unrelated",
        limit: 50,
      },
    );
    await vi.runAllTimersAsync();
    const unrelated = await unrelatedPromise;

    expect(matching.items.length).toBeGreaterThan(0);
    expect(
      matching.items.every((run) =>
        run.steps.some((step) => step.status.startsWith("WAITING_")),
      ),
    ).toBe(true);
    expect(unrelated.items).toEqual([]);
  });

  it("дополняет сохранённые demo-диалоги признаками текущей сессии после обновления схемы", async () => {
    localStorage.setItem(
      "lola-cms-demo-data-v2",
      JSON.stringify({
        conversations: [
          {
            id: "conv_1",
            userId: "usr_1",
            title: "Первый депозит",
            status: "ACTIVE",
            lastMessageAt: "2026-07-20T13:00:00.000Z",
            messageCount: 5,
            aiSuspension: {
              mode: "AUTOMATIC",
              lifecycle: "NONE",
              version: "0",
              suspendedUntil: null,
              serverTime: "2026-07-20T13:00:00.000Z",
            },
          },
        ],
      }),
    );

    const pending = mockRepository.getConversations("prj_lola_demo", "usr_1");
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({
      items: [
        {
          id: "conv_1",
          isCurrent: true,
          currentInteractionSessionCount: 1,
        },
      ],
    });
    vi.useRealTimers();
  });
});
