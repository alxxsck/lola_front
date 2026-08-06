import { describe, expect, it, vi } from "vitest";
import type { ConversationMessage } from "@/shared/types/domain";
import type {
  SupportWorkspaceConversation,
  SupportWorkspaceSelection,
} from "@/features/support-workspace/api/support-workspace-source";
import { createSupportConversationController } from "./use-support-conversation";

function conversation(
  id: string,
): SupportWorkspaceConversation {
  return {
    id,
    endUserId: `user-${id}`,
    title: id,
    status: "OPEN",
    createdAt: "2026-08-06T10:00:00.000Z",
    updatedAt: "2026-08-06T10:00:00.000Z",
    messageCount: 1,
    isCurrent: true,
    currentInteractionSessionCount: 1,
    lastMessageAt: null,
  };
}

function selection(
  conversationId: string,
  messages: ConversationMessage[],
  nextCursor: string | null = null,
  preserveMessageConversationIds = false,
): SupportWorkspaceSelection {
  return {
    checkpoint: "checkpoint-1",
    capabilitiesRevision: "capabilities-1",
    capabilities: {
      assignCase: false,
      claimAssignment: false,
      escalateCase: false,
      manageCase: false,
      releaseAssignment: false,
      reply: true,
      replyWithoutTranslation: false,
      suspendAi: false,
      transferAssignment: false,
    },
    endUser: {
      id: `user-${conversationId}`,
      externalId: `external-${conversationId}`,
      isGuest: false,
      createdAt: "2026-08-06T10:00:00.000Z",
      lastSeenAt: "2026-08-06T10:00:00.000Z",
      locale: "ru",
    },
    case: null,
    conversation: conversation(conversationId),
    messages: {
      items: preserveMessageConversationIds
        ? messages
        : messages.map((item) => ({ ...item, conversationId })),
      nextCursor,
    },
  };
}

function message(id: string, ordinal: number): ConversationMessage {
  return {
    id,
    conversationId: "conversation-1",
    ordinal,
    author: "USER",
    text: id,
    status: "COMPLETED",
    createdAt: `2026-08-06T10:0${ordinal}:00.000Z`,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("support conversation controller", () => {
  it("does not commit a stale history response after selection changes", async () => {
    let selectedConversationId = "conversation-1";
    const response = deferred<SupportWorkspaceSelection>();
    const source = {
      readSelection: vi.fn().mockReturnValue(response.promise),
    };
    const controller = createSupportConversationController(
      {
        projectId: () => "project-1",
        conversationId: () => selectedConversationId,
      },
      source,
    );

    const loading = controller.load();
    selectedConversationId = "conversation-2";
    response.resolve(selection("conversation-1", [message("stale", 1)]));
    await loading;

    expect(controller.messages.value).toEqual([]);
    expect(controller.selection.value).toBeNull();
    expect(controller.error.value).toBe("");
  });

  it("does not commit a stale history response after project changes", async () => {
    let projectId = "project-1";
    let selectedConversationId = "conversation-1";
    const response = deferred<SupportWorkspaceSelection>();
    const source = {
      readSelection: vi.fn().mockReturnValue(response.promise),
    };
    const controller = createSupportConversationController(
      { projectId: () => projectId, conversationId: () => selectedConversationId },
      source,
    );

    const loading = controller.load();
    projectId = "project-2";
    selectedConversationId = "conversation-2";
    response.resolve(selection("conversation-1", [message("stale", 1)]));
    await loading;

    expect(source.readSelection).toHaveBeenCalledWith("project-1", "conversation-1");
    expect(controller.messages.value).toEqual([]);
  });

  it("uses ordinal only and surfaces a reconcile state for a history gap", async () => {
    const source = {
      readSelection: vi.fn().mockResolvedValue(
        selection("conversation-1", [
          message("second", 2),
          message("first", 1),
          message("fourth", 4),
        ]),
      ),
    };
    const controller = createSupportConversationController(
      { projectId: () => "project-1", conversationId: () => "conversation-1" },
      source,
    );

    await controller.load();

    expect(controller.messages.value).toEqual([]);
    expect(controller.error.value).toBe("История сообщений требует обновления");
  });

  it("rejects a message that does not belong to the selected conversation", async () => {
    const foreignMessage = {
      ...message("foreign", 1),
      conversationId: "another-conversation",
    };
    const source = {
      readSelection: vi.fn().mockResolvedValue(
        selection("conversation-1", [foreignMessage], null, true),
      ),
    };
    const controller = createSupportConversationController(
      { projectId: () => "project-1", conversationId: () => "conversation-1" },
      source,
    );

    await controller.load();

    expect(controller.messages.value).toEqual([]);
    expect(controller.error.value).toBe("История сообщений требует обновления");
  });

  it("loads an authoritative selection directly by conversation id", async () => {
    const source = {
      readSelection: vi.fn().mockResolvedValue(
        selection("conversation-outside-first-page", [message("first", 1)]),
      ),
    };
    const controller = createSupportConversationController(
      {
        projectId: () => "project-1",
        conversationId: () => "conversation-outside-first-page",
      },
      source,
    );

    await controller.load();

    expect(source.readSelection).toHaveBeenCalledWith(
      "project-1",
      "conversation-outside-first-page",
    );
    expect(controller.selection.value?.endUser.externalId).toBe(
      "external-conversation-outside-first-page",
    );
    expect(controller.messages.value.map((item) => item.id)).toEqual(["first"]);
  });

  it("merges the older cursor page in authoritative ordinal order", async () => {
    const source = {
      readSelection: vi
        .fn()
        .mockResolvedValueOnce(
          selection(
            "conversation-1",
            [message("third", 3), message("fourth", 4)],
            "older-page",
          ),
        )
        .mockResolvedValueOnce(
          selection("conversation-1", [message("first", 1), message("second", 2)]),
        ),
    };
    const controller = createSupportConversationController(
      { projectId: () => "project-1", conversationId: () => "conversation-1" },
      source,
    );

    await controller.load();
    await controller.loadOlder();

    expect(source.readSelection).toHaveBeenNthCalledWith(
      2,
      "project-1",
      "conversation-1",
      { messageCursor: "older-page", messageLimit: 50 },
    );
    expect(controller.messages.value.map((item) => item.id)).toEqual([
      "first",
      "second",
      "third",
      "fourth",
    ]);
    expect(controller.nextMessageCursor.value).toBeNull();
  });

  it("reconciles the selected conversation without discarding loaded history", async () => {
    const source = {
      readSelection: vi
        .fn()
        .mockResolvedValueOnce(
          selection("conversation-1", [message("first", 1), message("second", 2)]),
        )
        .mockResolvedValueOnce(
          selection("conversation-1", [message("second", 2), message("third", 3)]),
        ),
    };
    const controller = createSupportConversationController(
      { projectId: () => "project-1", conversationId: () => "conversation-1" },
      source,
    );

    await controller.load();
    await controller.reconcile();

    expect(controller.messages.value.map((item) => item.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });
});
