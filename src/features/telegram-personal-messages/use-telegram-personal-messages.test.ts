import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import type {
  TelegramPersonalMessageDetailResponseDto,
  TelegramPersonalMessageResponseDto,
} from "@/shared/api/generated/models";
import { createTelegramPersonalMessagesController } from "./use-telegram-personal-messages";

const message = (
  status: TelegramPersonalMessageResponseDto["status"],
  overrides: Partial<TelegramPersonalMessageResponseDto> = {},
): TelegramPersonalMessageResponseDto => ({
  id: "message-1",
  projectId: "project-1",
  endUserId: "end-user-1",
  kind: "TEXT",
  status,
  attemptCount: status === "QUEUED" ? 0 : 1,
  providerMessageId: status === "SENT" ? "9007199254740993" : null,
  errorCode: null,
  nextAttemptAt: null,
  sentAt: status === "SENT" ? "2026-07-24T09:01:00.000Z" : null,
  createdAt: "2026-07-24T09:00:00.000Z",
  updatedAt: "2026-07-24T09:01:00.000Z",
  finishedAt: status === "SENT" ? "2026-07-24T09:01:00.000Z" : null,
  ...overrides,
});

describe("Telegram personal message controller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("creates one durable command and uses only sequential GET requests while polling", async () => {
    let concurrentGets = 0;
    let maximumConcurrentGets = 0;
    const api = {
      list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      create: vi.fn().mockResolvedValue(message("QUEUED")),
      get: vi
        .fn()
        .mockImplementationOnce(async () => {
          concurrentGets += 1;
          maximumConcurrentGets = Math.max(
            maximumConcurrentGets,
            concurrentGets,
          );
          await Promise.resolve();
          concurrentGets -= 1;
          return { ...message("SENDING"), attempts: [] };
        })
        .mockResolvedValue({
          ...message("SENT"),
          attempts: [],
        } satisfies TelegramPersonalMessageDetailResponseDto),
    };
    const controller = createTelegramPersonalMessagesController({
      api,
      idempotencyKey: () => "intent-key-1",
    });
    controller.setContext({
      visible: true,
      projectId: "project-1",
      endUserId: "end-user-1",
      canSend: true,
      linkStatus: "ACTIVE",
    });

    await controller.send({ text: "Сохраните это", file: null });
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.create).toHaveBeenCalledWith(
      "project-1",
      "end-user-1",
      { text: "Сохраните это", file: null },
      "intent-key-1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1_000);
    await flushPromises();

    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(maximumConcurrentGets).toBe(1);
    expect(controller.activeMessage.value?.status).toBe("SENT");
    expect(controller.polling.value).toBe(false);
  });

  it("retains the exact key and body only for an explicit transport retry", async () => {
    const api = {
      list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      create: vi
        .fn()
        .mockRejectedValueOnce(new ApiError(0, "network details"))
        .mockResolvedValueOnce(message("SENT")),
      get: vi.fn(),
    };
    const attachment = new File(["hello"], "note.txt", {
      type: "text/plain",
    });
    const controller = createTelegramPersonalMessagesController({
      api,
      idempotencyKey: () => "stable-retry-key",
    });
    controller.setContext({
      visible: true,
      projectId: "project-1",
      endUserId: "end-user-1",
      canSend: true,
      linkStatus: "ACTIVE",
    });

    expect(await controller.send({ text: "Подпись", file: attachment })).toBe(
      false,
    );
    expect(controller.transportRetryAvailable.value).toBe(true);
    expect(controller.error.value).not.toContain("network details");
    expect(api.get).not.toHaveBeenCalled();

    expect(await controller.retryTransport()).toBe(true);
    expect(api.create).toHaveBeenCalledTimes(2);
    const first = api.create.mock.calls[0]!;
    const second = api.create.mock.calls[1]!;
    expect(second.slice(0, 4)).toEqual(first.slice(0, 4));
    expect(second[3]).toBe("stable-retry-key");
    expect(second[2]).toEqual({ text: "Подпись", file: attachment });
    expect(api.get).not.toHaveBeenCalled();
  });

  it("recovers safe history and ignores rows belonging to another target", async () => {
    const api = {
      list: vi.fn().mockResolvedValue({
        items: [
          message("SENT"),
          message("FAILED_PERMANENT", {
            id: "foreign-message",
            endUserId: "end-user-2",
          }),
        ],
        nextCursor: null,
      }),
      create: vi.fn(),
      get: vi.fn(),
    };
    const controller = createTelegramPersonalMessagesController({ api });
    controller.setContext({
      visible: true,
      projectId: "project-1",
      endUserId: "end-user-1",
      canSend: true,
      linkStatus: "ACTIVE",
    });

    await controller.loadHistory();

    expect(api.list).toHaveBeenCalledWith(
      "project-1",
      "end-user-1",
      expect.objectContaining({ limit: 20, signal: expect.any(AbortSignal) }),
    );
    expect(controller.history.value.map(({ id }) => id)).toEqual(["message-1"]);
  });

  it("aborts and fences a pending target when permission or identity changes", async () => {
    let resolveOld!: (value: TelegramPersonalMessageDetailResponseDto) => void;
    let observedSignal: AbortSignal | undefined;
    const api = {
      list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      create: vi.fn().mockResolvedValue(message("QUEUED")),
      get: vi
        .fn()
        .mockImplementation(
          (
            _projectId: string,
            _endUserId: string,
            _messageId: string,
            options: { signal: AbortSignal },
          ) => {
            observedSignal = options.signal;
            return new Promise((resolve) => {
              resolveOld = resolve;
            });
          },
        ),
    };
    const controller = createTelegramPersonalMessagesController({ api });
    controller.setContext({
      visible: true,
      projectId: "project-1",
      endUserId: "end-user-1",
      canSend: true,
      linkStatus: "ACTIVE",
    });
    await controller.send({ text: "Первый", file: null });
    await vi.advanceTimersByTimeAsync(500);
    expect(api.get).toHaveBeenCalledTimes(1);

    controller.setContext({
      visible: true,
      projectId: "project-2",
      endUserId: "end-user-2",
      canSend: false,
      linkStatus: "ACTIVE",
    });
    expect(observedSignal?.aborted).toBe(true);
    resolveOld({
      ...message("SENT"),
      attempts: [],
    });
    await flushPromises();
    await vi.runAllTimersAsync();

    expect(controller.history.value).toEqual([]);
    expect(controller.activeMessage.value).toBeNull();
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("keeps one poll flight and never lets an older history row downgrade it", async () => {
    let resolveGet!: (value: TelegramPersonalMessageDetailResponseDto) => void;
    const api = {
      list: vi.fn().mockResolvedValue({
        items: [message("QUEUED", { updatedAt: "2026-07-24T09:00:00.000Z" })],
        nextCursor: null,
      }),
      create: vi
        .fn()
        .mockResolvedValue(
          message("QUEUED", { updatedAt: "2026-07-24T09:00:00.000Z" }),
        ),
      get: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveGet = resolve;
          }),
      ),
    };
    const controller = createTelegramPersonalMessagesController({ api });
    controller.setContext({
      visible: true,
      projectId: "project-1",
      endUserId: "end-user-1",
      canSend: true,
      linkStatus: "ACTIVE",
    });
    await controller.send({ text: "Один intent", file: null });
    await vi.advanceTimersByTimeAsync(500);
    expect(api.get).toHaveBeenCalledTimes(1);

    await controller.loadHistory();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.get).toHaveBeenCalledTimes(1);

    resolveGet({
      ...message("SENT", { updatedAt: "2026-07-24T09:02:00.000Z" }),
      attempts: [],
    });
    await flushPromises();

    expect(controller.activeMessage.value?.status).toBe("SENT");
    expect(controller.history.value[0]?.status).toBe("SENT");
  });

  it("uses bounded fallback polling for an invalid nextAttemptAt", async () => {
    const api = {
      list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      create: vi
        .fn()
        .mockResolvedValue(
          message("RETRY_WAIT", { nextAttemptAt: "not-a-date" }),
        ),
      get: vi.fn().mockResolvedValue({
        ...message("SENT"),
        attempts: [],
      }),
    };
    const controller = createTelegramPersonalMessagesController({ api });
    controller.setContext({
      visible: true,
      projectId: "project-1",
      endUserId: "end-user-1",
      canSend: true,
      linkStatus: "ACTIVE",
    });
    await controller.send({ text: "Retry", file: null });
    await vi.advanceTimersByTimeAsync(499);
    expect(api.get).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("stops the only poll and exposes a safe error when detail GET is forbidden", async () => {
    const api = {
      list: vi.fn(),
      create: vi.fn().mockResolvedValue(message("QUEUED")),
      get: vi
        .fn()
        .mockRejectedValue(new ApiError(403, "raw authorization details")),
    };
    const controller = createTelegramPersonalMessagesController({ api });
    controller.setContext({
      visible: true,
      projectId: "project-1",
      endUserId: "end-user-1",
      canSend: true,
      linkStatus: "ACTIVE",
    });

    await controller.send({ text: "Проверка статуса", file: null });
    expect(controller.polling.value).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();

    expect(controller.error.value).toBe(
      "Недостаточно прав для просмотра отправки.",
    );
    expect(controller.error.value).not.toContain("raw authorization details");
    expect(controller.polling.value).toBe(false);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("signals that the link summary is stale when create rejects the link or channel", async () => {
    const onLinkStateStale = vi.fn();
    const api = {
      list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      create: vi
        .fn()
        .mockRejectedValue(
          new ApiError(
            409,
            "raw link details",
            undefined,
            undefined,
            "TELEGRAM_LINK_NOT_ACTIVE",
          ),
        ),
      get: vi.fn(),
    };
    const controller = createTelegramPersonalMessagesController({
      api,
      onLinkStateStale,
    });
    controller.setContext({
      visible: true,
      projectId: "project-1",
      endUserId: "end-user-1",
      canSend: true,
      linkStatus: "ACTIVE",
    });

    await controller.send({ text: "Проверка", file: null });

    expect(onLinkStateStale).toHaveBeenCalledTimes(1);
    expect(controller.error.value).toBe(
      "Пользователь больше не подключён к Telegram.",
    );
    expect(controller.error.value).not.toContain("raw link details");
  });

  it("tracks two accepted messages while serializing their deferred status GETs", async () => {
    let resolveFirst!: (
      value: TelegramPersonalMessageDetailResponseDto,
    ) => void;
    let resolveSecond!: (
      value: TelegramPersonalMessageDetailResponseDto,
    ) => void;
    let concurrentGets = 0;
    let maximumConcurrentGets = 0;
    const first = message("QUEUED", { id: "message-a" });
    const second = message("QUEUED", {
      id: "message-b",
      updatedAt: "2026-07-24T09:02:00.000Z",
    });
    const api = {
      list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      create: vi
        .fn()
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(second),
      get: vi.fn().mockImplementation((_, __, messageId: string) => {
        concurrentGets += 1;
        maximumConcurrentGets = Math.max(maximumConcurrentGets, concurrentGets);
        if (messageId === "message-a")
          return new Promise((resolve) => {
            resolveFirst = (value) => {
              concurrentGets -= 1;
              resolve(value);
            };
          });
        return new Promise((resolve) => {
          resolveSecond = (value) => {
            concurrentGets -= 1;
            resolve(value);
          };
        });
      }),
    };
    const controller = createTelegramPersonalMessagesController({ api });
    controller.setContext({
      visible: true,
      projectId: "project-1",
      endUserId: "end-user-1",
      canSend: true,
      linkStatus: "ACTIVE",
    });
    await controller.send({ text: "A", file: null });
    await vi.advanceTimersByTimeAsync(500);
    expect(api.get).toHaveBeenCalledWith(
      "project-1",
      "end-user-1",
      "message-a",
      expect.anything(),
    );

    await controller.send({ text: "B", file: null });
    await vi.advanceTimersByTimeAsync(500);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(maximumConcurrentGets).toBe(1);

    resolveFirst({ ...message("SENT", { id: "message-a" }), attempts: [] });
    await flushPromises();
    expect(controller.activeMessage.value?.id).toBe("message-b");
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(maximumConcurrentGets).toBe(1);

    resolveSecond({
      ...message("SENT", {
        id: "message-b",
        updatedAt: "2026-07-24T09:03:00.000Z",
      }),
      attempts: [],
    });
    await flushPromises();
    expect(controller.activeMessage.value?.id).toBe("message-b");
    expect(controller.activeMessage.value?.status).toBe("SENT");
    expect(
      controller.history.value.find(({ id }) => id === "message-a")?.status,
    ).toBe("SENT");
    expect(api.get).toHaveBeenCalledWith(
      "project-1",
      "end-user-1",
      "message-b",
      expect.anything(),
    );
    expect(controller.polling.value).toBe(false);
  });

  it("recovers every non-terminal history item through one shared GET flight", async () => {
    const resolvers = new Map<
      string,
      (value: TelegramPersonalMessageDetailResponseDto) => void
    >();
    const queuedA = message("QUEUED", { id: "message-a" });
    const queuedB = message("RETRY_WAIT", {
      id: "message-b",
      nextAttemptAt: "not-a-date",
    });
    const api = {
      list: vi.fn().mockResolvedValue({
        items: [queuedA, queuedB],
        nextCursor: null,
      }),
      create: vi.fn(),
      get: vi.fn().mockImplementation(
        (_projectId: string, _endUserId: string, messageId: string) =>
          new Promise((resolve) => {
            resolvers.set(messageId, resolve);
          }),
      ),
    };
    const controller = createTelegramPersonalMessagesController({ api });
    controller.setContext({
      visible: true,
      projectId: "project-1",
      endUserId: "end-user-1",
      canSend: true,
      linkStatus: "ACTIVE",
    });

    await controller.loadHistory();
    await vi.advanceTimersByTimeAsync(500);
    expect(api.get).toHaveBeenCalledTimes(1);
    const firstId = api.get.mock.calls[0]?.[2] as string;
    resolvers.get(firstId)?.({
      ...message("SENT", { id: firstId }),
      attempts: [],
    });
    await flushPromises();
    expect(api.get).toHaveBeenCalledTimes(2);

    const secondId = api.get.mock.calls[1]?.[2] as string;
    resolvers.get(secondId)?.({
      ...message("SENT", { id: secondId }),
      attempts: [],
    });
    await flushPromises();
    expect(controller.history.value.map(({ status }) => status)).toEqual([
      "SENT",
      "SENT",
    ]);
    expect(controller.polling.value).toBe(false);
  });

  it("uses attempt count and lifecycle precedence for equal updatedAt snapshots", async () => {
    const sameTime = "2026-07-24T09:10:00.000Z";
    const api = {
      list: vi
        .fn()
        .mockResolvedValueOnce({
          items: [
            message("RETRY_WAIT", {
              id: "retry",
              attemptCount: 1,
              updatedAt: sameTime,
            }),
            message("SENT", {
              id: "terminal",
              attemptCount: 1,
              updatedAt: sameTime,
            }),
          ],
          nextCursor: null,
        })
        .mockResolvedValueOnce({
          items: [
            message("SENDING", {
              id: "retry",
              attemptCount: 2,
              updatedAt: sameTime,
            }),
            message("QUEUED", {
              id: "terminal",
              attemptCount: 2,
              updatedAt: sameTime,
            }),
          ],
          nextCursor: null,
        })
        .mockResolvedValueOnce({
          items: [
            message("RETRY_WAIT", {
              id: "retry",
              attemptCount: 1,
              updatedAt: sameTime,
            }),
          ],
          nextCursor: null,
        }),
      create: vi.fn(),
      get: vi.fn(),
    };
    const controller = createTelegramPersonalMessagesController({ api });
    controller.setContext({
      visible: true,
      projectId: "project-1",
      endUserId: "end-user-1",
      canSend: true,
      linkStatus: "ACTIVE",
    });

    await controller.loadHistory();
    await controller.loadHistory();
    expect(
      controller.history.value.find(({ id }) => id === "retry"),
    ).toMatchObject({ status: "SENDING", attemptCount: 2 });
    expect(
      controller.history.value.find(({ id }) => id === "terminal")?.status,
    ).toBe("SENT");

    await controller.loadHistory();
    expect(
      controller.history.value.find(({ id }) => id === "retry"),
    ).toMatchObject({ status: "SENDING", attemptCount: 2 });
  });

  it.each([
    ["TELEGRAM_LINK_REVOKED", "отключил связь"],
    ["TELEGRAM_LINK_RELINKED", "переподключил"],
    ["TELEGRAM_CHANNEL_ROTATED", "изменились"],
    ["TELEGRAM_CHANNEL_DISABLED", "отключён"],
    ["TELEGRAM_CHANNEL_VERSION_CONFLICT", "изменились"],
    ["TELEGRAM_CHANNEL_WEBHOOK_GENERATION_STALE", "изменились"],
  ])(
    "refreshes the link summary and renders intentional create copy for %s",
    async (code, expectedCopy) => {
      const onLinkStateStale = vi.fn();
      const api = {
        list: vi.fn(),
        create: vi
          .fn()
          .mockRejectedValue(
            new ApiError(
              409,
              "raw provider details",
              undefined,
              undefined,
              code,
            ),
          ),
        get: vi.fn(),
      };
      const controller = createTelegramPersonalMessagesController({
        api,
        onLinkStateStale,
      });
      controller.setContext({
        visible: true,
        projectId: "project-1",
        endUserId: "end-user-1",
        canSend: true,
        linkStatus: "ACTIVE",
      });

      await controller.send({ text: "Проверка", file: null });

      expect(onLinkStateStale).toHaveBeenCalledTimes(1);
      expect(controller.error.value).toContain(expectedCopy);
      expect(controller.error.value).not.toContain("raw provider details");
    },
  );

  it("reports lifecycle cancellation from history as a stale link summary", async () => {
    const onLinkStateStale = vi.fn();
    const api = {
      list: vi.fn().mockResolvedValue({
        items: [
          message("CANCELLED", {
            errorCode: "TELEGRAM_LINK_RELINKED",
          }),
        ],
        nextCursor: null,
      }),
      create: vi.fn(),
      get: vi.fn(),
    };
    const controller = createTelegramPersonalMessagesController({
      api,
      onLinkStateStale,
    });
    controller.setContext({
      visible: true,
      projectId: "project-1",
      endUserId: "end-user-1",
      canSend: true,
      linkStatus: "ACTIVE",
    });

    await controller.loadHistory();

    expect(onLinkStateStale).toHaveBeenCalledTimes(1);
  });

  it("stops scheduled polling after disposal", async () => {
    const api = {
      list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      create: vi.fn().mockResolvedValue(message("QUEUED")),
      get: vi.fn(),
    };
    const controller = createTelegramPersonalMessagesController({ api });
    controller.setContext({
      visible: true,
      projectId: "project-1",
      endUserId: "end-user-1",
      canSend: true,
      linkStatus: "ACTIVE",
    });
    await controller.send({ text: "Не опрашивать после unmount", file: null });
    controller.dispose();
    await vi.runAllTimersAsync();

    expect(api.get).not.toHaveBeenCalled();
    expect(controller.polling.value).toBe(false);
  });
});
