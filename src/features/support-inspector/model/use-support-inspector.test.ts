import { nextTick, reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import {
  createSupportInspectorController,
  type SupportInspectorContext,
  type SupportInspectorSource,
} from "./use-support-inspector";

const profile = {
  endUserId: "end-user-1",
  profileVersion: "7",
  contractRevision: 3,
  publicationId: null,
  publicationSequence: null,
  observedAt: "2026-08-08T10:00:00.000Z",
  ageSeconds: 60,
  receivedAt: "2026-08-08T10:01:00.000Z",
  provenance: "PRODUCT_PROFILE" as const,
  syncStatus: "VALID" as const,
  fields: [],
};

const eventsPage = {
  recipeVersion: 1 as const,
  caseId: "case-1",
  snapshotAt: "2026-08-08T10:00:00.000Z",
  items: [
    {
      id: "event-1",
      code: "retenive.became_online",
      name: "Пользователь появился онлайн",
      definitionVersion: 1,
      source: "FRONTEND" as const,
      status: "PROCESSED" as const,
      occurredAt: "2026-08-08T09:58:00.000Z",
      receivedAt: "2026-08-08T09:58:01.000Z",
    },
  ],
  nextCursor: "events-next",
};

const activityPage = {
  kind: "SUPPORT_ACTIVITY" as const,
  projectionGeneration: 1,
  computedAt: "2026-08-08T10:00:00.000Z",
  freshnessState: "READY" as const,
  effectiveWindow: null,
  sourceHighWater: "11",
  checkpoint: "11",
  nextCursor: null,
  slaRolloutState: "SHADOW" as const,
  capabilities: {
    scopes: [],
    actions: [],
  },
  data: { facts: [] },
};

function setup(
  initial: Partial<{
    caseId: string | undefined;
    operatorId: string;
  }> = {},
) {
  const state = reactive({
    projectId: "project-1",
    endUserId: "end-user-1",
    caseId: "caseId" in initial ? initial.caseId : "case-1",
    operatorId: initial.operatorId ?? "operator-1",
    canReadProfile: true,
    canReadEvents: true,
    canReadActivity: true,
  });
  const forbidden = vi.fn();
  const context: SupportInspectorContext = {
    projectId: () => state.projectId,
    endUserId: () => state.endUserId,
    caseId: () => state.caseId,
    operatorId: () => state.operatorId,
    permissions: () => ({
      profile: state.canReadProfile,
      events: state.canReadEvents,
      activity: state.canReadActivity,
    }),
    onForbidden: forbidden,
  };
  const source: SupportInspectorSource = {
    readProfile: vi.fn().mockResolvedValue(profile),
    readEvents: vi.fn().mockResolvedValue(eventsPage),
    readActivity: vi.fn().mockResolvedValue(activityPage),
  };
  return {
    state,
    forbidden,
    source,
    controller: createSupportInspectorController(context, source, {
      now: () => new Date("2026-08-08T10:00:00.000Z"),
    }),
  };
}

describe("support inspector controller", () => {
  beforeEach(() => sessionStorage.clear());

  it("restores only an allowed operator tab and lazily loads its projection", async () => {
    sessionStorage.setItem("retenive:support-inspector-tab:operator-1", "DATA");
    const { controller, source } = setup();

    expect(controller.activeTab.value).toBe("DATA");
    expect(source.readProfile).not.toHaveBeenCalled();

    await controller.loadActiveTab();

    expect(source.readProfile).toHaveBeenCalledOnce();
    expect(controller.profile.data.value).toEqual(profile);
    expect(source.readEvents).not.toHaveBeenCalled();
    expect(source.readActivity).not.toHaveBeenCalled();
  });

  it("restores a Case tab after the asynchronous selection becomes available", async () => {
    sessionStorage.setItem("retenive:support-inspector-tab:operator-1", "CASE");
    const { controller, state } = setup({ caseId: undefined });

    expect(controller.activeTab.value).toBe("USER");

    state.caseId = "case-1";
    await nextTick();

    expect(controller.activeTab.value).toBe("CASE");
  });

  it("purges the previous actor and restores only the next operator tab", async () => {
    sessionStorage.setItem(
      "retenive:support-inspector-tab:operator-2",
      "EVENTS",
    );
    const { controller, source, state } = setup();
    await controller.open("DATA");
    expect(controller.profile.data.value).toEqual(profile);

    state.operatorId = "operator-2";
    await nextTick();
    await nextTick();

    expect(controller.profile.data.value).toBeNull();
    expect(controller.activeTab.value).toBe("EVENTS");
    expect(source.readEvents).toHaveBeenCalledOnce();
  });

  it("purges a forbidden projection and moves focus state to a safe tab", async () => {
    const { controller, source, state } = setup();
    await controller.open("DATA");
    expect(controller.profile.data.value).toEqual(profile);

    state.canReadProfile = false;
    await nextTick();

    expect(controller.profile.data.value).toBeNull();
    expect(controller.activeTab.value).toBe("CASE");
    expect(controller.tabs.value.map((tab) => tab.id)).not.toContain("DATA");
    expect(source.readProfile).toHaveBeenCalledOnce();
  });

  it("rejects a stale profile response after project switch", async () => {
    let resolveProfile!: (value: typeof profile) => void;
    const { controller, source, state } = setup();
    vi.mocked(source.readProfile).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveProfile = resolve;
      }),
    );
    vi.mocked(source.readProfile).mockResolvedValueOnce({
      ...profile,
      profileVersion: "8",
    });

    const pending = controller.open("DATA");
    state.projectId = "project-2";
    await nextTick();
    resolveProfile(profile);
    await pending;

    expect(controller.profile.data.value?.profileVersion).toBe("8");
    expect(controller.profile.loading.value).toBe(false);
  });

  it("keeps one immutable Events snapshot while appending a cursor page", async () => {
    const { controller, source } = setup();
    vi.mocked(source.readEvents)
      .mockResolvedValueOnce(eventsPage)
      .mockResolvedValueOnce({
        ...eventsPage,
        items: [{ ...eventsPage.items[0]!, id: "event-2" }],
        nextCursor: null,
      });

    await controller.open("EVENTS");
    await controller.loadMoreEvents();

    expect(controller.events.data.value?.items.map((item) => item.id)).toEqual([
      "event-1",
      "event-2",
    ]);
    expect(vi.mocked(source.readEvents).mock.calls[1]?.[2].cursor).toBe(
      "events-next",
    );
  });

  it("purges concealed Activity data and requests fresh permissions on 403/404", async () => {
    const { controller, source, forbidden } = setup();
    vi.mocked(source.readActivity).mockRejectedValueOnce(
      new ApiError(403, "FORBIDDEN", "Forbidden"),
    );

    await controller.open("ACTIVITY");

    expect(controller.activity.data.value).toBeNull();
    expect(controller.activity.error.value).toBe("");
    expect(forbidden).toHaveBeenCalledWith("ACTIVITY");
  });

  it("uses the backend-bounded seven-day Activity window", async () => {
    const { controller, source } = setup();

    await controller.open("ACTIVITY");

    expect(vi.mocked(source.readActivity).mock.calls[0]?.[1]).toMatchObject({
      caseId: "case-1",
      from: "2026-08-01T10:00:00.000Z",
      to: "2026-08-08T10:00:00.000Z",
      limit: 100,
    });
  });
});
