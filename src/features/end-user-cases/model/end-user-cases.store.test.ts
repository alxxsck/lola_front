import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const repository = vi.hoisted(() => ({
  list: vi.fn(),
  summary: vi.fn(),
  detail: vi.fn(),
  messages: vi.fn(),
  workflow: vi.fn(),
  assign: vi.fn(),
  classify: vi.fn(),
  linkMessage: vi.fn(),
  unlinkMessage: vi.fn(),
  merge: vi.fn(),
  split: vi.fn(),
  requestEscalation: vi.fn(),
  claimEscalation: vi.fn(),
  releaseEscalation: vi.fn(),
  transferEscalation: vi.fn(),
  closeEscalation: vi.fn(),
  cancelEscalation: vi.fn(),
}));
const realtime = vi.hoisted(() => ({
  subscribe: vi.fn(() => vi.fn()),
  onState: vi.fn(() => vi.fn()),
  reconcile: vi.fn(() => vi.fn()),
  activateProject: vi.fn(),
}));

vi.mock("../api/end-user-cases-repository", () => ({
  endUserCasesRepository: repository,
}));
vi.mock("@/shared/realtime/cms-realtime-client", () => ({
  cmsRealtimeClient: realtime,
}));

import { useEndUserCasesStore } from "./end-user-cases.store";

const item = {
  id: "case-1",
  version: 1,
  projectSequence: "1",
  status: "OPEN",
  priority: "HIGH",
  title: "Deposit missing",
  lastActivityAt: "2026-07-26T10:00:00.000Z",
};

describe("End User Cases store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    repository.list.mockResolvedValue({ items: [item], nextCursor: null });
    repository.summary.mockResolvedValue({
      openCount: 1,
      lastProjectSequence: "1",
    });
    repository.detail.mockResolvedValue({
      case: item,
      messages: { items: [], nextCursor: null },
      timeline: { events: [], revisions: [] },
      proposals: { items: [] },
      escalations: { items: [] },
    });
    realtime.activateProject.mockResolvedValue(undefined);
  });

  it("loads durable state and registers shared realtime subscriptions", async () => {
    const store = useEndUserCasesStore();
    await store.activateProject("project-1");
    expect(store.items.map((value) => value.id)).toEqual(["case-1"]);
    expect(realtime.subscribe).toHaveBeenCalledWith(
      [
        "end_user_case.created",
        "end_user_case.updated",
        "end_user_case.summary",
      ],
      expect.any(Function),
    );
    expect(realtime.activateProject).toHaveBeenCalledWith("project-1");
  });

  it("removes a terminal realtime update from the active preset", async () => {
    const store = useEndUserCasesStore();
    await store.activateProject("project-1");
    repository.list.mockResolvedValueOnce({ items: [], nextCursor: null });
    await store.applyRealtimeEvent({
      type: "end_user_case.updated",
      contractVersion: 1,
      eventId: "event-2",
      projectSequence: "2",
      data: {
        case: { ...item, version: 2, projectSequence: "2", status: "RESOLVED" },
      },
    } as never);
    expect(store.items).toEqual([]);
  });

  it("reconciles ordinary realtime updates against authoritative relation filters", async () => {
    const store = useEndUserCasesStore();
    await store.activateProject("project-1");
    repository.list.mockResolvedValueOnce({ items: [], nextCursor: null });

    await store.applyRealtimeEvent({
      type: "end_user_case.updated",
      contractVersion: 1,
      eventId: "event-filter-reconciliation",
      projectSequence: "2",
      data: { case: { ...item, version: 2, projectSequence: "2" } },
    } as never);

    expect(repository.list).toHaveBeenCalledTimes(2);
    expect(store.items).toEqual([]);
  });

  it("reloads authoritative detail after a versioned workflow command", async () => {
    const store = useEndUserCasesStore();
    await store.activateProject("project-1");
    await store.open("case-1");
    repository.workflow.mockResolvedValue({
      id: "case-1",
      version: 2,
      status: "IN_PROGRESS",
    });
    repository.detail.mockResolvedValue({
      case: { ...item, version: 2, status: "IN_PROGRESS" },
      messages: { items: [], nextCursor: null },
      timeline: { events: [], revisions: [] },
      proposals: { items: [] },
      escalations: { items: [] },
    });
    expect(await store.transition("IN_PROGRESS", "Взяли в работу")).toBe(true);
    expect(repository.workflow).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      expect.objectContaining({
        expectedVersion: 1,
        status: "IN_PROGRESS",
        reason: "Взяли в работу",
      }),
    );
    expect(store.selected?.case.version).toBe(2);
  });

  it("requests specialist help with the selected Case version and an idempotency key", async () => {
    repository.requestEscalation.mockResolvedValue({
      escalation: { id: "escalation-1" },
      caseVersion: 2,
      replayed: false,
    });
    const store = useEndUserCasesStore();
    await store.activateProject("project-1");
    await store.open("case-1");

    expect(
      await store.requestEscalation(
        " DEPOSIT_HELP ",
        " Нужна ручная проверка депозита ",
      ),
    ).toBe(true);
    expect(repository.requestEscalation).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      {
        expectedCaseVersion: 1,
        reasonCode: "DEPOSIT_HELP",
        summary: "Нужна ручная проверка депозита",
      },
      expect.any(String),
    );
    expect(repository.detail).toHaveBeenCalledTimes(2);
  });

  it("claims the exact active occurrence and blocks a duplicate in-flight command", async () => {
    const escalation = {
      id: "escalation-1",
      caseId: "case-1",
      occurrenceNumber: 1,
      version: 7,
      status: "REQUESTED",
      source: "END_USER_REQUEST",
      reasonCode: "SUPPORT_REQUEST",
      summary: "Пользователь попросил специалиста",
      requester: { type: "END_USER", id: "user-1" },
      requestedAt: "2026-07-26T10:00:00.000Z",
      claimant: null,
      claimedAt: null,
    };
    repository.detail.mockResolvedValue({
      case: { ...item, version: 4, status: "WAITING_ADMIN" },
      messages: { items: [], nextCursor: null },
      timeline: { events: [], revisions: [] },
      proposals: { items: [] },
      escalations: { items: [escalation] },
    });
    let releaseClaim!: () => void;
    repository.claimEscalation.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseClaim = () => resolve({});
        }),
    );
    const store = useEndUserCasesStore();
    await store.activateProject("project-1");
    await store.open("case-1");

    const first = store.claimEscalation(" Беру в работу ");
    await Promise.resolve();
    expect(await store.claimEscalation("Повторный клик")).toBe(false);
    expect(repository.claimEscalation).toHaveBeenCalledTimes(1);
    expect(repository.claimEscalation).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      "escalation-1",
      {
        expectedCaseVersion: 4,
        expectedEscalationVersion: 7,
        reason: "Беру в работу",
      },
      expect.any(String),
    );

    releaseClaim();
    await expect(first).resolves.toBe(true);
  });

  it("sends exact OCC payloads for release, transfer, close and cancel", async () => {
    const escalation = {
      id: "escalation-1",
      caseId: "case-1",
      occurrenceNumber: 1,
      version: 7,
      status: "CLAIMED",
      source: "END_USER_REQUEST",
      reasonCode: "SUPPORT_REQUEST",
      summary: "Пользователь попросил специалиста",
      requester: { type: "END_USER", id: "user-1" },
      requestedAt: "2026-07-26T10:00:00.000Z",
      claimant: { id: "cms-1", displayName: "Анна" },
      claimedAt: "2026-07-26T10:05:00.000Z",
    };
    repository.detail.mockResolvedValue({
      case: { ...item, version: 4, status: "IN_PROGRESS" },
      messages: { items: [], nextCursor: null },
      timeline: { events: [], revisions: [] },
      proposals: { items: [] },
      escalations: { items: [escalation] },
    });
    repository.releaseEscalation.mockResolvedValue({});
    repository.transferEscalation.mockResolvedValue({});
    repository.closeEscalation.mockResolvedValue({});
    repository.cancelEscalation.mockResolvedValue({});
    const store = useEndUserCasesStore();
    await store.activateProject("project-1");
    await store.open("case-1");

    expect(await store.releaseEscalation(" Вернуть в очередь ")).toBe(true);
    expect(repository.releaseEscalation).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      "escalation-1",
      {
        expectedCaseVersion: 4,
        expectedEscalationVersion: 7,
        reason: "Вернуть в очередь",
      },
      expect.any(String),
    );

    expect(
      await store.transferEscalation(" cms-2 ", " Передать эксперту "),
    ).toBe(true);
    expect(repository.transferEscalation).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      "escalation-1",
      {
        expectedCaseVersion: 4,
        expectedEscalationVersion: 7,
        cmsUserId: "cms-2",
        reason: "Передать эксперту",
      },
      expect.any(String),
    );

    expect(await store.closeEscalation("RESOLVED", " Проверено ")).toBe(true);
    expect(repository.closeEscalation).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      "escalation-1",
      {
        expectedCaseVersion: 4,
        expectedEscalationVersion: 7,
        nextCaseStatus: "RESOLVED",
        reason: "Проверено",
      },
      expect.any(String),
    );

    expect(
      await store.cancelEscalation("WAITING_END_USER", " Ошибочный запрос "),
    ).toBe(true);
    expect(repository.cancelEscalation).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      "escalation-1",
      {
        expectedCaseVersion: 4,
        expectedEscalationVersion: 7,
        nextCaseStatus: "WAITING_END_USER",
        reason: "Ошибочный запрос",
      },
      expect.any(String),
    );
  });

  it("keeps Proposal reads disabled across mutation, realtime, and reconciliation", async () => {
    repository.workflow.mockResolvedValue({});
    const store = useEndUserCasesStore();
    await store.activateProject("project-1");
    await store.open("case-1", false);
    expect(repository.detail).toHaveBeenLastCalledWith("project-1", "case-1", {
      includeProposals: false,
    });

    await store.transition("IN_PROGRESS", "Take ownership");
    await store.applyRealtimeEvent({
      type: "end_user_case.updated",
      contractVersion: 1,
      eventId: "event-private-refresh",
      projectSequence: "2",
      data: { case: { ...item, version: 2, projectSequence: "2" } },
    } as never);
    await store.reconcile();

    for (const call of repository.detail.mock.calls.slice(1)) {
      expect(call[2]).toEqual({ includeProposals: false });
    }
  });

  it("submits merge with every source version and reconciles the survivor", async () => {
    const store = useEndUserCasesStore();
    await store.activateProject("project-1");
    await store.open("case-1");
    repository.merge.mockResolvedValue({
      caseId: "case-1",
      version: 2,
      mergedCaseIds: ["case-2"],
    });
    expect(
      await store.merge([{ id: "case-2", version: 4 }], "Duplicate goal"),
    ).toBe(true);
    expect(repository.merge).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      expect.objectContaining({
        expectedVersion: 1,
        sources: [{ caseId: "case-2", expectedVersion: 4 }],
      }),
    );
  });

  it("appends the next linked-message page without duplicating evidence", async () => {
    repository.detail.mockResolvedValue({
      case: item,
      messages: {
        items: [{ message: { id: "message-1" } }],
        nextCursor: "cursor-2",
      },
      timeline: { events: [], revisions: [] },
      proposals: { items: [] },
      escalations: { items: [] },
    });
    repository.messages.mockResolvedValue({
      items: [
        { message: { id: "message-1" } },
        { message: { id: "message-2" } },
      ],
      nextCursor: null,
    });
    const store = useEndUserCasesStore();
    await store.activateProject("project-1");
    await store.open("case-1");

    await store.loadMoreMessages();

    expect(repository.messages).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      "cursor-2",
    );
    expect(
      store.selected?.messages.items.map((link) => link.message.id),
    ).toEqual(["message-1", "message-2"]);
    expect(store.selected?.messages.nextCursor).toBeNull();
  });

  it("paginates, replaces filters and exposes a safe backend list error", async () => {
    repository.list
      .mockResolvedValueOnce({
        items: [item],
        nextCursor: "cursor-2",
      })
      .mockResolvedValueOnce({
        items: [{ ...item, id: "case-2" }],
        nextCursor: null,
      });
    const store = useEndUserCasesStore();
    await store.activateProject("project-1");
    await store.loadPage();
    expect(store.items.map((value) => value.id)).toEqual(["case-1", "case-2"]);

    repository.list.mockRejectedValueOnce({
      response: { data: { message: "bounded backend error" } },
    });
    await store.setFilters({
      preset: "ALL",
      sort: "LAST_ACTIVITY",
      priority: ["CRITICAL"],
    });
    expect(store.error).toBe("bounded backend error");
    expect(repository.list).toHaveBeenLastCalledWith(
      "project-1",
      expect.objectContaining({ preset: "ALL", priority: ["CRITICAL"] }),
      undefined,
    );
  });

  it("executes every versioned Case command and reloads authoritative state", async () => {
    repository.assign.mockResolvedValue({});
    repository.classify.mockResolvedValue({});
    repository.linkMessage.mockResolvedValue({});
    repository.unlinkMessage.mockResolvedValue({});
    const store = useEndUserCasesStore();
    await store.activateProject("project-1");
    await store.open("case-1");

    expect(await store.assign("cms-2", " owner ")).toBe(true);
    expect(repository.assign).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      expect.objectContaining({
        expectedVersion: 1,
        assignedCmsUserId: "cms-2",
        reason: "owner",
      }),
    );
    expect(
      await store.classify({
        type: "PROBLEM_RESOLUTION",
        groupCode: "DEPOSIT",
        priority: "CRITICAL",
        impact: "CRITICAL",
        urgency: "IMMEDIATE",
        reason: "manual correction",
      }),
    ).toBe(true);
    expect(
      await store.linkMessage({
        messageId: "message-2",
        relation: "SUPPORTING",
        relevance: 0.8,
        reason: "additional evidence",
      }),
    ).toBe(true);
    expect(await store.unlinkMessage("message-2", " wrong case ")).toBe(true);
    expect(repository.unlinkMessage).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      "message-2",
      expect.objectContaining({ expectedVersion: 1, reason: "wrong case" }),
    );
  });

  it("recovers a rejected mutation by reopening the authoritative Case", async () => {
    repository.assign.mockRejectedValue(new Error("version conflict"));
    const store = useEndUserCasesStore();
    await store.activateProject("project-1");
    await store.open("case-1");

    expect(await store.assign(null, "unassign")).toBe(false);
    expect(store.detailError).toBe("version conflict");
    expect(repository.detail).toHaveBeenCalledTimes(2);
    expect(store.mutating).toBe(false);
  });

  it("splits selected evidence and opens the backend-created Case", async () => {
    repository.split.mockResolvedValue({
      newCaseId: "case-2",
      sourceVersion: 2,
    });
    repository.detail.mockImplementation(
      async (_project: string, id: string) => ({
        case: { ...item, id },
        messages: { items: [], nextCursor: null },
        timeline: { events: [], revisions: [] },
        proposals: { items: [] },
        escalations: { items: [] },
      }),
    );
    const store = useEndUserCasesStore();
    await store.activateProject("project-1");
    await store.open("case-1");

    expect(
      await store.split(
        ["message-1"],
        " Refund ",
        " separate goal ",
        " REFUND ",
        ["evidence-1"],
      ),
    ).toBe("case-2");
    expect(repository.split).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      expect.objectContaining({
        messageIds: ["message-1"],
        evidenceIds: ["evidence-1"],
        title: "Refund",
        groupCode: "REFUND",
        reason: "separate goal",
      }),
    );
    expect(store.selectedId).toBe("case-2");
  });

  it("rejects incomplete commands locally and resets state on deactivation", async () => {
    const unsubscribe = vi.fn();
    realtime.subscribe.mockReturnValueOnce(unsubscribe);
    realtime.onState.mockReturnValueOnce(unsubscribe);
    realtime.reconcile.mockReturnValueOnce(unsubscribe);
    const store = useEndUserCasesStore();

    expect(await store.transition("IN_PROGRESS", "reason")).toBe(false);
    expect(await store.merge([], "reason")).toBe(false);
    expect(await store.split([], "", "")).toBeNull();
    await store.activateProject("project-1");
    store.close();
    expect(store.selected).toBeNull();
    store.deactivate();
    expect(store.projectId).toBeNull();
    expect(store.items).toEqual([]);
    expect(unsubscribe).toHaveBeenCalledTimes(3);
  });

  it("scrubs proposal cache, fences stale detail and refetches on access restore", async () => {
    const proposalDetail = {
      case: item,
      messages: { items: [], nextCursor: null },
      timeline: { events: [], revisions: [] },
      proposals: { items: [{ id: "proposal-stale", title: "Stale" }] },
      escalations: { items: [] },
    };
    const store = useEndUserCasesStore();
    await store.activateProject("project-1");
    repository.detail.mockResolvedValueOnce(proposalDetail);
    await store.open("case-1", true);
    expect(store.selected?.proposals.items).toHaveLength(1);

    let resolveStale!: (value: typeof proposalDetail) => void;
    repository.detail.mockImplementationOnce(
      () =>
        new Promise<typeof proposalDetail>((resolve) => {
          resolveStale = resolve;
        }),
    );
    const staleRequest = store.open("case-1", true);
    await store.setProposalAccess(false);
    expect(store.selected?.proposals.items).toEqual([]);
    resolveStale(proposalDetail);
    await staleRequest;
    expect(store.selected?.proposals.items).toEqual([]);

    repository.detail.mockResolvedValueOnce({
      ...proposalDetail,
      proposals: { items: [{ id: "proposal-fresh", title: "Fresh" }] },
    });
    await store.setProposalAccess(true);

    expect(repository.detail).toHaveBeenLastCalledWith("project-1", "case-1", {
      includeProposals: true,
    });
    expect(store.selected?.proposals.items[0]?.id).toBe("proposal-fresh");
  });

  it("reconciles realtime gaps and ignores stale summary regressions", async () => {
    const store = useEndUserCasesStore();
    await store.activateProject("project-1");
    const initialSummary = store.summary;
    await store.applyRealtimeEvent({
      type: "end_user_case.summary",
      contractVersion: 1,
      eventId: "summary-old",
      projectSequence: "0",
      data: { openCount: 99, lastProjectSequence: "0" },
    } as never);
    expect(store.summary).toEqual(initialSummary);

    await store.applyRealtimeEvent({
      type: "end_user_case.updated",
      contractVersion: 1,
      eventId: "event-gap",
      projectSequence: "4",
      data: {
        case: {
          ...item,
          version: 2,
          projectSequence: "4",
          status: "WAITING_ADMIN",
        },
      },
    } as never);
    expect(repository.list.mock.calls.length).toBeGreaterThan(1);
    expect(store.lastAppliedSequence).toBe(4n);
  });

  it("reconciles a summary sequence gap and schedules a follow-up after an in-flight refresh", async () => {
    const store = useEndUserCasesStore();
    await store.activateProject("project-1");
    let releaseList!: (value: {
      items: Array<typeof item>;
      nextCursor: null;
    }) => void;
    repository.list.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseList = resolve;
        }),
    );

    const first = store.applyRealtimeEvent({
      type: "end_user_case.updated",
      contractVersion: 1,
      eventId: "event-2",
      projectSequence: "2",
      data: { case: { ...item, version: 2, projectSequence: "2" } },
    } as never);
    await Promise.resolve();
    repository.list.mockResolvedValueOnce({
      items: [{ ...item, version: 3, projectSequence: "4" }],
      nextCursor: null,
    });
    const second = store.applyRealtimeEvent({
      type: "end_user_case.summary",
      contractVersion: 1,
      eventId: "summary-gap",
      projectSequence: "4",
      data: { openCount: 1, lastProjectSequence: "4" },
    } as never);
    releaseList({ items: [{ ...item, version: 2 }], nextCursor: null });
    await Promise.all([first, second]);

    expect(repository.list).toHaveBeenCalledTimes(3);
    expect(store.items[0]?.version).toBe(3);
    expect(store.lastAppliedSequence).toBe(4n);
  });

  it("reconciles the first realtime summary when its sequence proves missed events", async () => {
    const store = useEndUserCasesStore();
    repository.summary.mockResolvedValueOnce({
      openCount: 0,
      lastProjectSequence: "0",
    });
    await store.activateProject("project-1");
    repository.list.mockResolvedValueOnce({
      items: [{ ...item, version: 2, projectSequence: "3" }],
      nextCursor: null,
    });

    await store.applyRealtimeEvent({
      type: "end_user_case.summary",
      contractVersion: 1,
      eventId: "first-summary-gap",
      projectSequence: "3",
      data: { openCount: 1, lastProjectSequence: "3" },
    } as never);

    expect(repository.list).toHaveBeenCalledTimes(2);
    expect(store.items[0]?.version).toBe(2);
  });

  it("starts a new Project reconciliation without waiting for the previous Project", async () => {
    const store = useEndUserCasesStore();
    await store.activateProject("project-1");
    const subscribeCalls = realtime.subscribe.mock.calls as unknown as Array<
      [string[], (value: unknown) => Promise<void>]
    >;
    const oldRealtimeHandler = subscribeCalls[0]![1];
    let releaseOld!: (value: {
      items: Array<typeof item>;
      nextCursor: null;
    }) => void;
    repository.list.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseOld = resolve;
        }),
    );
    const oldReconcile = store.reconcile();
    await Promise.resolve();

    repository.list.mockResolvedValueOnce({
      items: [{ ...item, id: "case-project-2", version: 2 }],
      nextCursor: null,
    });
    repository.summary.mockResolvedValueOnce({
      openCount: 1,
      lastProjectSequence: "2",
    });
    await store.activateProject("project-2");

    expect(store.projectId).toBe("project-2");
    expect(store.items[0]?.id).toBe("case-project-2");
    await oldRealtimeHandler({
      type: "end_user_case.updated",
      contractVersion: 1,
      eventId: "queued-project-1-event",
      projectSequence: "99",
      data: { case: { ...item, id: "case-project-1", version: 9 } },
    });
    expect(store.items[0]?.id).toBe("case-project-2");
    expect(store.lastAppliedSequence).toBe(2n);
    repository.list.mockResolvedValueOnce({
      items: [{ ...item, id: "case-project-2", version: 3 }],
      nextCursor: null,
    });
    const newProjectEvent = store.applyRealtimeEvent({
      type: "end_user_case.updated",
      contractVersion: 1,
      eventId: "project-2-event",
      projectSequence: "3",
      data: {
        case: { ...item, id: "case-project-2", version: 3 },
      },
    } as never);
    await Promise.resolve();
    expect(repository.list).toHaveBeenCalledTimes(4);
    releaseOld({ items: [item], nextCursor: null });
    await Promise.all([oldReconcile, newProjectEvent]);
    expect(store.items[0]?.id).toBe("case-project-2");
    expect(store.items[0]?.version).toBe(3);
  });

  it("does not commit an old Project sequence after its handler resumes", async () => {
    const store = useEndUserCasesStore();
    await store.activateProject("project-1");
    let releaseOld!: (value: {
      items: Array<typeof item>;
      nextCursor: null;
    }) => void;
    repository.list.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseOld = resolve;
        }),
    );
    const oldEvent = store.applyRealtimeEvent({
      type: "end_user_case.updated",
      contractVersion: 1,
      eventId: "delayed-project-1-event",
      projectSequence: "99",
      data: { case: { ...item, version: 2 } },
    } as never);
    await Promise.resolve();

    repository.list.mockResolvedValueOnce({
      items: [{ ...item, id: "case-project-2" }],
      nextCursor: null,
    });
    repository.summary.mockResolvedValueOnce({
      openCount: 1,
      lastProjectSequence: "2",
    });
    await store.activateProject("project-2");
    releaseOld({ items: [item], nextCursor: null });
    await oldEvent;

    expect(store.items[0]?.id).toBe("case-project-2");
    expect(store.lastAppliedSequence).toBe(2n);
  });
});
