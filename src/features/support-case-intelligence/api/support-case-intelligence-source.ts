import {
  caseIntelligenceCalibration,
  caseIntelligenceCompileDetection,
  caseIntelligenceCurrent,
  caseIntelligenceDiscardDetectionDraft,
  caseIntelligenceDryRun,
  caseIntelligenceLookupCommand,
  caseIntelligenceModelProfiles,
  caseIntelligencePublishBudget,
  caseIntelligencePublishDetection,
  caseIntelligenceSaveBudgetDraft,
  caseIntelligenceSaveDetectionDraft,
  caseIntelligenceValidateDetection,
} from '@/shared/api/generated/retenive-backend';
import type {
  CaseIntelligenceBudgetPolicyDto,
  CaseIntelligenceBudgetRevisionResponseDto,
  CaseIntelligenceCalibrationResponseDto,
  CaseIntelligenceCommandLookupResponseDto,
  CaseIntelligenceCurrentResponseDto,
  CaseIntelligenceDetectionCompileResponseDto,
  CaseIntelligenceDetectionPolicyDto,
  CaseIntelligenceDetectionRevisionResponseDto,
  CaseIntelligenceDetectionValidationResponseDto,
  CaseIntelligencePreviewMessageDto,
  CaseIntelligenceDryRunResponseDto,
  CaseIntelligenceModelProfileCatalogResponseDto,
  CompiledCaseIntelligenceDetectionPolicyDto,
} from '@/shared/api/generated/models';
import { ApiError, normalizeApiError } from '@/shared/api/http/api-error';
import { noAuthRetryRequestOptions } from '@/shared/api/http/axios-instance';
import { isMockMode } from '@/shared/config/data-mode';
import {
  clonePolicy,
  createDefaultBudgetPolicy,
  createDefaultDetectionPolicy,
} from '../model/support-case-intelligence-policy';

export interface SupportCaseIntelligenceSource {
  read(projectId: string, signal?: AbortSignal): Promise<CaseIntelligenceCurrentResponseDto>;
  readModelProfiles(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<CaseIntelligenceModelProfileCatalogResponseDto>;
  validateDetection(
    projectId: string,
    definition: CaseIntelligenceDetectionPolicyDto,
    signal?: AbortSignal,
  ): Promise<CaseIntelligenceDetectionValidationResponseDto>;
  readCalibration(
    projectId: string,
    definition: CaseIntelligenceDetectionPolicyDto,
    signal?: AbortSignal,
  ): Promise<CaseIntelligenceCalibrationResponseDto>;
  compileDetection(
    projectId: string,
    definition: CaseIntelligenceDetectionPolicyDto,
    signal?: AbortSignal,
  ): Promise<CaseIntelligenceDetectionCompileResponseDto>;
  dryRun(
    projectId: string,
    definition: CaseIntelligenceDetectionPolicyDto,
    messages: CaseIntelligencePreviewMessageDto[],
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
  async readModelProfiles(projectId, signal) {
    try {
      return await caseIntelligenceModelProfiles(projectId, options(signal));
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async validateDetection(projectId, definition, signal) {
    try {
      return await caseIntelligenceValidateDetection(projectId, definition, options(signal));
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async readCalibration(projectId, definition, signal) {
    try {
      return await caseIntelligenceCalibration(projectId, { definition }, options(signal));
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async compileDetection(projectId, definition, signal) {
    try {
      return await caseIntelligenceCompileDetection(projectId, definition, options(signal));
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async dryRun(projectId, definition, messages, signal) {
    try {
      return await caseIntelligenceDryRun(projectId, { definition, messages }, options(signal));
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async saveDetectionDraft(projectId, definition, expectedVersion, idempotencyKey, signal) {
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
  async discardDetectionDraft(projectId, expectedVersion, reason, idempotencyKey, signal) {
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
  async publishDetection(projectId, revisionId, expectedVersion, reason, idempotencyKey, signal) {
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
  async saveBudgetDraft(projectId, definition, expectedVersion, idempotencyKey, signal) {
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
  async publishBudget(projectId, revisionId, expectedVersion, reason, idempotencyKey, signal) {
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
      return await caseIntelligenceLookupCommand(projectId, idempotencyKey, options(signal));
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
};

const mockProjectState = new Map<string, CaseIntelligenceCurrentResponseDto>();

function budgetRevision(
  projectId: string,
  version: number,
  status: 'DRAFT' | 'PUBLISHED',
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
  status: 'DRAFT' | 'PUBLISHED',
  definition: CaseIntelligenceDetectionPolicyDto,
): CaseIntelligenceDetectionRevisionResponseDto {
  return {
    id: `detection-${projectId}-${version}`,
    projectId,
    status,
    version,
    definition: clonePolicy(definition),
    compiledPolicy: compileMockPolicy(definition),
    compiledPolicyHash: 'a'.repeat(64),
    compilerRevisionId: 'case-intelligence-compiler-v1',
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
    compilerRevisionId: 'case-intelligence-compiler-v1',
    schemaVersion: 1,
    rules: definition.rules.map((rule) => ({
      ...clonePolicy(rule),
      normalizedPhrases:
        rule.kind === 'EXACT' || rule.kind === 'PHRASE'
          ? { [rule.locale ?? definition.fallbackLocale]: rule.phrase ?? '' }
          : {},
    })),
  };
}

function ensureMockState(projectId: string): CaseIntelligenceCurrentResponseDto {
  const existing = mockProjectState.get(projectId);
  if (existing) return existing;
  const policy = createDefaultDetectionPolicy();
  policy.topics = [
    {
      code: 'PAYMENT',
      label: 'Оплата',
      description: 'Оплата, списания и возвраты',
      positiveExamples: ['Списали деньги дважды'],
      negativeExamples: ['Какие способы оплаты доступны?'],
    },
  ];
  policy.rules = [
    {
      code: 'PAYMENT_EXACT',
      kind: 'PHRASE',
      phrase: 'списали деньги',
      priority: 100,
      action: 'CREATE',
      locale: 'ru-RU',
    },
  ];
  const detection = detectionRevision(projectId, 1, 'PUBLISHED', policy);
  const budget = budgetRevision(projectId, 1, 'PUBLISHED', createDefaultBudgetPolicy());
  const state: CaseIntelligenceCurrentResponseDto = {
    allowedActions: [
      'SAVE_DETECTION_DRAFT',
      'PREVIEW',
      'PUBLISH',
      'SAVE_BUDGET_DRAFT',
      'PUBLISH_BUDGET',
    ],
    detection: { draft: null, published: detection },
    budget: { draft: null, published: budget },
    escalation: { draft: null, published: null },
    runtime: { currentReleaseRevisionId: null, status: 'LIVE', version: 0 },
    release: null,
    minimumSafetyRevisionId: null,
    safety: {
      state: 'READY',
      authority: 'PLATFORM',
      assistantReleaseGate: 'ALLOW',
      minimumSafetyRevisionId: null,
      reconciledSafetyRevisionId: null,
      releaseSafetyRevisionId: null,
      projectOverrideAllowed: false,
    },
  };
  mockProjectState.set(projectId, state);
  return state;
}

export const mockSupportCaseIntelligenceSource: SupportCaseIntelligenceSource = {
  async read(projectId) {
    return clonePolicy(ensureMockState(projectId));
  },
  async readModelProfiles(projectId) {
    const selectedRevisionId =
      ensureMockState(projectId).detection?.draft?.definition.modelProfileRevisionId ??
      ensureMockState(projectId).detection?.published?.definition.modelProfileRevisionId ??
      null;
    return {
      selectedRevisionId,
      items: [
        {
          revisionId: 'default-router-model',
          displayName: 'Быстрая модель классификации',
          description: 'Основная модель для коротких обращений и точных правил.',
          scope: 'PROJECT',
          provider: 'xai',
          modelId: 'grok-3-mini',
          reasoningEffort: 'low',
          maxOutputTokens: 512,
          strongerFallbackModelId: 'grok-3-mini',
          strongerFallbackReasoningEffort: 'high',
          compatibilityHash: 'c'.repeat(64),
        },
        {
          revisionId: 'balanced-router-model',
          displayName: 'Сбалансированная модель',
          description: 'Для проектов с более длинными сообщениями и близкими категориями.',
          scope: 'PLATFORM',
          provider: 'xai',
          modelId: 'grok-4-fast-non-reasoning',
          reasoningEffort: 'low',
          maxOutputTokens: 768,
          strongerFallbackModelId: null,
          strongerFallbackReasoningEffort: null,
          compatibilityHash: 'd'.repeat(64),
        },
      ],
    };
  },
  async validateDetection(_projectId, definition) {
    return {
      valid: definition.rules.every((rule) => rule.code !== 'BROAD_RULE'),
      issues: definition.rules.flatMap((rule, index) =>
        rule.code === 'BROAD_RULE'
          ? [
              {
                severity: 'WARNING' as const,
                code: 'CASE_INTELLIGENCE_RULE_TOO_BROAD' as const,
                path: `rules[${index}].phrase`,
                relatedPaths: [],
                message: 'Rule is too broad',
              },
            ]
          : [],
      ),
      compiledPolicyHash: 'b'.repeat(64),
    };
  },
  async readCalibration(_projectId, definition) {
    return {
      state: 'READY',
      modelProfileRevisionId: definition.modelProfileRevisionId,
      calibratorRevisionId: 'calibrator-v1',
      datasetRevisionId: 'dataset-v1',
      minimumSamples: 100,
      maximumIntervalWidth: 0.12,
      autoApplyThreshold: definition.confidenceTiers.autoApply,
      cells: definition.channels.flatMap((channel) =>
        definition.locales.flatMap((locale) =>
          (['NO_CASE', 'CREATE', 'ATTACH', 'REOPEN'] as const).map((category) => ({
            modelId: 'grok-3-mini',
            category,
            locale,
            channel,
            samples: 240,
            confidenceInterval: { lower: 0.9, upper: 0.96 },
            coverage: 'SUFFICIENT' as const,
            coverageGatePassed: true,
            autoApplyStatus: 'SCORE_REQUIRED' as const,
            autoApplyBlockedReason: null,
          })),
        ),
      ),
    };
  },
  async compileDetection(_projectId, definition) {
    return {
      compiledPolicy: compileMockPolicy(definition),
      compiledPolicyHash: 'b'.repeat(64),
      compilerRevisionId: 'case-intelligence-compiler-v1',
    };
  },
  async dryRun(_projectId, definition, messages) {
    const userMessages = messages.filter((message) => message.role === 'USER');
    const lastMessage = userMessages.at(-1);
    const normalized = (lastMessage?.text ?? '').toLocaleLowerCase(
      lastMessage?.locale ?? definition.fallbackLocale,
    );
    const matched = definition.rules.filter(
      (rule) =>
        (rule.phrase ?? '').trim() &&
        normalized.includes((rule.phrase ?? '').toLocaleLowerCase('ru-RU')),
    );
    return {
      executionMode: 'NON_DISPATCHING',
      dialogMessageIds: messages.map((message) => message.id),
      caseDecision: matched[0]?.action ?? 'DEFER',
      matchedRuleCodes: matched.map((rule) => rule.code),
      reasonCode: matched.length
        ? 'CASE_INTELLIGENCE_DETERMINISTIC_RULE_MATCH'
        : 'CASE_INTELLIGENCE_NO_DETERMINISTIC_MATCH',
      messageResults: lastMessage
        ? [
            {
              messageId: lastMessage.id,
              contextMessageIds: messages
                .filter((message) => message.id !== lastMessage.id)
                .map((message) => message.id),
              caseDecision: matched[0]?.action ?? 'DEFER',
              matchedRuleCodes: matched.map((rule) => rule.code),
              reasonCode: matched.length
                ? 'CASE_INTELLIGENCE_DETERMINISTIC_RULE_MATCH'
                : 'CASE_INTELLIGENCE_NO_DETERMINISTIC_MATCH',
              confidence: {
                source: matched.length ? 'DETERMINISTIC' : 'UNAVAILABLE',
                value: matched.length ? 1 : null,
                coverage: matched.length ? 'NOT_REQUIRED' : 'INSUFFICIENT',
                interval: matched.length ? { lower: 1, upper: 1 } : null,
                autoApplyAllowed: matched.length > 0,
                autoApplyBlockedReason: matched.length
                  ? null
                  : 'SEMANTIC_ROUTER_NOT_EXECUTED_IN_PREVIEW',
              },
            },
          ]
        : [],
      candidates: definition.topics
        .filter((topic) =>
          [topic.label, topic.description, ...topic.positiveExamples].some((item) =>
            normalized.includes(item.toLocaleLowerCase('ru-RU')),
          ),
        )
        .slice(0, 8)
        .map((topic) => ({
          topicCode: topic.code,
          label: topic.label,
          score: 1,
          matchedEvidence: [topic.label],
          source: 'POLICY_EVIDENCE',
        })),
      cost: {
        currency: 'USD',
        estimatedMicroUsd: '0',
        billedMicroUsd: '0',
        inputTokens: 0,
        outputTokens: 0,
        providerCalls: 0,
        basis: 'DETERMINISTIC_PREVIEW',
      },
      stages: [
        { code: 'POLICY_VALIDATION', state: 'COMPLETED', reasonCode: null },
        { code: 'NORMALIZATION', state: 'COMPLETED', reasonCode: null },
        { code: 'DETERMINISTIC_RULES', state: 'COMPLETED', reasonCode: null },
        {
          code: 'SEMANTIC_ROUTER',
          state: 'SKIPPED',
          reasonCode: 'NON_DISPATCHING_PREVIEW',
        },
        {
          code: 'CALIBRATION',
          state: 'SKIPPED',
          reasonCode: 'NO_MODEL_RESULT',
        },
        { code: 'COST_ACCOUNTING', state: 'COMPLETED', reasonCode: null },
      ],
    };
  },
  async saveDetectionDraft(projectId, definition, expectedVersion) {
    const state = ensureMockState(projectId);
    const latest = Math.max(
      state.detection?.draft?.version ?? 0,
      state.detection?.published?.version ?? 0,
    );
    if (expectedVersion !== latest)
      throw new ApiError(409, 'Версия изменилась', undefined, undefined, 'VERSION_CONFLICT');
    const revision = detectionRevision(projectId, latest + 1, 'DRAFT', definition);
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
      throw new ApiError(409, 'Версия изменилась', undefined, undefined, 'VERSION_CONFLICT');
    state.detection = {
      draft: null,
      published: state.detection?.published ?? null,
    };
    return clonePolicy(draft);
  },
  async publishDetection(projectId, revisionId, expectedVersion) {
    const state = ensureMockState(projectId);
    const draft = state.detection?.draft;
    if (!draft || draft.id !== revisionId || draft.version !== expectedVersion)
      throw new ApiError(409, 'Версия изменилась', undefined, undefined, 'VERSION_CONFLICT');
    const published: CaseIntelligenceDetectionRevisionResponseDto = {
      ...draft,
      status: 'PUBLISHED',
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
      throw new ApiError(409, 'Версия изменилась', undefined, undefined, 'VERSION_CONFLICT');
    const revision = budgetRevision(projectId, latest + 1, 'DRAFT', definition);
    state.budget = {
      ...(state.budget ?? { published: null }),
      draft: revision,
    };
    return clonePolicy(revision);
  },
  async publishBudget(projectId, revisionId, expectedVersion) {
    const state = ensureMockState(projectId);
    const draft = state.budget?.draft;
    if (!draft || draft.id !== revisionId || draft.version !== expectedVersion)
      throw new ApiError(409, 'Версия изменилась', undefined, undefined, 'VERSION_CONFLICT');
    const published = {
      ...draft,
      status: 'PUBLISHED' as const,
      publishedAt: new Date().toISOString(),
    };
    state.budget = { draft: null, published };
    return clonePolicy(published);
  },
  async lookupCommand() {
    throw new ApiError(404, 'Команда не найдена', undefined, undefined, 'NOT_FOUND');
  },
};

export const supportCaseIntelligenceSource = isMockMode
  ? mockSupportCaseIntelligenceSource
  : apiSupportCaseIntelligenceSource;
