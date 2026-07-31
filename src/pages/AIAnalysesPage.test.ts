import { flushPromises, shallowMount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AIAnalysisCard from "@/features/project-ai-analyses/ui/AIAnalysisCard.vue";
import AIAnalysisDetailPanel from "@/features/project-ai-analyses/ui/AIAnalysisDetailPanel.vue";
import AIAnalysisFilters from "@/features/project-ai-analyses/ui/AIAnalysisFilters.vue";
import AIAnalysesPage from "./AIAnalysesPage.vue";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  cancel: vi.fn(),
  push: vi.fn(),
  route: { params: {} as Record<string, string> },
  auth: {
    project: {
      id: "project-1",
      effectivePermissionCodes: [
        "project.ai_analyses.read",
        "project.ai_analysis_cost.read",
        "project.ai_analyses.manage",
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
  "@/features/project-ai-analyses/api/project-ai-analyses-repository",
  () => ({
    projectAIAnalysesRepository: {
      list: mocks.list,
      detail: mocks.detail,
      cancel: mocks.cancel,
    },
  }),
);

describe("AIAnalysesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeAuth = null;
    mocks.route.params = {};
    mocks.auth.project.effectivePermissionCodes = [
      "project.ai_analyses.read",
      "project.ai_analysis_cost.read",
      "project.ai_analyses.manage",
    ];
    mocks.list.mockResolvedValue({ items: [], nextCursor: null });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("loads the unified Project-scoped analysis list", async () => {
    const wrapper = shallowMount(AIAnalysesPage);
    await flushPromises();

    expect(mocks.list).toHaveBeenCalledWith("project-1", { limit: 30 });
    expect(wrapper.findAllComponents(AIAnalysisCard)).toHaveLength(0);
    expect(wrapper.text()).toContain("Анализов пока нет");
  });

  it("does not load analyses without the exact base permission", async () => {
    mocks.auth.project.effectivePermissionCodes = [];

    const wrapper = shallowMount(AIAnalysesPage);
    await flushPromises();

    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.detail).not.toHaveBeenCalled();
    expect(wrapper.findAllComponents(AIAnalysisCard)).toHaveLength(0);
    expect(mocks.push).toHaveBeenCalledWith({ name: "overview" });
  });

  it("clears rendered analysis data when base permission is revoked", async () => {
    mocks.list.mockResolvedValue({
      items: [{ analysisId: "analysis-visible-before-revoke" }],
      nextCursor: null,
    });
    mocks.route.params = { analysisId: "analysis-visible-before-revoke" };
    mocks.detail.mockResolvedValue({
      analysis: {
        analysisId: "analysis-visible-before-revoke",
        title: "Sensitive result",
      },
      runs: [],
      subjectEvidence: { total: 0 },
    });
    const wrapper = shallowMount(AIAnalysesPage);
    await flushPromises();
    expect(wrapper.findAllComponents(AIAnalysisCard)).toHaveLength(1);
    expect(wrapper.findComponent(AIAnalysisDetailPanel).props("detail")).not.toBeNull();

    mocks.activeAuth!.project.effectivePermissionCodes = [];
    await flushPromises();

    expect(wrapper.findAllComponents(AIAnalysisCard)).toHaveLength(0);
    expect(wrapper.findComponent(AIAnalysisDetailPanel).props("detail")).toBeNull();
    expect(mocks.push).toHaveBeenCalledWith({ name: "overview" });
  });

  it("scrubs and reloads monetary projections when cost permission is revoked", async () => {
    mocks.route.params = { analysisId: "analysis-cost" };
    mocks.list.mockResolvedValueOnce({
      items: [{ analysisId: "analysis-cost", actualAiCostUsdTicks: "250000" }],
      nextCursor: null,
    });
    mocks.detail.mockResolvedValueOnce({
      analysis: {
        analysisId: "analysis-cost",
        title: "Cost result",
        actualAiCostUsdTicks: "250000",
      },
      runs: [],
      subjectEvidence: { total: 0 },
    });
    const wrapper = shallowMount(AIAnalysesPage);
    await flushPromises();
    expect(wrapper.findAllComponents(AIAnalysisCard)).toHaveLength(1);

    let resolveSafeList!: (value: { items: []; nextCursor: null }) => void;
    let resolveSafeDetail!: (value: Record<string, unknown>) => void;
    mocks.list.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSafeList = resolve;
      }),
    );
    mocks.detail.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSafeDetail = resolve;
      }),
    );
    mocks.activeAuth!.project.effectivePermissionCodes = [
      "project.ai_analyses.read",
      "project.ai_analyses.manage",
    ];
    await nextTick();

    expect(wrapper.findAllComponents(AIAnalysisCard)).toHaveLength(0);
    expect(wrapper.findComponent(AIAnalysisDetailPanel).props("detail")).toBeNull();
    resolveSafeList({ items: [], nextCursor: null });
    resolveSafeDetail({
      analysis: { analysisId: "analysis-cost", title: "Safe result" },
      runs: [],
      subjectEvidence: { total: 0 },
    });
    await flushPromises();
  });

  it("fences in-flight reads but preserves cancellation when cost permission changes", async () => {
    mocks.route.params = { analysisId: "analysis-cost-in-flight" };
    mocks.list.mockResolvedValueOnce({
      items: [{ analysisId: "analysis-cost-in-flight" }],
      nextCursor: "next-page",
    });
    mocks.detail.mockResolvedValueOnce({
      analysis: {
        analysisId: "analysis-cost-in-flight",
        title: "Cost result",
        version: 3,
      },
      runs: [],
      subjectEvidence: { total: 0 },
    });
    const wrapper = shallowMount(AIAnalysesPage);
    await flushPromises();

    mocks.list.mockReturnValueOnce(new Promise(() => undefined));
    let resolveCancellation!: () => void;
    mocks.cancel.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveCancellation = resolve;
      }),
    );
    void wrapper.find('button-stub[label="Показать ещё"]').trigger("click");
    wrapper.findComponent(AIAnalysisDetailPanel).vm.$emit("cancel", {
      projectId: "project-1",
      analysisId: "analysis-cost-in-flight",
      version: 3,
    });
    await nextTick();
    expect(
      wrapper.find('button-stub[label="Показать ещё"]').attributes("loading"),
    ).toBe("true");
    expect(wrapper.findComponent(AIAnalysisDetailPanel).props("cancelling")).toBe(
      true,
    );

    mocks.list.mockResolvedValueOnce({ items: [], nextCursor: null });
    mocks.detail.mockResolvedValueOnce({
      analysis: {
        analysisId: "analysis-cost-in-flight",
        title: "Safe result",
        version: 3,
      },
      runs: [],
      subjectEvidence: { total: 0 },
    });
    mocks.activeAuth!.project.effectivePermissionCodes = [
      "project.ai_analyses.read",
      "project.ai_analyses.manage",
    ];
    await flushPromises();

    expect(wrapper.find('button-stub[label="Показать ещё"]').exists()).toBe(false);
    expect(wrapper.findComponent(AIAnalysisDetailPanel).props("cancelling")).toBe(true);

    mocks.list.mockResolvedValueOnce({ items: [], nextCursor: null });
    mocks.detail.mockResolvedValueOnce({
      analysis: {
        analysisId: "analysis-cost-in-flight",
        title: "Cancelled result",
        version: 4,
      },
      runs: [],
      subjectEvidence: { total: 0 },
    });
    resolveCancellation();
    await flushPromises();

    expect(mocks.list).toHaveBeenCalledTimes(4);
    expect(mocks.detail).toHaveBeenCalledTimes(3);
    expect(wrapper.findComponent(AIAnalysisDetailPanel).props("cancelling")).toBe(false);
  });

  it("loads a protected detail for a deep link", async () => {
    mocks.route.params = { analysisId: "analysis-1" };
    mocks.detail.mockResolvedValue({
      analysis: { analysisId: "analysis-1", title: "Депозиты" },
      runs: [],
      subjectEvidence: { total: 0 },
    });

    const wrapper = shallowMount(AIAnalysesPage);
    await flushPromises();

    expect(mocks.detail).toHaveBeenCalledWith("project-1", "analysis-1");
    expect(
      wrapper.findComponent(AIAnalysisDetailPanel).props("canManage"),
    ).toBe(true);
    expect(
      wrapper.findComponent(AIAnalysisDetailPanel).props("canReadCost"),
    ).toBe(true);
  });

  it("does not append an old cursor response after filters change", async () => {
    let resolveOld!: (value: {
      items: Array<Record<string, unknown>>;
      nextCursor: null;
    }) => void;
    mocks.list
      .mockReset()
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
      )
      .mockResolvedValueOnce({
        items: [
          {
            analysisId: "new-analysis",
            title: "Новый фильтр",
            createdAt: "2026-07-31T00:00:00.000Z",
            eventCodes: [],
          },
        ],
        nextCursor: null,
      });
    const wrapper = shallowMount(AIAnalysesPage);
    const filters = wrapper.findComponent(AIAnalysisFilters);

    filters.vm.$emit("update:modelValue", { status: "SUCCEEDED" });
    filters.vm.$emit("apply");
    await flushPromises();
    resolveOld({
      items: [
        {
          analysisId: "stale-analysis",
          title: "Старый фильтр",
          createdAt: "2026-07-30T00:00:00.000Z",
          eventCodes: [],
        },
      ],
      nextCursor: null,
    });
    await flushPromises();

    const cards = wrapper.findAllComponents(AIAnalysisCard);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.props("item").analysisId).toBe("new-analysis");
  });

  it("keeps the newest detail when an older request for the same analysis resolves late", async () => {
    mocks.route.params = { analysisId: "analysis-1" };
    let resolveFirst!: (value: Record<string, unknown>) => void;
    mocks.detail
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockResolvedValueOnce({
        analysis: {
          analysisId: "analysis-1",
          title: "Свежий результат",
          version: 2,
        },
        runs: [],
        subjectEvidence: { total: 0 },
      });
    const wrapper = shallowMount(AIAnalysesPage);

    await wrapper.get('[data-testid="refresh-ai-analyses"]').trigger("click");
    await flushPromises();
    resolveFirst({
      analysis: {
        analysisId: "analysis-1",
        title: "Устаревший результат",
        version: 1,
      },
      runs: [],
      subjectEvidence: { total: 0 },
    });
    await flushPromises();

    expect(
      wrapper.findComponent(AIAnalysisDetailPanel).props("detail")!.analysis
        .title,
    ).toBe("Свежий результат");
  });

  it("refetches active analyses through REST while the page is visible", async () => {
    vi.useFakeTimers();
    mocks.list.mockResolvedValue({
      items: [
        {
          analysisId: "analysis-running",
          complete: false,
          createdAt: "2026-07-31T07:00:00.000Z",
          createdByCmsUserId: "admin-1",
          eventCodes: [],
          hasLimitations: false,
          kind: "ONE_OFF",
          latestRun: {
            analysisId: "analysis-running",
            complete: false,
            eventCodes: [],
            hasLimitations: false,
            limitationCodes: [],
            status: "RUNNING",
            version: 1,
          },
          projectSequence: "43",
          scopeKind: "PROJECT",
          state: "ACTIVE",
          title: "Активный анализ",
          version: 1,
        },
      ],
      nextCursor: null,
    });
    const wrapper = shallowMount(AIAnalysesPage);
    await flushPromises();

    await vi.advanceTimersByTimeAsync(15_000);
    await flushPromises();

    expect(mocks.list).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it("refreshes the full appended cursor window without collapsing it", async () => {
    vi.useFakeTimers();
    const runningItem = {
      analysisId: "analysis-running",
      complete: false,
      createdAt: "2026-07-31T07:00:00.000Z",
      createdByCmsUserId: "admin-1",
      eventCodes: [],
      hasLimitations: false,
      kind: "ONE_OFF" as const,
      latestRun: {
        analysisId: "analysis-running",
        complete: false,
        eventCodes: [],
        hasLimitations: false,
        limitationCodes: [],
        status: "RUNNING" as const,
        version: 1,
      },
      projectSequence: "43",
      scopeKind: "PROJECT" as const,
      state: "ACTIVE" as const,
      title: "Активный анализ",
      version: 1,
    };
    const completedFirstPageItem = {
      ...runningItem,
      latestRun: {
        ...runningItem.latestRun,
        status: "SUCCEEDED" as const,
      },
    };
    mocks.list
      .mockResolvedValueOnce({
        items: [completedFirstPageItem],
        nextCursor: "cursor-2",
      })
      .mockResolvedValueOnce({
        items: [
          {
            ...runningItem,
            analysisId: "analysis-page-2",
            latestRun: {
              ...runningItem.latestRun,
              analysisId: "analysis-page-2",
            },
            title: "Вторая страница",
          },
        ],
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        items: [completedFirstPageItem],
        nextCursor: "cursor-2-new",
      })
      .mockResolvedValueOnce({
        items: [
          {
            ...runningItem,
            analysisId: "analysis-page-2",
            latestRun: {
              ...runningItem.latestRun,
              analysisId: "analysis-page-2",
              status: "SUCCEEDED",
            },
            title: "Вторая страница",
          },
        ],
        nextCursor: null,
      });
    const wrapper = shallowMount(AIAnalysesPage);
    await flushPromises();

    await wrapper.find('button-stub[label="Показать ещё"]').trigger("click");
    await flushPromises();
    await vi.advanceTimersByTimeAsync(15_000);
    await flushPromises();

    expect(mocks.list).toHaveBeenCalledTimes(4);
    expect(mocks.list.mock.calls[3]?.[1]).toMatchObject({
      cursor: "cursor-2-new",
    });
    const cards = wrapper.findAllComponents(AIAnalysisCard);
    expect(cards.map((card) => card.props("item").analysisId)).toEqual([
      "analysis-running",
      "analysis-page-2",
    ]);
    expect(cards).toHaveLength(2);
    expect(cards[1]!.props("item").latestRun?.status).toBe("SUCCEEDED");
    wrapper.unmount();
  });

  it("does not let automatic refresh invalidate an in-flight page append", async () => {
    vi.useFakeTimers();
    const runningItem = {
      analysisId: "analysis-running",
      complete: false,
      createdAt: "2026-07-31T07:00:00.000Z",
      createdByCmsUserId: "admin-1",
      eventCodes: [],
      hasLimitations: false,
      kind: "ONE_OFF" as const,
      latestRun: {
        analysisId: "analysis-running",
        complete: false,
        eventCodes: [],
        hasLimitations: false,
        limitationCodes: [],
        status: "RUNNING" as const,
        version: 1,
      },
      projectSequence: "47",
      scopeKind: "PROJECT" as const,
      state: "ACTIVE" as const,
      title: "Активный анализ",
      version: 1,
    };
    const appendedItem = {
      ...runningItem,
      analysisId: "analysis-appended",
      latestRun: {
        ...runningItem.latestRun,
        analysisId: "analysis-appended",
        status: "SUCCEEDED" as const,
      },
      projectSequence: "48",
      title: "Загруженный анализ",
    };
    let resolveAppend!: (value: {
      items: (typeof appendedItem)[];
      nextCursor: null;
    }) => void;
    const appendResponse = new Promise<{
      items: (typeof appendedItem)[];
      nextCursor: null;
    }>((resolve) => {
      resolveAppend = resolve;
    });
    mocks.list
      .mockResolvedValueOnce({ items: [runningItem], nextCursor: "cursor-2" })
      .mockReturnValueOnce(appendResponse);
    const wrapper = shallowMount(AIAnalysesPage);
    await flushPromises();

    void wrapper.find('button-stub[label="Показать ещё"]').trigger("click");
    await flushPromises();
    await vi.advanceTimersByTimeAsync(15_000);
    await flushPromises();

    expect(mocks.list).toHaveBeenCalledTimes(2);
    document.dispatchEvent(new Event("visibilitychange"));
    await flushPromises();
    expect(mocks.list).toHaveBeenCalledTimes(2);
    resolveAppend({ items: [appendedItem], nextCursor: null });
    await flushPromises();
    expect(
      wrapper
        .findAllComponents(AIAnalysisCard)
        .map((card) => card.props("item").analysisId),
    ).toEqual(["analysis-running", "analysis-appended"]);
    wrapper.unmount();
  });

  it("keeps list and detail content visible during silent polling", async () => {
    vi.useFakeTimers();
    mocks.route.params = { analysisId: "analysis-silent" };
    const runningItem = {
      analysisId: "analysis-silent",
      complete: false,
      createdAt: "2026-07-31T07:00:00.000Z",
      createdByCmsUserId: "admin-1",
      eventCodes: [],
      hasLimitations: false,
      kind: "ONE_OFF" as const,
      latestRun: {
        analysisId: "analysis-silent",
        complete: false,
        eventCodes: [],
        hasLimitations: false,
        limitationCodes: [],
        status: "RUNNING" as const,
        version: 1,
      },
      projectSequence: "49",
      scopeKind: "PROJECT" as const,
      state: "ACTIVE" as const,
      title: "Активный анализ",
      version: 1,
    };
    const detailResponse = {
      analysis: {
        analysisId: "analysis-silent",
        title: "Активный анализ",
        version: 1,
      },
      runs: [{ status: "RUNNING" as const }],
      subjectEvidence: { total: 0 },
    };
    let resolveListRefresh!: (value: {
      items: (typeof runningItem)[];
      nextCursor: null;
    }) => void;
    let resolveDetailRefresh!: (value: typeof detailResponse) => void;
    mocks.list
      .mockResolvedValueOnce({ items: [runningItem], nextCursor: null })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveListRefresh = resolve;
        }),
      );
    mocks.detail.mockResolvedValueOnce(detailResponse).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDetailRefresh = resolve;
      }),
    );
    const wrapper = shallowMount(AIAnalysesPage);
    await flushPromises();

    vi.advanceTimersByTime(15_000);
    await nextTick();

    expect(wrapper.findAllComponents(AIAnalysisCard)).toHaveLength(1);
    expect(wrapper.findComponent(AIAnalysisDetailPanel).props("loading")).toBe(
      false,
    );
    expect(
      wrapper.findComponent(AIAnalysisDetailPanel).props("detail"),
    ).toEqual(detailResponse);
    resolveListRefresh({ items: [runningItem], nextCursor: null });
    resolveDetailRefresh(detailResponse);
    await flushPromises();
    wrapper.unmount();
  });

  it("caps automatic cursor-window refresh after five loaded pages", async () => {
    vi.useFakeTimers();
    const runningItem = {
      analysisId: "analysis-page-1",
      complete: false,
      createdAt: "2026-07-31T07:00:00.000Z",
      createdByCmsUserId: "admin-1",
      eventCodes: [],
      hasLimitations: false,
      kind: "ONE_OFF" as const,
      latestRun: {
        analysisId: "analysis-page-1",
        complete: false,
        eventCodes: [],
        hasLimitations: false,
        limitationCodes: [],
        status: "RUNNING" as const,
        version: 1,
      },
      projectSequence: "50",
      scopeKind: "PROJECT" as const,
      state: "ACTIVE" as const,
      title: "Активный анализ",
      version: 1,
    };
    for (let page = 1; page <= 6; page += 1) {
      mocks.list.mockResolvedValueOnce({
        items: [
          {
            ...runningItem,
            analysisId: `analysis-page-${page}`,
            latestRun: {
              ...runningItem.latestRun,
              analysisId: `analysis-page-${page}`,
            },
          },
        ],
        nextCursor: `cursor-${page + 1}`,
      });
    }
    const wrapper = shallowMount(AIAnalysesPage);
    await flushPromises();

    for (let page = 2; page <= 6; page += 1) {
      await wrapper.find('button-stub[label="Показать ещё"]').trigger("click");
      await flushPromises();
    }
    await vi.advanceTimersByTimeAsync(15_000);
    await flushPromises();

    expect(mocks.list).toHaveBeenCalledTimes(6);
    expect(wrapper.findAllComponents(AIAnalysisCard)).toHaveLength(6);
    wrapper.unmount();
  });

  it("removes records that leave an active filter while refreshing an expanded window", async () => {
    vi.useFakeTimers();
    const runningItem = {
      analysisId: "analysis-filtered-out",
      complete: false,
      createdAt: "2026-07-31T07:00:00.000Z",
      createdByCmsUserId: "admin-1",
      eventCodes: [],
      hasLimitations: false,
      kind: "ONE_OFF" as const,
      latestRun: {
        analysisId: "analysis-filtered-out",
        complete: false,
        eventCodes: [],
        hasLimitations: false,
        limitationCodes: [],
        status: "RUNNING" as const,
        version: 1,
      },
      projectSequence: "45",
      scopeKind: "PROJECT" as const,
      state: "ACTIVE" as const,
      title: "Завершающийся анализ",
      version: 1,
    };
    const remainingItem = {
      ...runningItem,
      analysisId: "analysis-still-running",
      latestRun: {
        ...runningItem.latestRun,
        analysisId: "analysis-still-running",
      },
      projectSequence: "46",
      title: "Ещё выполняется",
    };
    mocks.list
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValueOnce({
        items: [runningItem],
        nextCursor: "cursor-filter-2",
      })
      .mockResolvedValueOnce({ items: [remainingItem], nextCursor: null })
      .mockResolvedValueOnce({ items: [remainingItem], nextCursor: null });
    const wrapper = shallowMount(AIAnalysesPage);
    await flushPromises();

    const filters = wrapper.findComponent(AIAnalysisFilters);
    filters.vm.$emit("update:modelValue", { status: "RUNNING" });
    await nextTick();
    filters.vm.$emit("apply");
    await flushPromises();
    await wrapper.find('button-stub[label="Показать ещё"]').trigger("click");
    await flushPromises();
    await vi.advanceTimersByTimeAsync(15_000);
    await flushPromises();

    expect(mocks.list).toHaveBeenCalledTimes(4);
    expect(mocks.list.mock.calls[1]?.[1]).toMatchObject({ status: "RUNNING" });
    expect(
      wrapper
        .findAllComponents(AIAnalysisCard)
        .map((card) => card.props("item").analysisId),
    ).toEqual(["analysis-still-running"]);
    wrapper.unmount();
  });

  it("does not poll a far-future active schedule every 15 seconds", async () => {
    vi.useFakeTimers();
    const nextRunAt = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
    mocks.list.mockResolvedValue({
      items: [
        {
          analysisId: "analysis-recurring",
          complete: false,
          createdAt: "2026-07-31T07:00:00.000Z",
          createdByCmsUserId: "admin-1",
          eventCodes: [],
          hasLimitations: false,
          kind: "RECURRING",
          projectSequence: "44",
          schedule: {
            dstDisambiguation: "EXACT",
            localDateTime: "2026-08-01T07:00:00",
            nextRunAt,
            runAt: nextRunAt,
            scheduleId: "schedule-1",
            scheduleSpecVersion: 1,
            scheduleType: "RECURRING",
            state: "ACTIVE",
            timezone: "Europe/Madrid",
          },
          scopeKind: "PROJECT",
          state: "ACTIVE",
          title: "Ежедневный анализ",
          version: 1,
        },
      ],
      nextCursor: null,
    });
    const wrapper = shallowMount(AIAnalysesPage);
    await flushPromises();

    await vi.advanceTimersByTimeAsync(15_000);
    await flushPromises();

    expect(mocks.list).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("refuses a cancellation event for a different analysis ID", async () => {
    mocks.route.params = { analysisId: "analysis-1" };
    mocks.detail.mockResolvedValue({
      analysis: { analysisId: "analysis-1", title: "Депозиты" },
      runs: [],
      subjectEvidence: { total: 0 },
    });
    const wrapper = shallowMount(AIAnalysesPage);
    await flushPromises();

    wrapper.findComponent(AIAnalysisDetailPanel).vm.$emit("cancel", {
      projectId: "project-1",
      analysisId: "analysis-2",
      version: 1,
    });
    await flushPromises();

    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("cancels with an immutable version and reuses the key after an ambiguous failure", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-4111-8111-111111111111",
    );
    mocks.route.params = { analysisId: "analysis-1" };
    mocks.detail.mockResolvedValue({
      analysis: {
        analysisId: "analysis-1",
        title: "Депозиты",
        version: 7,
      },
      runs: [],
      subjectEvidence: { total: 0 },
    });
    mocks.cancel.mockRejectedValueOnce(new Error("Сетевой сбой"));
    const wrapper = shallowMount(AIAnalysesPage);
    await flushPromises();
    const target = {
      projectId: "project-1",
      analysisId: "analysis-1",
      version: 7,
    };

    wrapper.findComponent(AIAnalysisDetailPanel).vm.$emit("cancel", target);
    await flushPromises();
    wrapper.findComponent(AIAnalysisDetailPanel).vm.$emit("cancel", target);
    await flushPromises();

    expect(mocks.cancel).toHaveBeenNthCalledWith(1, {
      ...target,
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });
    expect(mocks.cancel).toHaveBeenNthCalledWith(2, {
      ...target,
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("moves focus into a deep-linked detail and restores it on close", async () => {
    mocks.route.params = { analysisId: "analysis-1" };
    mocks.detail.mockResolvedValue({
      analysis: { analysisId: "analysis-1", title: "Депозиты", version: 1 },
      runs: [],
      subjectEvidence: { total: 0 },
    });
    const focus = vi.fn();
    const querySelector = vi
      .spyOn(document, "querySelector")
      .mockReturnValue({ focus } as unknown as Element);
    const wrapper = shallowMount(AIAnalysesPage);
    await flushPromises();

    expect(querySelector).toHaveBeenCalledWith(
      '[data-testid="ai-analysis-detail"]',
    );
    wrapper.findComponent(AIAnalysisDetailPanel).vm.$emit("close");
    await flushPromises();

    expect(mocks.push).toHaveBeenCalledWith({ name: "ai-analyses" });
    expect(querySelector).toHaveBeenCalledWith(
      '[data-analysis-id="analysis-1"] .analysis-link',
    );
    expect(focus).toHaveBeenCalled();
  });
});
