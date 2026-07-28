import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eventQueryRepository } from "../api/event-query-repository";
import EventQueryPreview from "./EventQueryPreview.vue";

vi.mock("../api/event-query-repository", () => ({
  eventQueryRepository: { preview: vi.fn() },
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
      items: [aggregateItem, summaryItem] as never,
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
    await wrapper
      .get('[data-test="preview-event"]')
      .setValue("deposit.completed");
    await wrapper.get('[data-test="preview-mode"]').setValue("AGGREGATE");

    expect(wrapper.get('[data-test="preview-period"]').text()).not.toContain(
      "30 дней",
    );

    await wrapper.get('[data-test="preview-end-user"]').setValue("user-1");
    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(eventQueryRepository.preview).toHaveBeenCalledWith("project-1", {
      endUserId: "user-1",
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

  it("normalizes mode and lookback when the selected event changes", async () => {
    const wrapper = mountPreview();
    await wrapper
      .get('[data-test="preview-event"]')
      .setValue("deposit.completed");
    await wrapper.get('[data-test="preview-mode"]').setValue("LATEST");

    await wrapper.get('[data-test="preview-event"]').setValue("game.started");

    expect(
      (wrapper.get('[data-test="preview-mode"]').element as HTMLSelectElement)
        .value,
    ).toBe("SUMMARY");
    expect(wrapper.get('[data-test="preview-period"]').text()).not.toContain(
      "7 дней",
    );
  });
});
