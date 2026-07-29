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
      canReadCatalog: true,
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
        RouterLink: { template: "<a><slot /></a>" },
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
    vi.mocked(eventQueryRepository.usage).mockResolvedValue({
      from: "2026-06-28T00:00:00.000Z",
      to: "2026-07-28T00:00:00.000Z",
      scope: { endUserId: null, audience: null },
      calls: 3,
      estimatedAddedInputTokens: 72,
      resultBytes: 288,
      byOrigin: {},
      byAudience: {},
    });
  });

  it("shows only master state, counts, usage and navigation to Events", async () => {
    const wrapper = mountSection();
    await flushPromises();

    expect(wrapper.text()).toContain("Опубликована ревизия 2");
    expect(wrapper.text()).toContain("12");
    expect(wrapper.text()).toContain("8");
    expect(wrapper.text()).toContain("3");
    expect(wrapper.text()).toContain("Настроить события");
    expect(wrapper.find('[data-test="policy-description"]').exists()).toBe(
      false,
    );
  });

  it("patches and publishes only the Project master setting", async () => {
    const wrapper = mountSection();
    await flushPromises();

    await wrapper.get('.master-control input[type="checkbox"]').setValue(false);
    await wrapper.get('button[data-test="save-policy"]').trigger("click");
    await flushPromises();

    expect(eventQueryRepository.patchProject).toHaveBeenCalledWith(
      "project-1",
      { expectedVersion: 4, masterEnabled: false },
    );

    await wrapper.get('button[data-test="publish-policy"]').trigger("click");
    await flushPromises();
    expect(eventQueryRepository.publish).toHaveBeenCalledWith("project-1", {
      expectedVersion: 5,
    });
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
