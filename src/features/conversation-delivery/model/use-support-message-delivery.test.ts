import { describe, expect, it, vi } from "vitest";
import type { ConversationMessage } from "@/shared/types/domain";
import { ApiError } from "@/shared/api/http/api-error";
import type { SupportWorkspaceSelection } from "@/features/support-workspace/api/support-workspace-source";
import { createSupportMessageDeliveryController } from "./use-support-message-delivery";

function selection(reply = true): SupportWorkspaceSelection {
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
      replyWithoutTranslation: false,
      suspendAi: false,
      transferAssignment: false,
    },
    endUser: {
      id: "end-user-1",
      externalId: "external-1",
      isGuest: false,
      createdAt: "2026-08-08T10:00:00.000Z",
      lastSeenAt: "2026-08-08T10:00:00.000Z",
    },
    case: null,
    sla: null,
    routing: null,
    conversation: {
      id: "conversation-1",
      endUserId: "end-user-1",
      title: "Диалог",
      status: "OPEN",
      createdAt: "2026-08-08T10:00:00.000Z",
      updatedAt: "2026-08-08T10:00:00.000Z",
      messageCount: 1,
      isCurrent: true,
      currentInteractionSessionCount: 0,
      lastMessageAt: null,
      readState: {
        conversationId: "conversation-1",
        lastReadOrdinal: 0,
        highestOrdinal: 1,
        firstUnreadOrdinal: 1,
        unreadMessageCount: 1,
        unreadCustomerMessageCount: 0,
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

function failedMessage(): ConversationMessage {
  return {
    id: "message-1",
    conversationId: "conversation-1",
    ordinal: 1,
    author: "ADMIN",
    text: "Проверю платёж",
    status: "COMPLETED",
    delivery: {
      id: "delivery-1",
      channel: "SDK_REALTIME",
      status: "FAILED",
      generation: 3,
      version: 9,
      errorCode: "CLIENT_DISCONNECTED",
      retryEligible: true,
      allowedActions: ["RETRY_FAILED_DELIVERY"],
      commandIds: [],
    },
    createdAt: "2026-08-08T10:00:00.000Z",
  };
}

function retriedDelivery(): NonNullable<ConversationMessage["delivery"]> {
  return {
    id: "delivery-1",
    channel: "SDK_REALTIME",
    status: "PENDING",
    generation: 4,
    version: 0,
    errorCode: null,
    retryEligible: false,
    allowedActions: [],
    commandIds: [],
  };
}

describe("support message delivery controller", () => {
  it("retries only the exact server-authorized failed generation", async () => {
    const messages = [failedMessage()];
    const retryFailedDelivery = vi.fn().mockResolvedValue(retriedDelivery());
    const reconcile = vi.fn().mockResolvedValue(undefined);
    const applyDeliveryReceipt = vi.fn();
    const controller = createSupportMessageDeliveryController(
      {
        projectId: () => "project-1",
        selection: () => selection(),
        messages: () => messages,
        applyDeliveryReceipt,
        reconcile,
      },
      { retryFailedDelivery },
    );

    await controller.retry("message-1");

    expect(retryFailedDelivery).toHaveBeenCalledWith(
      "project-1",
      "end-user-1",
      "message-1",
      {
        expectedGeneration: 3,
        expectedVersion: 9,
        idempotencyKey: expect.any(String),
      },
    );
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(applyDeliveryReceipt).toHaveBeenCalledWith(
      "message-1",
      retriedDelivery(),
    );
    expect(controller.deliveryActions.value.get("message-1")).toMatchObject({
      visibility: "ENABLED",
      busy: false,
      error: undefined,
    });
  });

  it("fails closed when retry authority is absent", async () => {
    const message = failedMessage();
    message.delivery = { ...message.delivery!, allowedActions: [] };
    const retryFailedDelivery = vi.fn();
    const controller = createSupportMessageDeliveryController(
      {
        projectId: () => "project-1",
        selection: () => selection(),
        messages: () => [message],
        applyDeliveryReceipt: vi.fn(),
        reconcile: vi.fn(),
      },
      { retryFailedDelivery },
    );

    await controller.retry(message.id);

    expect(retryFailedDelivery).not.toHaveBeenCalled();
    expect(controller.deliveryActions.value.size).toBe(0);
  });

  it("keeps an ambiguous retry error beside the message and reconciles before another attempt", async () => {
    const message = failedMessage();
    const retryFailedDelivery = vi.fn().mockRejectedValue(new Error("timeout"));
    const reconcile = vi.fn().mockResolvedValue(undefined);
    const controller = createSupportMessageDeliveryController(
      {
        projectId: () => "project-1",
        selection: () => selection(),
        messages: () => [message],
        applyDeliveryReceipt: vi.fn(),
        reconcile,
      },
      { retryFailedDelivery },
    );

    await controller.retry(message.id);
    await controller.retry(message.id);

    expect(retryFailedDelivery).toHaveBeenCalledTimes(2);
    expect(retryFailedDelivery.mock.calls[0]?.[3].idempotencyKey).toBe(
      retryFailedDelivery.mock.calls[1]?.[3].idempotencyKey,
    );
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(controller.deliveryActions.value.get(message.id)?.error).toBe(
      "Не удалось подтвердить повтор. Обновите состояние доставки.",
    );
  });

  it("applies the authoritative current receipt from a typed stale conflict", async () => {
    const message = failedMessage();
    const applyDeliveryReceipt = vi.fn();
    const reconcile = vi.fn().mockResolvedValue(undefined);
    const controller = createSupportMessageDeliveryController(
      {
        projectId: () => "project-1",
        selection: () => selection(),
        messages: () => [message],
        applyDeliveryReceipt,
        reconcile,
      },
      {
        retryFailedDelivery: vi
          .fn()
          .mockRejectedValue(
            new ApiError(
              409,
              "Состояние доставки изменилось",
              { currentDelivery: retriedDelivery() },
              "request-1",
              "DELIVERY_RECEIPT_STALE",
            ),
          ),
      },
    );

    await controller.retry(message.id);

    expect(applyDeliveryReceipt).toHaveBeenCalledWith(
      message.id,
      retriedDelivery(),
    );
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(controller.deliveryActions.value.get(message.id)?.error).toBe(
      undefined,
    );
  });

  it("invalidates an in-flight retry before reset permits another operation", async () => {
    let rejectFirst!: (cause: unknown) => void;
    let resolveSecond!: (
      delivery: NonNullable<ConversationMessage["delivery"]>,
    ) => void;
    const retryFailedDelivery = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const controller = createSupportMessageDeliveryController(
      {
        projectId: () => "project-1",
        selection: () => selection(),
        messages: () => [failedMessage()],
        applyDeliveryReceipt: vi.fn(),
        reconcile: vi.fn().mockResolvedValue(undefined),
      },
      { retryFailedDelivery },
    );

    const first = controller.retry("message-1");
    controller.reset();
    const second = controller.retry("message-1");
    rejectFirst(new Error("stale timeout"));
    await first;

    expect(controller.deliveryActions.value.get("message-1")).toMatchObject({
      busy: true,
      error: undefined,
    });

    resolveSecond(retriedDelivery());
    await second;
    expect(controller.deliveryActions.value.get("message-1")?.busy).toBe(false);
  });
});
