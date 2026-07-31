import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AIOperationDetailPanel from "@/features/project-ai-operations/ui/AIOperationDetailPanel.vue";
import AIOperationCard from "@/features/project-ai-operations/ui/AIOperationCard.vue";
import AIOperationFilters from "@/features/project-ai-operations/ui/AIOperationFilters.vue";
import AIOperationSummary from "@/features/project-ai-operations/ui/AIOperationSummary.vue";
import AIOperationsPage from "./AIOperationsPage.vue";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  summary: vi.fn(),
  detail: vi.fn(),
  subjects: vi.fn(),
  accessHistory: vi.fn(),
  push: vi.fn(),
  route: { params: {} as Record<string, string> },
  auth: {
    project: {
      id: "project-1",
      effectivePermissionCodes: [
        "project.ai_operations.read",
        "project.ai_operations.sensitive.read",
        "project.ai_operations.subjects.read",
        "project.ai_operations.audit.read",
        "project.ai_analysis_cost.read",
      ],
    },
  },
  activeAuth: null as null | {
    project: {
      id: string;
      effectivePermissionCodes: string[];
    };
  },
}));

vi.mock("@/features/auth/auth.store", async () => {
  const { reactive } = await import("vue");
  return {
    useAuthStore: () => {
      const store = reactive({
        project: {
          ...mocks.auth.project,
          effectivePermissionCodes: [
            ...mocks.auth.project.effectivePermissionCodes,
          ],
        },
      });
      mocks.activeAuth = store;
      return store;
    },
  };
});
vi.mock("vue-router", () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock(
  "@/features/project-ai-operations/api/project-ai-operations-repository",
  () => ({
    projectAIOperationsRepository: {
      list: mocks.list,
      summary: mocks.summary,
      detail: mocks.detail,
      subjects: mocks.subjects,
      accessHistory: mocks.accessHistory,
    },
  }),
);

const summary = {
  operations: 0,
  rootOperations: 0,
  usageRecords: 0,
  dbWorkUnits: "0",
  cost: {
    providerReportedCost: "0",
    estimatedFallbackCost: "0",
    effectiveCost: "0",
    state: "KNOWN" as const,
    unknownUsageRecords: 0,
    reservedCostUsdTicks: "0",
  },
  byStatus: [],
  byChargedAccount: [],
  byProvider: [],
  byCategory: [],
  byResponsibleCmsUser: [],
  byChargedEndUser: [],
  byModel: [],
  byPeriod: [],
  breakdownLimits: {
    maxHighCardinalityItems: 100,
    responsibleCmsUsersTruncated: false,
    chargedEndUsersTruncated: false,
    modelsTruncated: false,
  },
};

describe("AIOperationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeAuth = null;
    mocks.route.params = {};
    mocks.auth.project.effectivePermissionCodes = [
      "project.ai_operations.read",
      "project.ai_operations.sensitive.read",
      "project.ai_operations.subjects.read",
      "project.ai_operations.audit.read",
      "project.ai_analysis_cost.read",
    ];
    mocks.list.mockResolvedValue({
      items: [],
      pageInfo: { hasMore: false, nextCursor: null },
    });
    mocks.summary.mockResolvedValue(summary);
  });

  it("loads a Project-scoped list and bounded summary period", async () => {
    const wrapper = shallowMount(AIOperationsPage);
    await flushPromises();

    expect(mocks.list).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        limit: 30,
        occurredFrom: expect.any(String),
        occurredTo: expect.any(String),
      }),
    );
    expect(mocks.summary).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        occurredFrom: expect.any(String),
        occurredTo: expect.any(String),
      }),
    );
    expect(wrapper.findComponent(AIOperationSummary).props("canReadCost")).toBe(
      true,
    );
  });

  it("applies shared list and summary filters without sending subject-only fields to summary", async () => {
    const wrapper = shallowMount(AIOperationsPage);
    await flushPromises();
    const filters = wrapper.findComponent(AIOperationFilters);

    filters.vm.$emit("update:modelValue", {
      status: "FAILED",
      responsibleCmsUserId: "admin-1",
      subjectEndUserId: "user-1",
      occurredFrom: "2026-07-01T00:00:00.000Z",
      occurredTo: "2026-08-01T00:00:00.000Z",
    });
    filters.vm.$emit("apply");
    await flushPromises();

    expect(mocks.list).toHaveBeenLastCalledWith("project-1", {
      limit: 30,
      status: "FAILED",
      responsibleCmsUserId: "admin-1",
      subjectEndUserId: "user-1",
      occurredFrom: "2026-07-01T00:00:00.000Z",
      occurredTo: "2026-08-01T00:00:00.000Z",
    });
    expect(mocks.summary).toHaveBeenLastCalledWith("project-1", {
      status: "FAILED",
      responsibleCmsUserId: "admin-1",
      occurredFrom: "2026-07-01T00:00:00.000Z",
      occurredTo: "2026-08-01T00:00:00.000Z",
    });
  });

  it("ignores a stale summary response after filters change again", async () => {
    const wrapper = shallowMount(AIOperationsPage);
    await flushPromises();
    let resolveOlder!: (value: typeof summary) => void;
    let resolveLatest!: (value: typeof summary) => void;
    mocks.summary
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOlder = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveLatest = resolve;
          }),
      );
    const filterComponent = wrapper.findComponent(AIOperationFilters);

    filterComponent.vm.$emit("update:modelValue", { status: "FAILED" });
    filterComponent.vm.$emit("apply");
    await flushPromises();
    filterComponent.vm.$emit("update:modelValue", { status: "SUCCEEDED" });
    filterComponent.vm.$emit("apply");
    await flushPromises();

    resolveLatest({ ...summary, operations: 2 });
    await flushPromises();
    resolveOlder({ ...summary, operations: 1 });
    await flushPromises();

    expect(wrapper.findComponent(AIOperationSummary).props("summary")).toEqual(
      expect.objectContaining({ operations: 2 }),
    );
  });

  it("opens safe detail but loads subjects and access history only on explicit request", async () => {
    mocks.route.params = { operationId: "operation-1" };
    mocks.detail.mockResolvedValue({
      operationId: "operation-1",
      timeline: [],
      timelinePageInfo: { hasMore: false },
      usage: { attempts: [], pageInfo: { hasMore: false } },
    });
    mocks.subjects.mockResolvedValue({
      availability: "EXACT",
      items: [],
      pageInfo: { hasMore: false },
    });
    mocks.accessHistory.mockResolvedValue({
      items: [],
      pageInfo: { hasMore: false },
    });
    const wrapper = shallowMount(AIOperationsPage);
    await flushPromises();

    expect(mocks.detail).toHaveBeenCalledWith("project-1", "operation-1", {
      limit: 50,
      usageLimit: 50,
    });
    expect(mocks.subjects).not.toHaveBeenCalled();
    expect(mocks.accessHistory).not.toHaveBeenCalled();

    const panel = wrapper.findComponent(AIOperationDetailPanel);
    panel.vm.$emit("loadSubjects");
    panel.vm.$emit("loadAccessHistory");
    await flushPromises();

    expect(mocks.subjects).toHaveBeenCalledWith("project-1", "operation-1", {
      limit: 50,
    });
    expect(mocks.accessHistory).toHaveBeenCalledWith(
      "project-1",
      "operation-1",
      { limit: 50 },
    );
  });

  it("deduplicates protected subject and access reads while requests are in flight", async () => {
    mocks.route.params = { operationId: "operation-1" };
    mocks.detail.mockResolvedValue({
      operationId: "operation-1",
      timeline: [],
      timelinePageInfo: { hasMore: false },
      usage: { attempts: [], pageInfo: { hasMore: false } },
    });
    let resolveSubjects!: (value: {
      availability: "EXACT";
      items: never[];
      pageInfo: { hasMore: false };
    }) => void;
    let resolveAccess!: (value: {
      items: never[];
      pageInfo: { hasMore: false };
    }) => void;
    mocks.subjects.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSubjects = resolve;
        }),
    );
    mocks.accessHistory.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAccess = resolve;
        }),
    );
    const wrapper = shallowMount(AIOperationsPage);
    await flushPromises();
    const panel = wrapper.findComponent(AIOperationDetailPanel);

    panel.vm.$emit("loadSubjects");
    panel.vm.$emit("loadSubjects");
    panel.vm.$emit("loadAccessHistory");
    panel.vm.$emit("loadAccessHistory");
    await flushPromises();

    expect(mocks.subjects).toHaveBeenCalledTimes(1);
    expect(mocks.accessHistory).toHaveBeenCalledTimes(1);
    expect(panel.props("subjectsLoading")).toBe(true);
    expect(panel.props("accessLoading")).toBe(true);

    resolveSubjects({
      availability: "EXACT",
      items: [],
      pageInfo: { hasMore: false },
    });
    resolveAccess({ items: [], pageInfo: { hasMore: false } });
    await flushPromises();
    expect(panel.props("subjectsLoading")).toBe(false);
    expect(panel.props("accessLoading")).toBe(false);
  });

  it("allows protected reads again after permission revoke and regrant during a request", async () => {
    mocks.route.params = { operationId: "operation-1" };
    mocks.detail.mockResolvedValue({
      operationId: "operation-1",
      timeline: [],
      timelinePageInfo: { hasMore: false },
      usage: { attempts: [], pageInfo: { hasMore: false } },
    });
    let resolveStaleSubjects!: (value: {
      availability: "EXACT";
      items: Array<{ subjectRowId: string }>;
      pageInfo: { hasMore: false };
    }) => void;
    mocks.subjects
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStaleSubjects = resolve;
          }),
      )
      .mockResolvedValueOnce({
        availability: "EXACT",
        items: [{ subjectRowId: "fresh-subject" }],
        pageInfo: { hasMore: false },
      });
    mocks.accessHistory
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce({
        items: [{ accessEventId: "fresh-access" }],
        pageInfo: { hasMore: false },
      });
    const wrapper = shallowMount(AIOperationsPage);
    await flushPromises();
    const panel = wrapper.findComponent(AIOperationDetailPanel);

    panel.vm.$emit("loadSubjects");
    panel.vm.$emit("loadAccessHistory");
    await flushPromises();
    mocks.activeAuth!.project.effectivePermissionCodes =
      mocks.activeAuth!.project.effectivePermissionCodes.filter(
        (permission) =>
          permission !== "project.ai_operations.subjects.read" &&
          permission !== "project.ai_operations.audit.read",
      );
    await flushPromises();

    expect(panel.props("subjectsLoading")).toBe(false);
    expect(panel.props("accessLoading")).toBe(false);

    mocks.activeAuth!.project.effectivePermissionCodes.push(
      "project.ai_operations.subjects.read",
      "project.ai_operations.audit.read",
    );
    await flushPromises();
    panel.vm.$emit("loadSubjects");
    panel.vm.$emit("loadAccessHistory");
    await flushPromises();

    expect(mocks.subjects).toHaveBeenCalledTimes(2);
    expect(mocks.accessHistory).toHaveBeenCalledTimes(2);
    expect(panel.props("subjects")?.items).toEqual([
      { subjectRowId: "fresh-subject" },
    ]);
    expect(panel.props("accessHistory")?.items).toEqual([
      { accessEventId: "fresh-access" },
    ]);

    resolveStaleSubjects({
      availability: "EXACT",
      items: [{ subjectRowId: "stale-subject" }],
      pageInfo: { hasMore: false },
    });
    await flushPromises();
    expect(panel.props("subjects")?.items).toEqual([
      { subjectRowId: "fresh-subject" },
    ]);
  });

  it("shows Conversation results only when both profile and conversation reads are allowed", async () => {
    mocks.route.params = { operationId: "operation-1" };
    mocks.auth.project.effectivePermissionCodes.push("project.profiles.read");
    mocks.detail.mockResolvedValue({
      operationId: "operation-1",
      timeline: [],
      timelinePageInfo: { hasMore: false },
      usage: { attempts: [], pageInfo: { hasMore: false } },
    });
    const wrapper = shallowMount(AIOperationsPage);
    await flushPromises();
    const panel = wrapper.findComponent(AIOperationDetailPanel);

    expect(panel.props("canReadConversationResult")).toBe(false);

    mocks.activeAuth!.project.effectivePermissionCodes.push(
      "project.conversations.read",
    );
    await flushPromises();

    expect(panel.props("canReadConversationResult")).toBe(true);
  });

  it("merges concurrent timeline and usage pages without cancelling either response", async () => {
    mocks.route.params = { operationId: "operation-1" };
    const baseDetail = {
      operationId: "operation-1",
      timeline: [{ sequence: "1" }],
      timelinePageInfo: {
        hasMore: true,
        nextCursor: "timeline-next" as string | null,
      },
      usage: {
        attempts: [{ id: "usage-1" }],
        pageInfo: {
          hasMore: true,
          nextCursor: "usage-next" as string | null,
        },
      },
    };
    mocks.detail.mockResolvedValueOnce(baseDetail);
    const wrapper = shallowMount(AIOperationsPage);
    await flushPromises();
    let resolveTimeline!: (value: typeof baseDetail) => void;
    let resolveUsage!: (value: typeof baseDetail) => void;
    mocks.detail
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveTimeline = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveUsage = resolve;
          }),
      );
    const panel = wrapper.findComponent(AIOperationDetailPanel);

    panel.vm.$emit("loadMoreTimeline");
    panel.vm.$emit("loadMoreUsage");
    await flushPromises();
    resolveUsage({
      ...baseDetail,
      timeline: [],
      usage: {
        attempts: [{ id: "usage-2" }],
        pageInfo: { hasMore: false, nextCursor: null },
      },
    });
    await flushPromises();
    resolveTimeline({
      ...baseDetail,
      timeline: [{ sequence: "2" }],
      timelinePageInfo: { hasMore: false, nextCursor: null },
      usage: {
        attempts: [],
        pageInfo: { hasMore: false, nextCursor: null },
      },
    });
    await flushPromises();

    expect(
      wrapper.findComponent(AIOperationDetailPanel).props("detail"),
    ).toEqual(
      expect.objectContaining({
        timeline: [{ sequence: "1" }, { sequence: "2" }],
        usage: expect.objectContaining({
          attempts: [{ id: "usage-1" }, { id: "usage-2" }],
        }),
      }),
    );
  });

  it("loads safe detail but does not expose cost without exact permissions", async () => {
    mocks.route.params = { operationId: "operation-1" };
    mocks.auth.project.effectivePermissionCodes = [
      "project.ai_operations.read",
    ];
    mocks.detail.mockResolvedValue({
      operationId: "operation-1",
      timeline: [],
      timelinePageInfo: { hasMore: false },
      usage: { attempts: [], pageInfo: { hasMore: false } },
    });
    const wrapper = shallowMount(AIOperationsPage);
    await flushPromises();

    expect(mocks.detail).toHaveBeenCalled();
    expect(wrapper.findComponent(AIOperationDetailPanel).exists()).toBe(true);
    expect(wrapper.findComponent(AIOperationSummary).props("canReadCost")).toBe(
      false,
    );
  });

  it("does not retain or load the journal when base permission is absent", async () => {
    mocks.auth.project.effectivePermissionCodes = [];

    const wrapper = shallowMount(AIOperationsPage);
    await flushPromises();

    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.summary).not.toHaveBeenCalled();
    expect(wrapper.findAllComponents(AIOperationDetailPanel)).toHaveLength(0);
    expect(mocks.push).toHaveBeenCalledWith({ name: "overview" });
  });

  it("clears already rendered operation data on runtime base-permission revocation", async () => {
    mocks.list.mockResolvedValue({
      items: [{ operationId: "operation-visible-before-revoke" }],
      pageInfo: { hasMore: false, nextCursor: null },
    });
    const wrapper = shallowMount(AIOperationsPage);
    await flushPromises();
    expect(wrapper.findAllComponents(AIOperationCard)).toHaveLength(1);

    mocks.activeAuth!.project.effectivePermissionCodes = [];
    await flushPromises();

    expect(wrapper.findAllComponents(AIOperationCard)).toHaveLength(0);
    expect(wrapper.findComponent(AIOperationDetailPanel).exists()).toBe(false);
    expect(mocks.push).toHaveBeenCalledWith({ name: "overview" });
  });

  it("blocks duplicate timeline pagination while the first page is in flight", async () => {
    mocks.route.params = { operationId: "operation-1" };
    const baseDetail = {
      operationId: "operation-1",
      timeline: [] as Array<{ sequence: string }>,
      timelinePageInfo: {
        hasMore: true,
        nextCursor: "timeline-next" as string | null,
      },
      usage: {
        attempts: [],
        pageInfo: { hasMore: false, nextCursor: null as string | null },
      },
    };
    mocks.detail.mockResolvedValueOnce(baseDetail);
    const wrapper = shallowMount(AIOperationsPage);
    await flushPromises();
    let resolvePage!: (value: typeof baseDetail) => void;
    mocks.detail.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePage = resolve;
        }),
    );
    const panel = wrapper.findComponent(AIOperationDetailPanel);

    panel.vm.$emit("loadMoreTimeline");
    panel.vm.$emit("loadMoreTimeline");
    await flushPromises();

    expect(mocks.detail).toHaveBeenCalledTimes(2);
    expect(panel.props("timelineLoading")).toBe(true);
    expect(panel.props("usageLoading")).toBe(false);
    resolvePage({
      ...baseDetail,
      timeline: [{ sequence: "2" }],
      timelinePageInfo: { hasMore: false, nextCursor: null },
    });
    await flushPromises();
    expect(panel.props("timelineLoading")).toBe(false);
  });
});
