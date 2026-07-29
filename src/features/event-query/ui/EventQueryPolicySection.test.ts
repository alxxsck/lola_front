import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eventQueryRepository } from "../api/event-query-repository";
import EventQueryPolicySection from "./EventQueryPolicySection.vue";

vi.mock("../api/event-query-repository", () => ({
  eventQueryRepository: {
    getPolicy: vi.fn(),
    patchProject: vi.fn(),
    publish: vi.fn(),
    usage: vi.fn(),
    listItems: vi.fn(),
    preview: vi.fn(),
  },
}));

const state = {
  counts: {
    configuredDraftItems: 12,
    enabledDraftItems: 8,
    endUserConversationDraftItems: 3,
  },
  currentRevision: {
    id: "policy-1",
    version: 2,
    publishedAt: "2026-07-28T10:00:00.000Z",
    itemCount: 8,
  },
  diagnostics: [],
  masterEnabled: true,
  version: 4,
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
    vi.mocked(eventQueryRepository.patchProject).mockResolvedValue({
      version: 5,
      masterEnabled: false,
      currentRevisionId: null,
      updatedAt: "2026-07-28T11:00:00.000Z",
    });
    vi.mocked(eventQueryRepository.publish).mockResolvedValue({
      id: "policy-2",
      version: 3,
      publishedAt: "2026-07-28T11:00:00.000Z",
      compilerVersion: "1",
      documentHash: "hash-2",
      document: { enabled: false, items: [] },
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
    vi.mocked(eventQueryRepository.getPolicy)
      .mockResolvedValueOnce(structuredClone(state))
      .mockResolvedValueOnce({
        ...structuredClone(state),
        masterEnabled: false,
        version: 5,
      });
    const wrapper = mountSection();
    await flushPromises();

    await wrapper.get('.master-control input[type="checkbox"]').setValue(false);
    await wrapper.get('button[data-test="apply-policy"]').trigger("click");
    await flushPromises();

    expect(eventQueryRepository.patchProject).toHaveBeenCalledWith(
      "project-1",
      { expectedVersion: 4, masterEnabled: false },
    );
    expect(eventQueryRepository.publish).toHaveBeenCalledWith("project-1", {
      expectedVersion: 5,
    });
    expect(wrapper.text()).not.toContain("Опубликовать");
  });

  it("reloads isolated state when the active Project changes", async () => {
    vi.mocked(eventQueryRepository.getPolicy)
      .mockResolvedValueOnce(structuredClone(state))
      .mockResolvedValueOnce({
        ...structuredClone(state),
        masterEnabled: false,
        version: 1,
        currentRevision: null,
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
});
