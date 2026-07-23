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
      props: {
        projectId: "project-1",
        endUserId: "user-1",
        userLabel: "customer-42",
        editable: false,
      },
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

  it("не показывает запоздалый ответ памяти другого пользователя", async () => {
    let resolveFirst:
      ((value: { items: Array<Record<string, unknown>> }) => void) | undefined;
    mocks.list
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockResolvedValueOnce({
        items: [
          {
            id: "fact-2",
            category: "INTEREST",
            key: "game",
            value: "Пользователь 2 любит го",
            sourceMessageId: "message-2",
            sourceObservedAt: "2026-07-21T12:00:00.000Z",
            expiresAt: "2027-07-21T12:00:00.000Z",
            createdAt: "2026-07-21T12:00:00.000Z",
            updatedAt: "2026-07-21T12:00:00.000Z",
          },
        ],
      });
    const wrapper = mount(UserMemoryPanel, {
      props: {
        projectId: "project-1",
        endUserId: "user-1",
        userLabel: "customer-1",
        editable: false,
      },
      global: {
        stubs: {
          Button: true,
          Message: { template: "<div><slot /></div>" },
          Dialog: true,
        },
      },
    });

    await wrapper.setProps({ endUserId: "user-2", userLabel: "customer-2" });
    await flushPromises();
    resolveFirst?.({
      items: [
        {
          id: "fact-1",
          category: "INTEREST",
          key: "game",
          value: "Секрет пользователя 1",
          sourceMessageId: "message-1",
          sourceObservedAt: "2026-07-20T12:00:00.000Z",
          expiresAt: "2027-07-20T12:00:00.000Z",
          createdAt: "2026-07-20T12:00:00.000Z",
          updatedAt: "2026-07-20T12:00:00.000Z",
        },
      ],
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Пользователь 2 любит го");
    expect(wrapper.text()).not.toContain("Секрет пользователя 1");
  });

  it("не очищает память нового пользователя после запоздалого clear", async () => {
    let resolveClear: (() => void) | undefined;
    mocks.list
      .mockResolvedValueOnce({
        items: [
          {
            id: "fact-1",
            category: "INTEREST",
            key: "game",
            value: "Пользователь 1 любит шахматы",
            sourceMessageId: "message-1",
            sourceObservedAt: "2026-07-20T12:00:00.000Z",
            expiresAt: "2027-07-20T12:00:00.000Z",
            createdAt: "2026-07-20T12:00:00.000Z",
            updatedAt: "2026-07-20T12:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "fact-2",
            category: "INTEREST",
            key: "game",
            value: "Пользователь 2 любит го",
            sourceMessageId: "message-2",
            sourceObservedAt: "2026-07-21T12:00:00.000Z",
            expiresAt: "2027-07-21T12:00:00.000Z",
            createdAt: "2026-07-21T12:00:00.000Z",
            updatedAt: "2026-07-21T12:00:00.000Z",
          },
        ],
      });
    mocks.clear.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveClear = resolve;
      }),
    );
    const wrapper = mount(UserMemoryPanel, {
      props: {
        projectId: "project-1",
        endUserId: "user-1",
        userLabel: "customer-1",
        editable: true,
      },
      global: {
        stubs: {
          Button: true,
          Message: { template: "<div><slot /></div>" },
          Dialog: true,
        },
      },
    });
    await flushPromises();
    const clearing = (
      wrapper.vm as unknown as { clear: () => Promise<void> }
    ).clear();
    await wrapper.setProps({ endUserId: "user-2", userLabel: "customer-2" });
    await flushPromises();
    resolveClear?.();
    await clearing;
    await flushPromises();

    expect(wrapper.text()).toContain("Пользователь 2 любит го");
  });
});
