import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AIReviewSettingsSection from "./AIReviewSettingsSection.vue";

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));

vi.mock("../api/ai-review-repository", () => ({
  aiReviewRepository: {
    getSettings: mocks.get,
    updateSettings: mocks.update,
  },
}));

describe("настройки AI Review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({
      projectVersion: 4,
      enabled: false,
      dailyRunLimit: 25,
      limits: { dailyRunLimit: { min: 1, max: 1000 } },
    });
  });

  it("явно сообщает, что платные запуски выключены по умолчанию", async () => {
    const wrapper = mount(AIReviewSettingsSection, {
      props: { projectId: "project-1", editable: false },
      global: {
        stubs: {
          Button: true,
          InputNumber: true,
          Message: { template: "<div><slot /></div>" },
          ToggleSwitch: true,
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("AI Review выключен");
    expect(wrapper.text()).toContain("новые платные запуски недоступны");
  });
});
