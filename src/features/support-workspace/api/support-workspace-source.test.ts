import { describe, expect, it } from "vitest";
import type { SupportWorkspaceSelectionCaseResponseDto } from "@/shared/api/generated/models";
import { mapWorkspaceCase } from "./support-workspace-source";

const value: SupportWorkspaceSelectionCaseResponseDto = {
  id: "case-1",
  endUserId: "end-user-1",
  title: "Возврат",
  summary: "",
  goal: "",
  groupCode: "billing",
  projectSequence: "42",
  status: "OPEN",
  priority: "NORMAL",
  attentionRequired: false,
  lastActivityAt: "2026-08-06T10:00:00.000Z",
  updatedAt: "2026-08-06T10:00:00.000Z",
  version: 1,
  assignment: null,
};

describe("support workspace Case mapper", () => {
  it("rejects a Case projection belonging to another end user", () => {
    expect(() => mapWorkspaceCase(value, "end-user-2")).toThrow(
      "another end user",
    );
  });

  it("keeps only the safe Case context for the selected end user", () => {
    expect(mapWorkspaceCase(value, "end-user-1")).toMatchObject({
      id: "case-1",
      title: "Возврат",
      projectSequence: "42",
    });
  });
});
