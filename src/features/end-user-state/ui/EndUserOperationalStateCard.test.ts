import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EndUserOperationalStateCard from "./EndUserOperationalStateCard.vue";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  history: vi.fn(),
  put: vi.fn(),
}));
vi.mock("../api/end-user-state-repository", () => ({
  endUserStateRepository: mocks,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function state(projectId: string, endUserId: string, label: string) {
  return {
    projectId,
    endUserId,
    items: [
      {
        definition: {
          key: "cms.tags",
          version: 1,
          owner: "CMS_MANAGED",
          classification: "INTERNAL",
          schema: { type: "array", items: { type: "string" } },
          label: { ru: label, en: label },
          description: { ru: "Внутренние теги", en: "Internal tags" },
          writable: true,
        },
        current: null,
      },
    ],
  } as const;
}

describe("EndUserOperationalStateCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders localized registry definitions and ignores a late prior-user response", async () => {
    const first = deferred<ReturnType<typeof state>>();
    const second = deferred<ReturnType<typeof state>>();
    mocks.get
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const wrapper = mount(EndUserOperationalStateCard, {
      props: { projectId: "project-1", endUserId: "user-1", canManage: true },
    });

    await wrapper.setProps({ endUserId: "user-2" });
    second.resolve(state("project-1", "user-2", "Current user tags"));
    await flushPromises();
    first.resolve(state("project-1", "user-1", "Stale user tags"));
    await flushPromises();

    expect(wrapper.text()).toContain("Current user tags");
    expect(wrapper.text()).toContain("Internal tags");
    expect(wrapper.text()).not.toContain("Stale user tags");
    expect(wrapper.get("button").attributes("disabled")).toBeUndefined();
  });
});
