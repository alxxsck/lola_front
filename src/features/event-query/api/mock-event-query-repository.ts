import type {
  EstimateCaseVerificationDto,
  EventQueryPolicyDocumentDto,
  EventQueryPolicyDraftResponseDto,
  EventQueryPolicyItemDto,
  EventQueryPolicyStateResponseDto,
  EventQueryPolicyUsageParams,
  PreviewEventQueryDto,
  SaveEventQueryPolicyDraftDto,
  StartCaseVerificationDto,
  ValidateEventQueryPolicyDto,
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
let draftDocument: EventQueryPolicyDocumentDto = {
  enabled: true,
  items: structuredClone(queryableEvents),
};
let publishedDocument: EventQueryPolicyDocumentDto =
  structuredClone(draftDocument);
const runs = new Map<string, ReturnType<typeof verificationRun>>();

function policyState(): EventQueryPolicyStateResponseDto {
  return {
    draft: {
      document: structuredClone(draftDocument),
      updatedAt: publishedAt,
      version: draftVersion,
    },
    published: {
      compilerVersion: "demo-1",
      document: structuredClone(publishedDocument),
      documentHash: "demo-policy-document-hash",
      id: policyRevisionId,
      publishedAt,
      version: 1,
    },
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

  async saveDraft(_projectId: string, input: SaveEventQueryPolicyDraftDto) {
    draftVersion += 1;
    draftDocument = structuredClone(input.document);
    return {
      document: structuredClone(draftDocument),
      updatedAt: new Date().toISOString(),
      version: draftVersion,
    } satisfies EventQueryPolicyDraftResponseDto;
  },

  async validate(_projectId: string, input: ValidateEventQueryPolicyDto) {
    const errors =
      input.document.enabled && input.document.items.length === 0
        ? [
            {
              code: "EVENT_REQUIRED",
              location: "items",
              message: "Добавьте хотя бы один тип события.",
            },
          ]
        : [];
    return { errors, valid: errors.length === 0 };
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
      to: params.to,
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
