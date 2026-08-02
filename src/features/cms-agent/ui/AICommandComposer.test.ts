import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AICommandComposer from "./AICommandComposer.vue";

const repository = vi.hoisted(() => ({
  estimate: vi.fn(),
  submit: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("../api/cms-agent-repository", () => ({
  cmsAgentRepository: repository,
}));

function mountComposer() {
  return mount(AICommandComposer, {
    props: { projectId: "project-1" },
    global: {
      stubs: {
        Textarea: {
          props: ["modelValue", "disabled"],
          emits: ["update:modelValue", "keydown"],
          template:
            '<textarea :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" @keydown="$emit(\'keydown\', $event)" />',
        },
        Button: {
          props: ["label", "disabled", "type"],
          emits: ["click"],
          template:
            '<button :type="type || \'button\'" :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
        },
        Message: { template: "<div><slot /></div>" },
        RouterLink: {
          props: ["to"],
          template: '<a :data-to="JSON.stringify(to)"><slot /></a>',
        },
      },
    },
  });
}

describe("AICommandComposer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.estimate.mockResolvedValue({
      confirmationRequired: false,
      executionPath: "CMS_AGENT",
      maxInputTokens: "12000",
      maxOutputTokens: "3000",
      maxProviderCalls: 2,
      model: "grok-4.5",
      pricingVersion: "pricing-v1",
      projectPolicyRevision: 1,
      provider: "xAI",
      reservedCostUsdTicks: "450000000",
    });
  });

  it("submits trimmed text and executes the durable request", async () => {
    repository.submit.mockResolvedValue({ requestId: "request-1" });
    repository.execute.mockResolvedValue({
      interpretation: { outcome: "PLANNED" },
      result: {
        domainId: "analysis-1",
        domainKind: "AI_ANALYSIS",
        relation: "CREATED",
        result: { runId: "run-1", status: "QUEUED" },
      },
    });
    const wrapper = mountComposer();

    await wrapper.get("textarea").setValue("  Сколько депозитов было вчера?  ");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(repository.submit).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        text: "Сколько депозитов было вчера?",
        idempotencyKey: expect.any(String),
      }),
    );
    expect(repository.estimate).toHaveBeenCalledWith("project-1", {
      executionPath: "CMS_AGENT",
      question: "Сколько депозитов было вчера?",
    });
    expect(repository.execute).toHaveBeenCalledWith("project-1", "request-1");
    expect(wrapper.text()).toContain("Анализ поставлен в очередь");
    expect(wrapper.get('[role="status"]').attributes("aria-live")).toBe(
      "polite",
    );
    expect(wrapper.emitted("analysis-created")).toEqual([["analysis-1"]]);
    expect(
      wrapper.get(".analysis-result-link").attributes("data-to"),
    ).toContain("analysis-1");
  });

  it("surfaces an intensified working state while a request is pending", async () => {
    repository.submit.mockReturnValue(new Promise(() => undefined));
    const wrapper = mountComposer();

    await wrapper.get("textarea").setValue("Покажи динамику депозитов");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.get('[data-testid="ai-command-composer"]').classes()).toContain(
      "is-busy",
    );
    expect(wrapper.get("form").attributes("aria-busy")).toBe("true");
    expect(wrapper.text()).toContain("Сохраняем запрос");

    wrapper.unmount();
  });

  it("presents a clarification without inventing an analysis result", async () => {
    repository.submit.mockResolvedValue({ requestId: "request-2" });
    repository.execute.mockResolvedValue({
      interpretation: {
        outcome: "CLARIFICATION_REQUIRED",
        code: "AMBIGUOUS_EVENT",
      },
      result: null,
    });
    const wrapper = mountComposer();

    await wrapper.get("textarea").setValue("Посмотри депозиты");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("Нужно уточнение");
    expect(wrapper.emitted("analysis-created")).toBeUndefined();

    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(repository.submit).toHaveBeenCalledTimes(1);

    await wrapper.get('[data-testid="ai-command-revise"]').trigger("click");
    await wrapper.get("textarea").setValue("Депозиты за вчера");
    repository.submit.mockResolvedValue({ requestId: "request-clarified" });
    repository.execute.mockResolvedValue({
      interpretation: { outcome: "PLANNED" },
      result: {
        domainId: "analysis-clarified",
        domainKind: "AI_ANALYSIS",
        relation: "CREATED",
        result: { runId: "run-clarified", status: "QUEUED" },
      },
    });
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(repository.submit).toHaveBeenCalledTimes(2);
    expect(repository.submit).toHaveBeenLastCalledWith(
      "project-1",
      expect.objectContaining({
        text: "Депозиты за вчера",
        idempotencyKey: expect.any(String),
      }),
    );
  });

  it("retries execution without creating a duplicate Agent request", async () => {
    repository.submit.mockResolvedValue({ requestId: "request-3" });
    repository.execute
      .mockRejectedValueOnce(new Error("Временный сбой"))
      .mockResolvedValue({
        interpretation: { outcome: "PLANNED" },
        result: {
          domainId: "analysis-3",
          domainKind: "AI_ANALYSIS",
          relation: "CREATED",
          result: { runId: "run-3", status: "QUEUED" },
        },
      });
    const wrapper = mountComposer();

    await wrapper.get("textarea").setValue("Покажи переходы на главную");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("Временный сбой");
    await wrapper.get('[data-testid="ai-command-retry"]').trigger("click");
    await flushPromises();

    expect(repository.submit).toHaveBeenCalledTimes(1);
    expect(repository.execute).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("Анализ поставлен в очередь");
  });

  it("retries an ambiguous submit with the same immutable command identity", async () => {
    repository.submit
      .mockRejectedValueOnce(new Error("Сетевой таймаут"))
      .mockResolvedValue({ requestId: "request-after-timeout" });
    repository.execute.mockResolvedValue({
      interpretation: { outcome: "PLANNED" },
      result: {
        domainId: "analysis-after-timeout",
        domainKind: "AI_ANALYSIS",
        relation: "CREATED",
        result: { runId: "run-after-timeout", status: "QUEUED" },
      },
    });
    const wrapper = mountComposer();

    await wrapper.get("textarea").setValue("Покажи депозиты");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.get("textarea").attributes("disabled")).toBeDefined();
    const firstCommand = repository.submit.mock.calls[0]?.[1];
    await wrapper.get('[data-testid="ai-command-retry"]').trigger("click");
    await flushPromises();

    expect(repository.submit).toHaveBeenCalledTimes(2);
    expect(repository.submit.mock.calls[1]?.[1]).toEqual(firstCommand);
    expect(wrapper.text()).toContain("Анализ поставлен в очередь");
  });

  it("requires an explicit confirmation before submitting a high-cost request", async () => {
    repository.estimate.mockResolvedValue({
      confirmationRequired: true,
      confirmationExpiresAt: "2026-07-31T08:00:00.000Z",
      confirmationToken: "signed-confirmation-token",
      executionPath: "CMS_AGENT",
      maxInputTokens: "12000",
      maxOutputTokens: "3000",
      maxProviderCalls: 2,
      model: "grok-4.5",
      pricingVersion: "pricing-v1",
      projectPolicyRevision: 1,
      provider: "xAI",
      reservedCostUsdTicks: "12500000000",
    });
    repository.submit.mockResolvedValue({ requestId: "expensive-request" });
    repository.execute.mockResolvedValue({
      interpretation: { outcome: "PLANNED" },
      result: {
        domainId: "expensive-analysis",
        domainKind: "AI_ANALYSIS",
        relation: "CREATED",
        result: { runId: "expensive-run", status: "QUEUED" },
      },
    });
    const wrapper = mountComposer();

    await wrapper.get("textarea").setValue("Сложный анализ депозитов");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("Нужно подтвердить высокий расход");
    expect(wrapper.text()).toContain("$1.25");
    expect(repository.submit).not.toHaveBeenCalled();

    await wrapper
      .get('[data-testid="ai-command-confirm-cost"]')
      .trigger("click");
    await flushPromises();

    expect(repository.submit).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        text: "Сложный анализ депозитов",
        highCostConfirmationToken: "signed-confirmation-token",
      }),
    );
    expect(wrapper.text()).toContain("Анализ поставлен в очередь");
  });

  it("discards an in-flight response when the selected project changes", async () => {
    let resolveSubmit!: (value: { requestId: string }) => void;
    repository.submit.mockReturnValue(
      new Promise((resolve) => {
        resolveSubmit = resolve;
      }),
    );
    const wrapper = mountComposer();

    await wrapper.get("textarea").setValue("Покажи депозиты");
    await wrapper.get("form").trigger("submit");
    await wrapper.setProps({ projectId: "project-2" });
    resolveSubmit({ requestId: "request-from-project-1" });
    await flushPromises();

    expect(repository.submit).toHaveBeenCalledWith(
      "project-1",
      expect.any(Object),
    );
    expect(repository.execute).not.toHaveBeenCalled();
    expect(wrapper.get("textarea").element.value).toBe("");
    expect(wrapper.text()).not.toContain("Анализ поставлен в очередь");
  });

  it("does not continue a submit after the permission-gated surface unmounts", async () => {
    let resolveSubmit!: (value: { requestId: string }) => void;
    repository.submit.mockReturnValue(
      new Promise((resolve) => {
        resolveSubmit = resolve;
      }),
    );
    const wrapper = mountComposer();

    await wrapper.get("textarea").setValue("Покажи депозиты");
    await wrapper.get("form").trigger("submit");
    wrapper.unmount();
    resolveSubmit({ requestId: "request-after-unmount" });
    await flushPromises();

    expect(repository.execute).not.toHaveBeenCalled();
  });
});
