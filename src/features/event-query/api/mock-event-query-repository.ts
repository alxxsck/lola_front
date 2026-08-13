import type {
  EstimateCaseVerificationDto,
  EventQueryPolicyItemDto,
  EventQueryPolicyItemStateResponseDto,
  EventQueryPolicyStateResponseDto,
  PreviewEventQueryDto,
  StartCaseVerificationDto,
} from '@/shared/api/generated/models';
import type { EventQueryRepository } from './event-query-repository';

const policyRevisionId = 'event-query-policy-demo-1';
const safeFields = [
  {
    path: 'amount',
    semanticType: 'MONEY' as const,
    sensitivity: 'PUBLIC_TO_END_USER' as const,
    operations: ['PROJECT', 'SUM'] as const,
    currencyPath: 'currency',
  },
  {
    path: 'currency',
    semanticType: 'CURRENCY' as const,
    sensitivity: 'PUBLIC_TO_END_USER' as const,
    operations: ['PROJECT', 'GROUP_BY'] as const,
  },
];
const queryableEvents: EventQueryPolicyItemDto[] = [
  ['registration_completed', 'Подтверждает завершение регистрации'],
  ['deposit_failed', 'Показывает неуспешную попытку пополнения'],
  ['email_confirmation_required', 'Показывает необходимость подтвердить почту'],
].map(([stableCode, descriptionForAI]) => ({
  stableCode: stableCode!,
  descriptionForAI: descriptionForAI!,
  allowedModes: ['SUMMARY', 'AGGREGATE', 'LATEST'],
  maxInteractiveLookbackHours: 744,
  maxVerificationLookbackHours: 2160,
  safeFields: safeFields.map((field) => ({
    ...field,
    operations: [...field.operations],
  })),
}));

let masterEnabled = true;
let projectTokenVersion = 1;
const itemTokenVersions = new Map<string, number>();
const itemSettings = new Map<
  string,
  {
    enabled: boolean;
    endUserConversationEnabled: boolean;
    item: EventQueryPolicyItemDto;
  }
>();
const runs = new Map<string, ReturnType<typeof verificationRun>>();

function policyState(): EventQueryPolicyStateResponseDto {
  return {
    concurrencyToken: `eq-project-v1.demo-${projectTokenVersion}`,
    configured: { masterEnabled },
    diagnostics: [],
    effective: { masterEnabled },
  };
}

function configuration(item: EventQueryPolicyItemDto) {
  return structuredClone({
    descriptionForAI: item.descriptionForAI,
    allowedModes: item.allowedModes,
    safeFields: item.safeFields,
    maxInteractiveLookbackHours: item.maxInteractiveLookbackHours,
    maxVerificationLookbackHours: item.maxVerificationLookbackHours,
  });
}

function itemState(definitionKeyId: string): EventQueryPolicyItemStateResponseDto {
  const fallbackIndex = Math.max(Number(definitionKeyId.replace('demo-event-', '')) - 1, 0);
  const fallbackItem = queryableEvents[fallbackIndex] ?? queryableEvents[0]!;
  const settings = itemSettings.get(definitionKeyId) ?? {
    enabled: true,
    endUserConversationEnabled: true,
    item: structuredClone(fallbackItem),
  };
  const tokenVersion = itemTokenVersions.get(definitionKeyId) ?? 1;
  return {
    concurrencyToken: `eq-item-v1.demo-${definitionKeyId}-${tokenVersion}`,
    configured: {
      enabled: settings.enabled,
      endUserConversationEnabled: settings.endUserConversationEnabled,
      configuration: configuration(settings.item),
    },
    definitionKeyId,
    diagnostics: [],
    effective: {
      internalAi: masterEnabled && settings.enabled,
      endUserConversation: masterEnabled && settings.enabled && settings.endUserConversationEnabled,
    },
    eventCode: settings.item.stableCode,
    lifecycle: 'ACTIVE',
    lifecycleRestrictions: {
      canApply: true,
      canEnable: true,
      readOnly: false,
      reasons: [],
    },
    safeFieldRecommendation: {
      fields: settings.item.safeFields.map((field) => ({
        ...field,
        operations: [...field.operations],
      })),
      skipped: [],
    },
  };
}

function result(eventCode: string) {
  const now = new Date().toISOString();
  return {
    complete: true,
    excludedCount: 0,
    limitations: ['Demo mode: результат сформирован из безопасных fixtures.'],
    matchedCount: 1,
    serializedBytes: 96,
    estimatedAddedInputTokens: 24,
    policyRevisionId,
    provenance: {
      source: 'EVENT_LOG' as const,
      policyRevisionId,
      snapshotReceivedAt: now,
    },
    range: {
      from: new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString(),
      to: now,
    },
    snapshotReceivedAt: now,
    status: 'COMPLETED' as const,
    summaries: [
      {
        eventCode,
        count: 1,
        firstOccurredAt: now,
        lastOccurredAt: now,
      },
    ],
    truncated: false,
  };
}

function verificationEstimate(input: EstimateCaseVerificationDto) {
  const query = structuredClone(input.queries[0]!);
  return {
    complete: true,
    estimatedAddedInputTokens: 24,
    evaluation: 'VERIFIED_RESOLVED' as const,
    policyRevisionId,
    predicate: structuredClone(input.predicate),
    queries: [query],
    results: {
      [query.key]: result(query.query.eventCodes[0] ?? 'event'),
    },
    snapshotReceivedAt: new Date().toISOString(),
  };
}

function verificationRun(input: StartCaseVerificationDto, runId: string) {
  const estimate = verificationEstimate(input);
  return {
    ...estimate,
    caseChanged: true,
    caseStatus: 'RESOLVED',
    caseVersion: 2,
    id: runId,
    planId: `plan-${runId}`,
    status: 'COMPLETED' as const,
  };
}

export const mockEventQueryRepository: EventQueryRepository = {
  async getPolicy() {
    return policyState();
  },

  async applyProject(_projectId, input) {
    if (masterEnabled !== input.masterEnabled) {
      masterEnabled = input.masterEnabled;
      projectTokenVersion += 1;
    }
    return policyState();
  },

  async listItems(_projectId, params) {
    const query = params.query?.toLocaleLowerCase('ru-RU');
    const items = queryableEvents
      .filter(
        (item) =>
          !query ||
          item.stableCode.toLocaleLowerCase('ru-RU').includes(query) ||
          item.descriptionForAI.toLocaleLowerCase('ru-RU').includes(query),
      )
      .map((item) => {
        const sourceIndex = queryableEvents.findIndex(
          (candidate) => candidate.stableCode === item.stableCode,
        );
        const definitionKeyId = `demo-event-${sourceIndex + 1}`;
        const current = itemState(definitionKeyId);
        const queryable =
          params.audience === 'END_USER_CONVERSATION'
            ? current.effective.endUserConversation
            : current.effective.internalAi;
        return {
          definitionKeyId,
          eventCode: current.eventCode,
          eventName: item.descriptionForAI,
          lifecycle: 'ACTIVE' as const,
          configuration: current.configured.configuration,
          effective: current.effective,
          queryable,
        };
      })
      .filter((item) => params.effective === false || item.queryable);
    return {
      audience: params.audience,
      effectiveOnly: params.effective ?? true,
      items,
      pageInfo: { hasMore: false, nextCursor: null },
    };
  },

  async getItem(_projectId, definitionKeyId) {
    return itemState(definitionKeyId);
  },

  async applyItem(_projectId, definitionKeyId, input) {
    const current = itemState(definitionKeyId);
    itemSettings.set(definitionKeyId, {
      enabled: input.enabled,
      endUserConversationEnabled: input.endUserConversationEnabled,
      item: {
        stableCode: current.eventCode,
        descriptionForAI: input.descriptionForAI,
        allowedModes: [...input.allowedModes],
        safeFields: input.safeFields.map((field) => ({
          ...field,
          operations: [...field.operations],
        })),
        maxInteractiveLookbackHours: input.maxInteractiveLookbackHours,
        maxVerificationLookbackHours: input.maxVerificationLookbackHours,
      },
    });
    itemTokenVersions.set(definitionKeyId, (itemTokenVersions.get(definitionKeyId) ?? 1) + 1);
    return itemState(definitionKeyId);
  },

  async preview(_projectId: string, input: PreviewEventQueryDto) {
    return result(input.query.eventCodes[0] ?? 'event');
  },

  async listRequests(_projectId, params) {
    return {
      items: [
        {
          id: 'demo-event-query-request-1',
          createdAt: params.to,
          endUserId: params.endUserId ?? '00000000-0000-4000-8000-000000000001',
          origin: 'INTERACTIVE_TEXT',
          audience: 'END_USER_CONVERSATION',
          mode: 'SUMMARY',
          eventCodes: [queryableEvents[0]!.stableCode],
          queryShape: { mode: 'SUMMARY', eventCodeCount: 1 },
          policyRevisionId: policyRevisionId as never,
          range: { from: params.from, to: params.to },
          snapshotReceivedAt: params.to,
          status: 'COMPLETED',
          rejectionCode: null,
          scannedRows: 1,
          returnedRows: 1,
          resultBytes: 96,
          estimatedAddedInputTokens: 24,
          durationMs: 18,
          attribution: {
            caseId: null,
            aiReviewRunId: null,
            aiAnalysisRunId: null,
            chatMessageId: null,
            voiceSessionId: null,
            voiceTurnId: null,
          },
          linkedAiUsage: {
            records: 1,
            totalTokens: 840,
            inputTokens: 710,
            outputTokens: 130,
            estimatedCostUsd: '0.0042' as never,
            billedCostUsd: null,
          },
        },
      ],
      pageInfo: { hasMore: false, nextCursor: null },
    };
  },

  async estimateCaseVerification(
    _projectId: string,
    _caseId: string,
    input: EstimateCaseVerificationDto,
  ) {
    return verificationEstimate(input);
  },

  async startCaseVerification(
    _projectId: string,
    _caseId: string,
    input: StartCaseVerificationDto,
  ) {
    const runId = crypto.randomUUID();
    const run = verificationRun(input, runId);
    runs.set(runId, run);
    return structuredClone(run);
  },

  async getCaseVerification(_projectId: string, _caseId: string, runId: string) {
    const run = runs.get(runId);
    if (!run) throw new Error('Demo verification run not found');
    return structuredClone(run);
  },
};
