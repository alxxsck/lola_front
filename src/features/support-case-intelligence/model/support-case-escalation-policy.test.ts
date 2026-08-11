import { describe, expect, it } from "vitest";
import {
  createDefaultEscalationPolicy,
  createSimulationStep,
  normalizeSimulationStepSafety,
  routingAdmissionPresentation,
  simulationStepSafetyIssue,
  simulationStepReferenceIssue,
  simulationStepShapeIssue,
  validateEscalationPolicy,
} from "./support-case-escalation-policy";

describe("support-case-escalation-policy", () => {
  it("creates all four trusted server outcomes and valid bounded defaults", () => {
    const policy = createDefaultEscalationPolicy();
    expect(policy.trustedOutcomeLimits.map((item) => item.outcome)).toEqual([
      "NO_ANSWER",
      "KNOWLEDGE_INSUFFICIENT",
      "TOOL_FAILED",
      "UNRESOLVED",
    ]);
    expect(validateEscalationPolicy(policy)).toEqual([]);
  });

  it("rejects unstable codes, empty phrases and invalid server thresholds", () => {
    const policy = createDefaultEscalationPolicy();
    policy.explicitHumanRequestRules = [
      { code: "human request", locales: [], phrases: [] },
    ];
    policy.offerResponseTimeoutSeconds = 10;
    const issues = validateEscalationPolicy(policy);
    expect(issues.map((item) => item.path)).toEqual(
      expect.arrayContaining([
        "explicitHumanRequestRules[0].code",
        "explicitHumanRequestRules[0].locales",
        "explicitHumanRequestRules[0].phrases",
        "offerResponseTimeoutSeconds",
      ]),
    );
  });

  it("creates fenced simulator identifiers and honest routing copy", () => {
    const step = createSimulationStep("EXPLICIT_HUMAN_REQUEST", 0);
    expect(step.attemptId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(step.outcomeId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(routingAdmissionPresentation("OUT_OF_HOURS").copy).toContain(
      "в рабочее время",
    );
    expect(routingAdmissionPresentation("NO_ELIGIBLE_TEAM").copy).not.toContain(
      "оператор подключается",
    );
  });

  it("validates and normalizes every simulator safety-state boundary", () => {
    const urgent = createSimulationStep("SCENARIO", 0);
    urgent.safetyState = "URGENT";
    expect(simulationStepSafetyIssue(urgent)).toContain("класс безопасности");
    urgent.safetyRiskClass = "SELF_HARM_OR_SUICIDE";
    expect(simulationStepSafetyIssue(urgent)).toBe("");

    const failed = createSimulationStep("TRUSTED_OUTCOME", 1);
    failed.safetyState = "FAILED";
    failed.safetyRiskClass = "SELF_HARM_OR_SUICIDE";
    expect(simulationStepSafetyIssue(failed)).toContain(
      "только для обнаруженного риска",
    );
    expect(normalizeSimulationStepSafety(failed).safetyRiskClass).toBeNull();

    const policySwitch = createSimulationStep("POLICY_SWITCH", 2);
    policySwitch.safetyState = "SUSPECTED";
    policySwitch.safetyRiskClass = "SELF_HARM_OR_SUICIDE";
    expect(simulationStepSafetyIssue(policySwitch)).toContain(
      "безопасного состояния",
    );
    expect(normalizeSimulationStepSafety(policySwitch)).toMatchObject({
      safetyState: "CLEAR",
      safetyRiskClass: null,
    });
  });

  it("rejects simulator events without their exact required reference", () => {
    expect(
      simulationStepShapeIssue(
        createSimulationStep("EXPLICIT_HUMAN_REQUEST", 0),
      ),
    ).toContain("правило");
    expect(
      simulationStepShapeIssue(createSimulationStep("SCENARIO", 1)),
    ).toContain("сценарий");
    expect(
      simulationStepShapeIssue(createSimulationStep("TRUSTED_OUTCOME", 2)),
    ).toContain("результат");
    expect(
      simulationStepShapeIssue(createSimulationStep("POLICY_SWITCH", 3)),
    ).toContain("версию правил");

    const removedRule = createSimulationStep("EXPLICIT_HUMAN_REQUEST", 4);
    removedRule.ruleCode = "REMOVED_RULE";
    expect(
      simulationStepReferenceIssue(
        removedRule,
        createDefaultEscalationPolicy(),
      ),
    ).toContain("больше не существует");

    const forbiddenReference = createSimulationStep("NO_MATCH", 5);
    forbiddenReference.scenarioCode = "STALE_SCENARIO";
    expect(
      simulationStepReferenceIssue(
        forbiddenReference,
        createDefaultEscalationPolicy(),
      ),
    ).toContain("не должно быть ссылки");
  });
});
