import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { endUserProfileRepository } from "@/features/end-user-profile/api/end-user-profile-repository";
import { eventQueryRepository } from "../api/event-query-repository";
import EventPicker from "@/features/events/EventPicker.vue";
import EventQueryPreview from "./EventQueryPreview.vue";

vi.mock("../api/event-query-repository", () => ({
  eventQueryRepository: { listItems: vi.fn(), preview: vi.fn() },
}));
vi.mock("@/features/end-user-profile/api/end-user-profile-repository", () => ({
  endUserProfileRepository: { resolveIdentity: vi.fn() },
}));

const aggregateItem = {
  stableCode: "deposit.completed",
  descriptionForAI: "Депозит",
  allowedModes: ["SUMMARY", "AGGREGATE", "LATEST"],
  maxInteractiveLookbackHours: 168,
  maxVerificationLookbackHours: 720,
  safeFields: [
    {
      path: "amount",
      semanticType: "MONEY",
      sensitivity: "PUBLIC_TO_END_USER",
      operations: ["PROJECT", "SUM"],
      currencyPath: "currency",
    },
    {
      path: "currency",
      semanticType: "CURRENCY",
      sensitivity: "PUBLIC_TO_END_USER",
      operations: ["GROUP_BY"],
    },
  ],
} as const;

const summaryItem = {
  ...aggregateItem,
  stableCode: "game.started",
  allowedModes: ["SUMMARY"],
  maxInteractiveLookbackHours: 24,
  safeFields: [],
} as const;

function mountPreview() {
  return mount(EventQueryPreview, {
    props: {
      projectId: "project-1",
    },
    global: {
      stubs: {
        Button: {
          props: ["label", "disabled"],
          emits: ["click"],
          template:
            '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
        },
        Message: { template: "<div><slot /></div>" },
      },
    },
  });
}

describe("EventQueryPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(endUserProfileRepository.resolveIdentity).mockResolvedValue({
      endUserId: "00000000-0000-4000-8000-000000000001",
      externalUserId: "player-42",
    });
    vi.mocked(eventQueryRepository.listItems).mockResolvedValue({
      audience: "INTERNAL_AI",
      effectiveOnly: true,
      items: [aggregateItem, summaryItem].map((item, index) => {
        const { stableCode, ...configuration } = item;
        return {
          definitionKeyId: `definition-${index + 1}`,
          eventCode: stableCode,
          eventName: stableCode,
          lifecycle: "ACTIVE",
          configuration,
          effective: { internalAi: true, endUserConversation: true },
          queryable: true,
        };
      }),
      pageInfo: { hasMore: false, nextCursor: null },
    } as never);
    vi.mocked(eventQueryRepository.preview).mockResolvedValue({
      status: "COMPLETED",
      complete: true,
      truncated: false,
      excludedCount: 0,
      limitations: [],
      provenance: { source: "EVENT_LOG" },
      policyRevisionId: "60000000-0000-4000-8000-000000000006",
      range: {
        from: "2026-07-28T10:00:00.000Z",
        to: "2026-07-28T11:00:00.000Z",
      },
      snapshotReceivedAt: "2026-07-28T11:00:00.000Z",
    });
  });

  it("builds a valid aggregate query and caps periods by policy", async () => {
    const wrapper = mountPreview();
    await flushPromises();
    wrapper
      .getComponent(EventPicker)
      .vm.$emit("update:modelValue", "deposit.completed");
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-test="preview-mode"]').setValue("AGGREGATE");

    expect(wrapper.get('[data-test="preview-period"]').text()).not.toContain(
      "30 дней",
    );

    await wrapper.get('[data-test="preview-end-user"]').setValue("player-42");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Выполнить preview")!
      .trigger("click");
    await flushPromises();

    expect(endUserProfileRepository.resolveIdentity).toHaveBeenCalledWith(
      "project-1",
      "player-42",
    );
    expect(eventQueryRepository.preview).toHaveBeenCalledWith("project-1", {
      audience: "INTERNAL_AI",
      endUserId: "00000000-0000-4000-8000-000000000001",
      query: expect.objectContaining({
        eventCodes: ["deposit.completed"],
        mode: "AGGREGATE",
        groupBy: ["currency"],
        metrics: [
          {
            currencyField: "currency",
            field: "amount",
            operation: "SUM",
          },
        ],
      }),
    });
  });

  it("does not execute preview when the user identity cannot be resolved", async () => {
    vi.mocked(endUserProfileRepository.resolveIdentity).mockResolvedValueOnce(
      null,
    );
    const wrapper = mountPreview();
    await flushPromises();
    wrapper
      .getComponent(EventPicker)
      .vm.$emit("update:modelValue", "game.started");
    await wrapper.vm.$nextTick();
    await wrapper
      .get('[data-test="preview-end-user"]')
      .setValue("unknown-player");

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Выполнить preview")!
      .trigger("click");
    await flushPromises();

    expect(eventQueryRepository.preview).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Пользователь не найден");
  });

  it("normalizes mode and lookback when the selected event changes", async () => {
    const wrapper = mountPreview();
    await flushPromises();
    wrapper
      .getComponent(EventPicker)
      .vm.$emit("update:modelValue", "deposit.completed");
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-test="preview-mode"]').setValue("LATEST");

    wrapper
      .getComponent(EventPicker)
      .vm.$emit("update:modelValue", "game.started");
    await wrapper.vm.$nextTick();

    expect(
      (wrapper.get('[data-test="preview-mode"]').element as HTMLSelectElement)
        .value,
    ).toBe("SUMMARY");
    expect(wrapper.get('[data-test="preview-period"]').text()).not.toContain(
      "7 дней",
    );
  });

  it("does not change the confirmed event while the picker searches", async () => {
    const wrapper = mountPreview();
    await flushPromises();
    const picker = wrapper.getComponent(EventPicker);
    expect(picker.props("modelValue")).toBe("deposit.completed");
    vi.mocked(eventQueryRepository.listItems).mockResolvedValueOnce({
      audience: "INTERNAL_AI",
      effectiveOnly: true,
      items: [],
      pageInfo: { hasMore: false, nextCursor: null },
    });

    await picker.props("load")({ query: "missing", limit: 25 });
    await wrapper.vm.$nextTick();

    expect(wrapper.getComponent(EventPicker).props("modelValue")).toBe(
      "deposit.completed",
    );
  });
});
