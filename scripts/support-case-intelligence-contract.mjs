import {
  contractOperation,
  contractSchema,
  requireOperationPermission,
  requireSchemaFields,
  requireSchemaPropertyEnum,
} from "./openapi-contract-assertions.mjs";

const PROJECT_OPERATIONS = [
  ["CaseIntelligence_current", "project.case_intelligence.read"],
  ["CaseIntelligence_compileDetection", "project.case_intelligence.preview"],
  ["CaseIntelligence_dryRun", "project.case_intelligence.preview"],
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
  ["EndUserCases_costSummary", "project.case_intelligence.cost.read"],
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
