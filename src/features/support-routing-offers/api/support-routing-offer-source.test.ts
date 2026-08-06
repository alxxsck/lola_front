import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SupportRoutingOfferActionReceiptDto,
  SupportRoutingOwnOfferCatalogDto,
} from "@/shared/api/generated/models";

const generated = vi.hoisted(() => ({
  list: vi.fn(),
  accept: vi.fn(),
  decline: vi.fn(),
}));

vi.mock("@/shared/api/generated/retenive-backend", () => ({
  supportRoutingOfferList: generated.list,
  supportRoutingOfferAccept: generated.accept,
  supportRoutingOfferDecline: generated.decline,
}));

vi.mock("@/shared/config/data-mode", () => ({ isMockMode: false }));

import { supportRoutingOfferSource } from "./support-routing-offer-source";

const catalog: SupportRoutingOwnOfferCatalogDto = {
  offers: [
    {
      assignmentId: "assignment-1",
      caseId: "case-1",
      teamId: "team-1",
      queueId: "queue-1",
      assignmentVersion: 7,
      fencingVersion: 3,
      expiresAt: "2026-08-06T10:15:00.000Z",
      actionEtag: '"so1.current.signature"',
      acceptToken: "opaque-routing-offer-token",
    },
  ],
};

const receipt: SupportRoutingOfferActionReceiptDto = {
  assignmentId: "assignment-1",
  assignmentVersion: 8,
  assignmentRootVersion: 5,
  caseVersion: 21,
  outcome: "ACCEPTED",
};

describe("support routing offer source", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the generated own-offer endpoints with the opaque capability and exact headers", async () => {
    generated.list.mockResolvedValue(catalog);
    generated.accept.mockResolvedValue(receipt);
    const signal = new AbortController().signal;

    const [offer] = await supportRoutingOfferSource.list("project-1", signal);
    await supportRoutingOfferSource.act(
      "project-1",
      { offer: offer!, kind: "ACCEPT", idempotencyKey: "offer-action-1" },
      signal,
    );

    expect(generated.list).toHaveBeenCalledWith(
      "project-1",
      undefined,
      { signal },
    );
    expect(generated.accept).toHaveBeenCalledWith(
      "project-1",
      "assignment-1",
      {
        expectedAssignmentVersion: 7,
        offerToken: "opaque-routing-offer-token",
      },
      {
        signal,
        headers: {
          "If-Match": '"so1.current.signature"',
          "Idempotency-Key": "offer-action-1",
        },
      },
    );
    expect(generated.decline).not.toHaveBeenCalled();
  });
});
