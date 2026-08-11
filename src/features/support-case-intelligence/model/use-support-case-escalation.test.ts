import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import type { SupportCaseEscalationSource } from "../api/support-case-escalation-source";
import {
  createDefaultEscalationPolicy,
  createSimulationStep,
} from "./support-case-escalation-policy";
import { useSupportCaseEscalation } from "./use-support-case-escalation";

const policy = createDefaultEscalationPolicy();
policy.explicitHumanRequestRules = [
  {
    code: "HUMAN_REQUEST_RU",
    locales: ["ru-RU"],
    phrases: ["позовите оператора"],
  },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function snapshot(
  actions: ReadonlyArray<"SAVE_ESCALATION_DRAFT" | "PREVIEW" | "PUBLISH"> = [
    "SAVE_ESCALATION_DRAFT",
    "PREVIEW",
    "PUBLISH",
  ],
  version = 1,
) {
  return {
    allowedActions: [...actions],
    escalation: {
      draft: null,
      published: {
        id: `revision-${version}`,
        projectId: "project-1",
        version,
        status: "PUBLISHED",
        definition: structuredClone(policy),
        compiledPolicy: { ...structuredClone(policy), schemaVersion: 1 },
        compiledPolicyHash: "a".repeat(64),
        compilerRevisionId: "case-intelligence-compiler-v1",
        createdAt: "2026-08-11T10:00:00.000Z",
      },
    },
    safety: {
      state: "READY",
      authority: "PLATFORM",
      assistantReleaseGate: "ALLOW",
      projectOverrideAllowed: false,
    },
  } as never;
}

function source(
  overrides: Partial<SupportCaseEscalationSource> = {},
): SupportCaseEscalationSource {
  return {
    read: vi.fn().mockResolvedValue(snapshot()),
    readSafety: vi.fn().mockResolvedValue({
      revisionId: "safety-v4",
      authority: "PLATFORM",
      projectOverrideAllowed: false,
      locales: ["ru-RU"],
      channels: ["TEXT"],
      classes: [],
    }),
    compile: vi.fn().mockResolvedValue({
      compiledPolicy: { ...structuredClone(policy), schemaVersion: 1 },
      compiledPolicyHash: "a".repeat(64),
      compilerRevisionId: "case-intelligence-compiler-v1",
    }),
    dryRun: vi.fn().mockResolvedValue({
      executionMode: "NON_DISPATCHING",
      sideEffectsCommitted: false,
      initialPolicyHash: "a".repeat(64),
      finalPolicyHash: "a".repeat(64),
      safetyPolicyRevisionId: "safety-v4",
      steps: [],
    }),
    saveDraft: vi.fn().mockResolvedValue({}),
    discardDraft: vi.fn().mockResolvedValue({}),
    publish: vi.fn().mockResolvedValue({}),
    lookupCommand: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as never;
}

describe("useSupportCaseEscalation", () => {
  let permissions: string[];
  beforeEach(() => {
    sessionStorage.clear();
    permissions = [
      "project.case_intelligence.read",
      "project.case_intelligence.preview",
      "project.case_intelligence.escalation.manage",
      "project.case_intelligence.release.manage",
    ];
  });

  it("loads the editable policy and immutable Project Safety projection", async () => {
    const adapter = source();
    const controller = useSupportCaseEscalation({
      authority: () => ({
        actorId: "lead-1",
        projectId: "project-1",
        permissions,
      }),
      source: adapter,
    });
    await controller.load();
    expect(controller.policy.value.explicitHumanRequestRules[0]?.code).toBe(
      "HUMAN_REQUEST_RU",
    );
    expect(controller.safety.value?.authority).toBe("PLATFORM");
    expect(controller.safety.value?.projectOverrideAllowed).toBe(false);
  });

  it("requires both exact IAM and server allowed action", async () => {
    const adapter = source({
      read: vi.fn().mockResolvedValue(snapshot(["PREVIEW"])),
    });
    const controller = useSupportCaseEscalation({
      authority: () => ({
        actorId: "lead-1",
        projectId: "project-1",
        permissions,
      }),
      source: adapter,
    });
    await controller.load();
    expect(controller.canManage.value).toBe(false);
    expect(await controller.save()).toBe(false);
    expect(adapter.saveDraft).not.toHaveBeenCalled();
  });

  it("never sends an incomplete simulator event to the server", async () => {
    const adapter = source();
    const controller = useSupportCaseEscalation({
      authority: () => ({
        actorId: "lead-1",
        projectId: "project-1",
        permissions,
      }),
      source: adapter,
    });
    await controller.load();
    controller.simulationSteps.value = [
      createSimulationStep("POLICY_SWITCH", 0),
    ];

    expect(await controller.runSimulation()).toBe(false);
    expect(adapter.dryRun).not.toHaveBeenCalled();

    const removedRule = createSimulationStep("EXPLICIT_HUMAN_REQUEST", 1);
    removedRule.ruleCode = "HUMAN_REQUEST_RU";
    controller.simulationSteps.value = [removedRule];
    controller.policy.value.explicitHumanRequestRules = [];
    expect(await controller.runSimulation()).toBe(false);
    expect(adapter.dryRun).not.toHaveBeenCalled();
  });

  it("retains the exact command after an unknown outcome and reconciles it by lookup", async () => {
    const adapter = source({
      saveDraft: vi
        .fn()
        .mockRejectedValue(new ApiError(503, "Временно недоступно")),
      read: vi.fn().mockResolvedValue(snapshot()),
      lookupCommand: vi
        .fn()
        .mockResolvedValue({ resultKind: "ESCALATION_POLICY" }),
    });
    const controller = useSupportCaseEscalation({
      authority: () => ({
        actorId: "lead-1",
        projectId: "project-1",
        permissions,
      }),
      source: adapter,
      createIdempotencyKey: () => "stable-key",
    });
    await controller.load();
    expect(await controller.save()).toBe(false);
    expect(controller.pendingAttempt.value).toMatchObject({
      operation: "SAVE",
      key: "stable-key",
      expectedVersion: 1,
    });
    expect(await controller.retryPending()).toBe(true);
    expect(adapter.lookupCommand).toHaveBeenCalledWith(
      "project-1",
      "stable-key",
      expect.any(AbortSignal),
    );
    expect(controller.pendingAttempt.value).toBeNull();
  });

  it("preserves the local draft and requires a fresh confirmation after version conflict", async () => {
    const fresh = snapshot([], 2);
    const adapter = source({
      saveDraft: vi
        .fn()
        .mockRejectedValue(new ApiError(409, "Версия изменилась")),
      read: vi.fn().mockResolvedValueOnce(snapshot()).mockResolvedValue(fresh),
    });
    const controller = useSupportCaseEscalation({
      authority: () => ({
        actorId: "lead-1",
        projectId: "project-1",
        permissions,
      }),
      source: adapter,
    });
    await controller.load();
    controller.policy.value.routingPolicyRevisionId = "local-routing-draft";
    expect(await controller.save()).toBe(false);
    expect(controller.policy.value.routingPolicyRevisionId).toBe(
      "local-routing-draft",
    );
    expect(controller.pendingAttempt.value).toBeNull();
    expect(controller.error.value).toContain("Свежая версия");
  });

  it("purges retained commands when mutation authority is revoked", async () => {
    const adapter = source({
      saveDraft: vi
        .fn()
        .mockRejectedValue(new ApiError(503, "Временно недоступно")),
    });
    const controller = useSupportCaseEscalation({
      authority: () => ({
        actorId: "lead-1",
        projectId: "project-1",
        permissions,
      }),
      source: adapter,
      createIdempotencyKey: () => "revoked-key",
    });
    await controller.load();
    await controller.save();
    permissions = ["project.case_intelligence.read"];
    controller.reset({ forgetRetained: true });
    await nextTick();
    await controller.load();
    expect(controller.pendingAttempt.value).toBeNull();
  });

  it("runs the server simulator only with PREVIEW and at least one step", async () => {
    const adapter = source();
    const controller = useSupportCaseEscalation({
      authority: () => ({
        actorId: "lead-1",
        projectId: "project-1",
        permissions,
      }),
      source: adapter,
    });
    await controller.load();
    expect(await controller.runSimulation()).toBe(false);
    const step = createSimulationStep("EXPLICIT_HUMAN_REQUEST", 0);
    step.ruleCode = "HUMAN_REQUEST_RU";
    controller.simulationSteps.value = [step];
    expect(await controller.runSimulation()).toBe(true);
    expect(adapter.dryRun).toHaveBeenCalledWith(
      "project-1",
      expect.any(Object),
      expect.any(Array),
      expect.any(AbortSignal),
    );
  });

  it("does not send a compiled draft after the actor switches Project", async () => {
    const compilation = deferred<never>();
    const adapter = source({
      compile: vi.fn().mockReturnValue(compilation.promise),
    });
    let projectId = "project-1";
    const controller = useSupportCaseEscalation({
      authority: () => ({ actorId: "lead-1", projectId, permissions }),
      source: adapter,
    });
    await controller.load();
    const saving = controller.save();
    projectId = "project-2";
    controller.reset();
    compilation.resolve({} as never);
    expect(await saving).toBe(false);
    expect(adapter.saveDraft).not.toHaveBeenCalled();
  });

  it("discards a late simulator result after scope reset", async () => {
    const result = deferred<never>();
    const adapter = source({ dryRun: vi.fn().mockReturnValue(result.promise) });
    const controller = useSupportCaseEscalation({
      authority: () => ({
        actorId: "lead-1",
        projectId: "project-1",
        permissions,
      }),
      source: adapter,
    });
    await controller.load();
    controller.simulationSteps.value.push(createSimulationStep("NO_MATCH", 0));
    const simulation = controller.runSimulation();
    controller.reset();
    result.resolve({
      executionMode: "NON_DISPATCHING",
      sideEffectsCommitted: false,
      steps: [],
    } as never);
    expect(await simulation).toBe(false);
    expect(controller.simulation.value).toBeNull();
  });

  it("restores an old Project attempt when the actor returns", async () => {
    const adapter = source({
      saveDraft: vi
        .fn()
        .mockRejectedValue(new ApiError(504, "Исход неизвестен")),
    });
    let projectId = "project-1";
    const controller = useSupportCaseEscalation({
      authority: () => ({ actorId: "lead-1", projectId, permissions }),
      source: adapter,
      createIdempotencyKey: () => "project-one-key",
    });
    await controller.load();
    await controller.save();
    projectId = "project-2";
    controller.reset();
    projectId = "project-1";
    await controller.load();
    expect(controller.pendingAttempt.value).toMatchObject({
      operation: "SAVE",
      key: "project-one-key",
    });
    controller.reset({ forgetRetained: true });
  });

  it("uses the same intent for exact replay when command lookup has no receipt", async () => {
    const saveDraft = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(503, "Исход неизвестен"))
      .mockResolvedValueOnce({});
    const adapter = source({
      saveDraft,
      lookupCommand: vi
        .fn()
        .mockRejectedValue(new ApiError(404, "Команда не найдена")),
    });
    const controller = useSupportCaseEscalation({
      authority: () => ({
        actorId: "lead-1",
        projectId: "project-1",
        permissions,
      }),
      source: adapter,
      createIdempotencyKey: () => "same-key",
    });
    await controller.load();
    await controller.save();
    expect(await controller.retryPending()).toBe(true);
    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(saveDraft.mock.calls[1]?.[3]).toBe("same-key");
  });
});
