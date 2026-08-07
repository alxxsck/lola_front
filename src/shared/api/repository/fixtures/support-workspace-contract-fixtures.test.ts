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

  it("does not present unpublished error or lookup contracts as production truth", () => {
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
      recovery: "REPEAT_SAME_IDEMPOTENCY_KEY",
      lookupOperation: "NOT_PUBLISHED",
    });
  });
});
