import type {
  SupportContentPanelResponseDto,
  SupportInternalNoteResponseDto,
  SupportKnowledgeSearchPageResponseDto,
  SupportLeadSummaryResponseDto,
  SupportMacroReplyDraftResponseDto,
  SupportOperationalAlertCommandReceiptDto,
  SupportOperationalAlertListResponseDto,
} from "@/shared/api/generated/models";

const tombstonedNote = {
  id: "51000000-0000-4000-8000-000000000001",
  endUserCaseId: "51000000-0000-4000-8000-000000000002",
  conversationId: null,
  messageId: null,
  macroRevisionId: null,
  knowledgeDocumentId: null,
  hasUnavailableReferences: true,
  lifecycle: "TOMBSTONED",
  version: 3,
  currentRevisionNumber: 2,
  body: null,
  creator: {},
  createdAt: "2026-08-07T09:00:00.000Z",
  updatedAt: "2026-08-07T10:00:00.000Z",
  tombstonedAt: "2026-08-07T10:00:00.000Z",
  actionEtag: '"sin1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
} satisfies SupportInternalNoteResponseDto;

const purgedNote = {
  ...tombstonedNote,
  id: "51000000-0000-4000-8000-000000000003",
  lifecycle: "PURGED",
  version: 4,
} satisfies SupportInternalNoteResponseDto;

const macroReplyDraft = {
  id: "52000000-0000-4000-8000-000000000001",
  macroId: "52000000-0000-4000-8000-000000000002",
  macroRevisionId: "52000000-0000-4000-8000-000000000003",
  macroRevisionNumber: 7,
  conversationId: "52000000-0000-4000-8000-000000000004",
  endUserCaseId: "51000000-0000-4000-8000-000000000002",
  state: "READY",
  version: 1,
  text: "Здравствуйте! Чем могу помочь?",
  renderedHash: "a".repeat(64),
  expiresAt: "2026-08-08T10:00:00.000Z",
  createdAt: "2026-08-07T10:00:00.000Z",
  updatedAt: "2026-08-07T10:00:00.000Z",
  actionEtag: '"smd1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
} satisfies SupportMacroReplyDraftResponseDto;

const emptyKnowledgeSearch = {
  items: [],
  nextCursor: null,
} satisfies SupportKnowledgeSearchPageResponseDto;

const partialContentPanel = {
  macros: {
    state: "READY",
    items: [],
    nextCursor: null,
  },
  knowledge: {
    state: "UNAVAILABLE",
    code: "KNOWLEDGE_DEPENDENCY_UNAVAILABLE",
    items: [],
    nextCursor: null,
  },
} satisfies SupportContentPanelResponseDto;

const staleLeadSummary = {
  projectionGeneration: 12,
  checkpoint: "41",
  sourceHighWater: "43",
  freshnessState: "STALE",
  computedAt: "2026-08-07T10:00:00.000Z",
  nextCursor: null,
  effectiveWindow: {
    from: "2026-08-07T09:00:00.000Z",
    to: "2026-08-07T10:00:00.000Z",
  },
  slaRolloutState: "SHADOW",
  capabilities: {
    noEligibleOperator: "UNAVAILABLE",
    routingCapacityRisks: "AVAILABLE",
    savedQueues: "UNAVAILABLE",
    teamSkillLanguageCapacity: "UNAVAILABLE",
    sla: "SHADOW",
  },
  kind: "LEAD_CONTROL",
  view: "SUMMARY",
  data: {
    sla: {
      atRiskCount: 2,
      breachedCount: 1,
      oldestDueAgeMs: 60_000,
    },
    actionableBacklog: {
      unassignedCount: 3,
      oldestUnassignedAgeMs: 120_000,
    },
    workforce: {
      availability: {
        AVAILABLE: 2,
        BUSY: 1,
        AWAY: 0,
        DRAINING: 0,
        OFFLINE: 4,
      },
      currentWorkloadUnits: 8,
      maximumCapacityUnits: 12,
      capacityGapUnits: 0,
    },
    delivery: {
      state: "AVAILABLE",
      pendingCount: 1,
      outcomeUnknownCount: 1,
    },
    projectionHealth: {
      state: "AVAILABLE",
      retryCount: 2,
      deadLetterCount: 0,
    },
  },
} satisfies SupportLeadSummaryResponseDto;

const degradedAlerts = {
  kind: "LIST",
  items: [],
  nextCursor: null,
  materialization: {
    state: "DEGRADED",
    checkpoint: "41",
    sourceHighWater: "43",
    diagnosticCode: "PROJECTION_LAG",
    computedAt: "2026-08-07T10:00:00.000Z",
  },
} satisfies SupportOperationalAlertListResponseDto;

const alertCommandReceipt = {
  commandId: "53000000-0000-4000-8000-000000000001",
  alertId: "53000000-0000-4000-8000-000000000002",
  eventId: "53000000-0000-4000-8000-000000000003",
  activityId: "53000000-0000-4000-8000-000000000004",
  outboxId: "53000000-0000-4000-8000-000000000005",
  state: "ACKNOWLEDGED",
  ownerCmsUserId: "53000000-0000-4000-8000-000000000006",
  version: 2,
  occurredAt: "2026-08-07T10:00:00.000Z",
  replayed: false,
} satisfies SupportOperationalAlertCommandReceiptDto;

export const supportContentLeadNotificationContractFixtures = {
  tombstonedNote,
  purgedNote,
  macroReplyDraft,
  emptyKnowledgeSearch,
  partialContentPanel,
  staleLeadSummary,
  degradedAlerts,
  alertCommandReceipt,
  deniedLeadControl: {
    error: {
      code: "PERMISSION_DENIED",
      message: "Permission denied",
    },
  },
  alertCommandTimeout: {
    error: {
      code: "SUPPORT_OPERATIONAL_ALERT_COMMAND_TIMEOUT",
      message: "Command outcome is not confirmed",
    },
  },
  deniedContent: {
    kind: "HTTP_ERROR",
    status: 403,
    publication: "NOT_PUBLISHED",
  },
  revokedBrowserSubscription: {
    kind: "BROWSER_PUSH_SUBSCRIPTION",
    state: "REVOKED",
    publication: "NOT_PUBLISHED",
  },
  partialLeadAction: {
    kind: "BULK_LEAD_COMMAND_RESULT",
    publication: "NOT_PUBLISHED",
  },
  unknownOutcomeLookup: {
    kind: "COMMAND_OUTCOME_LOOKUP",
    publication: "NOT_PUBLISHED",
  },
  unknownAlertState: {
    ...degradedAlerts.materialization,
    state: "STALE",
    publication: "FORWARD_COMPATIBILITY_FIXTURE",
  },
} as const;
