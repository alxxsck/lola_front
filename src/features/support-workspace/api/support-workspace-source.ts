import { supportWorkspaceRead } from "@/shared/api/generated/retenive-backend";
import { repository } from "@/shared/api/repository";
import type {
  CursorPage,
  CursorPageRequest,
} from "@/shared/api/repository/contracts";
import { mapConversationMessage } from "@/shared/api/repository/mappers";
import { isMockMode } from "@/shared/config/data-mode";
import type { ConversationMessage } from "@/shared/types/domain";
import type {
  SupportWorkspaceCaseRowResponseDto,
  SupportWorkspaceSelectionCaseResponseDto,
  SupportWorkspaceSelectionResponseDto,
} from "@/shared/api/generated/models";

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
  lastActivityAt: string;
  updatedAt: string;
  version: number;
}

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
  };
  endUser: {
    id: string;
    externalId: string;
    isGuest: boolean;
    createdAt: string;
    lastSeenAt: string;
    locale?: string | null;
  };
  case: SupportWorkspaceCase | null;
  conversation: SupportWorkspaceConversation | null;
  messages: CursorPage<SupportWorkspaceMessage>;
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
    request?: { messageCursor?: string; messageLimit?: number },
  ): Promise<SupportWorkspaceSelection>;
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
};

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
    lastActivityAt: value.lastActivityAt,
    updatedAt: value.updatedAt,
    version: value.version,
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
      messageLimit: request?.messageLimit ?? 50,
      ...(request?.messageCursor
        ? { messageCursor: request.messageCursor }
        : {}),
    });
    if (response.mode !== "SELECTION") {
      throw new Error(
        "Support workspace did not return the requested conversation",
      );
    }
    return mapSupportWorkspaceSelection(response, target);
  },
};

const mockCapabilities: SupportWorkspaceSelection["capabilities"] = {
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
    lastActivityAt: "2026-07-26T08:30:00.000Z",
    updatedAt: "2026-07-26T08:30:00.000Z",
    version: 4,
  },
];

function mockCaseSelection(value: MockSupportCase): SupportWorkspaceCase {
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
    assignee: null,
    assignment: null,
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
            limit: request?.messageLimit ?? 50,
            ...(request?.messageCursor
              ? { cursor: request.messageCursor }
              : {}),
          },
        )
      : { items: [], nextCursor: null };
    const endUserId = selected?.endUser.id ?? selectedCase!.endUserId;
    return {
      checkpoint: `mock:${projectId}:${target.caseId ?? conversationId}`,
      capabilitiesRevision: "mock-read-only",
      actionRevisions: {},
      classificationOptions: [{ code: "GENERAL", label: "Общие вопросы" }],
      capabilities: mockCapabilities,
      endUser: {
        id: endUserId,
        externalId:
          selected?.endUser.externalId ?? selectedCase!.externalEndUserId,
        isGuest: false,
        createdAt: selected?.createdAt ?? selectedCase!.updatedAt,
        lastSeenAt: selected?.updatedAt ?? selectedCase!.updatedAt,
        locale: null,
      },
      case: selectedCase ? mockCaseSelection(selectedCase) : null,
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
          }
        : null,
      messages: {
        items: withMockMessageOrdinals(messages.items),
        nextCursor: messages.nextCursor,
      },
    };
  },
};

export const supportWorkspaceSource: SupportWorkspaceSource = isMockMode
  ? mockSupportWorkspaceSource
  : apiSupportWorkspaceSource;
