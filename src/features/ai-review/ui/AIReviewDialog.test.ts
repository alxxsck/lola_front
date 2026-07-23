import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AIReviewDialog from "./AIReviewDialog.vue";

const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  estimate: vi.fn(),
  start: vi.fn(),
  get: vi.fn(),
  definitions: vi.fn(),
  push: vi.fn(),
}));

vi.mock("../api/ai-review-repository", () => ({
  aiReviewRepository: {
    getSettings: mocks.settings,
    estimate: mocks.estimate,
    start: mocks.start,
    get: mocks.get,
  },
}));
vi.mock("@/shared/api/repository/event-catalog", () => ({
  eventCatalogRepository: { listDefinitions: mocks.definitions },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));

describe("типизированный AI Review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings.mockResolvedValue({
      projectVersion: 1,
      enabled: true,
      dailyRunLimit: 25,
      limits: { dailyRunLimit: { min: 1, max: 1000 } },
    });
    mocks.definitions.mockResolvedValue([
      {
        code: "deposit.failed",
        metadata: { name: "Ошибка депозита" },
        policy: { enabled: true },
      },
    ]);
    mocks.estimate.mockResolvedValue({
      eventCount: 40,
      redactedBytes: 30000,
      estimatedInputTokens: 10000,
      costLevel: "HIGH",
      requiresConfirmation: true,
      blocked: false,
      timezone: "UTC",
      range: {
        start: "2026-07-23T00:00:00.000Z",
        end: "2026-07-24T00:00:00.000Z",
      },
    });
  });

  it("сначала показывает оценку токенов и требует подтверждение HIGH", async () => {
    const wrapper = mount(AIReviewDialog, {
      props: {
        projectId: "project-1",
        endUserId: "user-1",
        visible: true,
        "onUpdate:visible": () => undefined,
      },
      global: {
        stubs: {
          Button: {
            props: ["label", "disabled"],
            template:
              '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
          },
          Checkbox: true,
          Dialog: {
            props: ["visible"],
            template: '<div v-if="visible"><slot /></div>',
          },
          InputText: true,
          Message: { template: "<div><slot /></div>" },
          MultiSelect: true,
          ProgressSpinner: true,
          Textarea: true,
        },
      },
    });
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      form: { localDate: string; eventCodes: string[]; instruction: string };
      calculateEstimate: () => Promise<void>;
    };
    vm.form.localDate = "2026-07-23";
    vm.form.eventCodes = ["deposit.failed"];
    await vm.calculateEstimate();
    await flushPromises();

    expect(mocks.estimate).toHaveBeenCalledWith("project-1", {
      endUserId: "user-1",
      localDate: "2026-07-23",
      eventCodes: ["deposit.failed"],
    });
    expect(wrapper.text()).toContain("До 10 000 входных токенов");
    expect(wrapper.text()).toContain("Подтверждаю запуск дорогого AI Review");
    const start = wrapper
      .findAll("button")
      .find((button) => button.text() === "Запустить AI Review");
    expect(start?.attributes("disabled")).toBeDefined();
  });
});
