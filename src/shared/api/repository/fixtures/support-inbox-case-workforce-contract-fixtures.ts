import type {
  EndUserCaseCommandResponseDto,
  SupportCaseAssignmentAssign409,
  SupportCaseAssignmentCandidatesResponseDto,
  SupportOperatorAvailabilityResponseDto,
  SupportQueueCasesPageResponseDto,
  SupportRoutingOwnOfferCatalogDto,
  SupportRoutingOfferAccept409,
  SupportWorkforceSettingsResponseDto,
  SupportWorkspaceCasesPageResponseDto,
  SupportWorkspaceConversationsPageResponseDto,
} from "@/shared/api/generated/models";

const emptyCasesInbox = {
  mode: "CASES",
  items: [],
  nextCursor: null,
} satisfies SupportWorkspaceCasesPageResponseDto;

const emptyConversationsInbox = {
  mode: "ALL_CONVERSATIONS",
  items: [],
  nextCursor: null,
} satisfies SupportWorkspaceConversationsPageResponseDto;

const caseWorkflowSuccess = {
  id: "10000000-0000-4000-8000-000000000001",
  status: "IN_PROGRESS",
  version: 8,
} satisfies EndUserCaseCommandResponseDto;

const assignmentConflict = {
  error: {
    code: "CASE_VERSION_CONFLICT",
    message: "Case version no longer matches the submitted command",
    details: { currentVersion: 8 },
    requestId: "request-assignment-conflict-1",
  },
} satisfies SupportCaseAssignmentAssign409;

const assignmentCandidates = {
  caseId: "10000000-0000-4000-8000-000000000001",
  caseVersion: 8,
  caseReadToken: '"sc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
  assignmentState: "ASSIGNED",
  currentAssignment: {
    id: "30000000-0000-4000-8000-000000000001",
    version: 3,
    actionEtag: '"sa1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
  },
  workforceRevision: {
    id: "30000000-0000-4000-8000-000000000004",
    number: 5,
  },
  actions: { claim: false, assign: false, release: true, transfer: true },
  teams: [
    {
      id: "30000000-0000-4000-8000-000000000002",
      code: "PAYMENTS",
      name: "Payments",
      actions: { claim: false, assign: false, transfer: true },
      operators: [
        {
          id: "30000000-0000-4000-8000-000000000003",
          displayName: "Operator Anna",
          availableCapacityUnits: 300,
          actions: { claim: false, assign: false, transfer: true },
        },
      ],
    },
  ],
} satisfies SupportCaseAssignmentCandidatesResponseDto;

const degradedQueue = {
  queueId: "20000000-0000-4000-8000-000000000001",
  revisionId: "20000000-0000-4000-8000-000000000002",
  generationId: "20000000-0000-4000-8000-000000000003",
  items: [],
  nextCursor: null,
  count: null,
  freshness: {
    state: "DEGRADED",
    computedAt: "2026-08-07T10:00:00.000Z",
    sourceHighWater: { case: "41", assignment: "17", sla: "9" },
    currentSourceHighWater: { case: "43", assignment: "18", sla: "9" },
    lagMilliseconds: { case: 4_000, assignment: 2_000, sla: 0 },
  },
} satisfies SupportQueueCasesPageResponseDto;

const ownOffers = {
  offers: [
    {
      assignmentId: "30000000-0000-4000-8000-000000000001",
      caseId: "10000000-0000-4000-8000-000000000001",
      teamId: "30000000-0000-4000-8000-000000000002",
      queueId: "20000000-0000-4000-8000-000000000001",
      assignmentVersion: 3,
      fencingVersion: 5,
      expiresAt: "2026-08-07T10:05:00.000Z",
      actionEtag: '"so1.k.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
      acceptToken: "opaque-routing-offer-token",
    },
  ],
} satisfies SupportRoutingOwnOfferCatalogDto;

const expiredOfferConflict = {
  error: {
    code: "SUPPORT_OFFER_EXPIRED",
    message: "The private routing offer has expired",
    requestId: "request-offer-expired-1",
  },
} satisfies SupportRoutingOfferAccept409;

const availabilityLeaseExpired = {
  projectId: "40000000-0000-4000-8000-000000000001",
  operatorId: "40000000-0000-4000-8000-000000000002",
  declaredState: "AVAILABLE",
  effectiveState: "OFFLINE",
  acceptsNewWork: false,
  version: 7,
  leaseUntil: "2026-08-07T09:59:00.000Z",
  effectiveUntil: null,
  reasonCode: "LEASE_EXPIRED",
  source: "LEASE_EXPIRY",
  transitionedAt: "2026-08-07T10:00:00.000Z",
  leaseRenewedAt: "2026-08-07T09:58:00.000Z",
} satisfies SupportOperatorAvailabilityResponseDto;

const emptyWorkforce = {
  mode: "WORKFORCE_SETTINGS",
  view: "OVERVIEW",
  rootVersion: 0,
  actionEtag: '"sw1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
  currentRevisionNumber: 0,
} satisfies SupportWorkforceSettingsResponseDto;

export const supportInboxCaseWorkforceContractFixtures = {
  emptyCasesInbox,
  emptyConversationsInbox,
  caseWorkflowSuccess,
  assignmentConflict,
  assignmentCandidates,
  degradedQueue,
  ownOffers,
  expiredOfferConflict,
  availabilityLeaseExpired,
  emptyWorkforce,
  forbiddenInbox: {
    kind: "HTTP_ERROR",
    status: 403,
    publication: "NOT_PUBLISHED",
  },
  staleCaseWorkflow: {
    kind: "HTTP_ERROR",
    status: 409,
    publication: "NOT_PUBLISHED",
  },
  partialBulkOutcome: {
    kind: "BULK_ASSIGNMENT_RESULT",
    publication: "NOT_PUBLISHED",
  },
  unknownOutcome: {
    kind: "TRANSPORT_UNKNOWN_OUTCOME",
    lookupOperation: "NOT_PUBLISHED",
  },
  unknownQueueFreshness: {
    ...degradedQueue.freshness,
    state: "STALE",
    publication: "FORWARD_COMPATIBILITY_FIXTURE",
  },
} as const;
