import {
  caseIntelligenceCompileDetection,
  caseIntelligenceCurrent,
  caseIntelligenceDiscardDetectionDraft,
  caseIntelligenceDryRun,
  caseIntelligenceLookupCommand,
  caseIntelligencePublishBudget,
  caseIntelligencePublishDetection,
  caseIntelligenceSaveBudgetDraft,
  caseIntelligenceSaveDetectionDraft,
} from "@/shared/api/generated/retenive-backend";
import type {
  CaseIntelligenceBudgetPolicyDto,
  CaseIntelligenceBudgetRevisionResponseDto,
  CaseIntelligenceCommandLookupResponseDto,
  CaseIntelligenceCurrentResponseDto,
  CaseIntelligenceDetectionCompileResponseDto,
  CaseIntelligenceDetectionPolicyDto,
  CaseIntelligenceDetectionRevisionResponseDto,
  CaseIntelligenceDryRunResponseDto,
  CompiledCaseIntelligenceDetectionPolicyDto,
} from "@/shared/api/generated/models";
import { ApiError, normalizeApiError } from "@/shared/api/http/api-error";
import { noAuthRetryRequestOptions } from "@/shared/api/http/axios-instance";
import { isMockMode } from "@/shared/config/data-mode";
import {
  clonePolicy,
  createDefaultBudgetPolicy,
  createDefaultDetectionPolicy,
} from "../model/support-case-intelligence-policy";

export interface SupportCaseIntelligenceSource {
  read(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<CaseIntelligenceCurrentResponseDto>;
  compileDetection(
    projectId: string,
    definition: CaseIntelligenceDetectionPolicyDto,
    signal?: AbortSignal,
  ): Promise<CaseIntelligenceDetectionCompileResponseDto>;
  dryRun(
    projectId: string,
    definition: CaseIntelligenceDetectionPolicyDto,
    input: string,
    locale: string,
    signal?: AbortSignal,
  ): Promise<CaseIntelligenceDryRunResponseDto>;
  saveDetectionDraft(
    projectId: string,
    definition: CaseIntelligenceDetectionPolicyDto,
    expectedVersion: number,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<CaseIntelligenceDetectionRevisionResponseDto>;
  discardDetectionDraft(
    projectId: string,
    expectedVersion: number,
    reason: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<CaseIntelligenceDetectionRevisionResponseDto>;
  publishDetection(
    projectId: string,
    revisionId: string,
    expectedVersion: number,
    reason: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<CaseIntelligenceDetectionRevisionResponseDto>;
  saveBudgetDraft(
    projectId: string,
    definition: CaseIntelligenceBudgetPolicyDto,
    expectedVersion: number,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<CaseIntelligenceBudgetRevisionResponseDto>;
  publishBudget(
    projectId: string,
    revisionId: string,
    expectedVersion: number,
    reason: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<CaseIntelligenceBudgetRevisionResponseDto>;
  lookupCommand(
    projectId: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<CaseIntelligenceCommandLookupResponseDto>;
}

function options(signal?: AbortSignal) {
  return signal ? { signal } : undefined;
}

function commandOptions(signal?: AbortSignal) {
  return { ...noAuthRetryRequestOptions(), ...(signal ? { signal } : {}) };
}

export const apiSupportCaseIntelligenceSource: SupportCaseIntelligenceSource = {
  async read(projectId, signal) {
    try {
      return await caseIntelligenceCurrent(projectId, options(signal));
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async compileDetection(projectId, definition, signal) {
    try {
      return await caseIntelligenceCompileDetection(
        projectId,
        definition,
        options(signal),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async dryRun(projectId, definition, input, locale, signal) {
    try {
      return await caseIntelligenceDryRun(
        projectId,
        { definition, input, locale },
        options(signal),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async saveDetectionDraft(
    projectId,
    definition,
    expectedVersion,
    idempotencyKey,
    signal,
  ) {
    try {
      return await caseIntelligenceSaveDetectionDraft(
        projectId,
        { definition, expectedVersion, idempotencyKey },
        commandOptions(signal),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async discardDetectionDraft(
    projectId,
    expectedVersion,
    reason,
    idempotencyKey,
    signal,
  ) {
    try {
      return await caseIntelligenceDiscardDetectionDraft(
        projectId,
        { expectedVersion, reason, idempotencyKey },
        commandOptions(signal),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async publishDetection(
    projectId,
    revisionId,
    expectedVersion,
    reason,
    idempotencyKey,
    signal,
  ) {
    try {
      return await caseIntelligencePublishDetection(
        projectId,
        { revisionId, expectedVersion, reason, idempotencyKey },
        commandOptions(signal),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async saveBudgetDraft(
    projectId,
    definition,
    expectedVersion,
    idempotencyKey,
    signal,
  ) {
    try {
      return await caseIntelligenceSaveBudgetDraft(
        projectId,
        { definition, expectedVersion, idempotencyKey },
        commandOptions(signal),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async publishBudget(
    projectId,
    revisionId,
    expectedVersion,
    reason,
    idempotencyKey,
    signal,
  ) {
    try {
      return await caseIntelligencePublishBudget(
        projectId,
        { revisionId, expectedVersion, reason, idempotencyKey },
        commandOptions(signal),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async lookupCommand(projectId, idempotencyKey, signal) {
    try {
      return await caseIntelligenceLookupCommand(
        projectId,
        idempotencyKey,
        options(signal),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
};

const mockProjectState = new Map<string, CaseIntelligenceCurrentResponseDto>();

function budgetRevision(
  projectId: string,
  version: number,
  status: "DRAFT" | "PUBLISHED",
  definition: CaseIntelligenceBudgetPolicyDto,
): CaseIntelligenceBudgetRevisionResponseDto {
  return {
    ...clonePolicy(definition),
    id: `budget-${projectId}-${version}`,
    projectId,
    status,
    version,
    createdAt: new Date().toISOString(),
    publishedAt: undefined,
    publishedByCmsUserId: null,
    createdByCmsUserId: null,
  };
}

function detectionRevision(
  projectId: string,
  version: number,
  status: "DRAFT" | "PUBLISHED",
  definition: CaseIntelligenceDetectionPolicyDto,
): CaseIntelligenceDetectionRevisionResponseDto {
  return {
    id: `detection-${projectId}-${version}`,
    projectId,
    status,
    version,
    definition: clonePolicy(definition),
    compiledPolicy: compileMockPolicy(definition),
    compiledPolicyHash: "a".repeat(64),
    compilerRevisionId: "case-intelligence-compiler-v1",
    createdAt: new Date().toISOString(),
    createdByCmsUserId: null,
    publishedAt: undefined,
    publishedByCmsUserId: null,
  };
}

function compileMockPolicy(
  definition: CaseIntelligenceDetectionPolicyDto,
): CompiledCaseIntelligenceDetectionPolicyDto {
  return {
    ...clonePolicy(definition),
    compilerRevisionId: "case-intelligence-compiler-v1",
    schemaVersion: 1,
    rules: clonePolicy(definition.rules),
  };
}

function ensureMockState(
  projectId: string,
): CaseIntelligenceCurrentResponseDto {
  const existing = mockProjectState.get(projectId);
  if (existing) return existing;
  const policy = createDefaultDetectionPolicy();
  policy.topics = [
    {
      code: "PAYMENT",
      description: "Оплата, списания и возвраты",
      positiveExamples: ["Списали деньги дважды"],
      negativeExamples: ["Какие способы оплаты доступны?"],
    },
  ];
  policy.rules = [
    {
      code: "PAYMENT_EXACT",
      kind: "PHRASE",
      phrase: "списали деньги",
      priority: 100,
      action: "CREATE",
      locale: "ru-RU",
    },
  ];
  const detection = detectionRevision(projectId, 1, "PUBLISHED", policy);
  const budget = budgetRevision(
    projectId,
    1,
    "PUBLISHED",
    createDefaultBudgetPolicy(),
  );
  const state: CaseIntelligenceCurrentResponseDto = {
    allowedActions: [
      "SAVE_DETECTION_DRAFT",
      "PREVIEW",
      "PUBLISH",
      "SAVE_BUDGET_DRAFT",
      "PUBLISH_BUDGET",
    ],
    detection: { draft: null, published: detection },
    budget: { draft: null, published: budget },
    escalation: { draft: null, published: null },
    runtime: { currentReleaseRevisionId: null, status: "LIVE", version: 0 },
    release: null,
    minimumSafetyRevisionId: null,
  };
  mockProjectState.set(projectId, state);
  return state;
}

export const mockSupportCaseIntelligenceSource: SupportCaseIntelligenceSource =
  {
    async read(projectId) {
      return clonePolicy(ensureMockState(projectId));
    },
    async compileDetection(_projectId, definition) {
      return {
        compiledPolicy: compileMockPolicy(definition),
        compiledPolicyHash: "b".repeat(64),
        compilerRevisionId: "case-intelligence-compiler-v1",
      };
    },
    async dryRun(_projectId, definition, input) {
      const normalized = input.toLocaleLowerCase("ru-RU");
      const matched = definition.rules.filter(
        (rule) =>
          (rule.phrase ?? "").trim() &&
          normalized.includes((rule.phrase ?? "").toLocaleLowerCase("ru-RU")),
      );
      return {
        caseDecision: matched[0]?.action ?? "DEFER",
        matchedRuleCodes: matched.map((rule) => rule.code),
        reasonCode: matched.length
          ? "CASE_INTELLIGENCE_DETERMINISTIC_RULE_MATCH"
          : "CASE_INTELLIGENCE_NO_DETERMINISTIC_MATCH",
      };
    },
    async saveDetectionDraft(projectId, definition, expectedVersion) {
      const state = ensureMockState(projectId);
      const latest = Math.max(
        state.detection?.draft?.version ?? 0,
        state.detection?.published?.version ?? 0,
      );
      if (expectedVersion !== latest)
        throw new ApiError(
          409,
          "Версия изменилась",
          undefined,
          undefined,
          "VERSION_CONFLICT",
        );
      const revision = detectionRevision(
        projectId,
        latest + 1,
        "DRAFT",
        definition,
      );
      state.detection = {
        ...(state.detection ?? { published: null }),
        draft: revision,
      };
      return clonePolicy(revision);
    },
    async discardDetectionDraft(projectId, expectedVersion) {
      const state = ensureMockState(projectId);
      const draft = state.detection?.draft;
      if (!draft || draft.version !== expectedVersion)
        throw new ApiError(
          409,
          "Версия изменилась",
          undefined,
          undefined,
          "VERSION_CONFLICT",
        );
      state.detection = {
        draft: null,
        published: state.detection?.published ?? null,
      };
      return clonePolicy(draft);
    },
    async publishDetection(projectId, revisionId, expectedVersion) {
      const state = ensureMockState(projectId);
      const draft = state.detection?.draft;
      if (
        !draft ||
        draft.id !== revisionId ||
        draft.version !== expectedVersion
      )
        throw new ApiError(
          409,
          "Версия изменилась",
          undefined,
          undefined,
          "VERSION_CONFLICT",
        );
      const published: CaseIntelligenceDetectionRevisionResponseDto = {
        ...draft,
        status: "PUBLISHED",
        publishedAt: undefined,
      };
      state.detection = { draft: null, published };
      return clonePolicy(published);
    },
    async saveBudgetDraft(projectId, definition, expectedVersion) {
      const state = ensureMockState(projectId);
      const latest = Math.max(
        state.budget?.draft?.version ?? 0,
        state.budget?.published?.version ?? 0,
      );
      if (expectedVersion !== latest)
        throw new ApiError(
          409,
          "Версия изменилась",
          undefined,
          undefined,
          "VERSION_CONFLICT",
        );
      const revision = budgetRevision(
        projectId,
        latest + 1,
        "DRAFT",
        definition,
      );
      state.budget = {
        ...(state.budget ?? { published: null }),
        draft: revision,
      };
      return clonePolicy(revision);
    },
    async publishBudget(projectId, revisionId, expectedVersion) {
      const state = ensureMockState(projectId);
      const draft = state.budget?.draft;
      if (
        !draft ||
        draft.id !== revisionId ||
        draft.version !== expectedVersion
      )
        throw new ApiError(
          409,
          "Версия изменилась",
          undefined,
          undefined,
          "VERSION_CONFLICT",
        );
      const published = {
        ...draft,
        status: "PUBLISHED" as const,
        publishedAt: new Date().toISOString(),
      };
      state.budget = { draft: null, published };
      return clonePolicy(published);
    },
    async lookupCommand() {
      throw new ApiError(
        404,
        "Команда не найдена",
        undefined,
        undefined,
        "NOT_FOUND",
      );
    },
  };

export const supportCaseIntelligenceSource = isMockMode
  ? mockSupportCaseIntelligenceSource
  : apiSupportCaseIntelligenceSource;
