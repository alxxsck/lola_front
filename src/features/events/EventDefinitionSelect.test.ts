import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EventDefinitionSelect from "./EventDefinitionSelect.vue";

const mocks = vi.hoisted(() => ({ listDefinitions: vi.fn() }));

vi.mock("@/shared/api/repository/event-catalog", () => ({
  eventCatalogRepository: { listDefinitions: mocks.listDefinitions },
}));

describe("EventDefinitionSelect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listDefinitions.mockResolvedValue([
      {
        definitionKeyId: "event-1",
        code: "PAYMENT_COMPLETED",
        metadata: { name: "Оплата завершена" },
        currentSchema: { revisionId: "revision-7" },
      },
    ]);
  });

  it("hydrates an existing selection and emits its current revision", async () => {
    const wrapper = mount(EventDefinitionSelect, {
      props: { projectId: "project-1", modelValue: "event-1" },
    });
    await flushPromises();

    expect(
      wrapper.get('[data-testid="paged-search-trigger"]').text(),
    ).toContain("Оплата завершена");

    await wrapper.get('[data-testid="paged-search-trigger"]').trigger("click");
    await flushPromises();
    await wrapper.get('[role="option"]').trigger("click");

    expect(wrapper.emitted("select")).toEqual([
      [
        {
          definitionKeyId: "event-1",
          currentRevisionId: "revision-7",
          name: "Оплата завершена",
          code: "PAYMENT_COMPLETED",
        },
      ],
    ]);
  });

  it("retries the catalog request after a transient failure", async () => {
    mocks.listDefinitions
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce([
        {
          definitionKeyId: "event-1",
          code: "PAYMENT_COMPLETED",
          metadata: { name: "Оплата завершена" },
          currentSchema: { revisionId: "revision-7" },
        },
      ]);
    const wrapper = mount(EventDefinitionSelect, {
      props: { projectId: "project-1", modelValue: "" },
    });

    await wrapper.get('[data-testid="paged-search-trigger"]').trigger("click");
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Повторить"))!
      .trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Оплата завершена");
    expect(mocks.listDefinitions).toHaveBeenCalledTimes(2);
  });

  it("renders a neutral option row and a single-border search field", async () => {
    const wrapper = mount(EventDefinitionSelect, {
      props: { projectId: "project-1", modelValue: "" },
    });
    await flushPromises();
    await wrapper.get('[data-testid="paged-search-trigger"]').trigger("click");
    await flushPromises();

    const option = wrapper.get('[role="option"]');
    const search = wrapper.get('input[type="search"]');

    expect(option.classes()).toContain("paged-search-select__option");
    expect(option.find("strong").exists()).toBe(false);
    expect(search.classes()).toContain("paged-search-select__search-input");
  });
});
