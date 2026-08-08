import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminMessageResult } from "@/shared/types/domain";
import { ApiError } from "@/shared/api/http/api-error";
import type { SupportWorkspaceSelection } from "@/features/support-workspace/api/support-workspace-source";
import { createSupportReplyController } from "./use-support-reply";

function selection(
  reply = true,
  conversationId = "conversation-1",
  replyWithoutTranslation = false,
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
      reply,
      replyWithoutTranslation,
      suspendAi: false,
      transferAssignment: false,
    },
    endUser: {
      id: "user-1",
      isGuest: false,
      createdAt: "2026-08-06T10:00:00.000Z",
      lastSeenAt: "2026-08-06T10:00:00.000Z",
      locale: "ru",
    },
    case: null,
    sla: null,
    routing: null,
    conversation: {
      id: conversationId,
      endUserId: "user-1",
      title: "Диалог",
      status: "OPEN",
      createdAt: "2026-08-06T10:00:00.000Z",
      updatedAt: "2026-08-06T10:00:00.000Z",
      messageCount: 1,
      isCurrent: true,
      currentInteractionSessionCount: 0,
      lastMessageAt: null,
      readState: {
        conversationId,
        lastReadOrdinal: 0,
        highestOrdinal: 1,
        firstUnreadOrdinal: 1,
        unreadMessageCount: 1,
        unreadCustomerMessageCount: 1,
        updatedAt: null,
      },
    },
    messages: {
      items: [],
      nextCursor: null,
      newerCursor: null,
      anchorOrdinal: 1,
    },
  };
}

const delivered: AdminMessageResult = {
  duplicate: false,
  messageId: "message-1",
  threadId: "conversation-1",
  commandIds: [],
  status: "COMPLETED",
  deliveryStatus: "PENDING",
};

function replySource(sendAdminMessage = vi.fn()) {
  return {
    sendAdminMessage,
    lookupAdminMessageOutcome: vi.fn(),
  };
}

describe("support reply controller", () => {
  beforeEach(() => sessionStorage.clear());

  it("sends a reply only when the server selection allows it", async () => {
    const sendAdminMessage = vi.fn().mockResolvedValue(delivered);
    const reconcile = vi.fn().mockResolvedValue(undefined);
    const controller = createSupportReplyController(
      {
        projectId: () => "project-1",
        actorId: () => "operator-1",
        selection: () => selection(),
        reconcile,
      },
      replySource(sendAdminMessage),
    );
    controller.draft.value = "  Добрый день  ";

    await controller.send();

    expect(sendAdminMessage).toHaveBeenCalledWith("project-1", "user-1", {
      conversationId: "conversation-1",
      idempotencyKey: expect.any(String),
      text: "Добрый день",
    });
    expect(controller.draft.value).toBe("");
    expect(controller.deliveryStatus.value).toBe("PENDING");
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it("sends an attachment-only reply and consumes the exact durable draft", async () => {
    const sendAdminMessage = vi.fn().mockResolvedValue(delivered);
    const onAccepted = vi.fn();
    const controller = createSupportReplyController(
      {
        projectId: () => "project-1",
        actorId: () => "operator-1",
        selection: () => selection(),
        reconcile: vi.fn(),
        onAccepted,
      },
      replySource(sendAdminMessage),
    );

    await controller.send({
      attachmentIds: ["attachment-1", "attachment-2"],
      attachmentDraftKey: "draft-1",
    });

    expect(sendAdminMessage).toHaveBeenCalledWith("project-1", "user-1", {
      conversationId: "conversation-1",
      idempotencyKey: expect.any(String),
      attachmentIds: ["attachment-1", "attachment-2"],
      attachmentDraftKey: "draft-1",
    });
    expect(onAccepted).toHaveBeenCalledWith(
      expect.objectContaining({ attachmentDraftKey: "draft-1" }),
    );
  });

  it("binds a reviewed translation draft to the same authoritative reply", async () => {
    const sendAdminMessage = vi.fn().mockResolvedValue(delivered);
    const currentSelection = selection();
    currentSelection.case = {
      id: "case-1",
      title: "Проверка оплаты",
      status: "OPEN",
      priority: "NORMAL",
      groupCode: "payments",
      projectSequence: "7",
      attentionRequired: false,
      lastActivityAt: "2026-08-06T10:00:00.000Z",
      updatedAt: "2026-08-06T10:00:00.000Z",
      version: 1,
      latestRevisionId: null,
      assignee: null,
      assignment: null,
    };
    const controller = createSupportReplyController(
      {
        projectId: () => "project-1",
        actorId: () => "operator-1",
        selection: () => currentSelection,
        reconcile: vi.fn(),
      },
      replySource(sendAdminMessage),
    );
    controller.draft.value = "Добрый день";

    await controller.sendTranslatedReply("translation-draft-1");

    expect(sendAdminMessage).toHaveBeenCalledWith("project-1", "user-1", {
      conversationId: "conversation-1",
      endUserCaseId: "case-1",
      idempotencyKey: expect.any(String),
      replyTranslationDraftId: "translation-draft-1",
      text: "Добрый день",
    });
    expect(controller.draft.value).toBe("");
  });

  it("sends a server-authorized no-translation override with the audited reason", async () => {
    const sendAdminMessage = vi.fn().mockResolvedValue(delivered);
    const controller = createSupportReplyController(
      {
        projectId: () => "project-1",
        actorId: () => "operator-1",
        selection: () => selection(true, "conversation-1", true),
        reconcile: vi.fn(),
      },
      replySource(sendAdminMessage),
    );
    controller.draft.value = "Срочное исходное сообщение";

    await controller.sendWithoutTranslation("Провайдер перевода недоступен");

    expect(sendAdminMessage).toHaveBeenCalledWith("project-1", "user-1", {
      conversationId: "conversation-1",
      idempotencyKey: expect.any(String),
      sendWithoutTranslation: { reason: "Провайдер перевода недоступен" },
      text: "Срочное исходное сообщение",
    });
  });

  it("preserves the draft and routes a server translation requirement into the explicit flow", async () => {
    const controller = createSupportReplyController(
      {
        projectId: () => "project-1",
        actorId: () => "operator-1",
        selection: () => selection(),
        reconcile: vi.fn(),
      },
      {
        sendAdminMessage: vi
          .fn()
          .mockRejectedValue(
            new ApiError(
              409,
              "Нужен подготовленный перевод",
              undefined,
              undefined,
              "TRANSLATION_PREVIEW_REQUIRED",
            ),
          ),
        lookupAdminMessageOutcome: vi.fn(),
      },
    );
    controller.draft.value = "Не отправлять автоматически";

    await controller.send();

    expect(controller.draft.value).toBe("Не отправлять автоматически");
    expect(controller.translationRequired.value).toBe(true);
  });

  it("fails closed when the server did not grant reply capability", async () => {
    const sendAdminMessage = vi.fn();
    const controller = createSupportReplyController(
      {
        projectId: () => "project-1",
        actorId: () => "operator-1",
        selection: () => selection(false),
        reconcile: vi.fn(),
      },
      replySource(sendAdminMessage),
    );
    controller.draft.value = "Не отправлять";

    await controller.send();

    expect(sendAdminMessage).not.toHaveBeenCalled();
    expect(controller.error.value).toBe(
      "У вас нет права отвечать в этом диалоге",
    );
  });

  it("keeps reply drafts scoped to their selected conversation", () => {
    let currentSelection = selection(true, "conversation-1");
    const controller = createSupportReplyController(
      {
        projectId: () => "project-1",
        actorId: () => "operator-1",
        selection: () => currentSelection,
        reconcile: vi.fn(),
      },
      replySource(),
    );

    controller.syncSelection();
    controller.draft.value = "Черновик первого диалога";
    currentSelection = selection(true, "conversation-2");
    controller.syncSelection();

    expect(controller.draft.value).toBe("");

    controller.draft.value = "Черновик второго диалога";
    currentSelection = selection(true, "conversation-1");
    controller.syncSelection();

    expect(controller.draft.value).toBe("Черновик первого диалога");
  });

  it("looks up an ambiguous outcome before clearing the draft", async () => {
    const sendAdminMessage = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network timeout"));
    const lookupAdminMessageOutcome = vi.fn().mockResolvedValue(delivered);
    const controller = createSupportReplyController(
      {
        projectId: () => "project-1",
        actorId: () => "operator-1",
        selection: () => selection(),
        reconcile: vi.fn(),
      },
      { sendAdminMessage, lookupAdminMessageOutcome },
    );
    controller.draft.value = "Проверка retry";

    await controller.send();

    const firstKey = sendAdminMessage.mock.calls[0]?.[2]?.idempotencyKey;
    expect(firstKey).toEqual(expect.any(String));
    expect(sendAdminMessage).toHaveBeenCalledTimes(1);
    expect(lookupAdminMessageOutcome).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      firstKey,
    );
    expect(controller.draft.value).toBe("");
    expect(controller.outcomeState.value).toBe("IDLE");
  });

  it("retries with the same key only after lookup confirms no accepted message", async () => {
    const sendAdminMessage = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network timeout"))
      .mockResolvedValueOnce(delivered);
    const lookupAdminMessageOutcome = vi
      .fn()
      .mockRejectedValue(new ApiError(404, "Not found"));
    const controller = createSupportReplyController(
      {
        projectId: () => "project-1",
        actorId: () => "operator-1",
        selection: () => selection(),
        reconcile: vi.fn(),
      },
      { sendAdminMessage, lookupAdminMessageOutcome },
    );
    controller.draft.value = "Проверка retry";

    await controller.send();

    expect(controller.outcomeState.value).toBe("RETRYABLE");
    expect(controller.draft.value).toBe("Проверка retry");
    await controller.send();
    expect(sendAdminMessage).toHaveBeenCalledTimes(2);
    expect(sendAdminMessage.mock.calls[1]?.[2]?.idempotencyKey).toBe(
      sendAdminMessage.mock.calls[0]?.[2]?.idempotencyKey,
    );
    expect(controller.draft.value).toBe("");
  });

  it("replays the exact original Case-bound body when the selected Case changes", async () => {
    const sendAdminMessage = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network timeout"))
      .mockResolvedValueOnce(delivered);
    const lookupAdminMessageOutcome = vi
      .fn()
      .mockRejectedValue(new ApiError(404, "Not found"));
    let currentSelection = selection();
    currentSelection.case = {
      id: "case-original",
      title: "Исходное обращение",
      status: "OPEN",
      priority: "NORMAL",
      groupCode: "payments",
      projectSequence: "7",
      attentionRequired: false,
      lastActivityAt: "2026-08-06T10:00:00.000Z",
      updatedAt: "2026-08-06T10:00:00.000Z",
      version: 1,
      latestRevisionId: null,
      assignee: null,
      assignment: null,
    };
    const controller = createSupportReplyController(
      {
        projectId: () => "project-1",
        actorId: () => "operator-1",
        selection: () => currentSelection,
        reconcile: vi.fn(),
      },
      { sendAdminMessage, lookupAdminMessageOutcome },
    );
    controller.draft.value = "Повторить точный запрос";

    await controller.send();
    currentSelection = selection();
    await controller.send();

    expect(sendAdminMessage).toHaveBeenCalledTimes(2);
    expect(sendAdminMessage.mock.calls[1]?.[2]).toEqual(
      sendAdminMessage.mock.calls[0]?.[2],
    );
    expect(sendAdminMessage.mock.calls[1]?.[2]?.endUserCaseId).toBe(
      "case-original",
    );
  });

  it("uses the current Case and a new key when the operator changes a retryable payload", async () => {
    const sendAdminMessage = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network timeout"))
      .mockResolvedValueOnce(delivered);
    const lookupAdminMessageOutcome = vi
      .fn()
      .mockRejectedValue(new ApiError(404, "Not found"));
    let currentSelection = selection();
    currentSelection.case = {
      id: "case-original",
      title: "Исходное обращение",
      status: "OPEN",
      priority: "NORMAL",
      groupCode: "payments",
      projectSequence: "7",
      attentionRequired: false,
      lastActivityAt: "2026-08-06T10:00:00.000Z",
      updatedAt: "2026-08-06T10:00:00.000Z",
      version: 1,
      latestRevisionId: null,
      assignee: null,
      assignment: null,
    };
    const controller = createSupportReplyController(
      {
        projectId: () => "project-1",
        actorId: () => "operator-1",
        selection: () => currentSelection,
        reconcile: vi.fn(),
      },
      { sendAdminMessage, lookupAdminMessageOutcome },
    );
    controller.draft.value = "Исходный текст";
    await controller.send();
    const originalKey = sendAdminMessage.mock.calls[0]?.[2]?.idempotencyKey;

    currentSelection = selection();
    currentSelection.case = {
      id: "case-current",
      title: "Текущее обращение",
      status: "OPEN",
      priority: "HIGH",
      groupCode: "retention",
      projectSequence: "8",
      attentionRequired: true,
      lastActivityAt: "2026-08-06T11:00:00.000Z",
      updatedAt: "2026-08-06T11:00:00.000Z",
      version: 2,
      latestRevisionId: null,
      assignee: null,
      assignment: null,
    };
    controller.draft.value = "Исправленный текст";
    await controller.send();

    expect(sendAdminMessage.mock.calls[1]?.[2]).toMatchObject({
      text: "Исправленный текст",
      endUserCaseId: "case-current",
    });
    expect(sendAdminMessage.mock.calls[1]?.[2]?.idempotencyKey).not.toBe(
      originalKey,
    );
  });

  it("restores an unresolved attempt after reload and checks outcome without resending", async () => {
    const first = createSupportReplyController(
      {
        projectId: () => "project-1",
        actorId: () => "operator-1",
        selection: () => selection(),
        reconcile: vi.fn(),
      },
      {
        sendAdminMessage: vi.fn().mockRejectedValue(new TypeError("offline")),
        lookupAdminMessageOutcome: vi
          .fn()
          .mockRejectedValue(new TypeError("still offline")),
      },
    );
    first.syncSelection();
    first.draft.value = "Сохранённый ответ";
    await first.send();
    expect(first.outcomeState.value).toBe("CHECKING_OUTCOME");

    const sendAdminMessage = vi.fn();
    const lookupAdminMessageOutcome = vi.fn().mockResolvedValue(delivered);
    const restored = createSupportReplyController(
      {
        projectId: () => "project-1",
        actorId: () => "operator-1",
        selection: () => selection(),
        reconcile: vi.fn(),
      },
      { sendAdminMessage, lookupAdminMessageOutcome },
    );
    restored.syncSelection();

    expect(restored.draft.value).toBe("Сохранённый ответ");
    expect(restored.outcomeState.value).toBe("CHECKING_OUTCOME");
    await restored.checkOutcome();

    expect(sendAdminMessage).not.toHaveBeenCalled();
    expect(lookupAdminMessageOutcome).toHaveBeenCalledTimes(1);
    expect(restored.draft.value).toBe("");
  });

  it("blocks a reused idempotency key without losing the operator draft", async () => {
    const controller = createSupportReplyController(
      {
        projectId: () => "project-1",
        actorId: () => "operator-1",
        selection: () => selection(),
        reconcile: vi.fn(),
      },
      {
        sendAdminMessage: vi
          .fn()
          .mockRejectedValue(
            new ApiError(
              409,
              "Key reused",
              undefined,
              undefined,
              "IDEMPOTENCY_KEY_REUSED",
            ),
          ),
        lookupAdminMessageOutcome: vi.fn(),
      },
    );
    controller.draft.value = "Не потерять при конфликте";

    await controller.send();

    expect(controller.draft.value).toBe("Не потерять при конфликте");
    expect(controller.outcomeState.value).toBe("BLOCKED");
    expect(controller.error.value).toContain("Черновик сохранён");
  });

  it("discards only a conflicting attempt and starts a new key with the preserved draft", async () => {
    const blockedSend = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(
          409,
          "Key reused",
          undefined,
          undefined,
          "IDEMPOTENCY_KEY_REUSED",
        ),
      );
    const blocked = createSupportReplyController(
      {
        projectId: () => "project-1",
        actorId: () => "operator-1",
        selection: () => selection(),
        reconcile: vi.fn(),
      },
      replySource(blockedSend),
    );
    blocked.draft.value = "Сохранённый после конфликта текст";

    await blocked.send();
    const blockedKey = blockedSend.mock.calls[0]?.[2]?.idempotencyKey;

    const retrySend = vi.fn().mockResolvedValueOnce(delivered);
    const restored = createSupportReplyController(
      {
        projectId: () => "project-1",
        actorId: () => "operator-1",
        selection: () => selection(),
        reconcile: vi.fn(),
      },
      replySource(retrySend),
    );
    restored.syncSelection();
    expect(restored.outcomeState.value).toBe("BLOCKED");
    expect(restored.draft.value).toBe("Сохранённый после конфликта текст");
    restored.discardBlockedAttempt();
    await restored.send();

    expect(retrySend).toHaveBeenCalledTimes(1);
    expect(retrySend.mock.calls[0]?.[2]?.idempotencyKey).not.toBe(blockedKey);
    expect(restored.draft.value).toBe("");
  });

  it("preserves the draft and refreshes authority after reply permission is revoked", async () => {
    const reconcile = vi.fn().mockResolvedValue(undefined);
    const controller = createSupportReplyController(
      {
        projectId: () => "project-1",
        actorId: () => "operator-1",
        selection: () => selection(),
        reconcile,
      },
      {
        sendAdminMessage: vi
          .fn()
          .mockRejectedValue(new ApiError(403, "Forbidden")),
        lookupAdminMessageOutcome: vi.fn(),
      },
    );
    controller.draft.value = "Сохранить после revoke";

    await controller.send();

    expect(controller.draft.value).toBe("Сохранить после revoke");
    expect(controller.outcomeState.value).toBe("IDLE");
    expect(reconcile).toHaveBeenCalledOnce();
  });

  it("keeps an accepted reply accepted when the following reconcile fails", async () => {
    const sendAdminMessage = vi.fn().mockResolvedValue(delivered);
    const controller = createSupportReplyController(
      {
        projectId: () => "project-1",
        actorId: () => "operator-1",
        selection: () => selection(),
        reconcile: vi.fn().mockRejectedValue(new Error("refresh unavailable")),
      },
      replySource(sendAdminMessage),
    );
    controller.draft.value = "Сообщение уже принято";

    await controller.send();

    expect(sendAdminMessage).toHaveBeenCalledTimes(1);
    expect(controller.draft.value).toBe("");
    expect(controller.error.value).toBe(
      "Сообщение принято. Не удалось обновить историю диалога.",
    );
  });

  it("does not restore a draft under another project or operator", () => {
    let projectId = "project-1";
    let actorId = "operator-1";
    const controller = createSupportReplyController(
      {
        projectId: () => projectId,
        actorId: () => actorId,
        selection: () => selection(),
        reconcile: vi.fn(),
      },
      replySource(),
    );

    controller.syncSelection();
    controller.draft.value = "Личный черновик";
    projectId = "project-2";
    controller.syncSelection();
    expect(controller.draft.value).toBe("");

    projectId = "project-1";
    actorId = "operator-2";
    controller.syncSelection();
    expect(controller.draft.value).toBe("");
  });
});
