import type {
  EstimateCaseVerificationDto,
  EventQueryPolicyDocumentDto,
  EventQueryPolicyItemDto,
  EventQueryPolicyItemStateResponseDto,
  EventQueryPolicyStateResponseDto,
  EventQueryPolicyUsageParams,
  PreviewEventQueryDto,
  StartCaseVerificationDto,
} from "@/shared/api/generated/models";
import type { EventQueryRepository } from "./event-query-repository";

const publishedAt = "2026-07-28T10:00:00.000Z";
const policyRevisionId = "event-query-policy-demo-1";
const safeFields = [
  {
    path: "amount",
    semanticType: "MONEY" as const,
    sensitivity: "PUBLIC_TO_END_USER" as const,
    operations: ["PROJECT", "SUM"] as const,
    currencyPath: "currency",
  },
  {
    path: "currency",
    semanticType: "CURRENCY" as const,
    sensitivity: "PUBLIC_TO_END_USER" as const,
    operations: ["PROJECT", "GROUP_BY"] as const,
  },
];
const queryableEvents: EventQueryPolicyItemDto[] = [
  ["registration_completed", "Подтверждает завершение регистрации"],
  ["deposit_failed", "Показывает неуспешную попытку пополнения"],
  ["email_confirmation_required", "Показывает необходимость подтвердить почту"],
].map(([stableCode, descriptionForAI]) => ({
  stableCode: stableCode!,
  descriptionForAI: descriptionForAI!,
  allowedModes: ["SUMMARY", "AGGREGATE", "LATEST"],
  maxInteractiveLookbackHours: 744,
  maxVerificationLookbackHours: 2160,
  safeFields: safeFields.map((field) => ({
    ...field,
    operations: [...field.operations],
  })),
}));

let draftVersion = 1;
const draftDocument: EventQueryPolicyDocumentDto = {
  enabled: true,
  items: structuredClone(queryableEvents),
};
let publishedDocument: EventQueryPolicyDocumentDto =
  structuredClone(draftDocument);
const runs = new Map<string, ReturnType<typeof verificationRun>>();

function policyState(): EventQueryPolicyStateResponseDto {
  return {
    counts: {
      configuredDraftItems: draftDocument.items.length,
      enabledDraftItems: draftDocument.items.length,
      endUserConversationDraftItems: draftDocument.items.length,
    },
    currentRevision: {
      compilerVersion: "demo-1",
      documentHash: "demo-policy-document-hash",
      id: policyRevisionId,
      itemCount: publishedDocument.items.length,
      publishedAt,
      version: 1,
    },
    diagnostics: [],
    masterEnabled: draftDocument.enabled,
    version: draftVersion,
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

function itemState(
  definitionKeyId: string,
  item = queryableEvents[0]!,
): EventQueryPolicyItemStateResponseDto {
  return {
    configured: {
      enabled: true,
      endUserConversationEnabled: true,
      configuration: configuration(item),
    },
    definitionKeyId,
    diagnostics: [],
    draftVersion,
    effective: { internalAi: true, endUserConversation: true },
    eventCode: item.stableCode,
    lifecycle: "ACTIVE",
    policyDraftVersion: draftVersion,
    published: {
      enabled: true,
      endUserConversationEnabled: true,
      configuration: configuration(item),
    },
    publishedPolicyVersion: 1 as never,
  };
}

function result(eventCode: string) {
  const now = new Date().toISOString();
  return {
    complete: true,
    excludedCount: 0,
    limitations: ["Demo mode: результат сформирован из безопасных fixtures."],
    matchedCount: 1,
    serializedBytes: 96,
    estimatedAddedInputTokens: 24,
    policyRevisionId,
    provenance: {
      source: "EVENT_LOG" as const,
      policyRevisionId,
      snapshotReceivedAt: now,
    },
    range: {
      from: new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString(),
      to: now,
    },
    snapshotReceivedAt: now,
    status: "COMPLETED" as const,
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
    evaluation: "VERIFIED_RESOLVED" as const,
    policyRevisionId,
    predicate: structuredClone(input.predicate),
    queries: [query],
    results: {
      [query.key]: result(query.query.eventCodes[0] ?? "event"),
    },
    snapshotReceivedAt: new Date().toISOString(),
  };
}

function verificationRun(input: StartCaseVerificationDto, runId: string) {
  const estimate = verificationEstimate(input);
  return {
    ...estimate,
    caseChanged: true,
    caseStatus: "RESOLVED",
    caseVersion: 2,
    id: runId,
    planId: `plan-${runId}`,
    status: "COMPLETED" as const,
  };
}

export const mockEventQueryRepository: EventQueryRepository = {
  async getPolicy() {
    return policyState();
  },

  async patchProject(_projectId, input) {
    draftVersion += 1;
    draftDocument.enabled = input.masterEnabled;
    return {
      version: draftVersion,
      masterEnabled: input.masterEnabled,
      currentRevisionId: null,
      updatedAt: new Date().toISOString(),
    };
  },

  async listItems(_projectId, params) {
    const query = params.query?.toLocaleLowerCase("ru-RU");
    const items = queryableEvents
      .filter(
        (item) =>
          !query ||
          item.stableCode.toLocaleLowerCase("ru-RU").includes(query) ||
          item.descriptionForAI.toLocaleLowerCase("ru-RU").includes(query),
      )
      .map((item, index) => ({
        definitionKeyId: `demo-event-${index + 1}`,
        eventCode: item.stableCode,
        eventName: item.descriptionForAI,
        lifecycle: "ACTIVE" as const,
        configuration: configuration(item),
        effective: { internalAi: true, endUserConversation: true },
        queryable: true,
      }));
    return {
      audience: params.audience,
      effectiveOnly: params.effective ?? true,
      publishedMasterEnabled: publishedDocument.enabled,
      publishedPolicyRevision: {
        id: policyRevisionId,
        version: 1,
        publishedAt,
      },
      items,
      pageInfo: { hasMore: false, nextCursor: null },
    };
  },

  async getItem(_projectId, definitionKeyId) {
    return itemState(definitionKeyId);
  },

  async patchItem(_projectId, definitionKeyId, input) {
    draftVersion += 1;
    const current = itemState(definitionKeyId);
    return {
      definitionKeyId,
      eventCode: current.eventCode,
      lifecycle: current.lifecycle,
      version: draftVersion,
      enabled: input.enabled ?? current.configured.enabled,
      endUserConversationEnabled:
        input.endUserConversationEnabled ??
        current.configured.endUserConversationEnabled,
      configuration: {
        ...current.configured.configuration,
        ...(input.descriptionForAI !== undefined
          ? { descriptionForAI: input.descriptionForAI }
          : {}),
        ...(input.allowedModes !== undefined
          ? { allowedModes: input.allowedModes }
          : {}),
        ...(input.safeFields !== undefined
          ? { safeFields: input.safeFields }
          : {}),
        ...(input.maxInteractiveLookbackHours !== undefined
          ? {
              maxInteractiveLookbackHours: input.maxInteractiveLookbackHours,
            }
          : {}),
        ...(input.maxVerificationLookbackHours !== undefined
          ? {
              maxVerificationLookbackHours: input.maxVerificationLookbackHours,
            }
          : {}),
      },
      diagnostics: [],
    };
  },

  async validateItem() {
    return { valid: true, errors: [] };
  },

  async publishItem() {
    return {
      compilerVersion: "demo-1",
      document: structuredClone(publishedDocument),
      documentHash: "demo-policy-document-hash",
      id: policyRevisionId,
      publishedAt: new Date().toISOString(),
      version: 1,
    };
  },

  async publish() {
    publishedDocument = structuredClone(draftDocument);
    return {
      compilerVersion: "demo-1",
      document: structuredClone(publishedDocument),
      documentHash: "demo-policy-document-hash",
      id: policyRevisionId,
      publishedAt: new Date().toISOString(),
      version: 1,
    };
  },

  async preview(_projectId: string, input: PreviewEventQueryDto) {
    return result(input.query.eventCodes[0] ?? "event");
  },

  async usage(_projectId: string, params: EventQueryPolicyUsageParams) {
    return {
      byAudience: {
        END_USER_CONVERSATION: {
          calls: 3,
          estimatedAddedInputTokens: 72,
          resultBytes: 288,
        },
      },
      byOrigin: {
        "user-request": {
          calls: 3,
          estimatedAddedInputTokens: 72,
          resultBytes: 288,
        },
      },
      calls: 3,
      estimatedAddedInputTokens: 72,
      from: params.from,
      resultBytes: 288,
      scope: {
        endUserId: params.endUserId ?? null,
        audience: params.audience ?? null,
      },
      to: params.to,
    };
  },

  async listRequests(_projectId, params) {
    return {
      items: [
        {
          id: "demo-event-query-request-1",
          createdAt: params.to,
          endUserId: params.endUserId ?? "00000000-0000-4000-8000-000000000001",
          origin: "INTERACTIVE_TEXT",
          audience: "END_USER_CONVERSATION",
          mode: "SUMMARY",
          eventCodes: [queryableEvents[0]!.stableCode],
          queryShape: { mode: "SUMMARY", eventCodeCount: 1 },
          policyRevisionId: policyRevisionId as never,
          range: { from: params.from, to: params.to },
          snapshotReceivedAt: params.to,
          status: "COMPLETED",
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
            estimatedCostUsd: "0.0042" as never,
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

  async getCaseVerification(
    _projectId: string,
    _caseId: string,
    runId: string,
  ) {
    const run = runs.get(runId);
    if (!run) throw new Error("Demo verification run not found");
    return structuredClone(run);
  },
};
