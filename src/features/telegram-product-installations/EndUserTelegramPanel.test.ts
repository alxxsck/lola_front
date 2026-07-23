import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EndUserTelegramPanel from "./EndUserTelegramPanel.vue";

const mocks = vi.hoisted(() => ({
  getEndUserSummary: vi.fn(),
}));

vi.mock("./telegram-product-installations.api", () => ({
  telegramProductInstallationsApi: mocks,
}));

const summary = (overrides: Record<string, unknown> = {}) => ({
  linked: true,
  status: "ACTIVE",
  effectiveStatus: "ACTIVE",
  displayName: "Lola Customer",
  username: "lola_customer",
  linkedAt: "2026-07-23T12:00:00.000Z",
  revokedAt: null,
  activeLink: {
    status: "ACTIVE",
    linkedAt: "2026-07-23T12:00:00.000Z",
    displayName: "Lola Customer",
    username: "lola_customer",
  },
  pendingCandidate: null,
  ...overrides,
});

function mountPanel(
  props: Partial<{
    visible: boolean;
    projectId: string;
    endUserId: string | null;
    canRead: boolean;
  }> = {},
) {
  return mount(EndUserTelegramPanel, {
    props: {
      visible: true,
      projectId: "project-1",
      endUserId: "end-user-1",
      canRead: true,
      ...props,
    },
  });
}

describe("EndUserTelegramPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEndUserSummary.mockResolvedValue(summary());
  });

  it.each([
    ["UNLINKED", "Не подключён"],
    ["PENDING_CONFIRMATION", "Ожидает подтверждения"],
    ["ACTIVE", "Подключён"],
    ["BLOCKED", "Бот заблокирован"],
    ["REVOKED", "Отключён"],
  ])("shows %s using only safe display snapshots", async (effectiveStatus, copy) => {
    mocks.getEndUserSummary.mockResolvedValue(
      summary({
        linked: effectiveStatus === "ACTIVE",
        effectiveStatus,
        displayName: "Safe Name",
        username: "safe_name",
        activeLink: effectiveStatus === "UNLINKED" ? null : summary().activeLink,
        pendingCandidate:
          effectiveStatus === "PENDING_CONFIRMATION"
            ? {
                status: "PENDING_CONFIRMATION",
                displayName: "Safe Name",
                username: "safe_name",
                expiresAt: "2026-07-23T12:05:00.000Z",
              }
            : null,
      }),
    );
    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.text()).toContain(copy);
    expect(wrapper.text()).toContain("Safe Name");
    expect(wrapper.text()).toContain("@safe_name");
    expect(wrapper.text()).not.toMatch(/\b7001\b/u);
  });

  it("does not load without permission and clears immediately on permission loss", async () => {
    const wrapper = mountPanel({ canRead: false });
    await flushPromises();
    expect(mocks.getEndUserSummary).not.toHaveBeenCalled();
    expect(wrapper.find("section").exists()).toBe(false);

    await wrapper.setProps({ canRead: true });
    await flushPromises();
    expect(wrapper.text()).toContain("Lola Customer");
    await wrapper.setProps({ canRead: false });
    expect(wrapper.find("section").exists()).toBe(false);
  });

  it("distinguishes loading and unavailable from an unlinked user and supports retry", async () => {
    let rejectLoad!: (cause: Error) => void;
    mocks.getEndUserSummary.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectLoad = reject;
      }),
    );
    const wrapper = mountPanel();
    await wrapper.vm.$nextTick();

    expect(wrapper.get("header strong").text()).toBe("Загрузка");
    expect(wrapper.get("header strong").attributes("data-status")).toBe(
      "LOADING",
    );
    expect(wrapper.text()).not.toContain("Не подключён");

    rejectLoad(new Error("provider raw details"));
    await flushPromises();
    expect(wrapper.get("header strong").text()).toBe("Недоступно");
    expect(wrapper.get("header strong").attributes("data-status")).toBe(
      "UNAVAILABLE",
    );
    expect(wrapper.text()).not.toContain("Не подключён");
    expect(wrapper.text()).not.toContain("provider raw details");

    mocks.getEndUserSummary.mockResolvedValueOnce(summary());
    await wrapper.get('button[data-action="retry-telegram-summary"]').trigger(
      "click",
    );
    await flushPromises();
    expect(wrapper.get("header strong").text()).toBe("Подключён");
  });

  it("uses the nested pending candidate snapshot before confirmation", async () => {
    mocks.getEndUserSummary.mockResolvedValue(
      summary({
        linked: false,
        status: null,
        effectiveStatus: "PENDING_CONFIRMATION",
        displayName: null,
        username: null,
        activeLink: null,
        pendingCandidate: {
          status: "PENDING_CONFIRMATION",
          displayName: "Pending Candidate",
          username: "pending_candidate",
          expiresAt: "2026-07-23T12:05:00.000Z",
        },
      }),
    );
    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.text()).toContain("Pending Candidate");
    expect(wrapper.text()).toContain("@pending_candidate");
    expect(wrapper.text()).toContain("Ожидает до");
  });

  it("fences stale responses across visibility, project and end-user changes", async () => {
    let resolveOld!: (value: ReturnType<typeof summary>) => void;
    mocks.getEndUserSummary.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    mocks.getEndUserSummary.mockImplementation(
      (projectId: string, endUserId: string) =>
        Promise.resolve(
          summary({
            displayName:
              projectId === "project-2" && endUserId === "end-user-2"
                ? "Current User"
                : "Unexpected User",
          }),
        ),
    );
    const wrapper = mountPanel();
    await wrapper.setProps({
      projectId: "project-2",
      endUserId: "end-user-2",
    });
    await flushPromises();
    resolveOld(summary({ displayName: "Stale User" }));
    await flushPromises();

    expect(wrapper.text()).toContain("Current User");
    expect(wrapper.text()).not.toContain("Stale User");

    await wrapper.setProps({ visible: false });
    expect(wrapper.text()).not.toContain("Current User");
  });
});
