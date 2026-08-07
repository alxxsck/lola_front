import { describe, expect, it } from "vitest";
import { supportWorkspaceContractFixtures } from "./support-workspace-contract-fixtures";

describe("support workspace contract fixture catalog", () => {
  it("covers success, concealment, conflict, stale, pagination and unknown outcome", () => {
    expect(Object.keys(supportWorkspaceContractFixtures).sort()).toEqual([
      "concealedSelection",
      "forbiddenSelection",
      "fullSelectionSuccess",
      "historyNextPage",
      "minimalSelectionSuccess",
      "sendConflict",
      "staleRevision",
      "unknownDeliveryStatusMessage",
      "unknownSendOutcome",
    ]);
  });

  it("keeps unpublished workspace errors separate from the published send lookup", () => {
    expect(supportWorkspaceContractFixtures.forbiddenSelection).toMatchObject({
      status: 403,
      publication: "NOT_PUBLISHED",
    });
    expect(supportWorkspaceContractFixtures.concealedSelection).toMatchObject({
      status: 404,
      publication: "NOT_PUBLISHED",
    });
    expect(supportWorkspaceContractFixtures.staleRevision).toMatchObject({
      status: 409,
      publication: "NOT_PUBLISHED",
    });
    expect(supportWorkspaceContractFixtures.unknownSendOutcome).toEqual({
      kind: "TRANSPORT_UNKNOWN_OUTCOME",
      recovery: "LOOKUP_THEN_REPEAT_SAME_IDEMPOTENCY_KEY",
      lookupOperation: "AdminMessaging_lookupOutcome",
      publication: "PUBLISHED",
    });
  });
});
