import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import { eventQueryRepository } from "../api/event-query-repository";
import EventQueryPolicySection from "./EventQueryPolicySection.vue";

vi.mock("../api/event-query-repository", () => ({
  eventQueryRepository: {
    applyProject: vi.fn(),
    getPolicy: vi.fn(),
    listItems: vi.fn(),
    preview: vi.fn(),
  },
}));

const state = {
  concurrencyToken: "eq-project-v1.initial",
  configured: { masterEnabled: true },
  diagnostics: [],
  effective: { masterEnabled: true },
};

function mountSection() {
  return mount(EventQueryPolicySection, {
    props: {
      projectId: "project-1",
      canManage: true,
      canPreview: true,
    },
    global: {
      stubs: {
        Button: {
          props: ["label", "disabled", "loading"],
          emits: ["click"],
          template:
            '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
        },
        Message: { template: '<div class="message"><slot /></div>' },
        ProjectSettingsSectionHeader: {
          template:
            '<div><h2>Доступ AI к событиям</h2><slot name="actions" /></div>',
        },
        ToggleSwitch: {
          props: ["modelValue", "disabled"],
          emits: ["update:modelValue"],
          template:
            '<input type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
        },
        EventQueryPreview: { template: '<div data-test="preview" />' },
      },
    },
  });
}

describe("EventQueryPolicySection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(eventQueryRepository.getPolicy).mockResolvedValue(
      structuredClone(state),
    );
    vi.mocked(eventQueryRepository.applyProject).mockResolvedValue({
      concurrencyToken: "eq-project-v1.applied",
      configured: { masterEnabled: false },
      diagnostics: [],
      effective: { masterEnabled: false },
    });
  });

  it("shows only the master switch and safe preview", async () => {
    const wrapper = mountSection();
    await flushPromises();

    expect(wrapper.text()).toContain("Разрешить AI получать данные событий");
    expect(wrapper.find('[data-test="preview"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("ревизия");
    expect(wrapper.text()).not.toContain("Настроено событий");
    expect(wrapper.text()).not.toContain("Запросы за 30 дней");
  });

  it("applies the Project master setting behind one action", async () => {
    const wrapper = mountSection();
    await flushPromises();

    await wrapper.get('.master-control input[type="checkbox"]').setValue(false);
    await wrapper.get('button[data-test="apply-policy"]').trigger("click");
    await flushPromises();

    expect(eventQueryRepository.applyProject).toHaveBeenCalledWith(
      "project-1",
      {
        concurrencyToken: "eq-project-v1.initial",
        masterEnabled: false,
      },
    );
    expect(eventQueryRepository.getPolicy).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).not.toContain("Опубликовать");
  });

  it("reloads isolated state when the active Project changes", async () => {
    vi.mocked(eventQueryRepository.getPolicy)
      .mockResolvedValueOnce(structuredClone(state))
      .mockResolvedValueOnce({
        ...structuredClone(state),
        concurrencyToken: "eq-project-v1.project-2",
        configured: { masterEnabled: false },
        effective: { masterEnabled: false },
      });
    const wrapper = mountSection();
    await flushPromises();

    await wrapper.setProps({ projectId: "project-2" });
    await flushPromises();

    expect(eventQueryRepository.getPolicy).toHaveBeenLastCalledWith(
      "project-2",
    );
    expect(
      (
        wrapper.get('.master-control input[type="checkbox"]')
          .element as HTMLInputElement
      ).checked,
    ).toBe(false);
  });

  it("keeps the local choice and retries with the replacement token after 409", async () => {
    vi.mocked(eventQueryRepository.applyProject)
      .mockRejectedValueOnce(
        new ApiError(409, "Conflict", {
          current: {
            ...structuredClone(state),
            concurrencyToken: "eq-project-v1.current",
          },
        }),
      )
      .mockResolvedValueOnce({
        concurrencyToken: "eq-project-v1.applied",
        configured: { masterEnabled: false },
        diagnostics: [],
        effective: { masterEnabled: false },
      });
    const wrapper = mountSection();
    await flushPromises();

    await wrapper.get('.master-control input[type="checkbox"]').setValue(false);
    await wrapper.get('button[data-test="apply-policy"]').trigger("click");
    await flushPromises();

    expect(
      (
        wrapper.get('.master-control input[type="checkbox"]')
          .element as HTMLInputElement
      ).checked,
    ).toBe(false);
    expect(wrapper.text()).toContain("другой администратор");

    await wrapper.get('button[data-test="apply-policy"]').trigger("click");
    await flushPromises();

    expect(eventQueryRepository.applyProject).toHaveBeenLastCalledWith(
      "project-1",
      {
        concurrencyToken: "eq-project-v1.current",
        masterEnabled: false,
      },
    );
  });
});
