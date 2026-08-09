import {
  supportInternalKnowledgeCreateCitationDraft,
  supportInternalKnowledgeCreateDownloadGrant,
  supportInternalKnowledgeExchangeDownloadGrant,
  supportInternalKnowledgeOpen,
  supportInternalKnowledgeSearch,
  supportInternalKnowledgeUpdateCitationDraft,
} from "@/shared/api/generated/retenive-backend";
import type {
  SupportKnowledgeCitationDraftResponseDto,
  SupportKnowledgeFileDownloadResponseDto,
  SupportKnowledgeSearchItemResponseDto,
  SupportKnowledgeSearchPageResponseDto,
  SupportKnowledgeTextDocumentResponseDto,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";
import { isMockMode } from "@/shared/config/data-mode";

export interface SupportKnowledgeScope {
  projectId: string;
  caseId: string;
  conversationId: string;
  locale?: string;
  topicCode?: string;
}

export interface SupportInternalKnowledgeSource {
  search(scope: SupportKnowledgeScope, query: string, cursor?: string, signal?: AbortSignal): Promise<SupportKnowledgeSearchPageResponseDto>;
  open(scope: SupportKnowledgeScope, item: SupportKnowledgeSearchItemResponseDto, signal?: AbortSignal): Promise<SupportKnowledgeTextDocumentResponseDto>;
  createCitation(scope: SupportKnowledgeScope, item: SupportKnowledgeSearchItemResponseDto, mode: "QUOTE" | "LINK", selectedText?: string): Promise<SupportKnowledgeCitationDraftResponseDto>;
  updateCitation(scope: SupportKnowledgeScope, draft: SupportKnowledgeCitationDraftResponseDto, text: string): Promise<SupportKnowledgeCitationDraftResponseDto>;
  download(scope: SupportKnowledgeScope, item: SupportKnowledgeSearchItemResponseDto): Promise<SupportKnowledgeFileDownloadResponseDto>;
}

function options(signal?: AbortSignal) {
  return signal ? { signal } : undefined;
}

const apiSource: SupportInternalKnowledgeSource = {
  async search(scope, query, cursor, signal) {
    try {
      return await supportInternalKnowledgeSearch(
        scope.projectId,
        {
          caseId: scope.caseId,
          q: query,
          audience: "ALL",
          rollout: "CURRENT",
          limit: 20,
          ...(scope.locale ? { locale: scope.locale } : {}),
          ...(scope.topicCode ? { topicCode: scope.topicCode } : {}),
          ...(cursor ? { cursor } : {}),
        },
        options(signal),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async open(scope, item, signal) {
    try {
      return await supportInternalKnowledgeOpen(
        scope.projectId,
        item.documentId,
        { caseId: scope.caseId, revisionId: item.revisionId },
        options(signal),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async createCitation(scope, item, mode, selectedText) {
    try {
      return await supportInternalKnowledgeCreateCitationDraft(scope.projectId, {
        caseId: scope.caseId,
        conversationId: scope.conversationId,
        documentId: item.documentId,
        revisionId: item.revisionId,
        mode,
        ...(mode === "QUOTE" && selectedText ? { selectedText } : {}),
      });
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async updateCitation(scope, draft, text) {
    try {
      return await supportInternalKnowledgeUpdateCitationDraft(
        scope.projectId,
        draft.id,
        { expectedVersion: draft.version, text },
        { caseId: scope.caseId, conversationId: scope.conversationId },
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async download(scope, item) {
    try {
      const grant = await supportInternalKnowledgeCreateDownloadGrant(
        scope.projectId,
        item.documentId,
        { caseId: scope.caseId, revisionId: item.revisionId },
      );
      if (
        grant.documentId !== item.documentId ||
        grant.revisionId !== item.revisionId
      )
        throw new Error("Knowledge download grant changed identity");
      const result = await supportInternalKnowledgeExchangeDownloadGrant(
        scope.projectId,
        grant.grantId,
        { caseId: scope.caseId },
      );
      if (
        result.grantId !== grant.grantId ||
        result.documentId !== item.documentId ||
        result.revisionId !== item.revisionId
      )
        throw new Error("Knowledge download changed identity");
      return result;
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
};

const MOCK_TEXT = "Попросите пользователя проверить статус операции и время последней попытки. Если платёж не появился через 15 минут, зафиксируйте способ оплаты и передайте обращение команде PAYMENTS.";
const mockItem: SupportKnowledgeSearchItemResponseDto = {
  documentId: "knowledge-payments-1",
  revisionId: "knowledge-payments-revision-3",
  revisionNumber: 3,
  sourceType: "TEXT",
  title: "Депозит не поступил: первичная проверка",
  language: "ru",
  publishedAt: "2026-08-08T10:00:00.000Z",
  snippet: "Проверка статуса депозита, безопасный ответ и момент передачи в PAYMENTS.",
  allowedActions: ["OPEN", "INSERT_QUOTE", "INSERT_LINK", "REPORT_PROBLEM"],
};

const mockSource: SupportInternalKnowledgeSource = {
  async search(_scope, query) {
    const matches = `${mockItem.title} ${mockItem.snippet}`.toLowerCase().includes(query.toLowerCase());
    return {
      items: matches ? [mockItem] : [],
      nextCursor: null,
      freshness: { state: "CURRENT", admissionVersion: 2, catalogGeneration: 7, evaluatedAt: new Date().toISOString() },
    };
  },
  async open(_scope, item) {
    return {
      ...item,
      sourceType: "TEXT",
      allowedActions: item.allowedActions.filter(
        (action): action is "INSERT_QUOTE" | "INSERT_LINK" | "REPORT_PROBLEM" =>
          action === "INSERT_QUOTE" || action === "INSERT_LINK" || action === "REPORT_PROBLEM",
      ),
      contentText: MOCK_TEXT,
      freshness: { state: "CURRENT", admissionVersion: 2, catalogGeneration: 7, evaluatedAt: new Date().toISOString() },
    };
  },
  async createCitation(_scope, item, mode, selectedText) {
    return {
      id: globalThis.crypto.randomUUID(),
      documentId: item.documentId,
      revisionId: item.revisionId,
      revisionNumber: item.revisionNumber,
      mode,
      state: "READY",
      version: 1,
      text: mode === "QUOTE" ? selectedText ?? null : `[${item.title}](support-knowledge://${item.documentId}/${item.revisionId})`,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      actionEtag: '"skd1.mock"',
    };
  },
  async updateCitation(_scope, draft, text) {
    return { ...draft, text, version: draft.version + 1, actionEtag: '"skd1.mock-updated"' };
  },
  async download(_scope, item) {
    return {
      documentId: item.documentId,
      revisionId: item.revisionId,
      grantId: "mock-grant",
      filename: `${item.title}.txt`,
      url: "https://downloads.example.test/support-knowledge.txt",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  },
};

export const supportInternalKnowledgeSource = isMockMode ? mockSource : apiSource;
