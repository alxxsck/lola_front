import { config, flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InputNumber from "primevue/inputnumber";
import ScenarioAdmissionSettingsSection from "./ScenarioAdmissionSettingsSection.vue";

config.global.stubs.ProjectSettingsSectionHeader = false;

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("./scenario-admission.api", () => ({
  scenarioAdmissionApi: { get: mocks.get, update: mocks.update },
}));
vi.mock("primevue/usetoast", () => ({
  useToast: () => ({ add: mocks.toast }),
}));

const settings = {
  projectVersion: 7,
  mode: "PROJECT_GLOBAL_V1" as const,
  maxStartsPerLocalDay: 3,
  maxStartsPerVisit: 2,
  minimumIntervalSeconds: 3600,
  quietHours: {
    enabled: true,
    startLocalTime: "00:00",
    endLocalTime: "08:00",
  },
  semantics: {
    dailyLimitWindow: "END_USER_LOCAL_CALENDAR_DAY" as const,
    visitLimitWithoutActiveVisit: "NOT_APPLIED" as const,
    minimumIntervalAnchor: "LAST_NON_SECURITY_START" as const,
    quietHoursBehavior: "SUPPRESS_WITHOUT_DELAY_OR_QUOTA" as const,
    securityBypass: "FREQUENCY_AND_QUIET_HOURS" as const,
  },
};

describe("ScenarioAdmissionSettingsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue(settings);
    mocks.update.mockResolvedValue({ ...settings, projectVersion: 8 });
  });

  it("loads global policy and saves exact seconds with an audit reason", async () => {
    const wrapper = shallowMount(ScenarioAdmissionSettingsSection, {
      props: {
        projectId: "project-1",
        editable: true,
        fallbackTimeZone: "Europe/Madrid",
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Не более 3 запусков за локальные сутки");
    const numbers = wrapper.findAllComponents(InputNumber);
    numbers[0]!.vm.$emit("update:modelValue", 4);
    await wrapper.vm.$nextTick();
    await wrapper.get("[data-testid='admission-save']").trigger("click");
    await flushPromises();

    expect(mocks.update).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        expectedVersion: 7,
        maxStartsPerLocalDay: 4,
        minimumIntervalSeconds: 3600,
        reason: "Update Scenario Admission settings from CMS",
      }),
    );
  });

  it("keeps the draft and opens acknowledgement on legacy cutover conflict", async () => {
    mocks.update.mockRejectedValue(
      Object.assign(new Error("acknowledgement required"), {
        code: "LEGACY_SCENARIO_LIMITS_REQUIRE_ACKNOWLEDGEMENT",
        details: { activeScenarioCount: 4 },
      }),
    );
    const wrapper = shallowMount(ScenarioAdmissionSettingsSection, {
      props: {
        projectId: "project-1",
        editable: true,
        fallbackTimeZone: "UTC",
      },
    });
    await flushPromises();

    await wrapper.get("[data-testid='admission-save']").trigger("click");
    await flushPromises();

    expect(
      (wrapper.vm as unknown as { impactedScenarios: number })
        .impactedScenarios,
    ).toBe(4);
    expect(
      (wrapper.vm as unknown as { acknowledgeOpen: boolean }).acknowledgeOpen,
    ).toBe(true);
    expect(wrapper.text()).toContain("Не более 3 запусков");
  });

  it("preserves the unsaved draft after an optimistic conflict", async () => {
    mocks.update.mockRejectedValue(
      Object.assign(new Error("version conflict"), {
        code: "PROJECT_VERSION_CONFLICT",
      }),
    );
    const wrapper = shallowMount(ScenarioAdmissionSettingsSection, {
      props: {
        projectId: "project-1",
        editable: true,
        fallbackTimeZone: "UTC",
      },
    });
    await flushPromises();

    const numbers = wrapper.findAllComponents(InputNumber);
    numbers[0]!.vm.$emit("update:modelValue", 4);
    await wrapper.vm.$nextTick();
    await wrapper.get("[data-testid='admission-save']").trigger("click");
    await flushPromises();

    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect((wrapper.vm as unknown as { error: string }).error).toContain(
      "Ваши значения сохранены в форме",
    );
    expect(wrapper.text()).toContain("Не более 4 запусков");
  });
});
