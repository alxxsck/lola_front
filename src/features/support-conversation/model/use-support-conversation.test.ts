import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import type {
  SupportWorkspaceConversation,
  SupportWorkspaceMessage,
  SupportWorkspaceSelection,
} from "@/features/support-workspace/api/support-workspace-source";
import { createSupportConversationController } from "./use-support-conversation";

function conversation(id: string): SupportWorkspaceConversation {
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
    readState: {
      conversationId: id,
      lastReadOrdinal: 0,
      highestOrdinal: 1,
      firstUnreadOrdinal: 1,
      unreadMessageCount: 1,
      unreadCustomerMessageCount: 1,
      updatedAt: null,
    },
  };
}

function selection(
  conversationId: string,
  messages: SupportWorkspaceMessage[],
  nextCursor: string | null = null,
  preserveMessageConversationIds = false,
  newerCursor: string | null = null,
  anchorOrdinal: number | null = 1,
): SupportWorkspaceSelection {
  return {
    checkpoint: "checkpoint-1",
    capabilitiesRevision: "capabilities-1",
    actionRevisions: {},
    classificationOptions: [],
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
    sla: null,
    routing: null,
    conversation: conversation(conversationId),
    messages: {
      items: preserveMessageConversationIds
        ? messages
        : messages.map((item) => ({ ...item, conversationId })),
      nextCursor,
      newerCursor,
      anchorOrdinal,
    },
  };
}

function message(id: string, ordinal: number): SupportWorkspaceMessage {
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
  it("does not let an older delivery receipt overwrite a newer server receipt", async () => {
    const delivered = message("operator-reply", 1);
    delivered.author = "ADMIN";
    delivered.delivery = {
      status: "READ",
      generation: 2,
      version: 7,
      errorCode: null,
      retryEligible: false,
      allowedActions: [],
      commandIds: [],
    };
    const stale = structuredClone(delivered);
    stale.delivery = {
      ...stale.delivery!,
      status: "FAILED",
      generation: 1,
      version: 12,
      retryEligible: true,
      allowedActions: ["RETRY_FAILED_DELIVERY"],
    };
    const source = {
      readSelection: vi
        .fn()
        .mockResolvedValueOnce(selection("conversation-1", [delivered]))
        .mockResolvedValueOnce(selection("conversation-1", [stale])),
    };
    const controller = createSupportConversationController(
      { projectId: () => "project-1", conversationId: () => "conversation-1" },
      source,
    );

    await controller.load();
    await controller.reconcile();

    expect(controller.messages.value[0]?.delivery).toMatchObject({
      status: "READ",
      generation: 2,
      version: 7,
      retryEligible: false,
      allowedActions: [],
    });
  });

  it("applies an exact retry receipt even when the message is outside the bounded reconcile page", async () => {
    const failed = message("older-operator-reply", 1);
    failed.author = "ADMIN";
    failed.delivery = {
      status: "FAILED",
      generation: 3,
      version: 9,
      errorCode: "CLIENT_DISCONNECTED",
      retryEligible: true,
      allowedActions: ["RETRY_FAILED_DELIVERY"],
      commandIds: [],
    };
    const controller = createSupportConversationController(
      { projectId: () => "project-1", conversationId: () => "conversation-1" },
      {
        readSelection: vi
          .fn()
          .mockResolvedValue(selection("conversation-1", [failed])),
      },
    );
    await controller.load();

    controller.applyDeliveryReceipt(failed.id, {
      ...failed.delivery,
      status: "PENDING",
      generation: 4,
      version: 0,
      errorCode: null,
      retryEligible: false,
      allowedActions: [],
    });

    expect(controller.messages.value[0]?.delivery).toMatchObject({
      status: "PENDING",
      generation: 4,
      version: 0,
    });
  });

  it("keeps the initial first-unread anchor and follows the signed newer cursor", async () => {
    const source = {
      readSelection: vi
        .fn()
        .mockResolvedValueOnce(
          selection(
            "conversation-1",
            [message("first-unread", 3), message("fourth", 4)],
            "older-page",
            false,
            "newer-page",
            3,
          ),
        )
        .mockResolvedValueOnce(
          selection(
            "conversation-1",
            [message("fifth", 5), message("sixth", 6)],
            null,
            false,
            null,
            null,
          ),
        ),
      markConversationRead: vi.fn(),
    };
    const controller = createSupportConversationController(
      { projectId: () => "project-1", conversationId: () => "conversation-1" },
      source,
    );

    await controller.load();
    await controller.loadNewer();

    expect(source.readSelection).toHaveBeenNthCalledWith(
      2,
      "project-1",
      { conversationId: "conversation-1" },
      { messageNewerCursor: "newer-page", messageLimit: 50 },
    );
    expect(controller.messages.value.map((item) => item.ordinal)).toEqual([
      3, 4, 5, 6,
    ]);
    expect(controller.firstUnreadOrdinal.value).toBe(3);
    expect(controller.newerMessageCursor.value).toBeNull();
  });

  it("serializes visible high-water ACKs and commits only authoritative read state", async () => {
    const first = deferred<SupportWorkspaceConversation["readState"]>();
    const second = deferred<SupportWorkspaceConversation["readState"]>();
    const onReadStateChange = vi.fn();
    const initial = selection("conversation-1", [
      message("first", 1),
      message("second", 2),
      message("third", 3),
      message("fourth", 4),
    ]);
    initial.conversation!.readState = {
      conversationId: "conversation-1",
      lastReadOrdinal: 0,
      highestOrdinal: 4,
      firstUnreadOrdinal: 1,
      unreadMessageCount: 4,
      unreadCustomerMessageCount: 4,
      updatedAt: null,
    };
    const source = {
      readSelection: vi.fn().mockResolvedValue(initial),
      markConversationRead: vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
    };
    const controller = createSupportConversationController(
      {
        projectId: () => "project-1",
        conversationId: () => "conversation-1",
        onReadStateChange,
      },
      source,
    );
    await controller.load();

    const firstAck = controller.markVisible(2);
    const latestAck = controller.markVisible(4);
    expect(source.markConversationRead).toHaveBeenCalledTimes(1);
    expect(source.markConversationRead).toHaveBeenLastCalledWith(
      "project-1",
      "conversation-1",
      2,
    );

    first.resolve({
      ...initial.conversation!.readState,
      lastReadOrdinal: 2,
      firstUnreadOrdinal: 3,
      unreadMessageCount: 2,
      unreadCustomerMessageCount: 2,
      updatedAt: "2026-08-08T10:00:00.000Z",
    });
    await Promise.resolve();
    expect(source.markConversationRead).toHaveBeenCalledTimes(2);
    expect(source.markConversationRead).toHaveBeenLastCalledWith(
      "project-1",
      "conversation-1",
      4,
    );

    second.resolve({
      ...initial.conversation!.readState,
      lastReadOrdinal: 4,
      firstUnreadOrdinal: null,
      unreadMessageCount: 0,
      unreadCustomerMessageCount: 0,
      updatedAt: "2026-08-08T10:00:01.000Z",
    });
    await Promise.all([firstAck, latestAck]);

    expect(controller.readState.value?.lastReadOrdinal).toBe(4);
    expect(controller.firstUnreadOrdinal.value).toBe(1);
    expect(onReadStateChange).toHaveBeenLastCalledWith(
      "conversation-1",
      expect.objectContaining({ lastReadOrdinal: 4, unreadMessageCount: 0 }),
    );
  });

  it("ACKs the linked conversation while the workspace is selected by Case id", async () => {
    const linked = selection("conversation-linked-to-case", [
      message("first", 1),
    ]);
    const markConversationRead = vi.fn().mockResolvedValue({
      ...linked.conversation!.readState,
      lastReadOrdinal: 1,
      firstUnreadOrdinal: null,
      unreadMessageCount: 0,
      unreadCustomerMessageCount: 0,
      updatedAt: "2026-08-08T10:00:00.000Z",
    });
    const controller = createSupportConversationController(
      {
        projectId: () => "project-1",
        conversationId: () => undefined,
        caseId: () => "case-1",
      },
      {
        readSelection: vi.fn().mockResolvedValue(linked),
        markConversationRead,
      },
    );

    await controller.load();
    await controller.markVisible(1);

    expect(markConversationRead).toHaveBeenCalledWith(
      "project-1",
      "conversation-linked-to-case",
      1,
    );
  });

  it("does not let a stale reconnect projection decrease the read position", async () => {
    const current = selection("conversation-1", [message("fourth", 4)]);
    current.conversation!.readState = {
      ...current.conversation!.readState,
      lastReadOrdinal: 4,
      highestOrdinal: 4,
      firstUnreadOrdinal: null,
      unreadMessageCount: 0,
      unreadCustomerMessageCount: 0,
    };
    const stale = selection("conversation-1", [message("fourth", 4)]);
    stale.conversation!.readState = {
      ...stale.conversation!.readState,
      lastReadOrdinal: 2,
      highestOrdinal: 4,
      firstUnreadOrdinal: 3,
      unreadMessageCount: 2,
      unreadCustomerMessageCount: 2,
    };
    const source = {
      readSelection: vi
        .fn()
        .mockResolvedValueOnce(current)
        .mockResolvedValueOnce(stale),
    };
    const controller = createSupportConversationController(
      { projectId: () => "project-1", conversationId: () => "conversation-1" },
      source,
    );

    await controller.load();
    await controller.reconcile();

    expect(controller.readState.value?.lastReadOrdinal).toBe(4);
    expect(
      controller.selection.value?.conversation?.readState.lastReadOrdinal,
    ).toBe(4);
  });

  it("commits an in-flight read ACK when reconnect resolves first", async () => {
    const initial = selection("conversation-1", [
      message("first", 1),
      message("second", 2),
      message("third", 3),
      message("fourth", 4),
    ]);
    initial.conversation!.readState = {
      ...initial.conversation!.readState,
      highestOrdinal: 4,
      unreadMessageCount: 4,
      unreadCustomerMessageCount: 4,
    };
    const reconnect = deferred<SupportWorkspaceSelection>();
    const ack = deferred<SupportWorkspaceConversation["readState"]>();
    const source = {
      readSelection: vi
        .fn()
        .mockResolvedValueOnce(initial)
        .mockReturnValueOnce(reconnect.promise),
      markConversationRead: vi.fn().mockReturnValue(ack.promise),
    };
    const controller = createSupportConversationController(
      { projectId: () => "project-1", conversationId: () => "conversation-1" },
      source,
    );
    await controller.load();

    const pendingAck = controller.markVisible(4);
    const pendingReconnect = controller.reconcile();
    reconnect.resolve(initial);
    await pendingReconnect;
    ack.resolve({
      ...initial.conversation!.readState,
      lastReadOrdinal: 4,
      firstUnreadOrdinal: null,
      unreadMessageCount: 0,
      unreadCustomerMessageCount: 0,
    });
    await pendingAck;

    expect(controller.readState.value?.lastReadOrdinal).toBe(4);
  });

  it("keeps older pagination owned while reconnect overlaps", async () => {
    const initial = selection(
      "conversation-1",
      [message("third", 3), message("fourth", 4)],
      "older-page",
    );
    const older = deferred<SupportWorkspaceSelection>();
    const reconnect = deferred<SupportWorkspaceSelection>();
    const source = {
      readSelection: vi
        .fn()
        .mockResolvedValueOnce(initial)
        .mockReturnValueOnce(older.promise)
        .mockReturnValueOnce(reconnect.promise),
    };
    const controller = createSupportConversationController(
      { projectId: () => "project-1", conversationId: () => "conversation-1" },
      source,
    );
    await controller.load();

    const pendingOlder = controller.loadOlder();
    const pendingReconnect = controller.reconcile();
    reconnect.resolve(initial);
    await pendingReconnect;
    older.resolve(
      selection(
        "conversation-1",
        [message("first", 1), message("second", 2)],
        null,
        false,
        null,
        null,
      ),
    );
    await pendingOlder;

    expect(controller.loadingOlder.value).toBe(false);
    expect(controller.messages.value.map((item) => item.ordinal)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("keeps newer pagination owned while reconnect overlaps", async () => {
    const initial = selection(
      "conversation-1",
      [message("first", 1), message("second", 2)],
      null,
      false,
      "newer-page",
    );
    const newer = deferred<SupportWorkspaceSelection>();
    const reconnect = deferred<SupportWorkspaceSelection>();
    const source = {
      readSelection: vi
        .fn()
        .mockResolvedValueOnce(initial)
        .mockReturnValueOnce(newer.promise)
        .mockReturnValueOnce(reconnect.promise),
    };
    const controller = createSupportConversationController(
      { projectId: () => "project-1", conversationId: () => "conversation-1" },
      source,
    );
    await controller.load();

    const pendingNewer = controller.loadNewer();
    const pendingReconnect = controller.reconcile();
    reconnect.resolve(initial);
    await pendingReconnect;
    newer.resolve(
      selection(
        "conversation-1",
        [message("third", 3), message("fourth", 4)],
        null,
        false,
        null,
        null,
      ),
    );
    await pendingNewer;

    expect(controller.loadingNewer.value).toBe(false);
    expect(controller.messages.value.map((item) => item.ordinal)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("clears an invalidated older loading state when selection changes", async () => {
    let selectedConversationId = "conversation-1";
    const older = deferred<SupportWorkspaceSelection>();
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
        .mockReturnValueOnce(older.promise)
        .mockResolvedValueOnce(
          selection("conversation-2", [message("new-selection", 1)]),
        ),
    };
    const controller = createSupportConversationController(
      {
        projectId: () => "project-1",
        conversationId: () => selectedConversationId,
      },
      source,
    );
    await controller.load();

    const pendingOlder = controller.loadOlder();
    selectedConversationId = "conversation-2";
    await controller.load();
    expect(controller.loadingOlder.value).toBe(false);
    older.resolve(
      selection("conversation-1", [message("first", 1)], null, false, null),
    );
    await pendingOlder;

    expect(controller.loadingOlder.value).toBe(false);
    expect(controller.selection.value?.conversation?.id).toBe("conversation-2");
  });

  it("clears an invalidated newer loading state when selection changes", async () => {
    let selectedConversationId = "conversation-1";
    const newer = deferred<SupportWorkspaceSelection>();
    const source = {
      readSelection: vi
        .fn()
        .mockResolvedValueOnce(
          selection(
            "conversation-1",
            [message("first", 1)],
            null,
            false,
            "newer-page",
          ),
        )
        .mockReturnValueOnce(newer.promise)
        .mockResolvedValueOnce(
          selection("conversation-2", [message("new-selection", 1)]),
        ),
    };
    const controller = createSupportConversationController(
      {
        projectId: () => "project-1",
        conversationId: () => selectedConversationId,
      },
      source,
    );
    await controller.load();

    const pendingNewer = controller.loadNewer();
    selectedConversationId = "conversation-2";
    await controller.load();
    expect(controller.loadingNewer.value).toBe(false);
    newer.resolve(
      selection("conversation-1", [message("second", 2)], null, false, null),
    );
    await pendingNewer;

    expect(controller.loadingNewer.value).toBe(false);
    expect(controller.selection.value?.conversation?.id).toBe("conversation-2");
  });
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
      {
        projectId: () => projectId,
        conversationId: () => selectedConversationId,
      },
      source,
    );

    const loading = controller.load();
    projectId = "project-2";
    selectedConversationId = "conversation-2";
    response.resolve(selection("conversation-1", [message("stale", 1)]));
    await loading;

    expect(source.readSelection).toHaveBeenCalledWith("project-1", {
      conversationId: "conversation-1",
    });
    expect(controller.messages.value).toEqual([]);
  });

  it("uses ordinal only and surfaces a reconcile state for a history gap", async () => {
    const source = {
      readSelection: vi
        .fn()
        .mockResolvedValue(
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
      readSelection: vi
        .fn()
        .mockResolvedValue(
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
      readSelection: vi
        .fn()
        .mockResolvedValue(
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

    expect(source.readSelection).toHaveBeenCalledWith("project-1", {
      conversationId: "conversation-outside-first-page",
    });
    expect(controller.selection.value?.endUser.externalId).toBe(
      "external-conversation-outside-first-page",
    );
    expect(controller.messages.value.map((item) => item.id)).toEqual(["first"]);
  });

  it("loads the inspector by Case id without selecting a fallback conversation", async () => {
    const source = {
      readSelection: vi
        .fn()
        .mockResolvedValue(
          selection("conversation-linked-to-case", [message("first", 1)]),
        ),
    };
    const controller = createSupportConversationController(
      {
        projectId: () => "project-1",
        conversationId: () => undefined,
        caseId: () => "case-1",
      },
      source,
    );

    await controller.load();

    expect(source.readSelection).toHaveBeenCalledWith("project-1", {
      caseId: "case-1",
    });
    expect(controller.selection.value?.conversation?.id).toBe(
      "conversation-linked-to-case",
    );
  });

  it("keeps a Case without a linked Conversation as an authoritative selection", async () => {
    const caseOnly = selection("unused", []);
    caseOnly.conversation = null;
    caseOnly.messages = {
      items: [],
      nextCursor: null,
      newerCursor: null,
      anchorOrdinal: null,
    };
    caseOnly.case = {
      id: "case-only",
      title: "Отдельное обращение",
      status: "OPEN",
      priority: "NORMAL",
      groupCode: "GENERAL",
      projectSequence: "52",
      attentionRequired: false,
      lastActivityAt: "2026-08-06T10:00:00.000Z",
      updatedAt: "2026-08-06T10:00:00.000Z",
      version: 1,
      latestRevisionId: null,
      assignee: null,
      assignment: null,
    };
    const source = { readSelection: vi.fn().mockResolvedValue(caseOnly) };
    const controller = createSupportConversationController(
      {
        projectId: () => "project-1",
        conversationId: () => undefined,
        caseId: () => "case-only",
      },
      source,
    );

    await controller.load();

    expect(controller.error.value).toBe("");
    expect(controller.selection.value?.case?.id).toBe("case-only");
    expect(controller.selection.value?.conversation).toBeNull();
    expect(controller.messages.value).toEqual([]);
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
          selection("conversation-1", [
            message("first", 1),
            message("second", 2),
          ]),
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
      { conversationId: "conversation-1" },
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
          selection("conversation-1", [
            message("first", 1),
            message("second", 2),
          ]),
        )
        .mockResolvedValueOnce(
          selection("conversation-1", [
            message("second", 2),
            message("third", 3),
          ]),
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

  it("purges revoked operations context and rejects an older in-flight projection", async () => {
    const initial = selection("conversation-1", [message("first", 1)]);
    initial.sla = {
      rolloutState: "SHADOW",
      occurrenceState: "ACTIVE",
      clocks: [],
    };
    initial.routing = {
      state: "AVAILABLE",
      reasonCode: "WINNER",
      assignmentState: "UNASSIGNED",
      mode: "LIVE_PROPOSAL",
      outcome: "WINNER",
      queue: { code: "BILLING", name: "Платежи" },
      candidateCount: 1,
      eligibleCandidateCount: 1,
      exclusions: {},
      evaluatedAt: "2026-08-08T10:00:00.000Z",
      candidatesTruncated: false,
      reservation: null,
      fallback: null,
    };
    const stale = structuredClone(initial);
    const pending = deferred<SupportWorkspaceSelection>();
    const source = {
      readSelection: vi
        .fn()
        .mockResolvedValueOnce(initial)
        .mockReturnValueOnce(pending.promise),
    };
    const controller = createSupportConversationController(
      { projectId: () => "project-1", conversationId: () => "conversation-1" },
      source,
    );

    await controller.load();
    const reconcile = controller.reconcile();
    controller.purgeOperationsContext({ sla: true, routing: true });
    pending.resolve(stale);
    await reconcile;

    expect(controller.selection.value?.sla).toBeNull();
    expect(controller.selection.value?.routing).toEqual({ state: "REDACTED" });
    expect(controller.messages.value.map((item) => item.id)).toEqual(["first"]);
  });

  it("rejects an initial projection that returns after operations authority is revoked", async () => {
    const pending = deferred<SupportWorkspaceSelection>();
    const controller = createSupportConversationController(
      { projectId: () => "project-1", conversationId: () => "conversation-1" },
      { readSelection: vi.fn().mockReturnValueOnce(pending.promise) },
    );

    const load = controller.load();
    expect(controller.loading.value).toBe(true);
    controller.purgeOperationsContext({ sla: true, routing: true });
    expect(controller.loading.value).toBe(false);
    pending.resolve(selection("conversation-1", [message("first", 1)]));
    await load;

    expect(controller.selection.value).toBeNull();
    expect(controller.messages.value).toEqual([]);
    expect(controller.loading.value).toBe(false);
  });

  it("purges a visible history and ends the live selection after a concealed revoke", async () => {
    const onForbidden = vi.fn();
    const source = {
      readSelection: vi
        .fn()
        .mockResolvedValueOnce(
          selection("conversation-1", [message("first", 1)]),
        )
        .mockRejectedValueOnce(new ApiError(403, "Forbidden")),
    };
    const controller = createSupportConversationController(
      {
        projectId: () => "project-1",
        conversationId: () => "conversation-1",
        onForbidden,
      },
      source,
    );

    await controller.load();
    await controller.reconcile();

    expect(controller.selection.value).toBeNull();
    expect(controller.messages.value).toEqual([]);
    expect(onForbidden).toHaveBeenCalledOnce();
  });
});
