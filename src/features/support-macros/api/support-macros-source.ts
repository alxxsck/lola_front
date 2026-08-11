import {
  supportMacroArchive,
  supportMacroAuthoringCatalog,
  supportMacroCatalog,
  supportMacroCreate,
  supportMacroListRevisions,
  supportMacroNoteDraftCreate,
  supportMacroNoteDraftEdit,
  supportMacroPreview,
  supportMacroPublish,
  supportMacroReadAuthoring,
  supportMacroReplaceDraft,
  supportMacroReplyDraftCreate,
  supportMacroReplyDraftEdit,
  supportMacroRollback,
} from "@/shared/api/generated/retenive-backend";
import type {
  CreateSupportMacroNoteDraftDto,
  CreateSupportMacroReplyDraftDto,
  RollbackSupportMacroDtoReasonCode,
  SupportMacroCatalogResponseDto,
  SupportMacroDraftDto,
  SupportMacroPreviewResponseDto,
  SupportMacroReplyDraftResponseDto,
  SupportMacroResponseDto,
  SupportMacroRevisionPageResponseDto,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";
import { isMockMode } from "@/shared/config/data-mode";

export interface SupportMacroCatalogRequest {
  query?: string;
  locale?: string;
  teamId?: string;
  topicCode?: string;
  shortcut?: string;
  cursor?: string;
  limit?: number;
}

export interface SupportMacroDraftTarget {
  kind: "PUBLIC_REPLY" | "INTERNAL_NOTE";
  projectId: string;
  macroId: string;
  expectedMacroRevisionId: string;
  endUserId?: string;
  conversationId?: string;
  caseId?: string;
  locale?: string;
}

export interface SupportMacroDraftEditTarget extends SupportMacroDraftTarget {
  draftId: string;
  actionEtag: string;
  text: string;
}

export interface SupportMacroSource {
  catalog(
    projectId: string,
    request: SupportMacroCatalogRequest,
    signal?: AbortSignal,
  ): Promise<SupportMacroCatalogResponseDto>;
  createDraft(
    target: SupportMacroDraftTarget,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SupportMacroReplyDraftResponseDto>;
  editDraft(
    target: SupportMacroDraftEditTarget,
    signal?: AbortSignal,
  ): Promise<SupportMacroReplyDraftResponseDto>;
  authoringCatalog(
    projectId: string,
    request: SupportMacroCatalogRequest,
    signal?: AbortSignal,
  ): Promise<SupportMacroCatalogResponseDto>;
  readAuthoring(
    projectId: string,
    macroId: string,
    signal?: AbortSignal,
  ): Promise<SupportMacroResponseDto>;
  preview(
    projectId: string,
    draft: SupportMacroDraftDto,
    signal?: AbortSignal,
  ): Promise<SupportMacroPreviewResponseDto>;
  create(
    projectId: string,
    stableCode: string,
    draft: SupportMacroDraftDto,
    idempotencyKey: string,
  ): Promise<SupportMacroResponseDto>;
  replaceDraft(
    projectId: string,
    macroId: string,
    draft: SupportMacroDraftDto,
    actionEtag: string,
    idempotencyKey: string,
  ): Promise<SupportMacroResponseDto>;
  publish(
    projectId: string,
    macroId: string,
    actionEtag: string,
    idempotencyKey: string,
  ): Promise<SupportMacroResponseDto>;
  archive(
    projectId: string,
    macroId: string,
    actionEtag: string,
    idempotencyKey: string,
  ): Promise<SupportMacroResponseDto>;
  revisions(
    projectId: string,
    macroId: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<SupportMacroRevisionPageResponseDto>;
  rollback(
    projectId: string,
    macroId: string,
    revisionId: string,
    reasonCode: RollbackSupportMacroDtoReasonCode,
    actionEtag: string,
    idempotencyKey: string,
  ): Promise<SupportMacroResponseDto>;
}

function requestOptions(signal?: AbortSignal) {
  return signal ? { signal } : undefined;
}

function commandOptions(idempotencyKey: string, actionEtag?: string) {
  return {
    headers: {
      "Idempotency-Key": idempotencyKey,
      ...(actionEtag ? { "If-Match": actionEtag } : {}),
    },
  };
}

function assertDraftTarget(target: SupportMacroDraftTarget): void {
  if (
    (target.kind === "PUBLIC_REPLY" &&
      (!target.endUserId || !target.conversationId)) ||
    (target.kind === "INTERNAL_NOTE" && !target.caseId)
  )
    throw new Error("Support Macro draft target is incomplete");
}

const apiSource: SupportMacroSource = {
  async catalog(projectId, request, signal) {
    try {
      return await supportMacroCatalog(
        projectId,
        request,
        requestOptions(signal),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async createDraft(target, idempotencyKey, signal) {
    assertDraftTarget(target);
    const commonBody = {
      macroId: target.macroId,
      expectedMacroRevisionId: target.expectedMacroRevisionId,
    };
    try {
      if (target.kind === "PUBLIC_REPLY") {
        const body: CreateSupportMacroReplyDraftDto = {
          ...commonBody,
          ...(target.caseId ? { endUserCaseId: target.caseId } : {}),
          ...(target.locale ? { locale: target.locale } : {}),
        };
        return await supportMacroReplyDraftCreate(
          target.projectId,
          target.endUserId!,
          target.conversationId!,
          body,
          {
            ...(signal ? { signal } : {}),
            headers: { "Idempotency-Key": idempotencyKey },
          },
        );
      }
      const body: CreateSupportMacroNoteDraftDto = commonBody;
      return await supportMacroNoteDraftCreate(
        target.projectId,
        target.caseId!,
        body,
        {
          ...(signal ? { signal } : {}),
          headers: { "Idempotency-Key": idempotencyKey },
        },
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async editDraft(target, signal) {
    assertDraftTarget(target);
    const options = {
      ...(signal ? { signal } : {}),
      headers: { "If-Match": target.actionEtag },
    };
    try {
      return target.kind === "PUBLIC_REPLY"
        ? await supportMacroReplyDraftEdit(
            target.projectId,
            target.endUserId!,
            target.conversationId!,
            target.draftId,
            { text: target.text },
            options,
          )
        : await supportMacroNoteDraftEdit(
            target.projectId,
            target.caseId!,
            target.draftId,
            { text: target.text },
            options,
          );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async authoringCatalog(projectId, request, signal) {
    try {
      return await supportMacroAuthoringCatalog(
        projectId,
        request,
        requestOptions(signal),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async readAuthoring(projectId, macroId, signal) {
    try {
      return await supportMacroReadAuthoring(
        projectId,
        macroId,
        requestOptions(signal),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async preview(projectId, draft, signal) {
    try {
      return await supportMacroPreview(
        projectId,
        { draft },
        requestOptions(signal),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async create(projectId, stableCode, draft, idempotencyKey) {
    try {
      return await supportMacroCreate(
        projectId,
        { stableCode, draft },
        commandOptions(idempotencyKey),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async replaceDraft(projectId, macroId, draft, actionEtag, idempotencyKey) {
    try {
      return await supportMacroReplaceDraft(
        projectId,
        macroId,
        { draft },
        commandOptions(idempotencyKey, actionEtag),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async publish(projectId, macroId, actionEtag, idempotencyKey) {
    try {
      return await supportMacroPublish(
        projectId,
        macroId,
        commandOptions(idempotencyKey, actionEtag),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async archive(projectId, macroId, actionEtag, idempotencyKey) {
    try {
      return await supportMacroArchive(
        projectId,
        macroId,
        commandOptions(idempotencyKey, actionEtag),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async revisions(projectId, macroId, cursor, signal) {
    try {
      return await supportMacroListRevisions(
        projectId,
        macroId,
        { limit: 50, ...(cursor ? { cursor } : {}) },
        requestOptions(signal),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async rollback(
    projectId,
    macroId,
    revisionId,
    reasonCode,
    actionEtag,
    idempotencyKey,
  ) {
    try {
      return await supportMacroRollback(
        projectId,
        macroId,
        revisionId,
        { reasonCode },
        commandOptions(idempotencyKey, actionEtag),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
};

const mockMacro: SupportMacroResponseDto = {
  id: "65000000-0000-4000-8000-000000000001",
  stableCode: "payment-check",
  lifecycle: "ACTIVE",
  version: 1,
  draft: null,
  publishedRevision: {
    id: "65000000-0000-4000-8000-000000000002",
    revisionNumber: 3,
    contentHash: "a".repeat(64),
    publishedAt: new Date(Date.now() - 86_400_000).toISOString(),
    configuration: {
      compilerRevision: 1,
      title: "Проверка платежа",
      shortcuts: ["платёж", "deposit"],
      locale: "ru",
      body: "Проверяю статус платежа. Пожалуйста, подождите одну минуту.",
      translations: {
        ru: "Проверяю статус платежа. Пожалуйста, подождите одну минуту.",
        en: "I am checking the payment status. Please wait one minute.",
      },
      visibility: { mode: "PROJECT", teamIds: [], topicCodes: ["PAYMENTS"] },
      variables: [],
      contentHash: "a".repeat(64),
    },
  },
  actionEtag: '"sm1.mock"',
  applicability: {
    visibility: "PROJECT",
    teamIds: [],
    categoryCodes: ["PAYMENTS"],
    locale: "ru",
  },
};

const mockMacros: SupportMacroResponseDto[] = [
  mockMacro,
  {
    ...mockMacro,
    id: "65000000-0000-4000-8000-000000000011",
    stableCode: "profile-access",
    version: 2,
    publishedRevision: {
      ...mockMacro.publishedRevision!,
      id: "65000000-0000-4000-8000-000000000012",
      revisionNumber: 2,
      configuration: {
        ...mockMacro.publishedRevision!.configuration,
        title: "Доступ к профилю",
        body: "Откройте профиль и перейдите в раздел безопасности.",
        translations: {
          ru: "Откройте профиль и перейдите в раздел безопасности.",
        },
        shortcuts: ["профиль", "доступ"],
        visibility: { mode: "PROJECT", teamIds: [], topicCodes: ["ACCOUNT"] },
      },
    },
    actionEtag: '"sm1.mock-profile"',
  },
  {
    ...mockMacro,
    id: "65000000-0000-4000-8000-000000000021",
    stableCode: "refund-timing",
    version: 1,
    draft: {
      generation: 1,
      version: 1,
      contentHash: "c".repeat(64),
      configuration: {
        ...mockMacro.publishedRevision!.configuration,
        contentHash: "c".repeat(64),
        title: "Срок возврата",
        body: "Возврат уже создан. Обычно он поступает в течение пяти рабочих дней.",
        translations: {
          ru: "Возврат уже создан. Обычно он поступает в течение пяти рабочих дней.",
          en: "The refund has been created and usually arrives within five business days.",
        },
        shortcuts: ["возврат"],
        visibility: { mode: "PROJECT", teamIds: [], topicCodes: ["REFUNDS"] },
      },
    },
    publishedRevision: null,
    actionEtag: '"sm1.mock-refund"',
  },
  {
    ...mockMacro,
    id: "65000000-0000-4000-8000-000000000031",
    stableCode: "legacy-game-list",
    lifecycle: "ARCHIVED",
    publishedRevision: {
      ...mockMacro.publishedRevision!,
      id: "65000000-0000-4000-8000-000000000032",
      revisionNumber: 1,
      configuration: {
        ...mockMacro.publishedRevision!.configuration,
        title: "Список игр",
        body: "Показываю список доступных игр.",
        translations: { ru: "Показываю список доступных игр." },
        shortcuts: ["игры"],
        visibility: { mode: "PROJECT", teamIds: [], topicCodes: [] },
      },
    },
    actionEtag: '"sm1.mock-legacy"',
  },
];

const mockSource: SupportMacroSource = {
  async catalog(_projectId, request) {
    const query = request.query?.trim().toLocaleLowerCase("ru") ?? "";
    const items = query
      ? mockMacros.filter((macro) => {
          const configuration =
            macro.draft?.configuration ??
            macro.publishedRevision?.configuration;
          return [macro.stableCode, configuration?.title, configuration?.body]
            .filter(Boolean)
            .some((value) =>
              String(value).toLocaleLowerCase("ru").includes(query),
            );
        })
      : mockMacros;
    return {
      items,
      nextCursor: null,
      freshness: {
        state: "CURRENT",
        generation: "1",
        evaluatedAt: new Date().toISOString(),
        authorizationRevision: "mock",
      },
    };
  },
  async createDraft(target, idempotencyKey) {
    void idempotencyKey;
    return {
      id: globalThis.crypto.randomUUID(),
      macroId: target.macroId,
      macroRevisionId: target.expectedMacroRevisionId,
      macroRevisionNumber: 3,
      targetKind: target.kind,
      conversationId: target.conversationId ?? null,
      endUserCaseId: target.caseId ?? null,
      state: "READY",
      version: 1,
      locale: target.locale ?? "ru",
      text:
        (
          mockMacros.find((macro) => macro.id === target.macroId)
            ?.publishedRevision?.configuration.translations as
            Record<string, string> | undefined
        )?.[target.locale ?? "ru"] ??
        mockMacro.publishedRevision!.configuration.body,
      renderedHash: "a".repeat(64),
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      actionEtag: '"smd1.mock"',
    };
  },
  async editDraft(target) {
    const draft = await this.createDraft(
      target,
      globalThis.crypto.randomUUID(),
    );
    return { ...draft, id: target.draftId, version: 2, text: target.text };
  },
  async authoringCatalog(projectId, request) {
    return this.catalog(projectId, request);
  },
  async readAuthoring(_projectId, macroId) {
    return mockMacros.find((macro) => macro.id === macroId) ?? mockMacro;
  },
  async preview(_projectId, draft) {
    return {
      compilerRevision: 1,
      contentHash: "a".repeat(64),
      validatedAt: new Date().toISOString(),
      warningCodes: [],
      draft: {
        ...draft,
        translations: draft.translations ?? { [draft.locale]: draft.body },
        compilerRevision: 1,
        contentHash: "a".repeat(64),
        shortcuts: draft.shortcuts ?? [],
        visibility: {
          mode: draft.visibility.mode,
          teamIds: draft.visibility.teamIds ?? [],
          topicCodes: draft.visibility.topicCodes ?? [],
        },
        variables: draft.variables.map((item) => ({
          ...item,
          fallback: item.fallback ?? null,
        })),
      },
    };
  },
  async create(_projectId, stableCode, draft) {
    return {
      ...mockMacro,
      stableCode,
      draft: {
        generation: 1,
        version: 1,
        contentHash: "a".repeat(64),
        configuration: (await this.preview("", draft)).draft,
      },
    };
  },
  async replaceDraft(_projectId, _macroId, draft) {
    return {
      ...mockMacro,
      draft: {
        generation: 1,
        version: 2,
        contentHash: "a".repeat(64),
        configuration: (await this.preview("", draft)).draft,
      },
    };
  },
  async publish() {
    return mockMacro;
  },
  async archive() {
    return { ...mockMacro, lifecycle: "ARCHIVED" };
  },
  async revisions() {
    return { items: [], nextCursor: null };
  },
  async rollback() {
    return mockMacro;
  },
};

export const supportMacroSource: SupportMacroSource = isMockMode
  ? mockSource
  : apiSource;
