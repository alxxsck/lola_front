import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupportCaseAssignmentMutationResponseDto } from "@/shared/api/generated/models";

const generated = vi.hoisted(() => ({ release: vi.fn() }));

vi.mock("@/shared/api/generated/retenive-backend", () => ({
  supportCaseAssignmentRelease: generated.release,
}));

vi.mock("@/shared/config/data-mode", () => ({ isMockMode: false }));

import { supportAssignmentReleaseSource } from "./support-assignment-release-source";

const receipt: SupportCaseAssignmentMutationResponseDto = {
  actionEtag: '"sa1.next.signature"',
  assignment: {
    capacityWeightUnits: 100,
    caseId: "case-1",
    endedAt: "2026-08-06T10:20:00.000Z",
    id: "assignment-1",
    occurrenceNumber: 1,
    operator: { id: "operator-1", displayName: "Алина", avatarUrl: null },
    startedAt: "2026-08-06T10:00:00.000Z",
    state: "RELEASED",
    team: { id: "team-1", code: "billing", name: "Billing" },
    version: 4,
    workforceRevisionId: "workforce-1",
  },
  assignmentVersion: 4,
  caseVersion: 8,
  intent: "RELEASE_CASE_ASSIGNMENT",
};

describe("support assignment release source", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the generated release endpoint with the exact version, ETag and replay key", async () => {
    generated.release.mockResolvedValue(receipt);
    const signal = new AbortController().signal;

    await expect(
      supportAssignmentReleaseSource.release(
        "project-1",
        {
          caseId: "case-1",
          assignmentId: "assignment-1",
          expectedAssignmentVersion: 3,
          actionEtag: '"sa1.current.signature"',
          reasonCode: "SHIFT_END",
          reasonNote: "Передать в общую очередь",
        },
        "release-attempt-1",
        signal,
      ),
    ).resolves.toEqual({
      assignmentId: "assignment-1",
      caseId: "case-1",
      assignmentVersion: 4,
      caseVersion: 8,
    });

    expect(generated.release).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      {
        assignmentId: "assignment-1",
        expectedAssignmentVersion: 3,
        reasonCode: "SHIFT_END",
        reasonNote: "Передать в общую очередь",
      },
      {
        signal,
        headers: {
          "If-Match": '"sa1.current.signature"',
          "Idempotency-Key": "release-attempt-1",
        },
      },
    );
  });
});
