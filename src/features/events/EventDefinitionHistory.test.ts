import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EventDefinitionHistory from "./EventDefinitionHistory.vue";

const mocks = vi.hoisted(() => ({
  page: vi.fn(),
  detail: vi.fn(),
}));

vi.mock("@/shared/api/repository/event-catalog", () => ({
  eventCatalogRepository: {
    listRevisions: mocks.page,
    getRevision: mocks.detail,
  },
}));

const event = {
  definitionKeyId: "event-key-1",
  projectId: "project-1",
  code: "deposit.succeeded",
  lifecycle: "ACTIVE" as const,
  lifecycleVersion: 1,
  lifecycleUpdatedAt: "2026-07-20T10:00:00.000Z",
  metadata: {
    name: "Deposit",
    description: null,
    concurrencyToken: "2026-07-20T10:00:00.000Z",
  },
  policy: {
    version: 1,
    updatedAt: "2026-07-20T10:00:00.000Z",
    enabled: true,
    clientIngestible: false,
    countsAsActivity: true,
  },
  currentSchema: {
    revisionId: "revision-2",
    revisionNumber: 2,
    payloadSchema: {},
    publishedAt: "2026-07-20T10:00:00.000Z",
  },
  origin: "CUSTOM" as const,
  readOnly: false,
};

const revision = {
  id: "revision-2",
  projectId: "project-1",
  definitionKeyId: "event-key-1",
  code: "deposit.succeeded",
  number: 2,
  payloadSchema: {},
  publishedAt: "2026-07-20T10:00:00.000Z",
  pinnedScenarioRevisionCount: 3,
  compatibility: "PINNED" as const,
  isCurrent: true,
};

describe("EventDefinitionHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.page
      .mockResolvedValueOnce({
        items: [revision],
        nextCursor: "revision-1",
      })
      .mockResolvedValueOnce({
        items: [
          {
            ...revision,
            id: "revision-1",
            number: 1,
            isCurrent: false,
            pinnedScenarioRevisionCount: 0,
            compatibility: "SUPERSEDED",
          },
        ],
        nextCursor: null,
      });
    mocks.detail.mockResolvedValue(revision);
  });

  it("loads revision history by stable definition identity, pages it and opens pinned detail", async () => {
    const wrapper = shallowMount(EventDefinitionHistory, {
      props: { projectId: "project-1", event },
      global: { stubs: { Dialog: { template: "<div><slot /></div>" } } },
    });

    await wrapper.find('button-stub[label="История"]').trigger("click");
    await flushPromises();

    expect(mocks.page).toHaveBeenCalledWith("project-1", "event-key-1", {
      limit: 25,
    });
    expect(wrapper.text()).toContain("3 публикации сценариев");

    await wrapper
      .find('[data-testid="event-revision-detail"]')
      .trigger("click");
    await flushPromises();
    expect(mocks.detail).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      "revision-2",
    );
    expect(
      wrapper
        .findAll("tag-stub")
        .some((tag) => tag.attributes("value") === "Используется публикациями"),
    ).toBe(true);

    await wrapper.find('button-stub[label="Загрузить ещё"]').trigger("click");
    await flushPromises();
    expect(mocks.page).toHaveBeenLastCalledWith("project-1", "event-key-1", {
      limit: 25,
      cursor: "revision-1",
    });
    expect(wrapper.text()).toContain("v1");
  });

  it("opens an exact immutable revision linked from Event Logs", async () => {
    const wrapper = shallowMount(EventDefinitionHistory, {
      props: {
        projectId: "project-1",
        event,
        initialRevisionId: "revision-1",
      },
      global: { stubs: { Dialog: { template: "<div><slot /></div>" } } },
    });
    await flushPromises();

    expect(mocks.detail).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      "revision-1",
    );
    expect(wrapper.text()).toContain("Версия v2");
  });

  it("closes and ignores stale revision responses after identity changes", async () => {
    let resolveFirst!: (value: {
      items: Array<typeof revision>;
      nextCursor: null;
    }) => void;
    mocks.page.mockReset().mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );
    const wrapper = shallowMount(EventDefinitionHistory, {
      props: { projectId: "project-1", event },
      global: { stubs: { Dialog: { template: "<div><slot /></div>" } } },
    });
    await wrapper.find('button-stub[label="История"]').trigger("click");
    await wrapper.setProps({
      projectId: "project-2",
      event: {
        ...event,
        projectId: "project-2",
        definitionKeyId: "event-key-2",
        metadata: { ...event.metadata, name: "Withdrawal" },
      },
    });
    resolveFirst({ items: [revision], nextCursor: null });
    await flushPromises();

    expect(wrapper.text()).not.toContain("3 публикации сценариев");
    expect(wrapper.find('[data-testid="event-revision-detail"]').exists()).toBe(
      false,
    );
  });
});
