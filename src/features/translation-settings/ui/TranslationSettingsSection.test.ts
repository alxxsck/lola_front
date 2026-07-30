import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TranslationSettingsSection from "./TranslationSettingsSection.vue";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/features/translation-settings/api/translation-settings.api", () => ({
  translationSettingsApi: {
    project: {
      get: mocks.get,
      update: mocks.put,
    },
  },
}));

describe("project translation settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const response = {
      availability: { available: true, reason: null },
      configRevision: "translation-1",
      projectVersion: 4,
      supportedLocales: ["ru", "de"],
      settings: {
        enabled: true,
        formality: "AUTO",
        glossary: [],
        inboundMode: "ON_DEMAND",
        outboundMode: "PREVIEW_REQUIRED",
        outgoingTone: "PROFESSIONAL",
        version: 1,
        workingLocale: "ru",
      },
    };
    mocks.get.mockResolvedValue(response);
    mocks.put.mockResolvedValue({ ...response, projectVersion: 5 });
  });

  it("объясняет on-demand входящие и обязательный preview исходящих", async () => {
    const wrapper = shallowMount(TranslationSettingsSection, {
      props: { projectId: "project-1", editable: true },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("по запросу");
    expect(wrapper.text()).toContain("проверки перед отправкой");
  });

  it("сохраняет tone и formality с project version", async () => {
    const wrapper = shallowMount(TranslationSettingsSection, {
      props: { projectId: "project-1", editable: true },
    });
    await flushPromises();
    await wrapper
      .get('[data-testid="save-translation-settings"]')
      .trigger("click");
    await flushPromises();

    expect(mocks.put).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        expectedProjectVersion: 4,
        outgoingTone: "PROFESSIONAL",
        formality: "AUTO",
        inboundMode: "ON_DEMAND",
        outboundMode: "PREVIEW_REQUIRED",
      }),
    );
  });
});
