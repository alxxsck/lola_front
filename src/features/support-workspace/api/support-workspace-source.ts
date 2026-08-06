import { supportWorkspaceRead } from "@/shared/api/generated/retenive-backend";
import { repository } from "@/shared/api/repository";
import type { CursorPage, CursorPageRequest } from "@/shared/api/repository/contracts";
import { mapConversationMessage } from "@/shared/api/repository/mappers";
import { isMockMode } from "@/shared/config/data-mode";
import type { ConversationMessage } from "@/shared/types/domain";

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
}

export interface SupportWorkspaceSelection {
  checkpoint: string;
  capabilitiesRevision: string;
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
  conversation: SupportWorkspaceConversation | null;
  messages: CursorPage<ConversationMessage>;
}

export interface SupportWorkspaceSource {
  readConversations(
    projectId: string,
    request?: CursorPageRequest,
  ): Promise<CursorPage<SupportWorkspaceConversation>>;
  readSelection(
    projectId: string,
    conversationId: string,
    request?: { messageCursor?: string; messageLimit?: number },
  ): Promise<SupportWorkspaceSelection>;
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
  };
}

const apiSupportWorkspaceSource: SupportWorkspaceSource = {
  async readConversations(projectId, request) {
    const response = await supportWorkspaceRead(projectId, {
      mode: "ALL_CONVERSATIONS",
      limit: request?.limit ?? 30,
      ...(request?.cursor ? { cursor: request.cursor } : {}),
    });
    if (response.mode !== "ALL_CONVERSATIONS") {
      throw new Error("Support workspace returned an unexpected inbox projection");
    }
    return {
      items: response.items.map(mapWorkspaceConversation),
      nextCursor: response.nextCursor ?? null,
    };
  },

  async readSelection(projectId, conversationId, request) {
    const response = await supportWorkspaceRead(projectId, {
      mode: "SELECTION",
      conversationId,
      messageLimit: request?.messageLimit ?? 50,
      ...(request?.messageCursor ? { messageCursor: request.messageCursor } : {}),
    });
    if (response.mode !== "SELECTION" || !response.conversation) {
      throw new Error("Support workspace did not return the requested conversation");
    }
    const conversation = mapWorkspaceConversation(response.conversation);
    if (conversation.id !== conversationId) {
      throw new Error("Support workspace returned a different conversation");
    }
    return {
      checkpoint: response.checkpoint,
      capabilitiesRevision: response.capabilitiesRevision,
      capabilities: response.capabilities,
      endUser: response.endUser,
      conversation,
      messages: {
        items: response.messages.items.map(mapConversationMessage),
        nextCursor: response.messages.nextCursor ?? null,
      },
    };
  },
};

const mockCapabilities: SupportWorkspaceSelection["capabilities"] = {
  assignCase: false,
  claimAssignment: false,
  escalateCase: false,
  manageCase: false,
  releaseAssignment: false,
  reply: false,
  replyWithoutTranslation: false,
  suspendAi: false,
  transferAssignment: false,
};

const mockSupportWorkspaceSource: SupportWorkspaceSource = {
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
        currentInteractionSessionCount: conversation.currentInteractionSessionCount,
        lastMessageAt: conversation.lastMessage?.createdAt ?? null,
      })),
      nextCursor: page.nextCursor,
    };
  },

  async readSelection(projectId, conversationId, request) {
    const page = await repository.getProjectConversations(projectId, { limit: 100 });
    const selected = page.items.find((item) => item.id === conversationId);
    if (!selected) throw new Error("Support workspace conversation is unavailable");
    const messages = await repository.getMessages(
      projectId,
      selected.endUser.id,
      selected.id,
      {
        limit: request?.messageLimit ?? 50,
        ...(request?.messageCursor ? { cursor: request.messageCursor } : {}),
      },
    );
    return {
      checkpoint: `mock:${projectId}:${conversationId}`,
      capabilitiesRevision: "mock-read-only",
      capabilities: mockCapabilities,
      endUser: {
        id: selected.endUser.id,
        externalId: selected.endUser.externalId,
        isGuest: false,
        createdAt: selected.createdAt,
        lastSeenAt: selected.updatedAt,
        locale: null,
      },
      conversation: {
        id: selected.id,
        endUserId: selected.endUser.id,
        title: selected.title,
        status: selected.status === "ACTIVE" ? "OPEN" : "CLOSED",
        createdAt: selected.createdAt,
        updatedAt: selected.updatedAt,
        messageCount: selected.messageCount,
        isCurrent: selected.isCurrent,
        currentInteractionSessionCount: selected.currentInteractionSessionCount,
        lastMessageAt: selected.lastMessage?.createdAt ?? null,
      },
      messages,
    };
  },
};

export const supportWorkspaceSource: SupportWorkspaceSource = isMockMode
  ? mockSupportWorkspaceSource
  : apiSupportWorkspaceSource;
