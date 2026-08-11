import {
  contractOperation,
  contractSchema,
  requireOperationPermission,
  requireSchemaFields,
  requireSchemaPropertyEnum,
} from "./openapi-contract-assertions.mjs";

const PROJECT_OPERATIONS = [
  ["CaseIntelligence_current", "project.case_intelligence.read"],
  ["CaseIntelligence_modelProfiles", "project.case_intelligence.read"],
  ["CaseIntelligence_compileDetection", "project.case_intelligence.preview"],
  ["CaseIntelligence_validateDetection", "project.case_intelligence.preview"],
  ["CaseIntelligence_dryRun", "project.case_intelligence.preview"],
  ["CaseIntelligence_calibration", "project.case_intelligence.preview"],
  [
    "CaseIntelligence_saveDetectionDraft",
    "project.case_intelligence.detection.manage",
  ],
  [
    "CaseIntelligence_discardDetectionDraft",
    "project.case_intelligence.detection.manage",
  ],
  [
    "CaseIntelligence_publishDetection",
    "project.case_intelligence.release.manage",
  ],
  ["CaseIntelligence_compileEscalation", "project.case_intelligence.preview"],
  ["CaseIntelligence_dryRunEscalation", "project.case_intelligence.preview"],
  ["CaseIntelligence_projectSafetyPolicy", "project.case_intelligence.read"],
  [
    "CaseIntelligence_saveEscalationDraft",
    "project.case_intelligence.escalation.manage",
  ],
  [
    "CaseIntelligence_discardEscalationDraft",
    "project.case_intelligence.escalation.manage",
  ],
  [
    "CaseIntelligence_publishEscalation",
    "project.case_intelligence.release.manage",
  ],
  [
    "CaseIntelligence_saveBudgetDraft",
    "project.case_intelligence.release.manage",
  ],
  [
    "CaseIntelligence_publishBudget",
    "project.case_intelligence.release.manage",
  ],
  ["CaseIntelligence_getRelease", "project.case_intelligence.read"],
  [
    "CaseIntelligence_listDecisions",
    "project.case_intelligence.decisions.read",
  ],
  ["CaseIntelligence_explainCase", "project.case_intelligence.decisions.read"],
  [
    "CaseIntelligence_correctDecision",
    "project.case_intelligence.labels.review",
  ],
  ["EndUserCases_costSummary", "project.ai_usage.read"],
];

const STRONG_AUTH_OPERATIONS = [
  "CaseIntelligence_publishDetection",
  "CaseIntelligence_publishEscalation",
  "CaseIntelligence_publishBudget",
  "CaseIntelligence_activateRelease",
  "CaseIntelligence_pauseRelease",
  "CaseIntelligence_rollbackRelease",
  "CaseIntelligenceSafety_publish",
  "CaseIntelligenceCircuit_publish",
];

export function validateSupportCaseIntelligenceContract(document) {
  for (const [operationId, permission] of PROJECT_OPERATIONS) {
    requireOperationPermission(
      contractOperation(document, operationId),
      permission,
    );
  }

  const lookup = contractOperation(document, "CaseIntelligence_lookupCommand");
  const lookupPermissions = new Set(
    (lookup["x-iam-any-permission"] ?? []).map((item) => item.code),
  );
  for (const permission of [
    "project.case_intelligence.detection.manage",
    "project.case_intelligence.escalation.manage",
    "project.case_intelligence.release.manage",
    "project.case_intelligence.labels.review",
  ]) {
    if (!lookupPermissions.has(permission))
      throw new Error(
        `CaseIntelligence_lookupCommand must publish ${permission}`,
      );
  }

  for (const operationId of STRONG_AUTH_OPERATIONS) {
    if (
      contractOperation(document, operationId)[
        "x-iam-fresh-strong-authentication"
      ] !== true
    )
      throw new Error(
        `${operationId} must require fresh strong authentication`,
      );
  }

  requireSchemaFields(document, "CaseIntelligenceCurrentResponseDto", [
    "safety",
    "detection",
    "escalation",
    "budget",
    "runtime",
    "release",
    "minimumSafetyRevisionId",
    "allowedActions",
  ]);
  requireSchemaFields(document, "CaseIntelligenceDetectionPolicyDto", [
    "scope",
    "locales",
    "channels",
    "fallbackLocale",
    "audience",
    "topics",
    "rules",
    "attachWindowMs",
    "reopenWindowMs",
    "confidenceTiers",
    "ambiguityAction",
    "routerContext",
    "runtimeLimits",
    "debounceMs",
    "modelProfileRevisionId",
  ]);
  requireSchemaFields(document, "CaseIntelligenceTopicDto", [
    "code",
    "label",
    "description",
    "positiveExamples",
    "negativeExamples",
  ]);
  requireSchemaPropertyEnum(
    document,
    "CaseIntelligenceDetectionRuleDto",
    "kind",
    ["EXACT", "PHRASE", "ATTRIBUTE", "SEMANTIC_STATEMENT"],
  );
  requireSchemaFields(document, "CaseIntelligenceDetectionValidationResponseDto", [
    "valid",
    "issues",
  ]);
  requireSchemaFields(document, "CaseIntelligenceModelProfileCatalogItemDto", [
    "revisionId",
    "displayName",
    "description",
    "scope",
    "provider",
    "modelId",
    "reasoningEffort",
    "maxOutputTokens",
    "compatibilityHash",
  ]);
  requireSchemaFields(document, "CaseIntelligenceDryRunDto", [
    "definition",
    "messages",
  ]);
  requireSchemaFields(document, "CaseIntelligenceDryRunResponseDto", [
    "executionMode",
    "dialogMessageIds",
    "caseDecision",
    "reasonCode",
    "matchedRuleCodes",
    "messageResults",
    "candidates",
    "cost",
    "stages",
  ]);
  requireSchemaFields(document, "CaseIntelligenceCalibrationResponseDto", [
    "state",
    "modelProfileRevisionId",
    "calibratorRevisionId",
    "datasetRevisionId",
    "minimumSamples",
    "maximumIntervalWidth",
    "autoApplyThreshold",
    "cells",
  ]);
  requireSchemaFields(document, "CaseIntelligenceEscalationPolicyDto", [
    "explicitHumanRequestRules",
    "ambiguousHumanTermRules",
    "trustedOutcomeLimits",
    "scenarios",
    "clarificationLimit",
    "failedResolutionLimit",
    "noMatchLimit",
    "repeatLimit",
    "offerCooldownSeconds",
    "offerResponseTimeoutSeconds",
    "routingPolicyRevisionId",
  ]);
  requireSchemaPropertyEnum(
    document,
    "CaseIntelligenceAmbiguousRuleDto",
    "action",
    ["OFFER", "ASK_REASON_ONCE", "ESCALATE"],
  );
  requireSchemaPropertyEnum(
    document,
    "CaseIntelligenceTrustedOutcomeLimitDto",
    "outcome",
    ["NO_ANSWER", "KNOWLEDGE_INSUFFICIENT", "TOOL_FAILED", "UNRESOLVED"],
  );
  requireSchemaPropertyEnum(
    document,
    "CaseIntelligenceEscalationSimulationStepDto",
    "kind",
    [
      "EXPLICIT_HUMAN_REQUEST",
      "AMBIGUOUS_HUMAN_TERM",
      "SCENARIO",
      "TRUSTED_OUTCOME",
      "CLARIFICATION",
      "NO_MATCH",
      "REPEAT",
      "OFFER_ACCEPTED",
      "OFFER_DECLINED",
      "OFFER_TIMEOUT",
      "VERIFIED_RESOLUTION",
      "NEW_CASE_OR_TOPIC",
      "CASE_TERMINAL",
      "ESCALATION_COMMITTED",
      "POLICY_SWITCH",
    ],
  );
  requireSchemaPropertyEnum(
    document,
    "CaseIntelligenceEscalationSimulationStepResponseDto",
    "routingAdmission",
    ["NOT_REQUIRED", "ROUTABLE", "OUT_OF_HOURS", "NO_ELIGIBLE_TEAM", "DELIVERY_DEGRADED"],
  );
  requireSchemaFields(document, "CaseIntelligenceProjectSafetyPolicyResponseDto", [
    "revisionId",
    "authority",
    "projectOverrideAllowed",
    "locales",
    "channels",
    "classes",
  ]);
  requireSchemaPropertyEnum(document, "CaseIntelligenceProjectSafetyClassDto", "code", [
    "SELF_HARM_OR_SUICIDE",
    "CREDIBLE_THREAT_OR_VIOLENCE",
    "HARM_INVOLVING_MINORS",
    "RESPONSIBLE_GAMING_CRISIS",
  ]);

  const routerContext = contractSchema(
    document,
    "CaseIntelligenceRouterContextDto",
  );
  if (routerContext.properties?.maxSignals?.maximum !== 8)
    throw new Error("CaseIntelligenceRouterContextDto.maxSignals must remain <= 8");
  const detectionPolicy = contractSchema(
    document,
    "CaseIntelligenceDetectionPolicyDto",
  );
  for (const field of ["attachWindowMs", "reopenWindowMs"]) {
    if (detectionPolicy.properties?.[field]?.maximum !== 31_536_000_000)
      throw new Error(`${field} must retain the one-year maximum`);
  }

  for (const operationId of [
    "CaseIntelligence_modelProfiles",
    "CaseIntelligence_validateDetection",
    "CaseIntelligence_dryRun",
    "CaseIntelligence_calibration",
    "CaseIntelligence_dryRunEscalation",
    "CaseIntelligence_projectSafetyPolicy",
  ]) {
    const operation = contractOperation(document, operationId);
    for (const status of ["400", "401", "403", "404", "409", "428", "503"]) {
      const schema = operation.responses?.[status]?.content?.["application/json"]?.schema;
      const codes = schema?.properties?.error?.properties?.code?.enum;
      if (!Array.isArray(codes) || codes.length === 0)
        throw new Error(`${operationId} ${status} must publish a typed error code`);
    }
  }
  requireSchemaPropertyEnum(
    document,
    "CaseIntelligenceDetectionRuleDto",
    "action",
    ["NO_CASE", "CREATE", "ATTACH", "REOPEN", "DEFER"],
  );
  requireSchemaPropertyEnum(
    document,
    "CaseIntelligenceDryRunResponseDto",
    "caseDecision",
    ["NO_CASE", "CREATE", "ATTACH", "REOPEN", "DEFER"],
  );

  const current = contractOperation(document, "CaseIntelligence_current");
  if (!current.responses?.["200"]?.headers?.ETag)
    throw new Error("CaseIntelligence_current must publish ETag");

  for (const schemaName of [
    "CaseIntelligenceDetectionPolicyDto",
    "CaseIntelligenceEscalationPolicyDto",
    "CaseIntelligenceBudgetPolicyDto",
    "CaseIntelligenceReleaseRevisionResponseDto",
    "CaseIntelligenceDecisionLogItemDto",
  ]) {
    if (contractSchema(document, schemaName).additionalProperties !== false)
      throw new Error(`${schemaName} must stay closed`);
  }
}
