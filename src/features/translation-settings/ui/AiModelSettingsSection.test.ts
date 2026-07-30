import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AiModelSettingsSection from "./AiModelSettingsSection.vue";

const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  catalog: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/features/translation-settings/api/translation-settings.api", () => ({
  translationSettingsApi: {
    aiModels: {
      settings: mocks.settings,
      catalog: mocks.catalog,
      update: mocks.update,
    },
  },
}));

const profile = (modelId: string, reasoningEffort: "none" | "low") => ({
  modelId,
  reasoningEffort,
  configRevision: "config-1",
  source: "PROJECT",
});

describe("AI model settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings.mockResolvedValue({
      projectVersion: 7,
      resolved: {
        assistant: profile("grok-4.3", "low"),
        translation: profile("grok-4.3", "low"),
      },
      saved: null,
    });
    mocks.catalog.mockImplementation(
      (_projectId: string, { workload }: { workload: string }) =>
        Promise.resolve({
          workload,
          stale: false,
          fetchedAt: "2026-07-30T10:00:00.000Z",
          maxStaleAt: "2026-07-30T11:00:00.000Z",
          items: [
            {
              id: "grok-4.3",
              displayName: "Grok 4.3",
              workload,
              selectable: true,
              lolaTested: true,
              providerAvailable: true,
              reasoningRequired: false,
              reasoningEfforts: ["none", "low", "medium", "high"],
              inputPricePerMillion: "0",
              cachedInputPricePerMillion: "0",
              outputPricePerMillion: "0",
            },
          ],
        }),
    );
    mocks.update.mockResolvedValue({
      projectVersion: 8,
      resolved: {
        assistant: profile("grok-4.3", "low"),
        translation: profile("grok-4.3", "low"),
      },
      saved: null,
    });
  });

  it("явно показывает отдельные модели и reasoning для переводов", async () => {
    const wrapper = shallowMount(AiModelSettingsSection, {
      props: { projectId: "project-1", editable: true },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Основная модель");
    expect(wrapper.text()).toContain("Модель переводов");
    expect(wrapper.text()).toContain("Reasoning");
  });

  it("сохраняет assistant и translation одним versioned запросом", async () => {
    const wrapper = shallowMount(AiModelSettingsSection, {
      props: { projectId: "project-1", editable: true },
    });
    await flushPromises();

    await wrapper
      .get('[data-testid="save-ai-model-settings"]')
      .trigger("click");
    await flushPromises();

    expect(mocks.update).toHaveBeenCalledWith("project-1", {
      assistant: { modelId: "grok-4.3", reasoningEffort: "low" },
      translation: { modelId: "grok-4.3", reasoningEffort: "low" },
      expectedProjectVersion: 7,
    });
  });

  it("не предлагает none для модели с обязательным reasoning", async () => {
    mocks.catalog.mockImplementation(
      (_projectId: string, { workload }: { workload: string }) =>
        Promise.resolve({
          workload,
          stale: false,
          items: [
            {
              id: "grok-4.3",
              displayName: "Grok 4.3",
              workload,
              selectable: true,
              lolaTested: true,
              providerAvailable: true,
              reasoningRequired: true,
              reasoningEfforts: ["none", "low", "medium", "high"],
              inputPricePerMillion: "0",
              cachedInputPricePerMillion: "0",
              outputPricePerMillion: "0",
            },
          ],
        }),
    );
    const wrapper = shallowMount(AiModelSettingsSection, {
      props: { projectId: "project-1", editable: true },
    });
    await flushPromises();

    const vm = wrapper.vm as unknown as {
      reasoningOptions(
        key: "assistant" | "translation",
        workload: "ASSISTANT" | "TRANSLATION",
      ): Array<{ label: string; value: string }>;
    };
    const effortOptions = [
      vm.reasoningOptions("assistant", "ASSISTANT"),
      vm.reasoningOptions("translation", "TRANSLATION"),
    ];

    expect(effortOptions).toHaveLength(2);
    expect(effortOptions.flat()).not.toContainEqual(
      expect.objectContaining({ value: "none" }),
    );
    expect(wrapper.text()).toContain("reasoning обязателен");
  });

  it("при выборе reasoning-required модели автоматически включает совместимый effort", async () => {
    mocks.catalog.mockImplementation(
      (_projectId: string, { workload }: { workload: string }) =>
        Promise.resolve({
          workload,
          stale: false,
          items: [
            {
              id: "grok-4.3",
              displayName: "Grok 4.3",
              workload,
              selectable: true,
              lolaTested: true,
              providerAvailable: true,
              reasoningRequired: false,
              reasoningEfforts: ["none", "low"],
              inputPricePerMillion: "0",
              cachedInputPricePerMillion: "0",
              outputPricePerMillion: "0",
            },
            {
              id: "grok-4.5",
              displayName: "Grok 4.5",
              workload,
              selectable: true,
              lolaTested: true,
              providerAvailable: true,
              reasoningRequired: true,
              reasoningEfforts: ["none", "low", "medium"],
              inputPricePerMillion: "0",
              cachedInputPricePerMillion: "0",
              outputPricePerMillion: "0",
            },
          ],
        }),
    );
    mocks.settings.mockResolvedValue({
      projectVersion: 7,
      resolved: {
        assistant: profile("grok-4.3", "none"),
        translation: profile("grok-4.3", "none"),
      },
      saved: null,
    });
    const wrapper = shallowMount(AiModelSettingsSection, {
      props: { projectId: "project-1", editable: true },
    });
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      form: {
        translation: { modelId: string; reasoningEffort: string };
      };
      normalizeReasoning(key: "translation", workload: "TRANSLATION"): void;
    };

    vm.form.translation.modelId = "grok-4.5";
    vm.normalizeReasoning("translation", "TRANSLATION");

    expect(vm.form.translation.reasoningEffort).toBe("low");
  });
});
