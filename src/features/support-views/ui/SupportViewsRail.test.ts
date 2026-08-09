import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SupportViewsRail from "./SupportViewsRail.vue";

const freshness = {
  state: "READY" as const,
  lagSeconds: 0,
  indexedThrough: "2026-08-08T00:00:00Z",
  sourceWatermarks: {},
};
const saved = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "priority",
  scope: "PERSONAL" as const,
  lifecycle: "ACTIVE" as const,
  version: 1,
  etag: '"sv1"',
  ownerTeamId: null,
  draft: {
    schemaVersion: 1 as const,
    surface: "CASES" as const,
    displayName: "Приоритетные платежи",
    columns: [],
    filters: {},
    sort: { field: "PRIORITY" as const, direction: "DESC" as const },
  },
  publishedRevision: null,
  permissions: {
    read: true,
    replaceDraft: false,
    publish: true,
    archive: false,
  },
  count: { state: "LOWER_BOUND" as const, value: 12, cappedAt: 100 },
  freshness,
};

describe("SupportViewsRail", () => {
  it("renders server-owned lower-bound counts and only permitted actions", () => {
    const wrapper = mount(SupportViewsRail, {
      props: {
        system: [],
        saved: [saved],
        selection: { kind: "SAVED", id: saved.id },
        searchScope: "CASES",
        canCreate: true,
        canManageAll: false,
        mutating: false,
        conflict: "",
      },
    });
    expect(wrapper.text()).toContain("≥12");
    expect(wrapper.text()).toContain("Опубликовать");
    expect(wrapper.text()).not.toContain("В архив");
    expect(wrapper.text()).not.toContain("Переименовать");
  });

  it("does not invent a number when count is unavailable", () => {
    const unavailable = {
      ...saved,
      count: { state: "UNAVAILABLE" as const, value: null, cappedAt: 100 },
    };
    const wrapper = mount(SupportViewsRail, {
      props: {
        system: [],
        saved: [unavailable],
        selection: null,
        searchScope: "CASES",
        canCreate: false,
        canManageAll: false,
        mutating: false,
        conflict: "",
      },
    });
    expect(wrapper.text()).not.toContain("100");
  });

  it("shows server-owned degraded freshness for a saved view", () => {
    const degraded = {
      ...saved,
      freshness: {
        ...saved.freshness,
        state: "DEGRADED" as const,
        lagSeconds: 45,
      },
    };
    const wrapper = mount(SupportViewsRail, {
      props: {
        system: [],
        saved: [degraded],
        selection: null,
        searchScope: "CASES",
        canCreate: false,
        canManageAll: false,
        mutating: false,
        conflict: "",
      },
    });
    expect(wrapper.find('[title="Индекс отстаёт"]').exists()).toBe(true);
  });

  it("uses a readable title for a system view whose index is rebuilding", () => {
    const system = {
      code: "MY_ACTIVE",
      count: { state: "EXACT", value: 1, cappedAt: 100 },
      freshness: { ...freshness, state: "BUILDING" },
    } as never;
    const wrapper = mount(SupportViewsRail, {
      props: {
        system: [system],
        saved: [],
        selection: null,
        searchScope: "CASES",
        canCreate: false,
        canManageAll: false,
        mutating: false,
        conflict: "",
      },
    });
    expect(wrapper.find('[title="Индекс обновляется"]').exists()).toBe(true);
  });

  it("renders one default action for an active saved view", () => {
    const replaceable = {
      ...saved,
      permissions: { ...saved.permissions, replaceDraft: true },
    };
    const wrapper = mount(SupportViewsRail, {
      props: {
        system: [],
        saved: [replaceable],
        selection: { kind: "SAVED", id: replaceable.id },
        searchScope: "CASES",
        canCreate: true,
        canManageAll: false,
        mutating: false,
        conflict: "",
      },
    });
    expect(
      wrapper
        .findAll("button")
        .filter((button) => button.text().includes("умолчанию")),
    ).toHaveLength(1);
  });

  it("opens an explicit custom-search mode before exposing Save", async () => {
    const wrapper = mount(SupportViewsRail, {
      props: {
        system: [],
        saved: [],
        selection: { kind: "SYSTEM", code: "MY_ACTIVE" },
        searchScope: "CASES",
        canCreate: true,
        canManageAll: false,
        mutating: false,
        conflict: "",
      },
    });
    expect(wrapper.text()).toContain("Новый поиск");
    expect(wrapper.text()).not.toContain("Сохранить");

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Новый поиск"))!
      .trigger("click");
    expect(wrapper.emitted("customSearch")).toHaveLength(1);

    await wrapper.setProps({ selection: null });
    expect(wrapper.text()).toContain("Сохранить");
  });

  it("clears rename state when the active saved view changes", async () => {
    const replaceable = {
      ...saved,
      permissions: { ...saved.permissions, replaceDraft: true },
    };
    const other = {
      ...replaceable,
      id: "33333333-3333-4333-8333-333333333333",
      draft: { ...replaceable.draft, displayName: "Другой вид" },
    };
    const wrapper = mount(SupportViewsRail, {
      props: {
        system: [],
        saved: [replaceable, other],
        selection: { kind: "SAVED", id: replaceable.id },
        searchScope: "CASES",
        canCreate: true,
        canManageAll: false,
        mutating: false,
        conflict: "",
      },
    });
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Переименовать"))!
      .trigger("click");
    expect(wrapper.find(".rename-form").exists()).toBe(true);

    await wrapper.setProps({ selection: { kind: "SAVED", id: other.id } });

    expect(wrapper.find(".rename-form").exists()).toBe(false);
  });
});
