import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import type { EventCatalogDefinition } from "@/shared/api/repository/event-catalog";
import { eventQueryRepository } from "../api/event-query-repository";
import EventQueryEventAccess from "./EventQueryEventAccess.vue";

vi.mock("../api/event-query-repository", () => ({
  eventQueryRepository: {
    applyItem: vi.fn(),
    getItem: vi.fn(),
  },
}));

const definition = {
  definitionKeyId: "definition-1",
  projectId: "project-1",
  code: "deposit.completed",
  lifecycle: "ACTIVE",
  lifecycleVersion: 1,
  lifecycleUpdatedAt: "2026-07-28T10:00:00.000Z",
  metadata: {
    name: "Депозит зачислен",
    description: "Факт успешного зачисления депозита",
    concurrencyToken: "2026-07-28T10:00:00.000Z",
  },
  policy: {
    version: 1,
    updatedAt: "2026-07-28T10:00:00.000Z",
    enabled: true,
    clientIngestible: false,
    countsAsActivity: true,
  },
  currentSchema: {
    revisionId: "revision-1",
    revisionNumber: 1,
    publishedAt: "2026-07-28T10:00:00.000Z",
    payloadSchema: {
      type: "object",
      properties: {
        amount: { type: "number" },
        currency: { type: "string" },
      },
    },
  },
  origin: "CUSTOM",
  readOnly: false,
} as const satisfies EventCatalogDefinition;

const configuration = {
  descriptionForAI: "Успешный депозит",
  allowedModes: ["SUMMARY" as const],
  maxInteractiveLookbackHours: 168,
  maxVerificationLookbackHours: 720,
  safeFields: [],
};
const state = {
  definitionKeyId: "definition-1",
  eventCode: "deposit.completed",
  lifecycle: "ACTIVE" as const,
  concurrencyToken: "eq-item-v1.initial",
  configured: {
    enabled: true,
    endUserConversationEnabled: false,
    configuration,
  },
  effective: { internalAi: true, endUserConversation: false },
  lifecycleRestrictions: {
    canApply: true,
    canEnable: true,
    readOnly: false,
    reasons: [],
  },
  safeFieldRecommendation: {
    fields: [],
    skipped: [],
  },
  diagnostics: [],
};

function mountAccess() {
  return mount(EventQueryEventAccess, {
    props: {
      projectId: "project-1",
      definition,
      canManage: true,
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
        Skeleton: { template: '<div class="skeleton" />' },
        ToggleSwitch: {
          props: ["modelValue", "disabled"],
          emits: ["update:modelValue"],
          template:
            '<input type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
        },
      },
    },
  });
}

describe("EventQueryEventAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(eventQueryRepository.getItem).mockResolvedValue(
      structuredClone(state),
    );
    vi.mocked(eventQueryRepository.applyItem).mockResolvedValue({
      ...structuredClone(state),
      concurrencyToken: "eq-item-v1.applied",
      configured: {
        ...state.configured,
        endUserConversationEnabled: true,
      },
      effective: { internalAi: true, endUserConversation: true },
    });
  });

  it("applies only the current Event with both independent grants", async () => {
    const wrapper = mountAccess();
    await flushPromises();

    await wrapper
      .get('[data-test="event-query-conversation-enabled"]')
      .setValue(true);
    await wrapper.get('button[data-test="apply-event-query"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).not.toContain("добавлены в форму");
    expect(eventQueryRepository.applyItem).toHaveBeenCalledWith(
      "project-1",
      "definition-1",
      expect.objectContaining({
        concurrencyToken: "eq-item-v1.initial",
        enabled: true,
        endUserConversationEnabled: true,
        descriptionForAI: "Успешный депозит",
      }),
    );
    expect(wrapper.text()).not.toContain("Опубликовать");
    expect(wrapper.text()).not.toContain("Черновик");
    expect(wrapper.text()).not.toContain("v4");
  });

  it("preserves the conversation preference when base access is disabled", async () => {
    vi.mocked(eventQueryRepository.getItem).mockResolvedValueOnce({
      ...structuredClone(state),
      configured: {
        ...state.configured,
        endUserConversationEnabled: true,
      },
    });
    const wrapper = mountAccess();
    await flushPromises();

    await wrapper.get('[data-test="event-query-enabled"]').setValue(false);
    expect(
      wrapper
        .get('[data-test="event-query-conversation-enabled"]')
        .attributes("disabled"),
    ).toBeDefined();
    await wrapper.get('button[data-test="apply-event-query"]').trigger("click");
    await flushPromises();

    expect(eventQueryRepository.applyItem).toHaveBeenCalledWith(
      "project-1",
      "definition-1",
      expect.objectContaining({
        concurrencyToken: "eq-item-v1.initial",
        enabled: false,
        endUserConversationEnabled: true,
      }),
    );
  });

  it("does not call apply when the Event form is unchanged", async () => {
    const wrapper = mountAccess();
    await flushPromises();

    await wrapper.get('button[data-test="apply-event-query"]').trigger("click");
    await flushPromises();

    expect(eventQueryRepository.applyItem).not.toHaveBeenCalled();
  });

  it("prepares typed aggregate fields locally and applies them only after confirmation", async () => {
    vi.mocked(eventQueryRepository.getItem).mockResolvedValueOnce({
      ...structuredClone(state),
      safeFieldRecommendation: {
        fields: [
          {
            path: "amount",
            semanticType: "MONEY",
            operations: ["SUM"],
            sensitivity: "PRIVATE_DERIVED",
            currencyPath: "currency",
          },
          {
            path: "currency",
            semanticType: "CURRENCY",
            operations: ["GROUP_BY"],
            sensitivity: "PRIVATE_DERIVED",
          },
        ],
        skipped: [],
      },
    });
    const wrapper = mountAccess();
    await flushPromises();

    await wrapper
      .get('button[data-test="prepare-recommended-safe-fields"]')
      .trigger("click");
    expect(eventQueryRepository.applyItem).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("добавлены в форму");

    await wrapper.get('button[data-test="apply-event-query"]').trigger("click");
    await flushPromises();

    expect(eventQueryRepository.applyItem).toHaveBeenCalledWith(
      "project-1",
      "definition-1",
      expect.objectContaining({
        safeFields: [
          expect.objectContaining({
            path: "amount",
            semanticType: "MONEY",
            operations: ["SUM"],
            currencyPath: "currency",
          }),
          expect.objectContaining({
            path: "currency",
            semanticType: "CURRENCY",
            operations: ["GROUP_BY"],
          }),
        ],
      }),
    );
  });

  it("keeps the Event form and retries with the replacement token after 409", async () => {
    vi.mocked(eventQueryRepository.applyItem)
      .mockRejectedValueOnce(
        new ApiError(409, "Conflict", {
          current: {
            ...structuredClone(state),
            concurrencyToken: "eq-item-v1.current",
          },
        }),
      )
      .mockResolvedValueOnce({
        ...structuredClone(state),
        concurrencyToken: "eq-item-v1.applied",
        configured: {
          ...state.configured,
          endUserConversationEnabled: true,
        },
        effective: { internalAi: true, endUserConversation: true },
      });
    const wrapper = mountAccess();
    await flushPromises();

    await wrapper
      .get('[data-test="event-query-conversation-enabled"]')
      .setValue(true);
    await wrapper.get('button[data-test="apply-event-query"]').trigger("click");
    await flushPromises();

    expect(
      (
        wrapper.get('[data-test="event-query-conversation-enabled"]')
          .element as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(wrapper.text()).toContain("другой администратор");

    await wrapper.get('button[data-test="apply-event-query"]').trigger("click");
    await flushPromises();

    expect(eventQueryRepository.applyItem).toHaveBeenLastCalledWith(
      "project-1",
      "definition-1",
      expect.objectContaining({
        concurrencyToken: "eq-item-v1.current",
        endUserConversationEnabled: true,
      }),
    );
  });
});
