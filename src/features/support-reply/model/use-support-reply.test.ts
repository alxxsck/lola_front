import { describe, expect, it, vi } from "vitest";
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
      externalId: "external-1",
      isGuest: false,
      createdAt: "2026-08-06T10:00:00.000Z",
      lastSeenAt: "2026-08-06T10:00:00.000Z",
      locale: "ru",
    },
    case: null,
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
    },
    messages: { items: [], nextCursor: null },
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

describe("support reply controller", () => {
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
      { sendAdminMessage },
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
      { sendAdminMessage },
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
      { sendAdminMessage },
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
        sendAdminMessage: vi.fn().mockRejectedValue(
          new ApiError(
            409,
            "Нужен подготовленный перевод",
            undefined,
            undefined,
            "TRANSLATION_PREVIEW_REQUIRED",
          ),
        ),
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
      { sendAdminMessage },
    );
    controller.draft.value = "Не отправлять";

    await controller.send();

    expect(sendAdminMessage).not.toHaveBeenCalled();
    expect(controller.error.value).toBe("У вас нет права отвечать в этом диалоге");
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
      { sendAdminMessage: vi.fn() },
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

  it("reuses the same idempotency key when an unknown outcome is retried", async () => {
    const sendAdminMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce(delivered);
    const controller = createSupportReplyController(
      {
        projectId: () => "project-1",
        actorId: () => "operator-1",
        selection: () => selection(),
        reconcile: vi.fn(),
      },
      { sendAdminMessage },
    );
    controller.draft.value = "Проверка retry";

    await controller.send();
    await controller.send();

    const firstKey = sendAdminMessage.mock.calls[0]?.[2]?.idempotencyKey;
    const secondKey = sendAdminMessage.mock.calls[1]?.[2]?.idempotencyKey;
    expect(firstKey).toEqual(expect.any(String));
    expect(secondKey).toBe(firstKey);
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
      { sendAdminMessage },
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
      { sendAdminMessage: vi.fn() },
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
