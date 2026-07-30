import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import type {
  ConversationTranslationResponseDto,
  ReplyTranslationDraftResponseDto,
} from "@/shared/api/generated/models";
import {
  createConversationTranslationController,
  type ConversationTranslationApi,
} from "./use-conversation-translation";

const preference = (
  conversationLocale = "de",
): ConversationTranslationResponseDto => ({
  availability: { available: true, reason: null },
  budget: {
    consumedMicros: "0",
    hardExhausted: false,
    hardLimitMicros: null,
    hardPercent: null,
    reservedMicros: "0",
    softLimitMicros: null,
    softPercent: null,
  },
  configRevision: "translation-config-1",
  supportedLocales: ["ru", "de", "en", "fr"],
  language: {
    locale: conversationLocale,
    needsConfirmation: false,
    source: "PROFILE",
  },
  preference: {
    enabled: true,
    endUserLocaleOverride: null,
    updatedAt: "2026-07-30T10:00:00.000Z",
    version: 1,
    workingLocale: "ru",
  },
  projectVersion: 3,
});

const readyDraft = (
  sourceText = "Здравствуйте",
): ReplyTranslationDraftResponseDto => ({
  conversationId: "conversation-1",
  createdAt: "2026-07-30T10:00:00.000Z",
  deliveredTextPreview: "Guten Tag",
  editedTranslatedText: null,
  errorCode: null,
  expiresAt: "2099-07-30T10:10:00.000Z",
  id: "draft-1",
  model: "grok-4.3",
  modelConfigRevision: "model-1",
  provider: "xai",
  queued: false,
  sourceLocale: "ru",
  sourceText,
  sourceTextHash: "hash-1",
  status: "READY",
  targetLocale: "de",
  targetLocaleSource: "PROFILE",
  translatedText: "Guten Tag",
  translationConfigRevision: "translation-config-1",
  updatedAt: "2026-07-30T10:00:01.000Z",
  warnings: [],
});

function api(
  overrides: Partial<ConversationTranslationApi> = {},
): ConversationTranslationApi {
  return {
    getConversation: vi.fn().mockResolvedValue(preference()),
    updateConversation: vi.fn().mockResolvedValue(preference()),
    translateMessages: vi.fn().mockResolvedValue({ items: [], queued: false }),
    getMessageTranslation: vi.fn(),
    retryMessageTranslation: vi.fn(),
    createReplyDraft: vi.fn().mockResolvedValue(readyDraft()),
    getReplyDraft: vi.fn(),
    editReplyDraft: vi.fn(),
    retryReplyDraft: vi.fn(),
    ...overrides,
  };
}

describe("conversation translation controller", () => {
  beforeEach(() => sessionStorage.clear());

  it("игнорирует preference от ранее выбранного диалога", async () => {
    let resolveFirst!: (value: ConversationTranslationResponseDto) => void;
    const first = new Promise<ConversationTranslationResponseDto>((resolve) => {
      resolveFirst = resolve;
    });
    const client = api({
      getConversation: vi
        .fn()
        .mockReturnValueOnce(first)
        .mockResolvedValueOnce(preference("fr")),
    });
    const conversationId = ref("conversation-1");
    const controller = createConversationTranslationController(
      {
        projectId: () => "project-1",
        endUserId: () => "user-1",
        conversationId: () => conversationId.value,
        selectedCaseId: () => undefined,
        sourceText: () => "",
      },
      client,
    );

    const oldLoad = controller.load();
    conversationId.value = "conversation-2";
    await controller.load();
    resolveFirst(preference("de"));
    await oldLoad;

    expect(controller.state.value?.language.locale).toBe("fr");
  });

  it("инвалидирует готовый preview при изменении исходного ответа", async () => {
    const sourceText = ref("Здравствуйте");
    const controller = createConversationTranslationController(
      {
        projectId: () => "project-1",
        endUserId: () => "user-1",
        conversationId: () => "conversation-1",
        selectedCaseId: () => undefined,
        sourceText: () => sourceText.value,
      },
      api(),
    );

    await controller.createReplyPreview();
    expect(controller.readyDraft.value?.id).toBe("draft-1");

    sourceText.value = "Здравствуйте!";
    await nextTick();

    expect(controller.readyDraft.value).toBeNull();
    expect(controller.previewStale.value).toBe(true);
  });

  it("снимает stale, если оператор вернул исходный текст preview", async () => {
    const sourceText = ref("Здравствуйте");
    const controller = createConversationTranslationController(
      {
        projectId: () => "project-1",
        endUserId: () => "user-1",
        conversationId: () => "conversation-1",
        selectedCaseId: () => undefined,
        sourceText: () => sourceText.value,
      },
      api(),
    );

    await controller.createReplyPreview();
    sourceText.value = "Исправленный текст";
    await nextTick();
    expect(controller.previewStale.value).toBe(true);

    sourceText.value = "Здравствуйте";
    await nextTick();

    expect(controller.previewStale.value).toBe(false);
    expect(controller.readyDraft.value?.id).toBe("draft-1");
  });

  it("инвалидирует готовый preview при смене языка получателя", async () => {
    const client = api({
      updateConversation: vi.fn().mockResolvedValue(preference("fr")),
    });
    const controller = createConversationTranslationController(
      {
        projectId: () => "project-1",
        endUserId: () => "user-1",
        conversationId: () => "conversation-1",
        selectedCaseId: () => undefined,
        sourceText: () => "Здравствуйте",
      },
      client,
    );

    await controller.load();
    await controller.createReplyPreview();
    expect(controller.readyDraft.value?.targetLocale).toBe("de");

    await controller.updatePreference({ endUserLocaleOverride: "fr" });

    expect(controller.draft.value?.targetLocale).toBe("de");
    expect(controller.readyDraft.value).toBeNull();
    expect(controller.previewStale.value).toBe(true);
  });

  it("не переносит поздний edit preview в другой диалог", async () => {
    let resolveEdit!: (value: ReplyTranslationDraftResponseDto) => void;
    const edit = new Promise<ReplyTranslationDraftResponseDto>((resolve) => {
      resolveEdit = resolve;
    });
    const conversationId = ref("conversation-1");
    const client = api({
      editReplyDraft: vi.fn().mockReturnValue(edit),
    });
    const controller = createConversationTranslationController(
      {
        projectId: () => "project-1",
        endUserId: () => "user-1",
        conversationId: () => conversationId.value,
        selectedCaseId: () => undefined,
        sourceText: () => "Здравствуйте",
      },
      client,
    );

    await controller.load();
    await controller.createReplyPreview();
    const pendingEdit = controller.editReplyTranslation("Guten Abend");
    conversationId.value = "conversation-2";
    await controller.load();
    resolveEdit({
      ...readyDraft(),
      editedTranslatedText: "Guten Abend",
    });
    await pendingEdit;

    expect(controller.draft.value).toBeNull();
    expect(
      sessionStorage.getItem(
        "lola:reply-translation-draft:project-1:user-1:conversation-2",
      ),
    ).toBeNull();
  });

  it("не считает pending draft готовым к отправке", async () => {
    const pending = {
      ...readyDraft(),
      status: "PENDING" as const,
      queued: true,
    };
    const controller = createConversationTranslationController(
      {
        projectId: () => "project-1",
        endUserId: () => "user-1",
        conversationId: () => "conversation-1",
        selectedCaseId: () => undefined,
        sourceText: () => "Здравствуйте",
      },
      api({ createReplyDraft: vi.fn().mockResolvedValue(pending) }),
    );

    await controller.createReplyPreview({ poll: false });

    expect(controller.draft.value?.status).toBe("PENDING");
    expect(controller.readyDraft.value).toBeNull();
  });

  it("блокирует target locale до явного разрешения языкового конфликта", async () => {
    const conflict = preference("en");
    conflict.language.needsConfirmation = true;
    conflict.language.conflictingLocale = "de";
    const controller = createConversationTranslationController(
      {
        projectId: () => "project-1",
        endUserId: () => "user-1",
        conversationId: () => "conversation-1",
        selectedCaseId: () => undefined,
        sourceText: () => "Здравствуйте",
      },
      api({ getConversation: vi.fn().mockResolvedValue(conflict) }),
    );

    await controller.load();

    expect(controller.targetLocale.value).toBeNull();
    expect(await controller.createReplyPreview()).toBeNull();
  });

  it("мерджит только актуальный CMS translation realtime", async () => {
    const controller = createConversationTranslationController(
      {
        projectId: () => "project-1",
        endUserId: () => "user-1",
        conversationId: () => "conversation-1",
        selectedCaseId: () => undefined,
        sourceText: () => "",
      },
      api(),
    );
    const event = {
      contractVersion: 1,
      projectId: "project-1",
      endUserId: "user-1",
      conversationId: "conversation-1",
      messageId: "message-1",
      translation: {
        id: "translation-1",
        sourceMessageId: "message-1",
        status: "COMPLETED",
        sourceLocale: "de",
        targetLocale: "ru",
        translatedText: "Добрый день",
        warnings: [],
        errorCode: null,
        updatedAt: "2026-07-30T10:00:01.000Z",
      },
    };

    expect(controller.mergeRealtimeTranslation(event)).toBe(true);
    expect(
      controller.messageTranslations.value.get("message-1")?.translatedText,
    ).toBe("Добрый день");
    expect(
      controller.mergeRealtimeTranslation({
        ...event,
        conversationId: "conversation-2",
      }),
    ).toBe(false);
    expect(
      controller.mergeRealtimeTranslation({
        ...event,
        translation: {
          ...event.translation,
          status: "RUNNING",
          translatedText: null,
        },
      }),
    ).toBe(false);
    expect(
      controller.mergeRealtimeTranslation({
        ...event,
        translation: {
          ...event.translation,
          id: "translation-old-attempt",
          updatedAt: "2026-07-30T10:00:00.000Z",
        },
      }),
    ).toBe(false);
  });

  it("переиспользует готовый persisted draft для неизменённого текста", async () => {
    const client = api();
    const controller = createConversationTranslationController(
      {
        projectId: () => "project-1",
        endUserId: () => "user-1",
        conversationId: () => "conversation-1",
        selectedCaseId: () => undefined,
        sourceText: () => "Здравствуйте",
      },
      client,
    );

    const first = await controller.createReplyPreview();
    const second = await controller.createReplyPreview();

    expect(first?.id).toBe("draft-1");
    expect(second?.id).toBe("draft-1");
    expect(client.createReplyDraft).toHaveBeenCalledTimes(1);
  });

  it("после reload возобновляет polling незавершённого draft", async () => {
    vi.useFakeTimers();
    try {
      sessionStorage.setItem(
        "lola:reply-translation-draft:project-1:user-1:conversation-1",
        JSON.stringify({
          draftId: "draft-1",
          expiresAt: "2099-07-30T10:10:00.000Z",
        }),
      );
      const pending = {
        ...readyDraft(),
        status: "PENDING" as const,
        queued: true,
      };
      const client = api({
        getReplyDraft: vi
          .fn()
          .mockResolvedValueOnce(pending)
          .mockResolvedValueOnce(readyDraft()),
      });
      const controller = createConversationTranslationController(
        {
          projectId: () => "project-1",
          endUserId: () => "user-1",
          conversationId: () => "conversation-1",
          selectedCaseId: () => undefined,
          sourceText: () => "Здравствуйте",
        },
        client,
      );

      await controller.load();
      expect(controller.draft.value?.status).toBe("PENDING");
      await vi.advanceTimersByTimeAsync(350);

      expect(controller.draft.value?.status).toBe("READY");
      expect(client.getReplyDraft).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("сбрасывает busy-флаги предыдущего диалога при навигации", async () => {
    let resolveUpdate!: (value: ConversationTranslationResponseDto) => void;
    const update = new Promise<ConversationTranslationResponseDto>(
      (resolve) => {
        resolveUpdate = resolve;
      },
    );
    const conversationId = ref("conversation-1");
    const client = api({
      updateConversation: vi.fn().mockReturnValue(update),
    });
    const controller = createConversationTranslationController(
      {
        projectId: () => "project-1",
        endUserId: () => "user-1",
        conversationId: () => conversationId.value,
        selectedCaseId: () => undefined,
        sourceText: () => "Здравствуйте",
      },
      client,
    );

    await controller.load();
    const previousUpdate = controller.updatePreference({ enabled: false });
    expect(controller.savingPreference.value).toBe(true);
    conversationId.value = "conversation-2";
    await controller.load();

    expect(controller.savingPreference.value).toBe(false);
    resolveUpdate(preference());
    await previousUpdate;
    expect(controller.savingPreference.value).toBe(false);
  });

  it("создаёт новый idempotency key после подтверждённого create", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(readyDraft())
      .mockResolvedValueOnce({ ...readyDraft(), id: "draft-2" });
    const controller = createConversationTranslationController(
      {
        projectId: () => "project-1",
        endUserId: () => "user-1",
        conversationId: () => "conversation-1",
        selectedCaseId: () => undefined,
        sourceText: () => "Здравствуйте",
      },
      api({ createReplyDraft: create }),
    );

    await controller.createReplyPreview();
    controller.clearReplyDraft();
    await controller.createReplyPreview();

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]?.at(-1)).not.toBe(create.mock.calls[1]?.at(-1));
  });

  it("повторяет неизвестный create draft с тем же idempotency key", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(readyDraft());
    const controller = createConversationTranslationController(
      {
        projectId: () => "project-1",
        endUserId: () => "user-1",
        conversationId: () => "conversation-1",
        selectedCaseId: () => undefined,
        sourceText: () => "Здравствуйте",
      },
      api({ createReplyDraft: create }),
    );

    await controller.createReplyPreview();
    await controller.createReplyPreview();

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][7]).toBe(create.mock.calls[1][7]);
  });

  it("не сохраняет текст ответа в recovery envelope", async () => {
    const controller = createConversationTranslationController(
      {
        projectId: () => "project-1",
        endUserId: () => "user-1",
        conversationId: () => "conversation-1",
        selectedCaseId: () => undefined,
        sourceText: () => "Секретный исходный текст",
      },
      api({
        createReplyDraft: vi
          .fn()
          .mockResolvedValue(readyDraft("Секретный исходный текст")),
      }),
    );

    await controller.createReplyPreview();

    const stored = sessionStorage.getItem(
      "lola:reply-translation-draft:project-1:user-1:conversation-1",
    );
    expect(stored).toContain("draft-1");
    expect(stored).not.toContain("Секретный исходный текст");
  });

  it("ограничивает bulk текущей страницей из 50 сообщений", async () => {
    const translate = vi.fn().mockResolvedValue({ items: [], queued: false });
    const controller = createConversationTranslationController(
      {
        projectId: () => "project-1",
        endUserId: () => "user-1",
        conversationId: () => "conversation-1",
        selectedCaseId: () => undefined,
        sourceText: () => "",
      },
      api({ translateMessages: translate }),
    );
    await controller.load();

    await controller.translateMessages(
      Array.from({ length: 55 }, (_, index) => `message-${index}`),
    );

    expect(translate.mock.calls[0][3]).toHaveLength(50);
  });

  it("продолжает polling входящего перевода после transient GET error", async () => {
    vi.useFakeTimers();
    try {
      const pending = {
        messageId: "message-1",
        translationId: "translation-1",
        state: "PENDING" as const,
        sourceLocale: "de",
        targetLocale: "ru",
        translatedText: null,
        errorCode: null,
        warnings: [],
        updatedAt: "2026-07-30T10:00:00.000Z",
      };
      const completed = {
        ...pending,
        state: "COMPLETED" as const,
        translatedText: "Добрый день",
        updatedAt: "2026-07-30T10:00:02.000Z",
      };
      const get = vi
        .fn()
        .mockRejectedValueOnce(new Error("temporary"))
        .mockResolvedValueOnce(completed);
      const controller = createConversationTranslationController(
        {
          projectId: () => "project-1",
          endUserId: () => "user-1",
          conversationId: () => "conversation-1",
          selectedCaseId: () => undefined,
          sourceText: () => "",
        },
        api({
          translateMessages: vi.fn().mockResolvedValue({
            items: [pending],
            queued: true,
          }),
          getMessageTranslation: get,
        }),
      );
      await controller.load();

      const request = controller.translateMessage("message-1");
      await vi.advanceTimersByTimeAsync(350);
      expect(controller.messageTranslations.value.get("message-1")?.state).toBe(
        "PENDING",
      );
      await vi.advanceTimersByTimeAsync(700);
      await request;

      expect(controller.messageTranslations.value.get("message-1")?.state).toBe(
        "COMPLETED",
      );
      expect(get).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("после unknown bulk outcome запускает authoritative reconciliation", async () => {
    const reconcileMessages = vi.fn().mockResolvedValue(undefined);
    const controller = createConversationTranslationController(
      {
        projectId: () => "project-1",
        endUserId: () => "user-1",
        conversationId: () => "conversation-1",
        selectedCaseId: () => undefined,
        sourceText: () => "",
        reconcileMessages,
      },
      api({
        translateMessages: vi.fn().mockRejectedValue(new Error("network")),
      }),
    );
    await controller.load();

    await controller.translateMessage("message-1");

    expect(reconcileMessages).toHaveBeenCalledTimes(1);
    expect(controller.translatingMessageIds.value.has("message-1")).toBe(false);
  });
});
