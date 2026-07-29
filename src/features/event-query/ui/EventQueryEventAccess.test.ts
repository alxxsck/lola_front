import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventCatalogDefinition } from "@/shared/api/repository/event-catalog";
import { eventQueryRepository } from "../api/event-query-repository";
import EventQueryEventAccess from "./EventQueryEventAccess.vue";

vi.mock("../api/event-query-repository", () => ({
  eventQueryRepository: {
    getItem: vi.fn(),
    patchItem: vi.fn(),
    validateItem: vi.fn(),
    publishItem: vi.fn(),
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
  draftVersion: 4,
  policyDraftVersion: 2,
  publishedPolicyVersion: 3 as never,
  configured: {
    enabled: true,
    endUserConversationEnabled: false,
    configuration,
  },
  published: {
    enabled: true,
    endUserConversationEnabled: false,
    configuration,
  },
  effective: { internalAi: true, endUserConversation: false },
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
    vi.mocked(eventQueryRepository.validateItem).mockResolvedValue({
      valid: true,
      errors: [],
    });
    vi.mocked(eventQueryRepository.patchItem).mockResolvedValue({
      definitionKeyId: "definition-1",
      eventCode: "deposit.completed",
      lifecycle: "ACTIVE",
      version: 5,
      enabled: true,
      endUserConversationEnabled: true,
      configuration,
      diagnostics: [],
    });
    vi.mocked(eventQueryRepository.publishItem).mockResolvedValue({
      id: "policy-4",
      version: 4,
      publishedAt: "2026-07-28T11:00:00.000Z",
      compilerVersion: "1",
      documentHash: "hash-4",
      document: { enabled: true, items: [] },
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

    expect(eventQueryRepository.validateItem).toHaveBeenCalledWith(
      "project-1",
      "definition-1",
      {
        patch: expect.objectContaining({
          expectedVersion: 4,
          enabled: true,
          endUserConversationEnabled: true,
        }),
      },
    );
    expect(eventQueryRepository.patchItem).toHaveBeenCalledWith(
      "project-1",
      "definition-1",
      expect.objectContaining({
        expectedVersion: 4,
        enabled: true,
        endUserConversationEnabled: true,
        descriptionForAI: "Успешный депозит",
      }),
    );
    expect(eventQueryRepository.publishItem).toHaveBeenCalledWith(
      "project-1",
      "definition-1",
      { expectedVersion: 5, expectedPolicyVersion: 3 },
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

    expect(eventQueryRepository.patchItem).toHaveBeenCalledWith(
      "project-1",
      "definition-1",
      expect.objectContaining({
        enabled: false,
        endUserConversationEnabled: true,
      }),
    );
  });

  it("applies an already saved Event without exposing OCC versions", async () => {
    vi.mocked(eventQueryRepository.getItem)
      .mockResolvedValueOnce({
        ...structuredClone(state),
        configured: {
          ...state.configured,
          endUserConversationEnabled: true,
        },
      })
      .mockResolvedValueOnce(structuredClone(state));
    const wrapper = mountAccess();
    await flushPromises();

    await wrapper
      .get('button[data-test="apply-event-query"]')
      .trigger("click");
    await flushPromises();

    expect(eventQueryRepository.publishItem).toHaveBeenCalledWith(
      "project-1",
      "definition-1",
      { expectedVersion: 4, expectedPolicyVersion: 3 },
    );
  });
});
