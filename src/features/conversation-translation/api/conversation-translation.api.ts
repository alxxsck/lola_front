import {
  conversationMessageTranslationCreate,
  conversationMessageTranslationGet,
  conversationMessageTranslationRetry,
  conversationTranslationGet,
  conversationTranslationPut,
  replyTranslationDraftCreate,
  replyTranslationDraftEdit,
  replyTranslationDraftGet,
  replyTranslationDraftRetry,
} from "@/shared/api/generated/lola-backend";
import type {
  ConversationMessageTranslationItemResponseDto,
  ConversationMessageTranslationsResponseDto,
  ConversationTranslationResponseDto,
  EditReplyTranslationDraftDto,
  ReplyTranslationDraftResponseDto,
  UpdateConversationTranslationPreferenceDto,
} from "@/shared/api/generated/models";
import { isMockMode } from "@/shared/config/data-mode";

const mockPreferences = new Map<string, ConversationTranslationResponseDto>();
const mockMessageTranslations = new Map<
  string,
  ConversationMessageTranslationItemResponseDto
>();
const mockDrafts = new Map<string, ReplyTranslationDraftResponseDto>();

function mockPreferenceStorageKey(conversationId: string): string {
  return `lola:mock-conversation-translation:${conversationId}`;
}

function readStoredMockPreference(
  conversationId: string,
): ConversationTranslationResponseDto | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(
      mockPreferenceStorageKey(conversationId),
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConversationTranslationResponseDto;
    return parsed?.preference?.workingLocale &&
      typeof parsed.preference.enabled === "boolean"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function storeMockPreference(
  conversationId: string,
  value: ConversationTranslationResponseDto,
): void {
  try {
    globalThis.sessionStorage?.setItem(
      mockPreferenceStorageKey(conversationId),
      JSON.stringify(value),
    );
  } catch {
    // Demo persistence is best-effort and contains no message content.
  }
}

function mockPreference(
  conversationId: string,
): ConversationTranslationResponseDto {
  const saved =
    mockPreferences.get(conversationId) ??
    readStoredMockPreference(conversationId);
  if (saved) return saved;
  const value: ConversationTranslationResponseDto = {
    availability: { available: true, reason: null },
    budget: {
      consumedMicros: "3200",
      hardExhausted: false,
      hardLimitMicros: null,
      hardPercent: null,
      reservedMicros: "0",
      softLimitMicros: null,
      softPercent: null,
    },
    configRevision: "demo-translation-config",
    supportedLocales: [
      "ru",
      "de",
      "en",
      "es",
      "fr",
      "it",
      "pt",
      "pl",
      "tr",
      "uk",
      "ar",
      "ja",
      "ko",
      "zh-CN",
    ],
    language: {
      locale: "de",
      needsConfirmation: false,
      source: "PROFILE",
    },
    preference: {
      enabled: false,
      endUserLocaleOverride: null,
      updatedAt: null,
      version: null,
      workingLocale: "ru",
    },
    projectVersion: 1,
  };
  mockPreferences.set(conversationId, value);
  storeMockPreference(conversationId, value);
  return value;
}

export const conversationTranslationApi = {
  getConversation(
    projectId: string,
    endUserId: string,
    conversationId: string,
    selectedCaseId?: string,
  ): Promise<ConversationTranslationResponseDto> {
    if (isMockMode) return Promise.resolve(mockPreference(conversationId));
    return conversationTranslationGet(
      projectId,
      endUserId,
      conversationId,
      selectedCaseId ? { selectedCaseId } : undefined,
    );
  },
  updateConversation(
    projectId: string,
    endUserId: string,
    conversationId: string,
    value: UpdateConversationTranslationPreferenceDto,
    selectedCaseId?: string,
  ): Promise<ConversationTranslationResponseDto> {
    if (isMockMode) {
      const current = mockPreference(conversationId);
      const next: ConversationTranslationResponseDto = {
        ...current,
        preference: {
          enabled: value.enabled,
          endUserLocaleOverride: value.endUserLocaleOverride,
          workingLocale: value.workingLocale,
          updatedAt: new Date().toISOString(),
          version: (current.preference.version ?? 0) + 1,
        },
      };
      mockPreferences.set(conversationId, next);
      storeMockPreference(conversationId, next);
      return Promise.resolve(next);
    }
    return conversationTranslationPut(
      projectId,
      endUserId,
      conversationId,
      value,
      selectedCaseId ? { selectedCaseId } : undefined,
    );
  },
  translateMessages(
    projectId: string,
    endUserId: string,
    conversationId: string,
    messageIds: string[],
    targetLocale: string,
    idempotencyKey: string,
  ): Promise<ConversationMessageTranslationsResponseDto> {
    if (isMockMode) {
      const items = messageIds.map((messageId) => {
        const item: ConversationMessageTranslationItemResponseDto = {
          messageId,
          translationId: `demo-translation-${messageId}`,
          state: "COMPLETED",
          sourceLocale: "de",
          targetLocale,
          translatedText: "Демонстрационный перевод сообщения",
          warnings: [],
          updatedAt: new Date().toISOString(),
        };
        mockMessageTranslations.set(item.translationId!, item);
        return item;
      });
      return Promise.resolve({ items, queued: false });
    }
    return conversationMessageTranslationCreate(
      projectId,
      endUserId,
      conversationId,
      { messageIds, targetLocale },
      { headers: { "Idempotency-Key": idempotencyKey } },
    );
  },
  getMessageTranslation(
    projectId: string,
    endUserId: string,
    conversationId: string,
    translationId: string,
  ): Promise<ConversationMessageTranslationItemResponseDto> {
    if (isMockMode) {
      const item = mockMessageTranslations.get(translationId);
      return item
        ? Promise.resolve(item)
        : Promise.reject(new Error("Демонстрационный перевод не найден"));
    }
    return conversationMessageTranslationGet(
      projectId,
      endUserId,
      conversationId,
      translationId,
    );
  },
  retryMessageTranslation(
    projectId: string,
    endUserId: string,
    conversationId: string,
    translationId: string,
    idempotencyKey: string,
  ): Promise<ConversationMessageTranslationItemResponseDto> {
    if (isMockMode) {
      const item = mockMessageTranslations.get(translationId);
      return item
        ? Promise.resolve(item)
        : Promise.reject(new Error("Демонстрационный перевод не найден"));
    }
    return conversationMessageTranslationRetry(
      projectId,
      endUserId,
      conversationId,
      translationId,
      { headers: { "Idempotency-Key": idempotencyKey } },
    );
  },
  createReplyDraft(
    projectId: string,
    endUserId: string,
    conversationId: string,
    sourceText: string,
    sourceLocale: string,
    targetLocale: string,
    endUserCaseId?: string,
    idempotencyKey?: string,
  ): Promise<ReplyTranslationDraftResponseDto> {
    if (isMockMode) {
      const now = new Date();
      const value: ReplyTranslationDraftResponseDto = {
        conversationId,
        createdAt: now.toISOString(),
        deliveredTextPreview: `DE · ${sourceText}`,
        editedTranslatedText: null,
        errorCode: null,
        expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
        id: globalThis.crypto.randomUUID(),
        model: "grok-4.3",
        modelConfigRevision: "demo-model-config",
        provider: "xai",
        queued: false,
        sourceLocale,
        sourceText,
        sourceTextHash: `demo-${sourceText.length}`,
        status: "READY",
        targetLocale,
        targetLocaleSource: "PROFILE",
        translatedText: `DE · ${sourceText}`,
        translationConfigRevision: "demo-translation-config",
        updatedAt: now.toISOString(),
        warnings: [],
      };
      mockDrafts.set(value.id, value);
      return Promise.resolve(value);
    }
    return replyTranslationDraftCreate(
      projectId,
      endUserId,
      conversationId,
      {
        sourceText,
        sourceLocale,
        targetLocale,
        ...(endUserCaseId ? { endUserCaseId } : {}),
      },
      {
        headers: {
          "Idempotency-Key": idempotencyKey ?? globalThis.crypto.randomUUID(),
        },
      },
    );
  },
  getReplyDraft(
    projectId: string,
    endUserId: string,
    conversationId: string,
    draftId: string,
  ): Promise<ReplyTranslationDraftResponseDto> {
    if (isMockMode) {
      const draft = mockDrafts.get(draftId);
      return draft
        ? Promise.resolve(draft)
        : Promise.reject(new Error("Демонстрационный черновик не найден"));
    }
    return replyTranslationDraftGet(
      projectId,
      endUserId,
      conversationId,
      draftId,
    );
  },
  editReplyDraft(
    projectId: string,
    endUserId: string,
    conversationId: string,
    draftId: string,
    value: EditReplyTranslationDraftDto,
  ): Promise<ReplyTranslationDraftResponseDto> {
    if (isMockMode) {
      const current = mockDrafts.get(draftId);
      if (!current)
        return Promise.reject(new Error("Демонстрационный черновик не найден"));
      const next = {
        ...current,
        editedTranslatedText: value.editedTranslatedText ?? null,
        deliveredTextPreview:
          value.editedTranslatedText ?? current.translatedText,
        updatedAt: new Date().toISOString(),
      };
      mockDrafts.set(draftId, next);
      return Promise.resolve(next);
    }
    return replyTranslationDraftEdit(
      projectId,
      endUserId,
      conversationId,
      draftId,
      value,
    );
  },
  retryReplyDraft(
    projectId: string,
    endUserId: string,
    conversationId: string,
    draftId: string,
    idempotencyKey: string,
  ): Promise<ReplyTranslationDraftResponseDto> {
    if (isMockMode) {
      const draft = mockDrafts.get(draftId);
      return draft
        ? Promise.resolve({ ...draft, status: "READY", queued: false })
        : Promise.reject(new Error("Демонстрационный черновик не найден"));
    }
    return replyTranslationDraftRetry(
      projectId,
      endUserId,
      conversationId,
      draftId,
      { headers: { "Idempotency-Key": idempotencyKey } },
    );
  },
};
