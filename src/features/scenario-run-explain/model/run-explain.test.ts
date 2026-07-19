import { describe, expect, it } from "vitest";

import type { ScenarioRunExplainResponseDto } from "@/shared/api/generated/models";

import { adaptRunExplain, runtimeExplainLabel } from "./run-explain";

const response = {
  run: {
    id: "run-1",
    status: "COMPLETED",
    startedAt: "2026-07-18T10:00:00.000Z",
    finishedAt: "2026-07-18T10:03:00.000Z",
  },
  scenarioRevision: {
    revisionId: "revision-7",
    scenarioId: "scenario-1",
    revisionNumber: 7,
    catalogRevision: "catalog-42",
    contentHash: "hash-7",
    publishedAt: "2026-07-18T09:00:00.000Z",
  },
  trigger: {
    code: "page.opened",
    definitionKeyId: "page-key",
    definitionRevisionId: "event-revision-3",
    eventLogId: "event-log-1",
    occurredAt: "2026-07-18T09:59:58.000Z",
    receivedAt: "2026-07-18T10:00:00.000Z",
    schemaVersion: 3,
    source: "SERVER",
  },
  eligibility: {
    decision: "MATCHED",
    fidelity: "SNAPSHOT",
    evaluatedAt: "2026-07-18T10:00:00.000Z",
    lastRecheck: {
      decision: "MATCHED",
      fidelity: "TYPED",
      evaluatedAt: "2026-07-18T10:02:58.000Z",
    },
    root: {
      kind: "eventField",
      matched: true,
      actual: { visibility: "REDACTED", value: "never-render-this-secret" },
      expected: { visibility: "VISIBLE", value: "promotions" },
    },
  },
  audience: {
    decision: "MATCHED",
    fidelity: "V2",
    evaluatedAt: "2026-07-18T10:00:01.000Z",
    root: {
      kind: "all",
      matched: true,
      children: [
        {
          kind: "userAttribute",
          matched: true,
          definitionId: "vip-tier",
          actual: {
            visibility: "REDACTED",
            value: "never-render-this-audience-secret",
          },
          expected: { visibility: "VISIBLE", value: "gold" },
        },
        {
          kind: "segmentMembership",
          matched: true,
          segmentId: "vip",
          segmentRevisionId: "segment-revision-4",
        },
      ],
    },
    segmentRevisionIds: ["segment-revision-4"],
    attributeRevisionIds: ["attribute-revision-8"],
    lastRecheck: {
      decision: "NOT_MATCHED",
      evaluatedAt: "2026-07-18T10:02:59.000Z",
      root: {
        kind: "segmentMembership",
        matched: false,
        segmentId: "vip",
        segmentRevisionId: "segment-revision-4",
      },
    },
  },
  goalResolutions: [
    {
      waitId: "wait-1",
      stepId: "step-1",
      outcome: "GOAL_MATCHED",
      winner: "EVENT",
      winningEventLogId: "deposit-event-1",
      deadlineAt: "2026-07-20T10:00:00.000Z",
      resolvedAt: "2026-07-18T10:02:00.000Z",
      selectedBranch: "onGoal",
      targetNodeKey: "deposit_done",
    },
  ],
  delivery: {
    policy: {
      kind: "WAIT_UNTIL_ONLINE",
      expiryMs: 86_400_000,
      recheckEligibility: true,
    },
    waits: [
      {
        waitId: "delivery-1",
        stepId: "step-2",
        outcome: "DELIVERY_READY",
        deadlineAt: "2026-07-19T10:02:00.000Z",
        resolvedAt: "2026-07-18T10:03:00.000Z",
      },
    ],
  },
  actions: [
    {
      id: "step-1",
      position: 0,
      nodeKey: "wait_deposit",
      actionType: "WAIT_FOR_GOAL",
      executor: "SERVER",
      status: "SUCCEEDED",
      startedAt: "2026-07-18T10:00:00.000Z",
      finishedAt: "2026-07-18T10:02:00.000Z",
    },
  ],
  continuations: [
    {
      id: "continuation-1",
      stepId: "step-1",
      status: "COMPLETED",
      outcome: "GOAL_MATCHED",
      targetNodeKey: "deposit_done",
      attemptCount: 1,
      createdAt: "2026-07-18T10:02:00.000Z",
      completedAt: "2026-07-18T10:02:01.000Z",
    },
  ],
  timeline: [
    {
      id: "timeline-1",
      type: "GOAL_MATCHED",
      occurredAt: "2026-07-18T10:02:00.000Z",
      stepId: "step-1",
    },
  ],
} as ScenarioRunExplainResponseDto;

describe("Run Explain adapter", () => {
  it("presents pinned revision and an unambiguous Event/Deadline winner without restoring secrets", () => {
    const view = adaptRunExplain(response);

    expect(view.revision).toMatchObject({
      id: "revision-7",
      number: 7,
      pinned: true,
    });
    expect(view.eligibility.rows[0]).toMatchObject({
      actual: "Скрыто: чувствительные данные",
      expected: "promotions",
    });
    expect(view.eligibility.lastRecheck).toMatchObject({
      decision: "MATCHED",
      fidelity: "TYPED",
      evaluatedAt: "2026-07-18T10:02:58.000Z",
    });
    expect(view.audience).toMatchObject({
      decision: "MATCHED",
      fidelity: "V2",
      segmentRevisionIds: ["segment-revision-4"],
      attributeRevisionIds: ["attribute-revision-8"],
    });
    expect(view.audience.rows[1]).toMatchObject({
      definitionId: "vip-tier",
      actual: "Скрыто: чувствительные данные",
      expected: "gold",
    });
    expect(view.audience.lastRecheck).toMatchObject({
      decision: "NOT_MATCHED",
      evaluatedAt: "2026-07-18T10:02:59.000Z",
    });
    expect(view.goals[0]).toMatchObject({
      winner: "EVENT",
      winnerLabel: "Победило событие",
      targetNodeKey: "deposit_done",
    });
    expect(JSON.stringify(view)).not.toContain("never-render-this-secret");
    expect(JSON.stringify(view)).not.toContain(
      "never-render-this-audience-secret",
    );
    expect(view.delivery.summary).toContain("в сети");
  });

  it("labels missing revision data as unavailable instead of claiming the latest draft", () => {
    const view = adaptRunExplain({ ...response, scenarioRevision: null });
    expect(view.revision).toEqual({
      pinned: false,
      unavailable: true,
      label: "Зафиксированная версия недоступна",
    });
  });

  it("preserves unavailable rule state and formats visible scalar arrays safely", () => {
    const view = adaptRunExplain({
      ...response,
      eligibility: {
        ...response.eligibility,
        root: {
          kind: "unavailable",
          matched: false,
          actual: { visibility: "VISIBLE", value: ["EUR", 10, true] },
        },
      },
    } as ScenarioRunExplainResponseDto);

    expect(view.eligibility.rows[0]).toMatchObject({
      state: "unavailable",
      actual: "EUR, 10, Да",
    });
  });

  it("keeps unavailable Audience explicit without inventing current user data", () => {
    const view = adaptRunExplain({
      ...response,
      audience: {
        decision: "UNAVAILABLE",
        fidelity: "UNAVAILABLE",
        evaluatedAt: null,
        root: { kind: "unavailable", matched: false },
        segmentRevisionIds: [],
        attributeRevisionIds: [],
        lastRecheck: null,
      },
    } as ScenarioRunExplainResponseDto);

    expect(view.audience).toMatchObject({
      decision: "UNAVAILABLE",
      fidelity: "UNAVAILABLE",
      evaluatedAt: null,
      lastRecheck: null,
    });
    expect(view.audience.rows[0]).toMatchObject({
      kind: "unavailable",
      state: "unavailable",
    });
  });

  it("preserves tri-state UNKNOWN instead of presenting a definite non-match", () => {
    const view = adaptRunExplain({
      ...response,
      audience: {
        ...response.audience,
        truth: "UNKNOWN",
        root: {
          kind: "profileAttribute",
          matched: false,
          truth: "UNKNOWN",
          unknownReason: "STALE",
        },
      },
    } as unknown as ScenarioRunExplainResponseDto);

    expect(view.audience.rows[0]).toMatchObject({
      state: "unavailable",
      truth: "UNKNOWN",
      unknownReason: "STALE",
    });
  });

  it("translates backend lifecycle and timeline codes for operators", () => {
    expect(runtimeExplainLabel("GOAL_TIMED_OUT")).toBe("Срок цели истёк");
    expect(runtimeExplainLabel("WAITING_DELIVERY")).toBe("Ожидает доставку");
    expect(runtimeExplainLabel("WAITING_INPUT")).toBe(
      "Ожидает ответ пользователя",
    );
    expect(runtimeExplainLabel("PROCESSING")).toBe("Обрабатывается");
    expect(runtimeExplainLabel("EXPIRED")).toBe("Срок действия истёк");
  });
});
