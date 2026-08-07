import { flushPromises, mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
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
        lifecycle: "ACTIVE",
        policy: { enabled: true },
        metadata: { name: "Оплата завершена" },
        currentSchema: { revisionId: "revision-7" },
      },
    ]);
  });

  it("forwards a visually hidden label to the event picker", () => {
    const wrapper = mount(EventDefinitionSelect, {
      props: {
        projectId: "project-1",
        modelValue: "",
        hideLabel: true,
      },
      global: { plugins: [PrimeVue] },
    });

    expect(wrapper.get(".event-picker__label").classes()).toContain(
      "event-picker__label--visually-hidden",
    );
  });

  it("hydrates an existing selection and emits its current revision", async () => {
    const wrapper = mount(EventDefinitionSelect, {
      props: { projectId: "project-1", modelValue: "event-1" },
      global: { plugins: [PrimeVue] },
    });
    await flushPromises();

    expect(
      wrapper.get('[data-testid="event-picker-trigger"]').text(),
    ).toContain("Оплата завершена");

    await wrapper.get('[data-testid="event-picker-trigger"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="event-picker-option"]').trigger("click");
    await wrapper.get('[data-testid="event-picker-apply"]').trigger("click");

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
          lifecycle: "ACTIVE",
          policy: { enabled: true },
          metadata: { name: "Оплата завершена" },
          currentSchema: { revisionId: "revision-7" },
        },
      ]);
    const wrapper = mount(EventDefinitionSelect, {
      props: { projectId: "project-1", modelValue: "" },
      global: { plugins: [PrimeVue] },
    });

    await wrapper.get('[data-testid="event-picker-trigger"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="event-picker-retry"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Оплата завершена");
    expect(mocks.listDefinitions).toHaveBeenCalledTimes(2);
  });

  it("renders a compact event row with code and description", async () => {
    mocks.listDefinitions.mockResolvedValue([
      {
        definitionKeyId: "event-1",
        code: "PAYMENT_COMPLETED",
        lifecycle: "ACTIVE",
        policy: { enabled: true, clientIngestible: false },
        metadata: {
          name: "Оплата завершена",
          description: "Заказ успешно оплачен",
        },
        currentSchema: { revisionId: "revision-7", revisionNumber: 7 },
      },
    ]);
    const wrapper = mount(EventDefinitionSelect, {
      props: { projectId: "project-1", modelValue: "" },
      global: { plugins: [PrimeVue] },
    });
    await flushPromises();
    await wrapper.get('[data-testid="event-picker-trigger"]').trigger("click");
    await flushPromises();

    const option = wrapper.get('[data-testid="event-picker-option"]');
    const search = wrapper.get('input[type="search"]');

    expect(option.text()).toContain("PAYMENT_COMPLETED");
    expect(option.text()).toContain("Заказ успешно оплачен");
    expect(search.attributes("placeholder")).toContain("описание");
  });

  it("shows only enabled, non-archived events", async () => {
    mocks.listDefinitions.mockResolvedValue([
      {
        definitionKeyId: "active-event",
        code: "ACTIVE_EVENT",
        lifecycle: "ACTIVE",
        policy: { enabled: true },
        metadata: { name: "Активное событие" },
        currentSchema: { revisionId: "revision-1" },
      },
      {
        definitionKeyId: "disabled-event",
        code: "DISABLED_EVENT",
        lifecycle: "ACTIVE",
        policy: { enabled: false },
        metadata: { name: "Выключенное событие" },
        currentSchema: { revisionId: "revision-2" },
      },
      {
        definitionKeyId: "archived-event",
        code: "ARCHIVED_EVENT",
        lifecycle: "ARCHIVED",
        policy: { enabled: true },
        metadata: { name: "Архивное событие" },
        currentSchema: { revisionId: "revision-3" },
      },
    ]);
    const wrapper = mount(EventDefinitionSelect, {
      props: { projectId: "project-1", modelValue: "" },
      global: { plugins: [PrimeVue] },
    });

    await wrapper.get('[data-testid="event-picker-trigger"]').trigger("click");
    await flushPromises();

    expect(mocks.listDefinitions).toHaveBeenCalledWith("project-1", "ACTIVE");
    expect(wrapper.text()).toContain("Активное событие");
    expect(wrapper.text()).not.toContain("Выключенное событие");
    expect(wrapper.text()).not.toContain("Архивное событие");
  });

  it("finds an event by its description", async () => {
    vi.useFakeTimers();
    mocks.listDefinitions.mockResolvedValue([
      {
        definitionKeyId: "active-event",
        code: "PAYMENT_COMPLETED",
        lifecycle: "ACTIVE",
        policy: { enabled: true, clientIngestible: false },
        metadata: {
          name: "Оплата завершена",
          description: "Успешная оплата заказа",
        },
        currentSchema: { revisionId: "revision-1" },
      },
    ]);
    const wrapper = mount(EventDefinitionSelect, {
      props: { projectId: "project-1", modelValue: "" },
      global: { plugins: [PrimeVue] },
    });

    await wrapper.get('[data-testid="event-picker-trigger"]').trigger("click");
    await flushPromises();
    await wrapper.get('input[type="search"]').setValue("заказа");
    await vi.advanceTimersByTimeAsync(250);
    await flushPromises();

    expect(wrapper.text()).toContain("Оплата завершена");
    vi.useRealTimers();
  });
});
