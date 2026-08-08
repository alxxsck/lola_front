import { describe, expect, it, vi } from "vitest";
import { adminMessagingRetryFailedDelivery } from "@/shared/api/generated/retenive-backend";
import { supportMessageDeliverySource } from "./support-message-delivery-source";

vi.mock("@/shared/api/generated/retenive-backend", () => ({
  adminMessagingRetryFailedDelivery: vi.fn(),
}));

describe("support message delivery source", () => {
  it("sends the exact receipt fence and retry intent with its idempotency key", async () => {
    vi.mocked(adminMessagingRetryFailedDelivery).mockResolvedValue({
      duplicate: false,
      intent: "RETRY_FAILED_DELIVERY",
      delivery: {
        id: "delivery-1",
        channel: "SDK_REALTIME",
        status: "PENDING",
        generation: 4,
        version: 0,
        errorCode: null,
        retryEligible: false,
        allowedActions: [],
        commandIds: [],
      },
    });

    const delivery = await supportMessageDeliverySource.retryFailedDelivery(
      "project-1",
      "end-user-1",
      "message-1",
      {
        expectedGeneration: 3,
        expectedVersion: 9,
        idempotencyKey: "retry-key-1",
      },
    );

    expect(adminMessagingRetryFailedDelivery).toHaveBeenCalledWith(
      "project-1",
      "end-user-1",
      "message-1",
      {
        expectedGeneration: 3,
        expectedVersion: 9,
        intent: "RETRY_FAILED_DELIVERY",
      },
      { headers: { "Idempotency-Key": "retry-key-1" } },
    );
    expect(delivery).toMatchObject({
      status: "PENDING",
      generation: 4,
      version: 0,
    });
  });
});
