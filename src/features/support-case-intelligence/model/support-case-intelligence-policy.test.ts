import { describe, expect, it } from "vitest";
import {
  caseIntelligenceReasonLabel,
  createDefaultBudgetPolicy,
  createDefaultDetectionPolicy,
  createRule,
  createTopic,
  normalizeStableCode,
  prepareDetectionPolicyForAuthoring,
  presentCaseIntelligenceRuntime,
  presentCaseIntelligenceModelSetup,
  synchronizeProjectLocales,
  validateBudgetPolicy,
  validateDetectionPolicy,
} from "./support-case-intelligence-policy";

describe("Case Intelligence policy form", () => {
  it("creates a safe, structurally valid empty policy", () => {
    const policy = createDefaultDetectionPolicy();
    expect(validateDetectionPolicy(policy)).toEqual([]);
    expect(policy.channels).toEqual(["TEXT"]);
    expect(policy.ambiguityAction).toBe("DEFER");
  });

  it("normalizes category codes while the operator types", () => {
    expect(normalizeStableCode(" deposit-1 ")).toBe("DEPOSIT_1");
    expect(normalizeStableCode("12 deposits")).toBe("C_12_DEPOSITS");
    expect(normalizeStableCode("оплата")).toBe("");
  });

  it("uses all project languages and the project default as fallback", () => {
    const policy = createDefaultDetectionPolicy();
    policy.locales = ["en-US"];
    policy.fallbackLocale = "en-US";

    synchronizeProjectLocales(policy, ["ru", "en", "ru"], "ru");

    expect(policy.locales).toEqual(["ru", "en"]);
    expect(policy.fallbackLocale).toBe("ru");
  });

  it("repairs the invalid hidden rule limit from a migrated policy", () => {
    const policy = createDefaultDetectionPolicy();
    policy.runtimeLimits.maxRulesEvaluated = 0;

    const prepared = prepareDetectionPolicyForAuthoring(policy);

    expect(prepared.runtimeLimits.maxRulesEvaluated).toBe(20);
    expect(policy.runtimeLimits.maxRulesEvaluated).toBe(0);
    expect(validateDetectionPolicy(prepared)).not.toContainEqual(
      expect.objectContaining({ path: "runtimeLimits.maxRulesEvaluated" }),
    );
  });

  it("finds duplicate and incomplete categories and rules", () => {
    const policy = createDefaultDetectionPolicy();
    policy.topics = [createTopic(1), createTopic(1)];
    policy.rules = [createRule(1)];

    const issues = validateDetectionPolicy(policy);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "topics.1.code", severity: "ERROR" }),
        expect.objectContaining({
          path: "topics.0.description",
          severity: "ERROR",
        }),
        expect.objectContaining({ path: "rules.0.phrase", severity: "ERROR" }),
      ]),
    );
  });

  it("requires confidence thresholds to grow monotonically", () => {
    const policy = createDefaultDetectionPolicy();
    policy.confidenceTiers = { monitor: 0.8, suggest: 0.6, autoApply: 0.9 };
    expect(validateDetectionPolicy(policy)).toContainEqual(
      expect.objectContaining({ path: "confidenceTiers", severity: "ERROR" }),
    );
  });

  it("validates budget order without losing large integer precision", () => {
    const budget = createDefaultBudgetPolicy();
    budget.dailyTokenSoftCap = "9007199254740993";
    budget.dailyTokenHardCap = "9007199254740992";
    expect(validateBudgetPolicy(budget)).toContainEqual(
      expect.objectContaining({ path: "dailyTokenSoftCap" }),
    );
  });

  it("maps every published dry-run reason to safe Russian copy", () => {
    const reasons = [
      "CASE_INTELLIGENCE_DETERMINISTIC_RULE_MATCH",
      "CASE_INTELLIGENCE_NO_DETERMINISTIC_MATCH",
      "CASE_INTELLIGENCE_QUOTED_OR_NEGATED_MATCH",
      "CASE_INTELLIGENCE_RULE_CONFLICT",
    ];
    expect(reasons.map(caseIntelligenceReasonLabel)).toEqual([
      "совпало опубликованное детерминированное правило",
      "детерминированное правило не найдено",
      "фраза найдена в цитате или отрицании — решение передано на проверку",
      "совпали равноприоритетные правила — решение передано на проверку",
    ]);
    expect(caseIntelligenceReasonLabel("NEW_SERVER_REASON")).toContain(
      "неизвестную причину",
    );
  });

  it("enforces server collection and runtime bounds before save", () => {
    const policy = createDefaultDetectionPolicy();
    policy.topics = Array.from({ length: 51 }, (_, index) => ({
      ...createTopic(index + 1),
      description: "Категория",
    }));
    policy.runtimeLimits.maxEvaluationMs = 5001;
    policy.audience.include = [
      { attributeCode: "segment", operator: "EQ", value: "" },
    ];
    policy.rules = [
      {
        ...createRule(1),
        kind: "ATTRIBUTE",
        attributeCode: "profile_field",
        operator: "IN",
        value: Array.from({ length: 51 }, (_, index) => `VALUE_${index}`),
      },
    ];
    policy.topics[0]!.positiveExamples = ["x".repeat(501)];
    expect(validateDetectionPolicy(policy)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "topics", severity: "ERROR" }),
        expect.objectContaining({
          path: "runtimeLimits.maxEvaluationMs",
          severity: "ERROR",
        }),
        expect.objectContaining({
          path: "audience.include.0.attributeCode",
          severity: "ERROR",
        }),
        expect.objectContaining({
          path: "rules.0.value",
          severity: "ERROR",
        }),
        expect.objectContaining({
          path: "topics.0.positiveExamples",
          severity: "ERROR",
        }),
      ]),
    );
  });

  it("validates numeric budget bounds from the pinned contract", () => {
    const budget = createDefaultBudgetPolicy();
    budget.maxConcurrentRuns = 0;
    budget.routeMaxEstimatedTokens = 20_001;
    expect(validateBudgetPolicy(budget)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "maxConcurrentRuns" }),
        expect.objectContaining({ path: "routeMaxEstimatedTokens" }),
      ]),
    );
  });

  it("describes only the detection revision pinned by the active bundle as working", () => {
    type Snapshot = NonNullable<
      Parameters<typeof presentCaseIntelligenceRuntime>[0]
    >;
    const withoutBundle = {
      allowedActions: [],
      detection: {
        draft: null,
        published: { id: "latest-detection" },
      },
      release: null,
      runtime: {
        currentReleaseRevisionId: null,
        status: "LIVE",
        version: 1,
      },
    } as unknown as Snapshot;
    expect(presentCaseIntelligenceRuntime(withoutBundle).label).toContain(
      "ещё не собрана",
    );

    const withBundle = {
      ...withoutBundle,
      release: {
        detectionPolicyRevisionId: "active-detection",
      },
    } as unknown as Snapshot;
    expect(presentCaseIntelligenceRuntime(withBundle).label).toBe(
      "Правила применяются",
    );
    expect(
      presentCaseIntelligenceRuntime({
        ...withBundle,
        runtime: { ...withBundle.runtime!, status: "PAUSED" },
      }).label,
    ).toContain("приостановлена");
    expect(
      presentCaseIntelligenceRuntime({
        ...withBundle,
        runtime: {
          ...withBundle.runtime!,
          status: "SAFETY_RECONCILING",
        },
      }).label,
    ).toContain("безопасности");
  });

  it("distinguishes an unprepared platform catalog from a project selection", () => {
    expect(presentCaseIntelligenceModelSetup(false, 0, null)).toBeNull();
    expect(presentCaseIntelligenceModelSetup(true, 0, null)).toEqual({
      title: "Настройки проекта готовы — не подключён сервис классификации",
      copy: "Администратору платформы нужно подключить модель классификации и проверочный набор на сервере. В CMS такого раздела пока нет; настройки безопасности сообщений это не исправляют.",
      action: null,
    });
    expect(presentCaseIntelligenceModelSetup(true, 1, null)).toEqual({
      title: "Выберите модель классификации",
      copy: "После выбора станут доступны проверка и публикация.",
      action: "Выбрать модель",
    });
    expect(presentCaseIntelligenceModelSetup(true, 1, "model-v1")).toBeNull();
  });
});
