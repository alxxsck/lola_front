import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  messages: vi.fn(),
  timeline: vi.fn(),
  escalations: vi.fn(),
  requestEscalation: vi.fn(),
  claimEscalation: vi.fn(),
  releaseEscalation: vi.fn(),
  transferEscalation: vi.fn(),
  closeEscalation: vi.fn(),
  cancelEscalation: vi.fn(),
  summary: vi.fn(),
  assignees: vi.fn(),
  workflow: vi.fn(),
}));

vi.mock("@/shared/api/generated/retenive-backend", () => ({
  endUserCasesList: api.list,
  endUserCasesDetail: api.detail,
  endUserCasesMessages: api.messages,
  endUserCasesTimeline: api.timeline,
  endUserCasesListEscalations: api.escalations,
  endUserCasesRequestEscalation: api.requestEscalation,
  endUserCasesClaimEscalation: api.claimEscalation,
  endUserCasesReleaseEscalation: api.releaseEscalation,
  endUserCasesTransferEscalation: api.transferEscalation,
  endUserCasesCloseEscalation: api.closeEscalation,
  endUserCasesCancelEscalation: api.cancelEscalation,
  endUserCasesSummary: api.summary,
  endUserCasesAssignees: api.assignees,
  endUserCasesWorkflow: api.workflow,
  endUserCasesAssignment: vi.fn(),
  endUserCasesClassification: vi.fn(),
  endUserCasesLinkMessage: vi.fn(),
  endUserCasesUnlinkMessage: vi.fn(),
  endUserCasesMerge: vi.fn(),
  endUserCasesSplit: vi.fn(),
  endUserCasesCostSummary: vi.fn(),
  endUserCasePolicyGet: vi.fn(),
  endUserCasePolicyPreview: vi.fn(),
  endUserCasePolicySaveDraft: vi.fn(),
  endUserCasePolicyPublish: vi.fn(),
}));

import { endUserCasesRepository } from "./end-user-cases-repository";
import { defaultEndUserCaseFilters } from "../model/end-user-case";

describe("End User Cases repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses generated contracts and array serialization for list queries", async () => {
    api.list.mockResolvedValue({ items: [], nextCursor: null });
    await endUserCasesRepository.list(
      "project-1",
      {
        ...defaultEndUserCaseFilters(),
        priority: ["URGENT", "CRITICAL"],
      },
      "cursor-1",
    );
    expect(api.list).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        priority: ["URGENT", "CRITICAL"],
        cursor: "cursor-1",
        limit: 30,
      }),
      { paramsSerializer: { indexes: null } },
    );
  });

  it("loads an authoritative detail bundle without unrelated conversation data", async () => {
    api.detail.mockResolvedValue({ id: "case-1" });
    api.messages.mockResolvedValue({ items: [], nextCursor: "message-cursor" });
    api.timeline.mockResolvedValue({ events: [], revisions: [] });
    api.escalations.mockResolvedValue({ items: [] });
    const value = await endUserCasesRepository.detail("project-1", "case-1");
    expect(value).toEqual({
      case: { id: "case-1" },
      messages: { items: [], nextCursor: "message-cursor" },
      timeline: { events: [], revisions: [] },
      escalations: { items: [] },
    });
    expect(api.messages).toHaveBeenCalledWith("project-1", "case-1", {
      limit: 100,
    });
  });

  it("continues linked Case messages with the opaque backend cursor", async () => {
    api.messages.mockResolvedValue({ items: [], nextCursor: null });
    await endUserCasesRepository.messages(
      "project-1",
      "case-1",
      "message-cursor",
    );
    expect(api.messages).toHaveBeenCalledWith("project-1", "case-1", {
      limit: 100,
      cursor: "message-cursor",
    });
  });

  it("loads only assignable active project members from the Case contract", async () => {
    api.assignees.mockResolvedValue({
      items: [{ id: "cms-2", displayName: "Анна" }],
    });

    await expect(
      endUserCasesRepository.assignees("project-1"),
    ).resolves.toEqual({
      items: [{ id: "cms-2", displayName: "Анна" }],
    });
    expect(api.assignees).toHaveBeenCalledWith("project-1");
  });

  it("forwards the opaque idempotency header for escalation commands", async () => {
    api.claimEscalation.mockResolvedValue({
      escalation: { id: "escalation-1" },
      caseVersion: 4,
      replayed: false,
    });
    const command = {
      expectedCaseVersion: 3,
      expectedEscalationVersion: 2,
      reason: "Беру в работу",
    };

    await endUserCasesRepository.claimEscalation(
      "project-1",
      "case-1",
      "escalation-1",
      command,
      "idempotency-1",
    );

    expect(api.claimEscalation).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      "escalation-1",
      command,
      { headers: { "Idempotency-Key": "idempotency-1" } },
    );
  });
});
