import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  summary: vi.fn(),
  detail: vi.fn(),
  markRead: vi.fn(),
  decide: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  acknowledge: vi.fn(),
}));

vi.mock("../api/ai-proposals-repository", () => ({
  aiProposalsRepository: {
    list: mocks.list,
    summary: mocks.summary,
    detail: mocks.detail,
    markRead: mocks.markRead,
    decide: mocks.decide,
  },
}));

vi.mock("@/shared/realtime/cms-realtime-client", () => ({
  cmsRealtimeClient: {
    connect: mocks.connect,
    disconnect: mocks.disconnect,
    acknowledge: mocks.acknowledge,
  },
}));

import { useAIProposalsStore } from "./ai-proposals.store";
import type {
  AIProposalDetail,
  AIProposalListItem,
  AIProposalSummary,
} from "./ai-proposal";

const item: AIProposalListItem = {
  id: "proposal-1",
  projectSequence: "10",
  kind: "ADMIN_ATTENTION",
  workflowStatus: "OPEN",
  decisionMode: "ACKNOWLEDGE",
  priority: "HIGH",
  title: "Нужна помощь администратора",
  summary: "Пользователь просит связаться с ним.",
  sourceType: "TEXT_CHAT",
  endUser: { id: "user-1", externalId: "customer-1" },
  conversationId: "conversation-1",
  version: 1,
  isRead: false,
  createdAt: "2026-07-19T18:00:00.000Z",
  updatedAt: "2026-07-19T18:00:00.000Z",
};

const summary: AIProposalSummary = {
  openCount: 1,
  unreadCount: 1,
  highPriorityUnreadCount: 1,
  lastSequence: "10",
  calculatedAt: "2026-07-19T18:00:00.000Z",
};

const detail: AIProposalDetail = {
  ...item,
  content: { reasonCode: "SUPPORT_REQUEST" },
  evidence: [{ type: "USER_MESSAGE", excerpt: "Позовите администратора" }],
};

describe("AI Proposals store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({ items: [item], nextCursor: null, summary });
    mocks.summary.mockResolvedValue(summary);
    mocks.detail.mockResolvedValue(detail);
    mocks.markRead.mockResolvedValue({
      proposal: { ...detail, isRead: true, readAt: "2026-07-19T18:01:00.000Z" },
      summary: { ...summary, unreadCount: 0, highPriorityUnreadCount: 0 },
    });
    mocks.decide.mockResolvedValue({
      ...detail,
      workflowStatus: "RESOLVED",
      version: 2,
    });
  });

  it("replaces counters with the authoritative summary snapshot", async () => {
    const store = useAIProposalsStore();
    await store.activateProject("project-1");

    store.applyRealtimeEvent({
      type: "ai_proposal.summary",
      contractVersion: 1,
      eventId: "event-1",
      projectSequence: "11",
      occurredAt: "2026-07-19T18:02:00.000Z",
      data: {
        openCount: 7,
        unreadCount: 4,
        highPriorityUnreadCount: 2,
        lastSequence: "11",
        calculatedAt: "2026-07-19T18:02:00.000Z",
      },
    });

    expect(store.summary).toMatchObject({ openCount: 7, unreadCount: 4 });
  });

  it("deduplicates stale events and reconciles a project sequence gap", async () => {
    const store = useAIProposalsStore();
    await store.activateProject("project-1");
    mocks.list.mockClear();
    mocks.summary.mockClear();

    await store.applyRealtimeEvent({
      type: "ai_proposal.updated",
      contractVersion: 1,
      eventId: "event-gap",
      projectSequence: "13",
      occurredAt: "2026-07-19T18:03:00.000Z",
      data: { proposal: { ...item, version: 2, title: "Обновлено" } },
    });
    await store.applyRealtimeEvent({
      type: "ai_proposal.updated",
      contractVersion: 1,
      eventId: "event-stale",
      projectSequence: "14",
      occurredAt: "2026-07-19T18:04:00.000Z",
      data: { proposal: { ...item, version: 1, title: "Устарело" } },
    });

    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(store.itemsById.get(item.id)?.title).not.toBe("Устарело");
  });

  it("marks an item read only after the caller confirms that detail rendered", async () => {
    const store = useAIProposalsStore();
    await store.activateProject("project-1");

    await store.open(item.id);

    expect(mocks.detail).toHaveBeenCalledWith("project-1", item.id);
    expect(mocks.markRead).not.toHaveBeenCalled();

    await store.markSelectedRead();

    expect(mocks.markRead).toHaveBeenCalledWith("project-1", item.id);
    expect(store.selectedDetail?.isRead).toBe(true);
    expect(store.summary?.unreadCount).toBe(0);
  });

  it("applies paired item and summary events that share an outbox event id", async () => {
    const store = useAIProposalsStore();
    await store.activateProject("project-1");

    await store.applyRealtimeEvent({
      type: "ai_proposal.updated",
      contractVersion: 1,
      eventId: "shared-outbox-id",
      projectSequence: "11",
      occurredAt: "2026-07-19T18:02:00.000Z",
      data: { proposal: { ...item, version: 2, title: "Новая версия" } },
    });
    await store.applyRealtimeEvent({
      type: "ai_proposal.summary",
      contractVersion: 1,
      eventId: "shared-outbox-id",
      projectSequence: "11",
      occurredAt: "2026-07-19T18:02:00.000Z",
      data: {
        ...summary,
        unreadCount: 0,
        highPriorityUnreadCount: 0,
        lastSequence: "11",
      },
    });

    expect(store.itemsById.get(item.id)?.title).toBe("Новая версия");
    expect(store.summary?.unreadCount).toBe(0);
  });

  it("does not regress counters when an older summary arrives late", async () => {
    const store = useAIProposalsStore();
    await store.activateProject("project-1");

    await store.applyRealtimeEvent({
      type: "ai_proposal.summary",
      contractVersion: 1,
      eventId: "new-summary",
      projectSequence: "12",
      occurredAt: "2026-07-19T18:03:00.000Z",
      data: { ...summary, unreadCount: 0, lastSequence: "12" },
    });
    await store.applyRealtimeEvent({
      type: "ai_proposal.summary",
      contractVersion: 1,
      eventId: "old-summary",
      projectSequence: "11",
      occurredAt: "2026-07-19T18:02:00.000Z",
      data: { ...summary, unreadCount: 8, lastSequence: "11" },
    });

    expect(store.summary?.unreadCount).toBe(0);
    expect(store.lastAppliedSequence).toBe(12n);
  });

  it("disconnects and clears the previous project before activating another", async () => {
    const store = useAIProposalsStore();
    await store.activateProject("project-1");
    await store.activateProject("project-2");

    expect(mocks.disconnect).toHaveBeenCalled();
    expect(store.projectId).toBe("project-2");
    expect(mocks.connect).toHaveBeenLastCalledWith(
      "project-2",
      expect.objectContaining({ subscriptions: expect.any(Object) }),
    );
  });
});
