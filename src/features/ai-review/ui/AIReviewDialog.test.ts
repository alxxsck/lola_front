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

function mountDialog() {
  return mount(AIReviewDialog, {
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
        MultiSelect: {
          name: "MultiSelect",
          props: ["modelValue", "options"],
          template: "<div />",
        },
        ProgressSpinner: true,
        Textarea: true,
      },
    },
  });
}

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
    const wrapper = mountDialog();
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
    expect(wrapper.text()).toContain(
      "Консервативная оценка: 10 000 входных токенов",
    );
    expect(wrapper.text()).toContain("Подтверждаю запуск дорогого AI Review");
    const start = wrapper
      .findAll("button")
      .find((button) => button.text() === "Запустить AI Review");
    expect(start?.attributes("disabled")).toBeDefined();
  });

  it("показывает активные события, даже если приём новых событий выключен", async () => {
    mocks.definitions.mockResolvedValue([
      {
        code: "deposit.failed",
        metadata: { name: "Ошибка депозита" },
        policy: { enabled: false },
      },
    ]);

    const wrapper = mountDialog();
    await flushPromises();

    expect(mocks.definitions).toHaveBeenCalledWith("project-1", "ACTIVE");
    expect(
      wrapper.getComponent({ name: "MultiSelect" }).props("options"),
    ).toEqual([
      {
        label: "Ошибка депозита · deposit.failed",
        value: "deposit.failed",
      },
    ]);
  });

  it("повторяет неоднозначный start с тем же idempotency key", async () => {
    mocks.estimate.mockResolvedValue({
      eventCount: 1,
      redactedBytes: 100,
      estimatedInputTokens: 34,
      costLevel: "LOW",
      requiresConfirmation: false,
      blocked: false,
      timezone: "UTC",
      range: {
        start: "2026-07-23T00:00:00.000Z",
        end: "2026-07-24T00:00:00.000Z",
      },
    });
    mocks.start
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce({
        id: "run-1",
        status: "FAILED",
        costLevel: "LOW",
        proposalId: null,
      });
    const wrapper = mountDialog();
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      form: { localDate: string; eventCodes: string[]; instruction: string };
      calculateEstimate: () => Promise<void>;
      start: () => Promise<void>;
    };
    vm.form.localDate = "2026-07-23";
    vm.form.eventCodes = ["deposit.failed"];
    await vm.calculateEstimate();
    await vm.start();
    await vm.start();

    expect(mocks.start).toHaveBeenCalledTimes(2);
    const first = mocks.start.mock.calls[0]?.[1] as { idempotencyKey: string };
    const second = mocks.start.mock.calls[1]?.[1] as { idempotencyKey: string };
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
  });

  it("отбрасывает estimate для уже изменённого scope", async () => {
    let resolveEstimate:
      | ((value: {
          eventCount: number;
          redactedBytes: number;
          estimatedInputTokens: number;
          costLevel: "LOW";
          requiresConfirmation: boolean;
          blocked: boolean;
          timezone: string;
          range: { start: string; end: string };
        }) => void)
      | undefined;
    mocks.estimate.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveEstimate = resolve;
      }),
    );
    const wrapper = mountDialog();
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      form: { localDate: string; eventCodes: string[]; instruction: string };
      calculateEstimate: () => Promise<void>;
    };
    vm.form.localDate = "2026-07-23";
    vm.form.eventCodes = ["deposit.failed"];
    const pending = vm.calculateEstimate();
    await vi.waitFor(() => expect(mocks.estimate).toHaveBeenCalledTimes(1));
    vm.form.instruction = "Другой scope";
    await flushPromises();
    resolveEstimate?.({
      eventCount: 9,
      redactedBytes: 900,
      estimatedInputTokens: 1800,
      costLevel: "LOW",
      requiresConfirmation: false,
      blocked: false,
      timezone: "UTC",
      range: {
        start: "2026-07-23T00:00:00.000Z",
        end: "2026-07-24T00:00:00.000Z",
      },
    });
    await pending;
    await flushPromises();

    expect(wrapper.text()).not.toContain("9 событий");
  });

  it("сбрасывает estimate и confirmation при смене пользователя", async () => {
    const wrapper = mountDialog();
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      form: { localDate: string; eventCodes: string[]; instruction: string };
      calculateEstimate: () => Promise<void>;
      confirmedExpensive: boolean;
    };
    vm.form.localDate = "2026-07-23";
    vm.form.eventCodes = ["deposit.failed"];
    await vm.calculateEstimate();
    vm.confirmedExpensive = true;
    await wrapper.setProps({ endUserId: "user-2" });
    await flushPromises();

    expect(wrapper.text()).not.toContain("40 событий");
    expect(vm.confirmedExpensive).toBe(false);
  });

  it("не показывает ошибку запоздалого poll после смены пользователя", async () => {
    mocks.estimate.mockResolvedValueOnce({
      eventCount: 1,
      redactedBytes: 100,
      estimatedInputTokens: 1600,
      costLevel: "LOW",
      requiresConfirmation: false,
      blocked: false,
      timezone: "UTC",
      range: {
        start: "2026-07-23T00:00:00.000Z",
        end: "2026-07-24T00:00:00.000Z",
      },
    });
    mocks.start.mockResolvedValueOnce({
      id: "run-1",
      status: "RUNNING",
      costLevel: "LOW",
      proposalId: null,
    });
    let rejectPoll: ((reason: Error) => void) | undefined;
    mocks.get.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectPoll = reject;
      }),
    );
    const wrapper = mountDialog();
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      form: { localDate: string; eventCodes: string[]; instruction: string };
      calculateEstimate: () => Promise<void>;
      start: () => Promise<void>;
      poll: () => Promise<void>;
    };
    vm.form.localDate = "2026-07-23";
    vm.form.eventCodes = ["deposit.failed"];
    await vm.calculateEstimate();
    await vm.start();
    const pending = vm.poll();
    await wrapper.setProps({ endUserId: "user-2" });
    rejectPoll?.(new Error("old poll failed"));
    await pending;
    await flushPromises();

    expect(wrapper.text()).not.toContain("old poll failed");
  });
});
