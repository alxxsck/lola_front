import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserMemoryPanel from "./UserMemoryPanel.vue";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
}));

vi.mock("../api/user-memory-repository", () => ({
  userMemoryRepository: {
    listFacts: mocks.list,
    deleteFact: mocks.remove,
    clearFacts: mocks.clear,
  },
}));

describe("панель User Memory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({
      items: [
        {
          id: "fact-1",
          category: "INTEREST",
          key: "favorite_game",
          value: "Любит шахматы",
          sourceMessageId: "message-1",
          sourceObservedAt: "2026-07-20T12:00:00.000Z",
          expiresAt: "2027-07-20T12:00:00.000Z",
          createdAt: "2026-07-20T12:00:00.000Z",
          updatedAt: "2026-07-20T12:00:00.000Z",
        },
      ],
    });
  });

  it("показывает атомарный факт и provenance без исходного текста сообщения", async () => {
    const wrapper = mount(UserMemoryPanel, {
      props: { projectId: "project-1", endUserId: "user-1", editable: false },
      global: {
        stubs: {
          Button: true,
          Message: { template: "<div><slot /></div>" },
          ConfirmDialog: true,
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Любит шахматы");
    expect(wrapper.text()).toContain("Интерес");
    expect(wrapper.text()).toContain("20 июл. 2026");
    expect(wrapper.text()).not.toContain("message-1");
  });
});
