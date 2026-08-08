import type {
  SupportWorkspaceMessagePageResponseDto,
  SupportWorkspaceSelectionResponseDto,
} from "@/shared/api/generated/models";

const capabilities = {
  assignCase: false,
  claimAssignment: false,
  escalateCase: false,
  manageCase: false,
  releaseAssignment: false,
  reply: true,
  replyWithoutTranslation: false,
  suspendAi: false,
  transferAssignment: false,
};

const endUser = {
  id: "10000000-0000-4000-8000-000000000001",
  externalId: "fixture-user",
  isGuest: false,
  createdAt: "2026-08-07T09:00:00.000Z",
  lastSeenAt: "2026-08-07T10:00:00.000Z",
  locale: "ru",
};

const minimalConversation = {
  id: "30000000-0000-4000-8000-000000000000",
  endUserId: endUser.id,
  title: null,
  status: "OPEN",
  messageCount: 0,
  lastMessage: null,
  lastMessageOrdinal: 0,
  isCurrent: true,
  currentInteractionSessionCount: 0,
  readState: {
    conversationId: "30000000-0000-4000-8000-000000000000",
    lastReadOrdinal: 0,
    highestOrdinal: 0,
    firstUnreadOrdinal: null,
    unreadMessageCount: 0,
    unreadCustomerMessageCount: 0,
    updatedAt: null,
  },
  createdAt: "2026-08-07T09:00:00.000Z",
  updatedAt: "2026-08-07T09:00:00.000Z",
} as const;

const minimalSelectionSuccess = {
  mode: "SELECTION",
  checkpoint: "checkpoint:minimal",
  capabilitiesRevision: "capabilities:minimal",
  actionRevisions: {},
  capabilities,
  classificationOptions: [],
  endUser,
  case: null,
  conversation: minimalConversation,
  messages: {
    items: [],
    nextCursor: null,
    newerCursor: null,
    anchorOrdinal: null,
  },
  relatedCases: [],
  relatedConversations: [],
  relatedCasesTruncated: false,
  relatedConversationsTruncated: false,
} satisfies SupportWorkspaceSelectionResponseDto;

const fullSelectionSuccess = {
  ...minimalSelectionSuccess,
  checkpoint: "checkpoint:full",
  capabilitiesRevision: "capabilities:full",
  actionRevisions: {
    aiSuspensionVersion: "ai-4",
    assignmentVersion: 3,
    caseVersion: 8,
    conversationUpdatedAt: "2026-08-07T10:00:00.000Z",
  },
  capabilities: { ...capabilities, manageCase: true, reply: true },
  classificationOptions: [{ code: "BILLING", label: "Оплата" }],
  case: {
    id: "20000000-0000-4000-8000-000000000001",
    endUserId: endUser.id,
    projectSequence: "42",
    version: 8,
    latestRevisionId: "20000000-0000-4000-8000-000000000008",
    title: "Возврат",
    summary: "Пользователь запросил возврат",
    goal: "Вернуть платёж",
    status: "OPEN",
    priority: "HIGH",
    groupCode: "BILLING",
    attentionRequired: true,
    lastActivityAt: "2026-08-07T10:00:00.000Z",
    updatedAt: "2026-08-07T10:00:00.000Z",
    assignment: null,
  },
  conversation: {
    id: "30000000-0000-4000-8000-000000000001",
    endUserId: endUser.id,
    title: "Возврат",
    status: "OPEN",
    messageCount: 17,
    lastMessage: null,
    lastMessageOrdinal: 17,
    isCurrent: true,
    currentInteractionSessionCount: 0,
    readState: {
      conversationId: "30000000-0000-4000-8000-000000000001",
      lastReadOrdinal: 15,
      highestOrdinal: 17,
      firstUnreadOrdinal: 16,
      unreadMessageCount: 2,
      unreadCustomerMessageCount: 1,
      updatedAt: "2026-08-07T09:59:00.000Z",
    },
    createdAt: "2026-08-07T09:00:00.000Z",
    updatedAt: "2026-08-07T10:00:00.000Z",
  },
  messages: {
    items: [
      {
        id: "40000000-0000-4000-8000-000000000017",
        threadId: "30000000-0000-4000-8000-000000000001",
        ordinal: 17,
        role: "ADMIN",
        status: "COMPLETED",
        text: "Проверяю результат",
        contentState: "ACTIVE",
        contentVersion: 1,
        revisionNumber: 1,
        attachments: [],
        author: {
          type: "CMS_USER",
          cmsUserId: "50000000-0000-4000-8000-000000000001",
          displayName: "Анна",
          avatarUrl: null,
        },
        delivery: {
          id: "60000000-0000-4000-8000-000000000017",
          channel: "SDK_REALTIME",
          commandIds: ["70000000-0000-4000-8000-000000000017"],
          interactionSessionId: null,
          status: "PENDING",
          generation: 1,
          version: 0,
          errorCode: null,
          retryEligible: false,
          allowedActions: [],
          acceptedAt: "2026-08-07T10:00:00.000Z",
        },
        createdAt: "2026-08-07T10:00:00.000Z",
        updatedAt: "2026-08-07T10:00:00.000Z",
      },
    ],
    nextCursor: "messages:older",
    newerCursor: "messages:newer",
    anchorOrdinal: 16,
  },
} satisfies SupportWorkspaceSelectionResponseDto;

const historyNextPage = {
  items: [],
  nextCursor: "messages:oldest",
  newerCursor: null,
  anchorOrdinal: null,
} satisfies SupportWorkspaceMessagePageResponseDto;

const unknownDeliveryStatusMessage = {
  ...fullSelectionSuccess.messages.items[0],
  delivery: {
    ...fullSelectionSuccess.messages.items[0].delivery,
    status: "PROVIDER_ACCEPTED",
  },
} as const;

export const supportWorkspaceContractFixtures = {
  minimalSelectionSuccess,
  fullSelectionSuccess,
  historyNextPage,
  unknownDeliveryStatusMessage,
  forbiddenSelection: {
    kind: "HTTP_ERROR",
    status: 403,
    publication: "NOT_PUBLISHED",
  },
  concealedSelection: {
    kind: "HTTP_ERROR",
    status: 404,
    publication: "NOT_PUBLISHED",
  },
  sendConflict: {
    kind: "HTTP_ERROR",
    status: 409,
    publication: "PUBLISHED",
    body: { code: "TRANSLATION_DRAFT_STALE" },
  },
  staleRevision: {
    kind: "HTTP_ERROR",
    status: 409,
    publication: "NOT_PUBLISHED",
  },
  unknownSendOutcome: {
    kind: "TRANSPORT_UNKNOWN_OUTCOME",
    recovery: "LOOKUP_THEN_REPEAT_SAME_IDEMPOTENCY_KEY",
    lookupOperation: "AdminMessaging_lookupOutcome",
    publication: "PUBLISHED",
  },
} as const;
