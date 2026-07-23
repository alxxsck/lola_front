import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserMemorySettingsSection from "./UserMemorySettingsSection.vue";

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));

vi.mock("../api/user-memory-repository", () => ({
  userMemoryRepository: {
    getSettings: mocks.get,
    updateSettings: mocks.update,
  },
}));
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: vi.fn() }) }));

describe("настройки User Memory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({
      projectVersion: 3,
      enabled: false,
      dailyExtractionCallLimit: 1000,
      factTtlDays: 365,
      limits: {
        dailyExtractionCallLimit: { min: 1, max: 100000 },
        factTtlDays: { min: 1, max: 3650 },
      },
    });
  });

  it("объясняет, что выключение приостанавливает память без удаления", async () => {
    const wrapper = mount(UserMemorySettingsSection, {
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

    expect(wrapper.text()).toContain("Память приостановлена");
    expect(wrapper.text()).toContain("Сохранённые факты не удаляются");
    expect(wrapper.find(".settings-editor").exists()).toBe(true);
    expect(wrapper.find(".settings-fields").exists()).toBe(true);
    expect(wrapper.find(".settings-actions").exists()).toBe(true);
  });

  it("сохраняет настройки из отдельного action-footer", async () => {
    mocks.update.mockResolvedValue({
      projectVersion: 4,
      enabled: false,
      dailyExtractionCallLimit: 1000,
      factTtlDays: 365,
      limits: {
        dailyExtractionCallLimit: { min: 1, max: 100000 },
        factTtlDays: { min: 1, max: 3650 },
      },
    });
    const wrapper = mount(UserMemorySettingsSection, {
      props: { projectId: "project-1", editable: true },
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

    await wrapper.get(".settings-actions button-stub").trigger("click");
    await flushPromises();

    expect(mocks.update).toHaveBeenCalledWith("project-1", {
      expectedVersion: 3,
      enabled: false,
      dailyExtractionCallLimit: 1000,
      factTtlDays: 365,
    });
  });
});
