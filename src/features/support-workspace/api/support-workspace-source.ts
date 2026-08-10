import {
  adminConversationCollaborationMark,
  supportWorkspaceRead,
} from "@/shared/api/generated/retenive-backend";
import { repository } from "@/shared/api/repository";
import type {
  CursorPage,
  CursorPageRequest,
} from "@/shared/api/repository/contracts";
import { mapConversationMessage } from "@/shared/api/repository/mappers";
import { isMockMode } from "@/shared/config/data-mode";
import type { ConversationMessage } from "@/shared/types/domain";
import type {
  CmsConversationReadPositionResponseDto,
  SupportCaseRoutingAvailableResponseDto,
  SupportSlaCaseProjectionResponseDto,
  SupportWorkspaceCaseRowResponseDto,
  SupportWorkspaceSelectionCaseResponseDto,
  SupportWorkspaceSelectionResponseDto,
} from "@/shared/api/generated/models";
import { readMockSupportAssignment } from "@/features/support-case-assignment/api/support-assignment-mock-state";

export const SUPPORT_WORKSPACE_MESSAGE_PAGE_LIMIT = 30;

export type SupportWorkspaceMessage = ConversationMessage & { ordinal: number };
export type SupportInboxMode = "CASES" | "ALL_CONVERSATIONS";

export interface SupportWorkspaceCaseRow {
  id: string;
  endUserId: string;
  projectSequence: string;
  title: string;
  status: string;
  priority: string;
  groupCode: string;
  attentionRequired: boolean;
  slaSignal: SupportWorkspaceSlaSignal | null;
  lastActivityAt: string;
  updatedAt: string;
  version: number;
}

export type SupportWorkspaceSlaSignal =
  | {
      state: "UNCONFIGURED";
      computedAt: string | null;
    }
  | {
      state: "NO_ACTIVE_CLOCK";
      computedAt: string | null;
    }
  | {
      state: "AVAILABLE";
      signalCode: "SLA_BREACHED" | "SLA_AT_RISK" | "SLA_PAUSED" | "SLA_DUE";
      kind: SupportSlaClockKind;
      timing: "RUNNING" | "PAUSED";
      risk: SupportSlaRisk;
      pauseReason: SupportSlaPauseReason;
      currentDeadlineAt: string | null;
      remainingBusinessMs: number;
      computedAt: string;
    };

export type SupportSlaClockKind =
  "FIRST_HUMAN_RESPONSE" | "NEXT_HUMAN_RESPONSE" | "RESOLUTION";
export type SupportSlaRisk = "ON_TRACK" | "AT_RISK" | "BREACHED";
export type SupportSlaPauseReason =
  "WAITING_END_USER" | "WAITING_SYSTEM" | null;

export interface SupportSlaClock {
  kind: SupportSlaClockKind;
  timing: "RUNNING" | "PAUSED";
  risk: SupportSlaRisk;
  outcome: "OPEN" | "MET" | "CANCELLED" | "MIGRATED";
  pauseReason: SupportSlaPauseReason;
  targetBusinessSeconds: number;
  consumedBusinessMs: number;
  remainingBusinessMs: number;
  currentDeadlineAt: string | null;
  breachedAt: string | null;
  metAt: string | null;
}

export interface SupportSlaContext {
  occurrenceState: "ACTIVE" | "TERMINAL" | null;
  clocks: SupportSlaClock[];
}

export type SupportRoutingExclusion =
  | "ASSIGNMENT_CONFLICT"
  | "AVAILABILITY_NOT_ROUTABLE"
  | "CAPACITY_EXHAUSTED"
  | "CASE_COOLDOWN"
  | "DATA_SCOPE_DENIED"
  | "FACT_STALE"
  | "LANGUAGE_REQUIRED"
  | "LEASE_EXPIRED"
  | "MEMBERSHIP_INACTIVE"
  | "RECEIVE_PERMISSION_MISSING"
  | "SKILL_REQUIRED"
  | "TEAM_NOT_ELIGIBLE";

export type SupportRoutingContext =
  | { state: "REDACTED" | "NOT_EVALUATED" }
  | {
      state: "AVAILABLE";
      reasonCode: SupportCaseRoutingAvailableResponseDto["reasonCode"];
      assignmentState: "UNASSIGNED" | "RESERVED" | "ASSIGNED";
      mode: "SHADOW" | "LIVE_PROPOSAL" | null;
      outcome:
        | "WINNER"
        | "NO_ELIGIBLE_OPERATOR"
        | "CAPACITY_GAP"
        | "CONFIGURATION_REQUIRED"
        | "STALE_INPUT"
        | "DEGRADED"
        | null;
      queue: { code: string; name: string } | null;
      candidateCount: number;
      eligibleCandidateCount: number | null;
      exclusions: Partial<Record<SupportRoutingExclusion, number>>;
      evaluatedAt: string | null;
      candidatesTruncated: boolean;
      reservation: {
        expiresAt: string;
        capacityWeightUnits: number;
      } | null;
      fallback: {
        state:
          | "EVALUATION_PENDING"
          | "EVALUATION_PROCESSING"
          | "SCHEDULED"
          | "PROCESSING"
          | "EXHAUSTED"
          | "DEGRADED";
        candidateAttempt: number;
        availableAt: string;
      } | null;
    };

export type SupportInboxItem =
  | (SupportWorkspaceCaseRow & { kind: "CASE" })
  | (SupportWorkspaceConversation & { kind: "CONVERSATION" });

export interface SupportWorkspaceConversation {
  id: string;
  endUserId: string;
  title: string;
  status: "OPEN" | "CLOSED";
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  isCurrent: boolean;
  currentInteractionSessionCount: number;
  lastMessageAt: string | null;
  lastMessageOrdinal?: number;
  readState: SupportConversationReadState;
}

export interface SupportConversationReadState {
  conversationId: string;
  lastReadOrdinal: number;
  highestOrdinal: number;
  firstUnreadOrdinal: number | null;
  unreadMessageCount: number;
  unreadCustomerMessageCount: number;
  updatedAt: string | null;
}

export interface SupportWorkspaceMessagePage extends CursorPage<SupportWorkspaceMessage> {
  newerCursor: string | null;
  anchorOrdinal: number | null;
}

export interface SupportWorkspaceSelection {
  checkpoint: string;
  capabilitiesRevision: string;
  actionRevisions: SupportWorkspaceActionRevisions;
  classificationOptions: Array<{ code: string; label: string }>;
  capabilities: {
    assignCase: boolean;
    claimAssignment: boolean;
    escalateCase: boolean;
    manageCase: boolean;
    releaseAssignment: boolean;
    reply: boolean;
    replyWithoutTranslation: boolean;
    suspendAi: boolean;
    transferAssignment: boolean;
    attachments?: {
      state: "AVAILABLE" | "UNAVAILABLE";
      upload: boolean;
      download: boolean;
      maxFilesPerMessage: number;
      maxBytesPerFile: number;
      maxBytesPerMessage: number;
      contentTypes: string[];
    };
    internalNotes?: {
      state: "AVAILABLE" | "UNAVAILABLE";
      read: boolean;
      create: boolean;
      historyRead: boolean;
      correct: boolean;
      tombstone: boolean;
      realtimeWatch: boolean;
      attachmentUpload?: boolean;
      attachmentDownload?: boolean;
    };
  };
  endUser: {
    id: string;
    isGuest: boolean;
    createdAt: string;
    lastSeenAt: string;
    locale?: string | null;
  };
  case: SupportWorkspaceCase | null;
  sla: SupportSlaContext | null;
  routing: SupportRoutingContext | null;
  conversation: SupportWorkspaceConversation | null;
  messages: SupportWorkspaceMessagePage;
}

export interface SupportWorkspaceActionRevisions {
  aiSuspensionVersion?: string | null;
  assignmentVersion?: number | null;
  caseVersion?: number | null;
  conversationUpdatedAt?: string | null;
}

export interface SupportWorkspaceCase {
  id: string;
  title: string;
  status: string;
  priority: string;
  groupCode: string;
  projectSequence: string;
  attentionRequired: boolean;
  lastActivityAt: string;
  updatedAt: string;
  version: number;
  latestRevisionId: string | null;
  assignee: { id?: string; displayName?: string } | null;
  assignment: {
    id: string;
    state: string;
    operatorId: string;
    operatorName: string;
    teamName: string;
    version: number;
    /** Server-issued optimistic-concurrency capability. Never render it. */
    actionEtag: string;
  } | null;
}

export interface SupportWorkspaceSource {
  readCases(
    projectId: string,
    request?: CursorPageRequest,
  ): Promise<CursorPage<SupportWorkspaceCaseRow>>;
  readConversations(
    projectId: string,
    request?: CursorPageRequest,
  ): Promise<CursorPage<SupportWorkspaceConversation>>;
  readSelection(
    projectId: string,
    target: SupportWorkspaceSelectionTarget,
    request?: {
      messageCursor?: string;
      messageNewerCursor?: string;
      messageLimit?: number;
    },
  ): Promise<SupportWorkspaceSelection>;
  markConversationRead(
    projectId: string,
    conversationId: string,
    lastReadOrdinal: number,
  ): Promise<SupportConversationReadState>;
}

/** Exact server-owned target for the inspector. One of the ids is required. */
export interface SupportWorkspaceSelectionTarget {
  conversationId?: string;
  caseId?: string;
}

type WorkspaceConversationDto = {
  id: string;
  endUserId: string;
  title?: string | null;
  status: "OPEN" | "CLOSED";
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  isCurrent: boolean;
  currentInteractionSessionCount: number;
  lastMessage: { createdAt: string } | null;
  lastMessageOrdinal?: number;
  readState: CmsConversationReadPositionResponseDto;
};

export function mapConversationReadState(
  value: CmsConversationReadPositionResponseDto,
  expectedConversationId = value.conversationId,
): SupportConversationReadState {
  if (value.conversationId !== expectedConversationId) {
    throw new Error(
      "Support workspace returned read state for another conversation",
    );
  }
  return {
    conversationId: value.conversationId,
    lastReadOrdinal: value.lastReadOrdinal,
    highestOrdinal: value.highestOrdinal,
    firstUnreadOrdinal: value.firstUnreadOrdinal,
    unreadMessageCount: value.unreadMessageCount,
    unreadCustomerMessageCount: value.unreadCustomerMessageCount,
    updatedAt: value.updatedAt ?? null,
  };
}

function mapWorkspaceConversation(
  conversation: WorkspaceConversationDto,
): SupportWorkspaceConversation {
  return {
    id: conversation.id,
    endUserId: conversation.endUserId,
    title: conversation.title?.trim() || "Диалог без названия",
    status: conversation.status,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messageCount,
    isCurrent: conversation.isCurrent,
    currentInteractionSessionCount: conversation.currentInteractionSessionCount,
    lastMessageAt: conversation.lastMessage?.createdAt ?? null,
    ...(conversation.lastMessageOrdinal !== undefined
      ? { lastMessageOrdinal: conversation.lastMessageOrdinal }
      : {}),
    readState: mapConversationReadState(
      conversation.readState,
      conversation.id,
    ),
  };
}

export function mapWorkspaceCaseRow(
  value: SupportWorkspaceCaseRowResponseDto,
): SupportWorkspaceCaseRow {
  return {
    id: value.id,
    endUserId: value.endUserId,
    projectSequence: value.projectSequence,
    title: value.title,
    status: value.status,
    priority: value.priority,
    groupCode: value.groupCode,
    attentionRequired: value.attentionRequired,
    slaSignal: mapWorkspaceSlaSignal(value.slaSignal),
    lastActivityAt: value.lastActivityAt,
    updatedAt: value.updatedAt,
    version: value.version,
  };
}

function mapWorkspaceSlaSignal(
  value: SupportWorkspaceCaseRowResponseDto["slaSignal"],
): SupportWorkspaceSlaSignal | null {
  if (!value) return null;
  if (value.state !== "AVAILABLE") {
    return {
      state:
        value.state === "NO_ACTIVE_CLOCK"
          ? "NO_ACTIVE_CLOCK"
          : "UNCONFIGURED",
      computedAt: value.computedAt ?? null,
    };
  }
  return {
    state: "AVAILABLE",
    signalCode: value.signalCode,
    kind: value.kind,
    timing: value.timing,
    risk: value.risk,
    pauseReason: value.pauseReason,
    currentDeadlineAt: value.currentDeadlineAt,
    remainingBusinessMs: value.remainingBusinessMs,
    computedAt: value.computedAt,
  };
}

function mapSlaContext(
  value: SupportSlaCaseProjectionResponseDto | null,
): SupportSlaContext | null {
  if (!value) return null;
  return {
    occurrenceState: value.occurrence?.state ?? null,
    clocks: value.clocks.map((clock) => ({
      kind: clock.kind,
      timing: clock.timing,
      risk: clock.risk,
      outcome: clock.outcome,
      pauseReason: clock.pauseReason,
      targetBusinessSeconds: clock.targetBusinessSeconds,
      consumedBusinessMs: clock.consumedBusinessMs,
      remainingBusinessMs: clock.remainingBusinessMs,
      currentDeadlineAt: clock.currentDeadlineAt,
      breachedAt: clock.breachedAt,
      metAt: clock.metAt,
    })),
  };
}

function mapRoutingContext(
  value: SupportWorkspaceSelectionResponseDto["routing"],
): SupportRoutingContext | null {
  if (!value) return null;
  if (value.state !== "AVAILABLE") return { state: value.state };
  const decision = value.decision;
  return {
    state: "AVAILABLE",
    reasonCode: value.reasonCode,
    assignmentState: value.assignmentState,
    mode: decision?.mode ?? null,
    outcome: decision?.outcome ?? null,
    queue: decision?.queue
      ? { code: decision.queue.code, name: decision.queue.name }
      : null,
    candidateCount: decision?.candidateCount ?? 0,
    eligibleCandidateCount:
      decision &&
      !decision.candidates.truncated &&
      decision.candidates.items.length === decision.candidateCount
        ? decision.candidates.items.filter((candidate) => candidate.eligible)
            .length
        : null,
    exclusions: decision?.exclusionCounts ?? {},
    evaluatedAt: decision?.evaluatedAt ?? null,
    candidatesTruncated: decision?.candidates.truncated ?? false,
    reservation: value.reservation
      ? {
          expiresAt: value.reservation.expiresAt,
          capacityWeightUnits: value.reservation.capacityWeightUnits,
        }
      : null,
    fallback: value.fallback
      ? {
          state: value.fallback.state,
          candidateAttempt: value.fallback.candidateAttempt,
          availableAt: value.fallback.availableAt,
        }
      : null,
  };
}

function mapSelectionMessages(
  conversationId: string,
  items: Parameters<typeof mapConversationMessage>[0][],
): SupportWorkspaceMessage[] {
  return items.map((item) => {
    const message = mapConversationMessage(item);
    if (message.conversationId !== conversationId)
      throw new Error(
        "Support workspace returned a message from another conversation",
      );
    if (!Number.isSafeInteger(item.ordinal) || item.ordinal < 1) {
      throw new Error("Support workspace returned an invalid message ordinal");
    }
    return { ...message, ordinal: item.ordinal };
  });
}

/**
 * The demo writer does not receive a server ordinal. Its newly appended item
 * must follow the highest known ordinal, not its reverse-chronological page
 * position, otherwise a refresh would create a duplicate ordinal.
 */
export function withMockMessageOrdinals(
  messages: readonly ConversationMessage[],
): SupportWorkspaceMessage[] {
  let nextOrdinal =
    Math.max(
      0,
      ...messages.flatMap((message) => {
        const ordinal = message.ordinal;
        return typeof ordinal === "number" && Number.isSafeInteger(ordinal)
          ? [ordinal]
          : [];
      }),
    ) + 1;
  return messages.map((message) => ({
    ...message,
    ordinal: message.ordinal ?? nextOrdinal++,
  }));
}

export function mapWorkspaceCase(
  value: SupportWorkspaceSelectionCaseResponseDto | null,
  expectedEndUserId: string,
): SupportWorkspaceCase | null {
  if (!value) return null;
  if (value.endUserId !== expectedEndUserId) {
    throw new Error("Support workspace returned a case from another end user");
  }
  if (value.assignment && value.assignment.caseId !== value.id) {
    throw new Error(
      "Support workspace returned an assignment from another case",
    );
  }
  return {
    id: value.id,
    title: value.title,
    status: value.status,
    priority: value.priority,
    groupCode: value.groupCode,
    projectSequence: value.projectSequence,
    attentionRequired: value.attentionRequired,
    lastActivityAt: value.lastActivityAt,
    updatedAt: value.updatedAt,
    version: value.version,
    latestRevisionId: value.latestRevisionId ?? null,
    assignee: value.assignee
      ? {
          ...(value.assignee.id ? { id: value.assignee.id } : {}),
          ...(value.assignee.displayName
            ? { displayName: value.assignee.displayName }
            : {}),
        }
      : null,
    assignment: value.assignment
      ? {
          id: value.assignment.id,
          state: value.assignment.state,
          operatorId: value.assignment.operator.id,
          operatorName: value.assignment.operator.displayName,
          teamName: value.assignment.team.name,
          version: value.assignment.version,
          actionEtag: value.assignment.actionEtag,
        }
      : null,
  };
}

export function mapSupportWorkspaceSelection(
  response: SupportWorkspaceSelectionResponseDto,
  target: SupportWorkspaceSelectionTarget,
): SupportWorkspaceSelection {
  const conversation = response.conversation
    ? mapWorkspaceConversation(response.conversation)
    : null;
  if (target.conversationId && conversation?.id !== target.conversationId) {
    throw new Error("Support workspace returned a different conversation");
  }
  if (conversation && conversation.endUserId !== response.endUser.id) {
    throw new Error(
      "Support workspace returned a conversation from another end user",
    );
  }
  const supportCase = mapWorkspaceCase(response.case, response.endUser.id);
  if (target.caseId && supportCase?.id !== target.caseId) {
    throw new Error("Support workspace returned a different case");
  }
  return {
    checkpoint: response.checkpoint,
    capabilitiesRevision: response.capabilitiesRevision,
    actionRevisions: {
      ...(response.actionRevisions.aiSuspensionVersion !== undefined
        ? {
            aiSuspensionVersion: response.actionRevisions.aiSuspensionVersion,
          }
        : {}),
      ...(response.actionRevisions.assignmentVersion !== undefined
        ? { assignmentVersion: response.actionRevisions.assignmentVersion }
        : {}),
      ...(response.actionRevisions.caseVersion !== undefined
        ? { caseVersion: response.actionRevisions.caseVersion }
        : {}),
      ...(response.actionRevisions.conversationUpdatedAt !== undefined
        ? {
            conversationUpdatedAt:
              response.actionRevisions.conversationUpdatedAt,
          }
        : {}),
    },
    classificationOptions: response.classificationOptions,
    capabilities: response.capabilities,
    endUser: response.endUser,
    case: supportCase,
    sla: mapSlaContext(response.sla),
    routing: mapRoutingContext(response.routing),
    conversation,
    messages: {
      items: conversation
        ? mapSelectionMessages(conversation.id, response.messages.items)
        : response.messages.items.length
          ? (() => {
              throw new Error(
                "Support workspace returned messages without a conversation",
              );
            })()
          : [],
      nextCursor: response.messages.nextCursor ?? null,
      newerCursor: response.messages.newerCursor ?? null,
      anchorOrdinal: response.messages.anchorOrdinal,
    },
  };
}

const apiSupportWorkspaceSource: SupportWorkspaceSource = {
  async readCases(projectId, request) {
    const response = await supportWorkspaceRead(projectId, {
      mode: "CASES",
      limit: request?.limit ?? 30,
      ...(request?.cursor ? { cursor: request.cursor } : {}),
    });
    if (response.mode !== "CASES") {
      throw new Error(
        "Support workspace returned an unexpected Case inbox projection",
      );
    }
    return {
      items: response.items.map(mapWorkspaceCaseRow),
      nextCursor: response.nextCursor ?? null,
    };
  },

  async readConversations(projectId, request) {
    const response = await supportWorkspaceRead(projectId, {
      mode: "ALL_CONVERSATIONS",
      limit: request?.limit ?? 30,
      ...(request?.cursor ? { cursor: request.cursor } : {}),
    });
    if (response.mode !== "ALL_CONVERSATIONS") {
      throw new Error(
        "Support workspace returned an unexpected inbox projection",
      );
    }
    return {
      items: response.items.map(mapWorkspaceConversation),
      nextCursor: response.nextCursor ?? null,
    };
  },

  async readSelection(projectId, target, request) {
    if (!target.conversationId && !target.caseId)
      throw new Error("Support workspace selection requires an exact target");
    const response = await supportWorkspaceRead(projectId, {
      mode: "SELECTION",
      ...(target.conversationId
        ? { conversationId: target.conversationId }
        : {}),
      ...(target.caseId ? { caseId: target.caseId } : {}),
      messageLimit:
        request?.messageLimit ?? SUPPORT_WORKSPACE_MESSAGE_PAGE_LIMIT,
      ...(request?.messageCursor
        ? { messageCursor: request.messageCursor }
        : {}),
      ...(request?.messageNewerCursor
        ? { messageNewerCursor: request.messageNewerCursor }
        : {}),
    });
    if (response.mode !== "SELECTION") {
      throw new Error(
        "Support workspace did not return the requested conversation",
      );
    }
    return mapSupportWorkspaceSelection(response, target);
  },

  async markConversationRead(projectId, conversationId, lastReadOrdinal) {
    return mapConversationReadState(
      await adminConversationCollaborationMark(projectId, conversationId, {
        lastReadOrdinal,
      }),
      conversationId,
    );
  },
};

function mockCapabilities(
  selectedCase: MockSupportCase | undefined,
): SupportWorkspaceSelection["capabilities"] {
  const assignment = selectedCase
    ? readMockSupportAssignment(selectedCase.id)
    : null;
  const actionable = Boolean(
    selectedCase && selectedCase.status !== "RESOLVED",
  );
  return {
    assignCase: false,
    claimAssignment: actionable && !assignment,
    escalateCase: true,
    manageCase: true,
    releaseAssignment: actionable && Boolean(assignment),
    reply: true,
    replyWithoutTranslation: false,
    suspendAi: false,
    transferAssignment: actionable && Boolean(assignment),
    attachments: {
      state: "AVAILABLE",
      upload: true,
      download: true,
      maxFilesPerMessage: 10,
      maxBytesPerFile: 20 * 1024 * 1024,
      maxBytesPerMessage: 50 * 1024 * 1024,
      contentTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain", "text/csv"],
    },
    internalNotes: selectedCase
      ? {
          state: "AVAILABLE",
          read: true,
          create: true,
          historyRead: true,
          correct: true,
          tombstone: true,
          realtimeWatch: false,
          attachmentUpload: true,
          attachmentDownload: true,
        }
      : {
          state: "UNAVAILABLE",
          read: false,
          create: false,
          historyRead: false,
          correct: false,
          tombstone: false,
          realtimeWatch: false,
          attachmentUpload: false,
          attachmentDownload: false,
        },
  };
}

const mockReadStateByConversation = new Map<
  string,
  SupportConversationReadState
>();

function mockConversationReadState(
  conversationId: string,
  highestOrdinal: number,
): SupportConversationReadState {
  const current = mockReadStateByConversation.get(conversationId);
  if (current && current.highestOrdinal >= highestOrdinal) return current;
  const lastReadOrdinal =
    current?.lastReadOrdinal ?? Math.max(0, highestOrdinal - 2);
  const unreadMessageCount = Math.max(0, highestOrdinal - lastReadOrdinal);
  const value: SupportConversationReadState = {
    conversationId,
    lastReadOrdinal,
    highestOrdinal,
    firstUnreadOrdinal: unreadMessageCount > 0 ? lastReadOrdinal + 1 : null,
    unreadMessageCount,
    unreadCustomerMessageCount: Math.min(1, unreadMessageCount),
    updatedAt: current?.updatedAt ?? null,
  };
  mockReadStateByConversation.set(conversationId, value);
  return value;
}

type MockSupportCase = SupportWorkspaceCaseRow & {
  conversationId: string | null;
  externalEndUserId: string;
};

const mockSupportCases: readonly MockSupportCase[] = [
  {
    id: "case-demo-deposit",
    endUserId: "usr_1",
    externalEndUserId: "player-0042",
    conversationId: "conv_1",
    projectSequence: "48",
    title: "Не поступил депозит",
    status: "WAITING_SYSTEM",
    priority: "URGENT",
    groupCode: "PAYMENTS",
    attentionRequired: false,
    slaSignal: {
      state: "AVAILABLE",
      signalCode: "SLA_PAUSED",
      kind: "RESOLUTION",
      timing: "PAUSED",
      risk: "ON_TRACK",
      pauseReason: "WAITING_SYSTEM",
      currentDeadlineAt: "2026-07-26T11:30:00.000Z",
      remainingBusinessMs: 5_400_000,
      computedAt: "2026-07-26T10:00:00.000Z",
    },
    lastActivityAt: "2026-07-26T10:00:00.000Z",
    updatedAt: "2026-07-26T10:00:00.000Z",
    version: 2,
  },
  {
    id: "case-demo-game",
    endUserId: "usr_2",
    externalEndUserId: "player-0198",
    conversationId: "conv_3",
    projectSequence: "47",
    title: "Не запускается игра",
    status: "WAITING_ADMIN",
    priority: "HIGH",
    groupCode: "GAMES",
    attentionRequired: true,
    slaSignal: {
      state: "AVAILABLE",
      signalCode: "SLA_AT_RISK",
      kind: "FIRST_HUMAN_RESPONSE",
      timing: "RUNNING",
      risk: "AT_RISK",
      pauseReason: null,
      currentDeadlineAt: "2026-07-26T09:35:00.000Z",
      remainingBusinessMs: 900_000,
      computedAt: "2026-07-26T09:20:00.000Z",
    },
    lastActivityAt: "2026-07-26T09:20:00.000Z",
    updatedAt: "2026-07-26T09:20:00.000Z",
    version: 1,
  },
  {
    id: "case-demo-resolved",
    endUserId: "usr_3",
    externalEndUserId: "player-0281",
    conversationId: null,
    projectSequence: "46",
    title: "Восстановление доступа",
    status: "RESOLVED",
    priority: "NORMAL",
    groupCode: "ACCOUNT",
    attentionRequired: false,
    slaSignal: {
      state: "NO_ACTIVE_CLOCK",
      computedAt: "2026-07-26T08:30:00.000Z",
    },
    lastActivityAt: "2026-07-26T08:30:00.000Z",
    updatedAt: "2026-07-26T08:30:00.000Z",
    version: 4,
  },
];

function mockCaseSelection(value: MockSupportCase): SupportWorkspaceCase {
  const assignment = readMockSupportAssignment(value.id);
  return {
    id: value.id,
    title: value.title,
    status: value.status,
    priority: value.priority,
    groupCode: value.groupCode,
    projectSequence: value.projectSequence,
    attentionRequired: value.attentionRequired,
    lastActivityAt: value.lastActivityAt,
    updatedAt: value.updatedAt,
    version: value.version,
    latestRevisionId: null,
    assignee: assignment
      ? { id: assignment.operatorId, displayName: assignment.operatorName }
      : null,
    assignment: assignment
      ? {
          id: assignment.id,
          state: "ASSIGNED",
          operatorId: assignment.operatorId,
          operatorName: assignment.operatorName,
          teamName: assignment.teamName,
          version: assignment.version,
          actionEtag: assignment.actionEtag,
        }
      : null,
  };
}

const mockSupportWorkspaceSource: SupportWorkspaceSource = {
  async readCases(_projectId, request) {
    const offset = request?.cursor ? Number(request.cursor) : 0;
    const limit = request?.limit ?? 30;
    const page = mockSupportCases.slice(offset, offset + limit);
    return {
      items: page.map((item) => ({
        id: item.id,
        endUserId: item.endUserId,
        projectSequence: item.projectSequence,
        title: item.title,
        status: item.status,
        priority: item.priority,
        groupCode: item.groupCode,
        attentionRequired: item.attentionRequired,
        slaSignal: item.slaSignal,
        lastActivityAt: item.lastActivityAt,
        updatedAt: item.updatedAt,
        version: item.version,
      })),
      nextCursor:
        offset + limit < mockSupportCases.length
          ? String(offset + limit)
          : null,
    };
  },

  async readConversations(projectId, request) {
    const page = await repository.getProjectConversations(projectId, request);
    return {
      items: page.items.map((conversation) => ({
        id: conversation.id,
        endUserId: conversation.endUser.id,
        title: conversation.title,
        status: conversation.status === "ACTIVE" ? "OPEN" : "CLOSED",
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messageCount: conversation.messageCount,
        isCurrent: conversation.isCurrent,
        currentInteractionSessionCount:
          conversation.currentInteractionSessionCount,
        lastMessageAt: conversation.lastMessage?.createdAt ?? null,
        readState: mockConversationReadState(
          conversation.id,
          conversation.messageCount,
        ),
      })),
      nextCursor: page.nextCursor,
    };
  },

  async readSelection(projectId, target, request) {
    if (!target.conversationId && !target.caseId)
      throw new Error("Support workspace selection requires an exact target");
    const selectedCase = target.caseId
      ? mockSupportCases.find((item) => item.id === target.caseId)
      : undefined;
    if (target.caseId && !selectedCase)
      throw new Error("Support workspace Case is unavailable");
    const conversationId =
      target.conversationId ?? selectedCase?.conversationId ?? null;
    const page = await repository.getProjectConversations(projectId, {
      limit: 100,
    });
    const selected = conversationId
      ? page.items.find((item) => item.id === conversationId)
      : undefined;
    if (conversationId && !selected)
      throw new Error("Support workspace conversation is unavailable");
    if (
      selectedCase &&
      selected &&
      selected.endUser.id !== selectedCase.endUserId
    )
      throw new Error("Mock Case points to another end user conversation");
    const messages = selected
      ? await repository.getMessages(
          projectId,
          selected.endUser.id,
          selected.id,
          {
            limit:
              request?.messageLimit ?? SUPPORT_WORKSPACE_MESSAGE_PAGE_LIMIT,
            ...(request?.messageCursor
              ? { cursor: request.messageCursor }
              : {}),
          },
        )
      : { items: [], nextCursor: null };
    const endUserId = selected?.endUser.id ?? selectedCase!.endUserId;
    const readState = selected
      ? mockConversationReadState(selected.id, selected.messageCount)
      : null;
    return {
      checkpoint: `mock:${projectId}:${target.caseId ?? conversationId}`,
      capabilitiesRevision: "mock-read-only",
      actionRevisions: {},
      classificationOptions: [
        { code: "PAYMENTS", label: "Платежи" },
        { code: "GAMES", label: "Игры" },
        { code: "ACCOUNT", label: "Аккаунт" },
        { code: "GENERAL", label: "Общие вопросы" },
      ],
      capabilities: mockCapabilities(selectedCase),
      endUser: {
        id: endUserId,
        isGuest: false,
        createdAt: selected?.createdAt ?? selectedCase!.updatedAt,
        lastSeenAt: selected?.updatedAt ?? selectedCase!.updatedAt,
        locale: null,
      },
      case: selectedCase ? mockCaseSelection(selectedCase) : null,
      sla: selectedCase
        ? {
            occurrenceState:
              selectedCase.status === "RESOLVED" ? "TERMINAL" : "ACTIVE",
            clocks:
              selectedCase.slaSignal?.state === "AVAILABLE"
                ? [
                    {
                      kind: selectedCase.slaSignal.kind,
                      timing: selectedCase.slaSignal.timing,
                      risk: selectedCase.slaSignal.risk,
                      outcome:
                        selectedCase.status === "RESOLVED" ? "MET" : "OPEN",
                      pauseReason: selectedCase.slaSignal.pauseReason,
                      targetBusinessSeconds: 7_200,
                      consumedBusinessMs: 1_800_000,
                      remainingBusinessMs:
                        selectedCase.slaSignal.remainingBusinessMs,
                      currentDeadlineAt:
                        selectedCase.slaSignal.currentDeadlineAt,
                      breachedAt: null,
                      metAt:
                        selectedCase.status === "RESOLVED"
                          ? selectedCase.updatedAt
                          : null,
                    },
                  ]
                : [],
          }
        : null,
      routing: selectedCase
        ? {
            state: "AVAILABLE",
            reasonCode:
              selectedCase.status === "RESOLVED"
                ? "ROUTING_OFFER_ACCEPTED"
                : selectedCase.id === "case-demo-game"
                  ? "CAPACITY_GAP"
                  : "ROUTING_EVALUATION_PENDING",
            assignmentState: readMockSupportAssignment(selectedCase.id)
              ? "ASSIGNED"
              : "UNASSIGNED",
            mode: "LIVE_PROPOSAL",
            outcome:
              selectedCase.id === "case-demo-game" ? "CAPACITY_GAP" : null,
            queue: {
              code: selectedCase.groupCode,
              name:
                selectedCase.groupCode === "PAYMENTS"
                  ? "Платежи"
                  : selectedCase.groupCode === "GAMES"
                    ? "Игры"
                    : "Аккаунты",
            },
            candidateCount: selectedCase.id === "case-demo-game" ? 4 : 2,
            eligibleCandidateCount:
              selectedCase.id === "case-demo-game" ? 0 : 2,
            exclusions:
              selectedCase.id === "case-demo-game"
                ? { CAPACITY_EXHAUSTED: 3, SKILL_REQUIRED: 1 }
                : {},
            evaluatedAt: selectedCase.updatedAt,
            candidatesTruncated: false,
            reservation: null,
            fallback:
              selectedCase.id === "case-demo-game"
                ? {
                    state: "SCHEDULED",
                    candidateAttempt: 2,
                    availableAt: "2026-07-26T09:25:00.000Z",
                  }
                : null,
          }
        : null,
      conversation: selected
        ? {
            id: selected.id,
            endUserId: selected.endUser.id,
            title: selected.title,
            status: selected.status === "ACTIVE" ? "OPEN" : "CLOSED",
            createdAt: selected.createdAt,
            updatedAt: selected.updatedAt,
            messageCount: selected.messageCount,
            isCurrent: selected.isCurrent,
            currentInteractionSessionCount:
              selected.currentInteractionSessionCount,
            lastMessageAt: selected.lastMessage?.createdAt ?? null,
            readState: readState!,
          }
        : null,
      messages: {
        items: withMockMessageOrdinals(messages.items),
        nextCursor: messages.nextCursor,
        newerCursor: null,
        anchorOrdinal: request?.messageCursor
          ? null
          : (readState?.firstUnreadOrdinal ?? null),
      },
    };
  },

  async markConversationRead(_projectId, conversationId, lastReadOrdinal) {
    const current = mockConversationReadState(conversationId, lastReadOrdinal);
    const nextLastReadOrdinal = Math.min(
      current.highestOrdinal,
      Math.max(current.lastReadOrdinal, lastReadOrdinal),
    );
    const unreadMessageCount = Math.max(
      0,
      current.highestOrdinal - nextLastReadOrdinal,
    );
    const next: SupportConversationReadState = {
      ...current,
      lastReadOrdinal: nextLastReadOrdinal,
      firstUnreadOrdinal:
        unreadMessageCount > 0 ? nextLastReadOrdinal + 1 : null,
      unreadMessageCount,
      unreadCustomerMessageCount: Math.min(
        current.unreadCustomerMessageCount,
        unreadMessageCount,
      ),
      updatedAt: new Date().toISOString(),
    };
    mockReadStateByConversation.set(conversationId, next);
    return next;
  },
};

export const supportWorkspaceSource: SupportWorkspaceSource = isMockMode
  ? mockSupportWorkspaceSource
  : apiSupportWorkspaceSource;
