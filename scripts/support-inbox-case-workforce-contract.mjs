import {
  contractOperation as operation,
  contractSchema as schema,
  operationParameter as parameter,
  requireOperationPermission as requirePermission,
  requireSchemaFields,
  requireSchemaProperties as requireProperties,
  requireSchemaPropertyEnum as requirePropertyEnum,
} from "./openapi-contract-assertions.mjs";

function requireAnyPermissions(operationValue, codes) {
  const actual = new Set(
    operationValue["x-iam-any-permission"]?.map((value) => value.code) ?? [],
  );
  for (const code of codes) {
    if (!actual.has(code)) {
      throw new Error(`${operationValue.operationId} must allow ${code}`);
    }
  }
}

function requireHeader(operationValue, name) {
  const value = parameter(operationValue, name);
  if (value.in !== "header" || value.required !== true) {
    throw new Error(
      `${operationValue.operationId} must require ${name} header`,
    );
  }
}

function requireParameterEnum(operationValue, name, values) {
  const actual = new Set(parameter(operationValue, name).schema?.enum ?? []);
  for (const value of values) {
    if (!actual.has(value)) {
      throw new Error(
        `${operationValue.operationId}.${name} must retain ${value}`,
      );
    }
  }
}

function inlineErrorSchema(operationValue, status) {
  const responseSchema =
    operationValue.responses?.[status]?.content?.["application/json"]?.schema;
  return (
    responseSchema?.properties?.error ??
    responseSchema?.allOf?.find((entry) => entry.properties?.error)?.properties
      ?.error
  );
}

function requireInlineErrorEnum(operationValue, status, values) {
  const actual = new Set(inlineErrorSchema(operationValue, status)?.properties?.code?.enum ?? []);
  for (const value of values) {
    if (!actual.has(value)) {
      throw new Error(
        `${operationValue.operationId} ${status}.error.code must retain ${value}`,
      );
    }
  }
}

function requireInlineErrorFields(operationValue, status, fields) {
  const errorSchema = inlineErrorSchema(operationValue, status);
  if (!errorSchema) {
    throw new Error(
      `${operationValue.operationId} must retain typed response ${status}`,
    );
  }

  const properties = errorSchema.properties ?? {};
  for (const field of fields) {
    if (!(field in properties)) {
      throw new Error(
        `${operationValue.operationId} ${status}.error must publish ${field}`,
      );
    }
  }
}

function requireInlineErrorDetailFields(operationValue, status, fields) {
  const properties =
    inlineErrorSchema(operationValue, status)?.properties?.details?.properties ?? {};
  for (const field of fields) {
    if (!(field in properties)) {
      throw new Error(
        `${operationValue.operationId} ${status}.error.details must publish ${field}`,
      );
    }
  }
}

function requireRequestSchema(operationValue, schemaName) {
  const requestSchema =
    operationValue.requestBody?.content?.["application/json"]?.schema;
  if (requestSchema?.$ref !== `#/components/schemas/${schemaName}`) {
    throw new Error(`${operationValue.operationId} must accept ${schemaName}`);
  }
}

function requireResponseSchema(operationValue, status, schemaName) {
  const responseSchema =
    operationValue.responses?.[status]?.content?.["application/json"]?.schema;
  if (responseSchema?.$ref !== `#/components/schemas/${schemaName}`) {
    throw new Error(
      `${operationValue.operationId} ${status} must return ${schemaName}`,
    );
  }
}

export function validateSupportInboxCaseWorkforceContract(document) {
  const workspaceRead = operation(document, "SupportWorkspace_read");
  requireAnyPermissions(workspaceRead, [
    "project.cases.read",
    "project.conversations.read",
  ]);
  if (parameter(workspaceRead, "mode").required !== true) {
    throw new Error("SupportWorkspace_read mode must remain required");
  }
  if (parameter(workspaceRead, "cursor").schema?.maxLength !== 2048) {
    throw new Error("SupportWorkspace_read cursor must remain bounded");
  }
  if (parameter(workspaceRead, "limit").schema?.maximum !== 100) {
    throw new Error("SupportWorkspace_read limit must remain bounded at 100");
  }
  requireProperties(document, "SupportWorkspaceCasesPageResponseDto", [
    "mode",
    "items",
  ]);
  requireProperties(document, "SupportWorkspaceCaseRowResponseDto", [
    "id",
    "endUserId",
    "projectSequence",
    "version",
    "title",
    "status",
    "priority",
    "groupCode",
    "attentionRequired",
    "lastActivityAt",
    "updatedAt",
  ]);

  const conversationList = operation(
    document,
    "AdminProjectConversations_list",
  );
  requirePermission(conversationList, "project.conversations.read");
  if (parameter(conversationList, "cursor").schema?.maxLength !== 1024) {
    throw new Error(
      "AdminProjectConversations_list cursor must remain bounded",
    );
  }
  if (parameter(conversationList, "limit").schema?.maximum !== 100) {
    throw new Error(
      "AdminProjectConversations_list limit must remain bounded at 100",
    );
  }
  for (const filter of ["status", "endUserId"]) {
    parameter(conversationList, filter);
  }
  requireProperties(document, "AdminProjectConversationsPageResponseDto", [
    "items",
  ]);

  const caseList = operation(document, "EndUserCases_list");
  requirePermission(caseList, "project.cases.read");
  if (parameter(caseList, "limit").schema?.maximum !== 100) {
    throw new Error("EndUserCases_list limit must remain bounded at 100");
  }
  if (parameter(caseList, "cursor").schema?.maxLength !== 2048) {
    throw new Error("EndUserCases_list cursor must remain bounded");
  }
  requireParameterEnum(caseList, "sort", [
    "ATTENTION_FIRST",
    "LAST_ACTIVITY",
    "OLDEST_OPEN",
    "PRIORITY",
    "RECENTLY_RESOLVED",
  ]);
  for (const filter of [
    "status",
    "priority",
    "impact",
    "urgency",
    "resolutionAssessment",
    "resolutionSource",
    "groupCode",
    "endUserId",
    "assignedCmsUserId",
    "assignment",
    "primaryLanguage",
    "channel",
    "aiCapabilityCode",
    "aiCapabilityOutcome",
    "adminAttention",
    "cmsParticipation",
    "recontacted",
    "reopened",
    "stale",
    "degraded",
    "createdFrom",
    "createdTo",
    "lastActivityFrom",
    "lastActivityTo",
  ]) {
    parameter(caseList, filter);
  }

  const caseDetail = operation(document, "EndUserCases_detail");
  requirePermission(caseDetail, "project.cases.read");
  requireProperties(document, "EndUserCaseResponseDto", [
    "id",
    "version",
    "type",
    "groupCode",
    "status",
    "availableStatuses",
    "impact",
    "urgency",
    "priority",
    "prioritySource",
    "priorityReasons",
  ]);
  requireSchemaFields(document, "SupportWorkspaceCapabilitiesResponseDto", [
    "manageCase",
    "assignCase",
    "claimAssignment",
    "releaseAssignment",
    "transferAssignment",
  ]);
  requireProperties(document, "SupportWorkspaceCapabilitiesResponseDto", [
    "manageCase",
    "assignCase",
    "claimAssignment",
    "releaseAssignment",
    "transferAssignment",
  ]);

  const workflow = operation(document, "EndUserCases_workflow");
  const classification = operation(document, "EndUserCases_classification");
  requirePermission(workflow, "project.cases.manage");
  requirePermission(classification, "project.cases.manage");
  requireProperties(document, "UpdateEndUserCaseWorkflowDto", [
    "expectedVersion",
    "idempotencyKey",
    "reason",
    "status",
  ]);
  requireProperties(document, "ClassifyEndUserCaseDto", [
    "expectedVersion",
    "idempotencyKey",
    "reason",
  ]);
  requireSchemaFields(document, "ClassifyEndUserCaseDto", [
    "type",
    "groupCode",
    "impact",
    "urgency",
    "priority",
  ]);
  requireProperties(document, "EndUserCaseCommandResponseDto", [
    "id",
    "status",
    "version",
  ]);

  const assignmentClaim = operation(document, "SupportCaseAssignment_claim");
  const assignmentAssign = operation(document, "SupportCaseAssignment_assign");
  const assignmentRelease = operation(
    document,
    "SupportCaseAssignment_release",
  );
  const assignmentTransfer = operation(
    document,
    "SupportCaseAssignment_transfer",
  );
  requirePermission(assignmentClaim, "project.support.assignments.self_manage");
  requirePermission(assignmentAssign, "project.support.assignments.override");
  requireAnyPermissions(assignmentRelease, [
    "project.support.assignments.self_manage",
    "project.support.assignments.override",
  ]);
  requirePermission(assignmentTransfer, "project.support.assignments.override");
  for (const operationValue of [
    assignmentClaim,
    assignmentAssign,
    assignmentRelease,
    assignmentTransfer,
  ]) {
    requireHeader(operationValue, "Idempotency-Key");
  }
  requireHeader(assignmentRelease, "If-Match");
  requireHeader(assignmentTransfer, "If-Match");
  requireProperties(document, "ClaimSupportCaseAssignmentDto", [
    "teamId",
    "expectedCaseVersion",
  ]);
  requireProperties(document, "AssignSupportCaseAssignmentDto", [
    "teamId",
    "operatorCmsUserId",
    "expectedCaseVersion",
    "reasonCode",
  ]);
  requireProperties(document, "ReleaseSupportCaseAssignmentDto", [
    "assignmentId",
    "expectedAssignmentVersion",
    "reasonCode",
  ]);
  requireProperties(document, "TransferSupportCaseAssignmentDto", [
    "assignmentId",
    "expectedAssignmentVersion",
    "teamId",
    "operatorCmsUserId",
    "reasonCode",
  ]);
  requireProperties(document, "SupportCaseAssignmentMutationResponseDto", [
    "intent",
    "caseVersion",
    "assignmentVersion",
    "actionEtag",
    "assignment",
  ]);
  requireProperties(document, "SupportCaseAssignmentResponseDto", [
    "id",
    "caseId",
    "state",
    "version",
    "team",
    "operator",
    "workforceRevisionId",
    "capacityWeightUnits",
  ]);
  requirePropertyEnum(
    document,
    "SupportCaseAssignmentMutationResponseDto",
    "intent",
    [
      "CLAIM_CASE_ASSIGNMENT",
      "ASSIGN_CASE_ASSIGNMENT",
      "RELEASE_CASE_ASSIGNMENT",
      "TRANSFER_CASE_ASSIGNMENT",
    ],
  );
  requirePropertyEnum(
    document,
    "AssignSupportCaseAssignmentDto",
    "reasonCode",
    ["SKILL_MATCH", "LOAD_BALANCE", "LEAD_INTERVENTION", "OTHER"],
  );
  requirePropertyEnum(
    document,
    "TransferSupportCaseAssignmentDto",
    "reasonCode",
    ["SKILL_HANDOFF", "LOAD_BALANCE", "LEAD_INTERVENTION", "OTHER"],
  );
  requirePropertyEnum(
    document,
    "ReleaseSupportCaseAssignmentDto",
    "reasonCode",
    ["WORK_RETURNED", "SHIFT_END", "LEAD_REBALANCE", "OTHER"],
  );
  for (const operationValue of [
    assignmentClaim,
    assignmentAssign,
    assignmentRelease,
    assignmentTransfer,
  ]) {
    for (const status of ["400", "403", "404"]) {
      requireInlineErrorFields(operationValue, status, ["code"]);
    }
    requireInlineErrorFields(operationValue, "409", ["code", "details"]);
    requireInlineErrorDetailFields(operationValue, "409", [
      "current",
      "currentActionEtag",
      "currentReadToken",
      "currentUnits",
      "currentVersion",
      "maxCapacityUnits",
    ]);
    requireInlineErrorEnum(operationValue, "409", [
      "CASE_VERSION_CONFLICT",
      "ASSIGNMENT_VERSION_CONFLICT",
      "ASSIGNMENT_CAPACITY_EXCEEDED",
      "ASSIGNMENT_PROJECTION_DRIFT",
      "ASSIGNMENT_LOAD_DRIFT",
      "IDEMPOTENCY_KEY_REUSED",
    ]);
  }

  const offerList = operation(document, "SupportRoutingOffer_list");
  const offerAccept = operation(document, "SupportRoutingOffer_accept");
  const offerDecline = operation(document, "SupportRoutingOffer_decline");
  for (const operationValue of [offerList, offerAccept, offerDecline]) {
    requirePermission(
      operationValue,
      "project.support.assignments.self_manage",
    );
  }
  for (const operationValue of [offerAccept, offerDecline]) {
    requireHeader(operationValue, "Idempotency-Key");
    requireHeader(operationValue, "If-Match");
    for (const status of ["400", "403", "404", "409"])
      requireInlineErrorFields(operationValue, status, ["code"]);
    requireInlineErrorEnum(operationValue, "409", [
      "SUPPORT_OFFER_VERSION_CONFLICT",
      "SUPPORT_OFFER_IDEMPOTENCY_KEY_REUSED",
      "SUPPORT_OFFER_EXPIRED",
      "SUPPORT_OFFER_ALREADY_TERMINAL",
    ]);
  }
  requireProperties(document, "SupportRoutingOwnOfferCatalogDto", ["offers"]);
  requireProperties(document, "SupportRoutingOwnOfferDto", [
    "assignmentId",
    "caseId",
    "teamId",
    "queueId",
    "assignmentVersion",
    "fencingVersion",
    "expiresAt",
    "actionEtag",
    "acceptToken",
  ]);
  requireProperties(document, "SupportRoutingOfferActionDto", [
    "expectedAssignmentVersion",
    "offerToken",
  ]);
  requireProperties(document, "SupportRoutingOfferActionReceiptDto", [
    "outcome",
    "assignmentId",
    "assignmentVersion",
    "assignmentRootVersion",
    "caseVersion",
  ]);
  requirePropertyEnum(
    document,
    "SupportRoutingOfferActionReceiptDto",
    "outcome",
    ["ACCEPTED", "DECLINED"],
  );

  const availabilityRead = operation(
    document,
    "SupportOperatorAvailability_read",
  );
  const availabilitySet = operation(
    document,
    "SupportOperatorAvailability_setOwn",
  );
  const availabilityHeartbeat = operation(
    document,
    "SupportOperatorAvailability_heartbeatOwn",
  );
  const availabilityOverride = operation(
    document,
    "SupportOperatorAvailability_overrideOperator",
  );
  requirePermission(availabilityRead, "project.support.availability.read");
  requirePermission(
    availabilitySet,
    "project.support.availability.self_manage",
  );
  requirePermission(
    availabilityHeartbeat,
    "project.support.availability.self_manage",
  );
  requirePermission(
    availabilityOverride,
    "project.support.availability.override",
  );
  for (const operationValue of [availabilitySet, availabilityOverride]) {
    requireHeader(operationValue, "If-Match");
    requireHeader(operationValue, "Idempotency-Key");
  }
  requireHeader(availabilityHeartbeat, "If-Match");
  requireProperties(document, "SetSupportOperatorAvailabilityDto", [
    "state",
    "reasonCode",
  ]);
  requireProperties(document, "SupportOperatorAvailabilityResponseDto", [
    "projectId",
    "operatorId",
    "declaredState",
    "effectiveState",
    "acceptsNewWork",
    "version",
    "leaseUntil",
    "effectiveUntil",
    "reasonCode",
    "source",
    "transitionedAt",
    "leaseRenewedAt",
  ]);
  requirePropertyEnum(
    document,
    "SupportOperatorAvailabilityResponseDto",
    "effectiveState",
    ["OFFLINE", "AVAILABLE", "BUSY", "AWAY", "DRAINING"],
  );
  requirePropertyEnum(
    document,
    "SupportOperatorAvailabilityResponseDto",
    "source",
    ["SELF", "LEAD_OVERRIDE", "LEASE_EXPIRY"],
  );

  const workforceRead = operation(document, "SupportWorkforce_getWorkforce");
  const workforceTeams = operation(document, "SupportWorkforce_listTeams");
  const workforceSkills = operation(document, "SupportWorkforce_listSkills");
  for (const operationValue of [
    workforceRead,
    workforceTeams,
    workforceSkills,
  ]) {
    requireAnyPermissions(operationValue, [
      "project.support.teams.read",
      "project.support.teams.manage",
    ]);
  }
  requireProperties(document, "SupportWorkforceSettingsResponseDto", [
    "mode",
    "view",
    "rootVersion",
    "actionEtag",
    "currentRevisionNumber",
  ]);
  requireProperties(document, "ReplaceSupportWorkforceDraftDto", [
    "operators",
    "teams",
  ]);
  requireProperties(document, "SupportWorkforceOperatorDto", [
    "cmsUserId",
    "languages",
    "maxCapacityUnits",
    "skills",
  ]);
  requireProperties(document, "SupportWorkforceTeamDto", [
    "teamId",
    "members",
    "languages",
    "skills",
  ]);

  const queueList = operation(document, "SupportQueue_list");
  const queueCases = operation(document, "SupportQueue_cases");
  for (const operationValue of [queueList, queueCases]) {
    requireAnyPermissions(operationValue, [
      "project.support.queues.read",
      "project.support.queues.manage",
    ]);
  }
  if (parameter(queueList, "limit").schema?.maximum !== 100) {
    throw new Error("SupportQueue_list limit must remain bounded at 100");
  }
  if (parameter(queueCases, "limit").schema?.maximum !== 200) {
    throw new Error("SupportQueue_cases limit must remain bounded at 200");
  }
  requireProperties(document, "SupportQueueCatalogResponseDto", [
    "view",
    "items",
    "nextCursor",
  ]);
  requireProperties(document, "SupportQueueCasesPageResponseDto", [
    "queueId",
    "revisionId",
    "generationId",
    "items",
    "nextCursor",
    "count",
    "freshness",
  ]);
  requireProperties(document, "SupportQueueEntryResponseDto", [
    "caseId",
    "effectivePriority",
    "eligibleSince",
    "evaluatedAt",
    "createdAt",
    "lastActivityAt",
    "slaDueAt",
  ]);
  requireProperties(document, "SupportQueueFreshnessResponseDto", [
    "state",
    "computedAt",
    "sourceHighWater",
    "currentSourceHighWater",
    "lagMilliseconds",
  ]);
  requirePropertyEnum(document, "SupportQueueFreshnessResponseDto", "state", [
    "READY",
    "BUILDING",
    "DEGRADED",
  ]);

  const routingActivation = operation(
    document,
    "SupportRoutingRuntime_activation",
  );
  const routingDecision = operation(
    document,
    "SupportRoutingRuntime_decisionDetail",
  );
  for (const operationValue of [routingActivation, routingDecision]) {
    requireAnyPermissions(operationValue, [
      "project.support.routing.read",
      "project.support.routing.manage",
    ]);
  }
  requireProperties(document, "SupportRoutingRolloutResponseDto", [
    "hardCeiling",
    "emergencyDisabled",
    "version",
    "actionEtag",
    "activations",
  ]);
  requireProperties(document, "SupportRoutingDecisionDetailResponseDto", [
    "id",
    "caseId",
    "outcome",
    "queueId",
    "queueRevisionId",
    "queueGenerationId",
    "policyId",
    "policyRevisionId",
    "workforceRevisionId",
    "selectedOperatorId",
    "candidateCount",
    "exclusionCounts",
    "algorithmRevision",
    "resultHash",
    "evaluationFingerprint",
    "evaluatedAt",
    "inputManifest",
    "sourceVector",
  ]);
  requirePropertyEnum(
    document,
    "SupportRoutingRolloutResponseDto",
    "hardCeiling",
    ["DISABLED", "SHADOW", "OFFER", "AUTO_ASSIGN"],
  );

  const slaSettings = operation(document, "SupportSlaConfiguration_read");
  const slaCorrection = operation(
    document,
    "SupportSlaHumanCommand_correctClock",
  );
  requireAnyPermissions(slaSettings, [
    "project.support.sla.read",
    "project.support.sla.manage",
  ]);
  requirePermission(slaCorrection, "project.support.sla.correct");
  requireHeader(slaCorrection, "If-Match");
  requireHeader(slaCorrection, "Idempotency-Key");
  requireProperties(document, "SupportSlaConfigurationSettingsResponseDto", [
    "mode",
    "rootVersion",
    "actionEtag",
    "rolloutState",
  ]);
  requireSchemaFields(document, "SupportSlaConfigurationSettingsResponseDto", [
    "reconciliationCheckpoint",
  ]);
  requireProperties(document, "SupportSlaCorrectClockMutationResponseDto", [
    "intent",
    "caseId",
    "clockId",
    "clockVersion",
    "timing",
    "risk",
    "outcome",
    "actionEtag",
  ]);
  requirePropertyEnum(
    document,
    "SupportSlaConfigurationSettingsResponseDto",
    "rolloutState",
    ["DISABLED", "SHADOW"],
  );
  requirePropertyEnum(
    document,
    "SupportSlaCorrectClockMutationResponseDto",
    "risk",
    ["ON_TRACK", "AT_RISK", "BREACHED"],
  );

  const searchCases = operation(document, "SupportSearch_cases");
  const searchConversations = operation(
    document,
    "SupportSearch_conversations",
  );
  const searchMessages = operation(document, "SupportSearch_messages");
  const searchUsers = operation(document, "SupportSearch_users");
  const searchContracts = [
    [searchCases, "SupportCaseSearchQueryDto", "SupportSearchCasePageResponseDto"],
    [
      searchConversations,
      "SupportConversationSearchQueryDto",
      "SupportSearchConversationPageResponseDto",
    ],
    [
      searchMessages,
      "SupportMessageSearchQueryDto",
      "SupportSearchMessagePageResponseDto",
    ],
    [
      searchUsers,
      "SupportEndUserSearchQueryDto",
      "SupportSearchEndUserPageResponseDto",
    ],
  ];
  for (const [operationValue, requestSchema, responseSchema] of searchContracts) {
    requirePermission(operationValue, "project.support.search.read");
    requireRequestSchema(operationValue, requestSchema);
    requireResponseSchema(operationValue, "200", responseSchema);
  }
  for (const schemaName of [
    "SupportCaseSearchQueryDto",
    "SupportConversationSearchQueryDto",
    "SupportMessageSearchQueryDto",
    "SupportEndUserSearchQueryDto",
  ]) {
    const searchQuery = schema(document, schemaName).properties;
    if (
      searchQuery?.limit?.maximum !== 100 ||
      searchQuery?.cursor?.maxLength !== 2048 ||
      searchQuery?.phrase?.minLength !== 2 ||
      searchQuery?.phrase?.maxLength !== 256
    ) {
      throw new Error(`${schemaName} bounds changed`);
    }
  }

  const savedViewCatalog = operation(document, "SavedSupportView_catalog");
  const savedViewCreate = operation(document, "SavedSupportView_create");
  const savedViewReplace = operation(document, "SavedSupportView_replace");
  const savedViewPublish = operation(document, "SavedSupportView_publish");
  const savedViewArchive = operation(document, "SavedSupportView_archive");
  const savedViewQuery = operation(document, "SavedSupportView_query");
  const activePresetQuery = operation(document, "SupportViewPreset_query");
  requireAnyPermissions(savedViewCatalog, [
    "project.support.saved_views.read",
    "project.support.saved_views.self_manage",
    "project.support.saved_views.manage",
  ]);
  for (const operationValue of [
    savedViewCreate,
    savedViewReplace,
    savedViewPublish,
    savedViewArchive,
  ]) {
    requireAnyPermissions(operationValue, [
      "project.support.saved_views.self_manage",
      "project.support.saved_views.manage",
    ]);
    requireHeader(operationValue, "Idempotency-Key");
  }
  for (const operationValue of [
    savedViewReplace,
    savedViewPublish,
    savedViewArchive,
  ]) {
    requireHeader(operationValue, "If-Match");
  }
  requirePermission(savedViewQuery, "project.support.search.read");
  requirePermission(activePresetQuery, "project.support.search.read");
  requireRequestSchema(savedViewCreate, "CreateSavedSupportViewDto");
  requireRequestSchema(savedViewReplace, "ReplaceSavedSupportViewDraftDto");
  requireRequestSchema(savedViewQuery, "SavedSupportViewQueryDto");
  requireRequestSchema(activePresetQuery, "SavedSupportViewQueryDto");
  requireProperties(document, "CreateSavedSupportViewDto", [
    "code",
    "scope",
    "draft",
  ]);
  requireProperties(document, "ReplaceSavedSupportViewDraftDto", ["draft"]);
  requirePropertyEnum(document, "CreateSavedSupportViewDto", "scope", [
    "PERSONAL",
    "TEAM",
    "PROJECT",
  ]);
  requireResponseSchema(
    savedViewCatalog,
    "200",
    "SavedSupportViewCatalogResponseDto",
  );
  for (const operationValue of [
    savedViewCreate,
    savedViewReplace,
    savedViewPublish,
    savedViewArchive,
  ]) {
    requireResponseSchema(
      operationValue,
      "200",
      "SavedSupportViewMutationResponseDto",
    );
  }
  requireResponseSchema(
    savedViewQuery,
    "200",
    "SavedSupportViewQueryResponseDto",
  );
  requireResponseSchema(
    activePresetQuery,
    "200",
    "SupportViewPresetCaseQueryResponseDto",
  );
}
