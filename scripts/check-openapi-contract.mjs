import { readFile } from "node:fs/promises";

const snapshotUrl = new URL("../openapi/lola-backend.json", import.meta.url);
const document = JSON.parse(await readFile(snapshotUrl, "utf8"));

const unversionedPaths = Object.keys(document.paths ?? {}).filter(
  (path) => path !== "/health" && !path.startsWith("/api/v1/"),
);
if (unversionedPaths.length) {
  throw new Error(
    `OpenAPI paths must include the runtime /api/v1 prefix: ${unversionedPaths.slice(0, 5).join(", ")}`,
  );
}

const requiredOperations = new Map([
  [
    "InitialAccess_login",
    {
      label: "CMS User login and Initial Access exchange",
      request: "CmsLoginRequestDto",
      responses: [
        "PasswordSetupRequiredResponseDto",
        "MfaEnrollmentRequiredResponseDto",
        "MfaRequiredResponseDto",
      ],
    },
  ],
  [
    "InitialAccess_setupPassword",
    {
      label: "mandatory password setup",
      request: "PasswordSetupRequestDto",
      response: "PasswordEstablishedResponseDto",
    },
  ],
  [
    "InitialAccess_refresh",
    {
      label: "CMS session refresh rotation",
      requestAbsent: true,
      response: "CmsAuthenticatedResponseDto",
    },
  ],
  [
    "CmsUserProvisioning_provision",
    {
      label: "CMS User provisioning",
      request: "CmsUserProvisioningDto",
      responses: [
        "CmsUserProvisioningCreatedResponseDto",
        "CmsUserProvisioningManualCreatedResponseDto",
        "CmsUserProvisioningReplayResponseDto",
      ],
    },
  ],
  [
    "CmsSecuritySettings_logout",
    {
      label: "auth logout",
      requestAbsent: true,
      response: "CmsSecurityMutationResponseDto",
    },
  ],
  [
    "CmsSecuritySettings_logoutAll",
    {
      label: "auth logout all sessions",
      requestAbsent: true,
      response: "CmsSecurityMutationResponseDto",
    },
  ],
  [
    "CmsSecuritySettings_list",
    {
      label: "CMS session inventory",
      response: "CmsSessionListResponseDto",
    },
  ],
  [
    "CmsSecuritySettings_revoke",
    {
      label: "CMS session revocation",
      response: "CmsSecurityMutationResponseDto",
    },
  ],
  [
    "CmsSecuritySettings_revokeOthers",
    {
      label: "CMS other-session revocation",
      requestAbsent: true,
      response: "CmsSecurityMutationResponseDto",
    },
  ],
  [
    "CmsSecuritySettings_changePassword",
    {
      label: "CMS password change",
      request: "CmsPasswordChangeRequestDto",
      response: "CmsPasswordChangedResponseDto",
    },
  ],
  [
    "CmsSessionContext_me",
    {
      label: "target CMS User session context",
      response: "CmsSessionContextResponseDto",
    },
  ],
  [
    "Platform_createProject",
    {
      label: "project creation",
      request: "CreateProjectDto",
      response: "CreateProjectResponseDto",
    },
  ],
  [
    "Platform_listProjects",
    { label: "projects", response: "ProjectResponseDto" },
  ],
  [
    "NotificationOperations_health",
    {
      label: "notification operations health",
      response: "NotificationOperationsHealthResponseDto",
    },
  ],
  [
    "NotificationOperations_deliveries",
    {
      label: "exceptional notification deliveries",
      response: "NotificationOperationsDeliveryPageResponseDto",
    },
  ],
  [
    "NotificationOperations_integrations",
    {
      label: "notification integration quarantine candidates",
      response: "NotificationOperationsIntegrationPageResponseDto",
    },
  ],
  [
    "NotificationOperations_replay",
    {
      label: "single notification delivery replay",
      response: "NotificationOperationsReplayResponseDto",
    },
  ],
  [
    "NotificationOperations_quarantine",
    {
      label: "notification integration quarantine",
      request: "NotificationQuarantineDto",
      response: "NotificationOperationsQuarantineResponseDto",
    },
  ],
  [
    "PlatformOperations_projectSettings",
    { label: "project-scoped settings", response: "ProjectResponseDto" },
  ],
  [
    "PlatformOperations_updateProjectSettings",
    {
      label: "project-scoped settings update",
      request: "UpdateProjectSettingsDto",
      response: "ProjectResponseDto",
    },
  ],
  [
    "Events_list",
    {
      label: "paginated legacy event logs",
      response: "LegacyEventLogPageResponseDto",
    },
  ],
  [
    "AdminEventLogs_list",
    {
      label: "cursor-paginated event logs",
      response: "EventLogPageResponseDto",
    },
  ],
  [
    "AdminEventLogs_get",
    { label: "event log detail", response: "EventLogResponseDto" },
  ],
  [
    "ScenarioRuns_list",
    { label: "scenario runs", response: "ScenarioRunResponseDto" },
  ],
  [
    "ScenarioRuns_page",
    {
      label: "cursor-paginated scenario runs",
      response: "ScenarioRunPageResponseDto",
    },
  ],
  [
    "PlatformOperations_usersPage",
    { label: "cursor-paginated users", response: "EndUserPageResponseDto" },
  ],
  [
    "EventCatalog_list",
    {
      label: "event catalog definition collection",
      response: "EventDefinitionCatalogResponseDto",
    },
  ],
  [
    "EventCatalog_create",
    {
      label: "event catalog definition creation",
      request: "CreateEventCatalogDefinitionDto",
      response: "EventCatalogDefinitionResponseDto",
    },
  ],
  [
    "EventCatalog_detail",
    {
      label: "event catalog definition detail",
      response: "EventDefinitionCatalogResponseDto",
    },
  ],
  [
    "EventCatalog_revisions",
    {
      label: "event catalog revision collection",
      response: "EventDefinitionRevisionPageResponseDto",
    },
  ],
  [
    "EventCatalog_revision",
    {
      label: "event catalog revision detail",
      response: "EventDefinitionRevisionResponseDto",
    },
  ],
  [
    "EventCatalog_archive",
    {
      label: "event catalog definition archive",
      request: "ArchiveEventDefinitionDto",
      response: "EventDefinitionCatalogResponseDto",
    },
  ],
  [
    "EventCatalog_restore",
    {
      label: "event catalog definition restore",
      request: "RestoreEventDefinitionDto",
      response: "EventDefinitionCatalogResponseDto",
    },
  ],
  [
    "EventCatalog_hardDelete",
    { label: "event catalog definition hard delete" },
  ],
  [
    "EventCatalog_usage",
    {
      label: "event catalog definition usage",
      response: "EventDefinitionUsageResponseDto",
    },
  ],
  [
    "EventCatalog_updateMetadata",
    {
      label: "event definition metadata update",
      request: "UpdateEventDefinitionMetadataDto",
      response: "EventDefinitionMetadataMutationResponseDto",
    },
  ],
  [
    "EventCatalog_updatePolicy",
    {
      label: "event ingestion policy update",
      request: "UpdateEventIngestionPolicyDto",
      response: "EventIngestionPolicyMutationResponseDto",
    },
  ],
  [
    "EventCatalog_saveSchemaDraft",
    {
      label: "event schema draft save",
      request: "SaveEventSchemaDraftDto",
      response: "EventSchemaDraftResponseDto",
    },
  ],
  [
    "EventCatalog_analyzeSchemaDraft",
    {
      label: "event schema draft impact",
      request: "AnalyzeEventSchemaDraftDto",
      response: "EventSchemaImpactResponseDto",
    },
  ],
  [
    "EventCatalog_publishSchemaDraft",
    {
      label: "event schema draft publication",
      request: "PublishEventSchemaDraftDto",
      response: "EventSchemaPublishResponseDto",
    },
  ],
  [
    "EventCatalog_projectHealth",
    {
      label: "event catalog consumer health",
      response: "EventCatalogHealthResponseDto",
    },
  ],
  [
    "PlatformOperations_activitySettings",
    { label: "activity settings", response: "ActivitySettingsResponseDto" },
  ],
  [
    "PlatformOperations_updateActivitySettings",
    {
      label: "activity settings update",
      request: "UpdateActivitySettingsDto",
      response: "ActivitySettingsResponseDto",
    },
  ],
  [
    "IamMfa_enrollmentOptions",
    {
      label: "MFA passkey enrollment options",
      request: "IamMfaCapabilityRequestDto",
      response: "IamMfaEnrollmentOptionsResponseDto",
    },
  ],
  [
    "IamMfa_completeEnrollment",
    {
      label: "MFA passkey enrollment completion",
      request: "IamMfaEnrollmentCompleteRequestDto",
      response: "IamMfaEnrollmentCompleteResponseDto",
    },
  ],
  [
    "IamMfa_completeAuthentication",
    {
      label: "MFA passkey authentication completion",
      request: "IamMfaAuthenticationCompleteRequestDto",
      response: "IamMfaAuthenticatedResponseDto",
    },
  ],
  [
    "IamMfa_completeRecovery",
    {
      label: "MFA recovery and replacement enrollment",
      request: "IamMfaRecoveryCompleteRequestDto",
      response: "IamMfaRecoveryEnrollmentOptionsResponseDto",
    },
  ],
  [
    "IamMfaManagement_summary",
    { label: "MFA factor summary", response: "IamMfaFactorSummaryResponseDto" },
  ],
  [
    "IamMfaManagement_beginPasskeyEnrollment",
    {
      label: "managed passkey enrollment",
      response: "IamMfaEnrollmentOptionsResponseDto",
    },
  ],
  [
    "IamMfaManagement_removePasskey",
    { label: "passkey removal", response: "IamMfaPasskeyRemovedResponseDto" },
  ],
  [
    "IamMfaManagement_rotateRecoveryCodes",
    {
      label: "recovery-code rotation",
      response: "IamMfaRecoveryCodesResponseDto",
    },
  ],
  [
    "ScenarioAuthoring_catalog",
    {
      label: "scenario authoring catalog",
      response: "ConditionCatalogResponseDto",
    },
  ],
  [
    "ScenarioAuthoring_createScenario",
    {
      label: "atomic scenario and authoring draft creation",
      request: "CreateScenarioAuthoringDto",
      response: "CreateScenarioAuthoringResponseDto",
    },
  ],
  [
    "ScenarioAuthoring_listScenarios",
    {
      label: "scenario authoring summary collection",
      response: "ScenarioAuthoringSummaryResponseDto",
    },
  ],
  [
    "ScenarioAuthoring_updateScenarioMetadata",
    {
      label: "scenario authoring metadata update",
      request: "UpdateScenarioAuthoringMetadataDto",
      response: "ScenarioAuthoringSummaryResponseDto",
    },
  ],
  [
    "ScenarioAuthoring_archiveScenario",
    {
      label: "scenario authoring archive",
      request: "ArchiveScenarioAuthoringDto",
      response: "ScenarioAuthoringSummaryResponseDto",
    },
  ],
  [
    "SegmentCatalog_catalog",
    {
      label: "segment-owned authoring catalog",
      response: "ConditionCatalogResponseDto",
    },
  ],
  [
    "ScenarioAuthoring_validate",
    {
      label: "scenario rule validation",
      request: "ValidateScenarioRuleDto",
      response: "ValidateScenarioRuleResponseDto",
    },
  ],
  [
    "ScenarioAuthoring_preview",
    {
      label: "scenario rule preview",
      request: "PreviewScenarioRuleDto",
      response: "PreviewScenarioRuleResponseDto",
    },
  ],
  [
    "ScenarioAuthoring_previewGoal",
    {
      label: "typed goal preview",
      request: "PreviewScenarioGoalDto",
      response: "PreviewScenarioGoalResponseDto",
    },
  ],
  [
    "ScenarioAuthoring_scenarioDocument",
    {
      label: "scenario authoring read model",
      response: "ScenarioAuthoringDocumentResponseDto",
    },
  ],
  [
    "ScenarioAuthoring_saveDraft",
    {
      label: "durable scenario draft",
      request: "SaveScenarioDraftDto",
      response: "ScenarioAuthoringDraftResponseDto",
    },
  ],
  [
    "ScenarioAuthoring_validateScenarioDraft",
    {
      label: "full scenario draft validation",
      request: "ValidateScenarioDraftDto",
      response: "ValidateScenarioDraftResponseDto",
    },
  ],
  [
    "ScenarioAuthoring_scenarioRevisions",
    {
      label: "scenario revision history",
      response: "ScenarioRevisionPageResponseDto",
    },
  ],
  [
    "ScenarioAuthoring_scenarioRevision",
    {
      label: "scenario revision detail",
      response: "ScenarioRevisionDetailResponseDto",
    },
  ],
  [
    "ScenarioAuthoring_publishScenario",
    {
      label: "scenario publication",
      request: "PublishScenarioDto",
      response: "PublishScenarioResponseDto",
    },
  ],
  [
    "ScenarioAuthoring_rollbackScenario",
    { label: "scenario rollback", request: "RollbackScenarioDto" },
  ],
  [
    "ScenarioAudience_search",
    { label: "segment search", response: "SegmentSearchResponseDto" },
  ],
  [
    "ScenarioAudience_create",
    {
      label: "segment creation",
      request: "PublishSegmentRevisionDto",
      response: "PublishedSegmentResponseDto",
    },
  ],
  [
    "ScenarioAudience_detail",
    {
      label: "segment detail and history",
      response: "SegmentDetailResponseDto",
    },
  ],
  [
    "ScenarioAudience_archive",
    { label: "segment archive", response: "ArchivedSegmentResponseDto" },
  ],
  [
    "ScenarioAudience_publishRevision",
    {
      label: "segment successor revision",
      request: "PublishSegmentRevisionDto",
      response: "PublishedSegmentResponseDto",
    },
  ],
  [
    "ScenarioAudience_revision",
    {
      label: "segment revision detail",
      response: "SegmentRevisionDetailResponseDto",
    },
  ],
  [
    "ScenarioAudienceEvaluation_evaluateUser",
    {
      label: "one-user audience evaluation",
      request: "EvaluateAudienceUserDto",
      response: "AudienceEvaluationResponseDto",
    },
  ],
  [
    "AttributeContract_workspace",
    {
      label: "attribute contract workspace",
      response: "AttributeContractWorkspaceResponseDto",
    },
  ],
  [
    "AttributeContract_saveDraft",
    {
      label: "attribute contract optimistic draft",
      request: "SaveAttributeContractDraftDto",
      response: "AttributeContractDraftResponseDto",
    },
  ],
  [
    "AttributeContract_validate",
    {
      label: "attribute contract validation",
      request: "ValidateAttributeContractDto",
      response: "AttributeContractValidationResponseDto",
    },
  ],
  [
    "AttributeContract_publish",
    {
      label: "attribute contract publication",
      request: "PublishAttributeContractDto",
      response: "PublishAttributeContractResponseDto",
    },
  ],
  [
    "AttributeContract_revisions",
    {
      label: "attribute contract history",
      response: "AttributeContractRevisionPageResponseDto",
    },
  ],
  [
    "AttributeContract_revision",
    {
      label: "attribute contract revision",
      response: "AttributeContractRevisionResponseDto",
    },
  ],
  [
    "AttributeDefinition_impact",
    {
      label: "attribute definition impact",
      response: "AttributeDefinitionImpactResponseDto",
    },
  ],
  [
    "ProfileHealth_health",
    {
      label: "profile integration health",
      response: "ProfileHealthResponseDto",
    },
  ],
  [
    "AdminEndUserProfiles_list",
    { label: "current profile list", response: "CmsProfileListResponseDto" },
  ],
  [
    "AdminEndUserProfiles_profile",
    {
      label: "current profile detail",
      response: "ProfileProjectionResponseDto",
    },
  ],
  [
    "ScenarioRuns_explain",
    {
      label: "scenario run explanation",
      response: "ScenarioRunExplainResponseDto",
    },
  ],
  [
    "AdminMessaging_send",
    {
      label: "admin messaging",
      request: "SendAdminMessageDto",
      response: "SendAdminMessageResponseDto",
    },
  ],
  ["Audit_list", { label: "audit logs", response: "AuditLogResponseDto" }],
  [
    "Presence_list",
    { label: "active sessions", response: "ActiveUserResponseDto" },
  ],
  [
    "AdminSpeech_get",
    {
      label: "speech synthesis settings",
      response: "SpeechSettingsResponseDto",
    },
  ],
  [
    "AdminSpeech_update",
    {
      label: "speech synthesis update",
      request: "UpdateSpeechSettingsDto",
      response: "SpeechSettingsResponseDto",
    },
  ],
  [
    "AdminSpeech_voices",
    {
      label: "speech synthesis voices",
      response: "SpeechVoicePageResponseDto",
    },
  ],
  [
    "AiUsage_report",
    { label: "AI usage report", response: "AiUsageReportResponseDto" },
  ],
  [
    "Translation_create",
    {
      label: "translation job creation",
      request: "CreateTranslationJobDto",
      response: "TranslationJobAcceptedResponseDto",
    },
  ],
  [
    "Translation_get",
    { label: "translation job status", response: "TranslationJobResponseDto" },
  ],
  [
    "Translation_cancel",
    {
      label: "translation job cancellation",
      response: "TranslationJobResponseDto",
    },
  ],
  [
    "Translation_retryTarget",
    {
      label: "translation target retry",
      response: "TranslationJobResponseDto",
    },
  ],
  [
    "Translation_usageReport",
    { label: "translation usage", response: "TranslationUsageResponseDto" },
  ],
  [
    "ProductActions_actionTypes",
    {
      label: "product action type catalog",
      response: "ActionTypeResponseDto",
    },
  ],
  [
    "ProductActions_projectActions",
    {
      label: "project actions",
      response: "ProjectActionResponseDto",
    },
  ],
  [
    "ProductActions_configureProjectAction",
    {
      label: "project action configuration",
      request: "ConfigureProjectActionDto",
      response: "ProjectActionResponseDto",
    },
  ],
  [
    "ProductActions_archiveProjectAction",
    {
      label: "project action archive",
      response: "ProjectActionResponseDto",
    },
  ],
  [
    "ProductActions_previewProjectAction",
    {
      label: "AI capability preview",
      response: "AiCapabilityPreviewResponseDto",
    },
  ],
  [
    "ProviderBilling_get",
    {
      label: "ElevenLabs provider billing snapshot",
      response: "ProviderBillingSnapshotResponseDto",
    },
  ],
  [
    "ProviderBilling_sync",
    {
      label: "ElevenLabs provider billing refresh",
      response: "ProviderBillingSnapshotResponseDto",
    },
  ],
]);

const operations = Object.values(document.paths ?? {}).flatMap((path) =>
  Object.values(path).filter(
    (operation) => operation && typeof operation === "object",
  ),
);

function containsSchema(schema, schemaName) {
  if (!schema) return false;
  if (schema.$ref === `#/components/schemas/${schemaName}`) return true;

  return Object.values(schema).some((value) =>
    typeof value === "object" && value !== null
      ? containsSchema(value, schemaName)
      : false,
  );
}

function contractSchema(schemaName) {
  const schema = document.components?.schemas?.[schemaName];
  if (!schema)
    throw new Error(`OpenAPI snapshot is missing ${schemaName} schema`);
  return schema;
}

function requireSchemaProperties(schemaName, propertyNames) {
  const properties = contractSchema(schemaName).properties ?? {};
  const missing = propertyNames.filter(
    (propertyName) => !Object.hasOwn(properties, propertyName),
  );
  if (missing.length)
    throw new Error(
      `${schemaName} is missing contract properties: ${missing.join(", ")}`,
    );
}

function requireRequiredProperties(schemaName, propertyNames) {
  const required = new Set(contractSchema(schemaName).required ?? []);
  const missing = propertyNames.filter(
    (propertyName) => !required.has(propertyName),
  );
  if (missing.length)
    throw new Error(`${schemaName} no longer requires: ${missing.join(", ")}`);
}

function requireDiscriminatedUnion(
  schemaName,
  propertyName,
  discriminator,
  schemaNames,
) {
  const property = contractSchema(schemaName).properties?.[propertyName];
  if (property?.discriminator?.propertyName !== discriminator) {
    throw new Error(
      `${schemaName}.${propertyName} must be discriminated by ${discriminator}`,
    );
  }
  const references = new Set(
    (property.oneOf ?? []).map((item) => item.$ref?.split("/").at(-1)),
  );
  const missing = schemaNames.filter((candidate) => !references.has(candidate));
  if (missing.length)
    throw new Error(
      `${schemaName}.${propertyName} is missing union members: ${missing.join(", ")}`,
    );
}

for (const [operationId, expectation] of requiredOperations) {
  const operation = operations.find(
    (candidate) => candidate.operationId === operationId,
  );

  if (!operation) {
    throw new Error(
      `OpenAPI snapshot is missing ${expectation.label} operation (${operationId})`,
    );
  }

  const requestSchema =
    operation.requestBody?.content?.["application/json"]?.schema;
  const successResponse = Object.entries(operation.responses ?? {}).find(
    ([status]) => /^2\d\d$/.test(status),
  );
  const responseSchema =
    successResponse?.[1]?.content?.["application/json"]?.schema;

  if (!successResponse) {
    throw new Error(`OpenAPI operation ${operationId} has no success response`);
  }

  const expectedResponses =
    expectation.responses ??
    (expectation.response ? [expectation.response] : []);

  if (expectedResponses.length && !responseSchema) {
    throw new Error(
      `OpenAPI operation ${operationId} has no typed JSON success response`,
    );
  }

  if (
    expectation.request &&
    !containsSchema(requestSchema, expectation.request)
  ) {
    throw new Error(
      `OpenAPI operation ${operationId} does not use ${expectation.request} as its JSON request`,
    );
  }

  if (expectation.requestAbsent && operation.requestBody) {
    throw new Error(
      `OpenAPI operation ${operationId} must authenticate with its HttpOnly cookie and accept no request body`,
    );
  }

  for (const expectedResponse of expectedResponses) {
    if (!containsSchema(responseSchema, expectedResponse)) {
      throw new Error(
        `OpenAPI operation ${operationId} does not return ${expectedResponse}`,
      );
    }
  }
}

function requireOperationParameters(operationId, parameterNames) {
  const operation = operations.find(
    (candidate) => candidate.operationId === operationId,
  );
  const parameters = new Map(
    (operation?.parameters ?? []).map((parameter) => [
      parameter.name,
      parameter,
    ]),
  );
  const missing = parameterNames.filter(
    (parameterName) =>
      !parameters.has(parameterName) ||
      parameters.get(parameterName)?.required !== true,
  );

  if (missing.length) {
    throw new Error(
      `${operationId} no longer requires operation parameters: ${missing.join(", ")}`,
    );
  }
}

requireOperationParameters("NotificationOperations_replay", [
  "Expected-Version",
  "Idempotency-Key",
]);
requireOperationParameters("NotificationOperations_quarantine", [
  "Expected-Version",
  "Idempotency-Key",
]);

for (const deprecatedSchema of [
  "CmsLoginDto",
  "CmsAuthResponseDto",
  "RefreshTokenDto",
  "RefreshRequestDto",
  "LogoutDto",
  "SuccessResponseDto",
  "CreateScenarioDto",
  "ScenarioResponseDto",
  "EventDefinitionResponseDto",
  "CreateEventDefinitionDto",
  "UpdateEventDefinitionDto",
  "ScenarioActionDefinitionResponseDto",
]) {
  if (document.components?.schemas?.[deprecatedSchema]) {
    throw new Error(
      `OpenAPI still exposes deprecated auth schema ${deprecatedSchema}`,
    );
  }
}

for (const deprecatedOperation of [
  "Platform_scenarios",
  "Platform_createScenario",
  "Platform_updateScenario",
  "Platform_deleteScenario",
  "Platform_eventDefinitions",
  "Platform_createEventDefinition",
  "Platform_updateEventDefinition",
  "Platform_deleteEventDefinition",
  "Platform_actionDefinitions",
  "Platform_uiElements",
  "Platform_createUi",
  "Platform_updateUi",
  "Platform_deleteUi",
  "Platform_users",
  "Platform_usersPage",
  "Platform_activitySettings",
  "Platform_updateActivitySettings",
]) {
  if (
    operations.some(
      (operation) => operation.operationId === deprecatedOperation,
    )
  ) {
    throw new Error(
      `OpenAPI still exposes deprecated operation ${deprecatedOperation}`,
    );
  }
}

requireSchemaProperties("CmsLoginRequestDto", ["identifier", "secret"]);
requireRequiredProperties("CmsLoginRequestDto", ["identifier", "secret"]);
requireSchemaProperties("PasswordSetupRequestDto", [
  "setupToken",
  "newPassword",
  "passwordConfirmation",
]);
requireRequiredProperties("PasswordSetupRequestDto", [
  "setupToken",
  "newPassword",
  "passwordConfirmation",
]);
requireSchemaProperties("PasswordSetupRequiredResponseDto", [
  "kind",
  "setupToken",
  "expiresAt",
]);
requireSchemaProperties("PasswordEstablishedResponseDto", [
  "kind",
  "cmsUserId",
  "status",
  "next",
]);
requireSchemaProperties("CmsAuthenticatedResponseDto", [
  "kind",
  "tokenType",
  "accessToken",
  "expiresIn",
  "refreshExpiresIn",
  "user",
]);
requireSchemaProperties("CmsPasswordChangeRequestDto", [
  "currentPassword",
  "newPassword",
  "passwordConfirmation",
]);
requireRequiredProperties("CmsPasswordChangeRequestDto", [
  "currentPassword",
  "newPassword",
  "passwordConfirmation",
]);
requireSchemaProperties("CmsPasswordChangedResponseDto", [
  "kind",
  "tokenType",
  "accessToken",
  "expiresIn",
  "refreshExpiresIn",
  "user",
]);
requireSchemaProperties("CmsSessionListResponseDto", ["sessions"]);
requireRequiredProperties("CmsSessionListResponseDto", ["sessions"]);
requireSchemaProperties("CmsSecurityMutationResponseDto", ["success"]);
requireRequiredProperties("CmsSecurityMutationResponseDto", ["success"]);
requireSchemaProperties("CmsSessionContextResponseDto", [
  "user",
  "platformPermissionCodes",
  "projects",
]);
requireRequiredProperties("CmsSessionContextResponseDto", [
  "user",
  "platformPermissionCodes",
  "projects",
]);
requireSchemaProperties("CmsSessionProjectContextDto", [
  "membershipId",
  "roleKeys",
  "effectivePermissionCodes",
]);
requireRequiredProperties("CmsSessionProjectContextDto", [
  "membershipId",
  "roleKeys",
  "effectivePermissionCodes",
]);
requireSchemaProperties("CmsUserProvisioningDto", [
  "email",
  "givenName",
  "familyName",
  "projectAssignments",
]);
requireRequiredProperties("CmsUserProvisioningDto", [
  "email",
  "givenName",
  "familyName",
]);
const provisioningAssignments = contractSchema("CmsUserProvisioningDto")
  .properties?.projectAssignments;
if (
  provisioningAssignments?.type !== "array" ||
  !Array.isArray(provisioningAssignments.default) ||
  provisioningAssignments.default.length !== 0
) {
  throw new Error(
    "CmsUserProvisioningDto.projectAssignments must be an optional array with an empty default",
  );
}
requireSchemaProperties("CmsUserProvisioningManualCreatedResponseDto", [
  "cmsUserId",
  "status",
  "replayed",
  "deliveryMode",
  "initialAccessSecret",
  "expiresAt",
]);
requireRequiredProperties("CmsUserProvisioningManualCreatedResponseDto", [
  "cmsUserId",
  "status",
  "replayed",
  "deliveryMode",
  "initialAccessSecret",
  "expiresAt",
]);

for (const schemaName of [
  "MfaEnrollmentRequiredResponseDto",
  "MfaRequiredResponseDto",
  "IamMfaEnrollmentOptionsResponseDto",
  "IamMfaRecoveryEnrollmentOptionsResponseDto",
]) {
  requireSchemaProperties(schemaName, ["kind", "ceremonyToken", "expiresAt"]);
  requireRequiredProperties(schemaName, ["kind", "ceremonyToken", "expiresAt"]);
}
requireSchemaProperties("MfaRequiredResponseDto", [
  "publicKey",
  "recoveryAvailable",
]);
requireRequiredProperties("MfaRequiredResponseDto", [
  "publicKey",
  "recoveryAvailable",
]);
requireSchemaProperties("IamMfaEnrollmentOptionsResponseDto", ["publicKey"]);
requireSchemaProperties("IamMfaRecoveryEnrollmentOptionsResponseDto", [
  "publicKey",
  "reason",
]);
for (const schemaName of [
  "IamMfaEnrollmentOptionsResponseDto",
  "IamMfaRecoveryEnrollmentOptionsResponseDto",
]) {
  if (
    contractSchema(schemaName).properties?.ceremonyToken?.writeOnly === true
  ) {
    throw new Error(
      `${schemaName}.ceremonyToken is a response value and cannot be writeOnly`,
    );
  }
}
requireSchemaProperties("AdminConversationResponseDto", [
  "isCurrent",
  "currentInteractionSessionCount",
]);
requireRequiredProperties("AdminConversationResponseDto", [
  "isCurrent",
  "currentInteractionSessionCount",
]);

for (const schemaName of ["CreateProjectDto", "UpdateProjectDto"]) {
  const properties =
    document.components?.schemas?.[schemaName]?.properties ?? {};
  if (
    properties.settings?.type !== "object" ||
    properties.settings?.additionalProperties !== true
  ) {
    throw new Error(`${schemaName} must expose general project settings`);
  }
}

requireSchemaProperties("ConditionCatalogResponseDto", [
  "version",
  "revision",
  "projectId",
  "events",
  "audience",
  "localization",
  "translation",
]);
requireSchemaProperties("ActionTypeRevisionResponseDto", [
  "id",
  "version",
  "name",
  "description",
  "executorAdapter",
  "inputSchema",
  "resultSchema",
  "projectConfigSchema",
  "uiSchema",
  "supportedSurfaces",
  "risk",
  "confirmationPolicy",
  "multipleInstances",
]);
requireSchemaProperties("ProjectActionResponseDto", [
  "id",
  "projectId",
  "actionTypeId",
  "actionTypeRevisionId",
  "code",
  "scenarioEnabled",
  "aiEnabled",
  "aiUsageDescription",
  "configuration",
  "lifecycle",
  "actionType",
  "actionTypeRevision",
]);
requireSchemaProperties("ConfigureProjectActionDto", [
  "scenarioEnabled",
  "aiEnabled",
  "aiUsageDescription",
  "configuration",
  "auditReason",
]);
requireSchemaProperties("UiElementResponseDto", [
  "aiEnabled",
  "aiDescription",
  "aiAliases",
]);
for (const schemaName of ["CreateUiElementDto", "UpdateUiElementDto"]) {
  requireSchemaProperties(schemaName, [
    "aiEnabled",
    "aiDescription",
    "aiAliases",
    "auditReason",
  ]);
}
requireRequiredProperties("ConditionCatalogResponseDto", [
  "version",
  "revision",
  "projectId",
  "events",
]);
requireSchemaProperties("ConditionCatalogEventResponseDto", [
  "definitionKeyId",
  "definitionId",
  "code",
  "schemaVersion",
  "fields",
  "capabilities",
]);
requireSchemaProperties("ConditionCatalogFieldResponseDto", [
  "fieldKey",
  "path",
  "valueType",
  "required",
  "operators",
  "aggregations",
  "control",
  "semanticType",
  "unit",
  "sensitive",
  "capabilities",
  "display",
]);
requireSchemaProperties("ConditionCatalogDisplayResponseDto", [
  "scale",
  "precision",
  "conversion",
]);

requireSchemaProperties("ValidateScenarioRuleDto", ["rule", "audience"]);
requireRequiredProperties("ValidateScenarioRuleDto", ["rule"]);
requireSchemaProperties("PreviewScenarioRuleDto", [
  "rule",
  "audience",
  "scope",
]);
requireRequiredProperties("PreviewScenarioRuleDto", ["rule", "scope"]);
requireSchemaProperties("PreviewScenarioScopeDto", ["kind", "eventLogId"]);
requireRequiredProperties("PreviewScenarioScopeDto", ["kind", "eventLogId"]);
if (
  JSON.stringify(
    contractSchema("PreviewScenarioScopeDto").properties?.kind?.enum,
  ) !== JSON.stringify(["eventLog"])
) {
  throw new Error("PreviewScenarioScopeDto.kind must only allow eventLog");
}
requireSchemaProperties("PublishScenarioDto", [
  "rule",
  "audience",
  "profileFreshness",
  "deliveryPolicy",
  "expectedCurrentRevisionId",
  "expectedDraftVersion",
  "catalogRevision",
  "localization",
]);
requireRequiredProperties("PublishScenarioDto", [
  "expectedCurrentRevisionId",
  "catalogRevision",
]);
requireSchemaProperties("RollbackScenarioDto", ["expectedCurrentRevisionId"]);
requireSchemaProperties("ScenarioAuthoringDocumentResponseDto", [
  "currentRevisionId",
  "source",
  "draft",
  "editable",
  "unavailableReason",
  "triggerEventDefinitionRevisionId",
]);
requireSchemaProperties("SaveScenarioDraftDto", [
  "expectedDraftVersion",
  "expectedCurrentRevisionId",
  "catalogRevision",
  "rule",
  "audience",
  "profileFreshness",
  "deliveryPolicy",
  "graph",
  "localization",
]);
requireRequiredProperties("SaveScenarioDraftDto", [
  "expectedDraftVersion",
  "expectedCurrentRevisionId",
  "catalogRevision",
  "deliveryPolicy",
  "graph",
]);
requireSchemaProperties("ValidateScenarioDraftDto", [
  "catalogRevision",
  "rule",
  "audience",
  "profileFreshness",
  "deliveryPolicy",
  "graph",
  "localization",
]);
requireRequiredProperties("ValidateScenarioDraftDto", [
  "catalogRevision",
  "deliveryPolicy",
  "graph",
]);
requireSchemaProperties("ScenarioRevisionDetailResponseDto", [
  "id",
  "revisionNumber",
  "publishedAt",
  "publishedByAdminId",
  "contentHash",
  "source",
]);
requireSchemaProperties("PreviewScenarioGoalDto", [
  "goal",
  "timeoutMs",
  "scope",
]);
requireRequiredProperties("PreviewScenarioGoalDto", [
  "goal",
  "timeoutMs",
  "scope",
]);
requireSchemaProperties("PreviewScenarioGoalResponseDto", [
  "valid",
  "matched",
  "actual",
  "matchedCount",
  "window",
  "dependency",
  "issues",
]);
requireSchemaProperties("ScenarioGoalActualResponseDto", [
  "visibility",
  "value",
]);

requireSchemaProperties("ScenarioRuleDto", ["version", "root"]);
requireRequiredProperties("ScenarioRuleDto", ["version", "root"]);
requireDiscriminatedUnion("ScenarioRuleDto", "root", "kind", [
  "AllRuleNodeDto",
  "AnyRuleNodeDto",
  "NotRuleNodeDto",
  "EventFieldRuleNodeDto",
  "EventAggregateRuleNodeDto",
  "ActivityDayStreakRuleNodeDto",
]);
requireSchemaProperties("AudienceCatalogResponseDto", [
  "version",
  "revision",
  "locales",
  "localeSource",
  "languageSource",
  "country",
  "attributes",
  "segmentSource",
  "snapshotPolicy",
]);
requireRequiredProperties("AudienceCatalogResponseDto", [
  "version",
  "revision",
  "locales",
  "localeSource",
  "languageSource",
  "country",
  "attributes",
  "segmentSource",
  "snapshotPolicy",
]);
requireSchemaProperties("AudienceCatalogV2ResponseDto", [
  "version",
  "source",
  "revision",
  "attributes",
  "freshnessPolicies",
  "segmentSource",
  "snapshotPolicy",
]);
requireRequiredProperties("AudienceCatalogV2ResponseDto", [
  "version",
  "source",
  "revision",
  "attributes",
  "freshnessPolicies",
  "segmentSource",
  "snapshotPolicy",
]);
requireSchemaProperties("AttributeContractWorkspaceResponseDto", [
  "currentRevision",
  "draft",
  "validation",
]);
requireRequiredProperties("AttributeContractWorkspaceResponseDto", [
  "draft",
  "validation",
]);
requireSchemaProperties("AttributeContractDraftFieldDto", [
  "definitionId",
  "key",
  "label",
  "valueType",
  "lifecycle",
  "classification",
  "purpose",
  "policies",
  "requirement",
  "semanticRole",
  "position",
  "constraints",
  "replacementDefinitionId",
  "sunsetAt",
]);
requireSchemaProperties("AttributeConstraintsDto", [
  "allowedValues",
  "defaultLocale",
]);
requireSchemaProperties("ScenarioLocalizationCatalogResponseDto", [
  "version",
  "enabled",
  "attributeKey",
  "attributeContractRevision",
  "defaultLocale",
  "locales",
  "policyModes",
  "localizedValueSchemaVersion",
  "paths",
]);
requireSchemaProperties("ScenarioTranslationCatalogResponseDto", [
  "enabled",
  "supportedSourceLocales",
  "supportedTargetLocales",
  "maxBatchCharacters",
]);
requireSchemaProperties("ScenarioLocalizationPolicyDto", [
  "version",
  "mode",
  "locales",
]);
requireSchemaProperties("CreateTranslationJobDto", [
  "sourceLocale",
  "targetLocales",
  "units",
]);
requireSchemaProperties("TranslationJobResponseDto", [
  "jobId",
  "status",
  "sourceHash",
  "createdAt",
  "sourceLocale",
  "targets",
]);
requireSchemaProperties("ProfileProjectionResponseDto", [
  "endUserId",
  "externalUserId",
  "profileVersion",
  "contractRevision",
  "syncStatus",
  "observedAt",
  "receivedAt",
  "ageSeconds",
  "fields",
  "provenance",
  "lastRejectedSync",
]);
requireSchemaProperties("ProfileProjectionFieldResponseDto", [
  "definitionId",
  "definitionRevisionId",
  "key",
  "label",
  "valueType",
  "lifecycle",
  "classification",
  "access",
  "availability",
  "value",
]);
requireSchemaProperties("AudienceRuleDto", ["version", "root"]);
requireRequiredProperties("AudienceRuleDto", ["version", "root"]);
requireDiscriminatedUnion("AudienceRuleDto", "root", "kind", [
  "AudienceAllNodeDto",
  "AudienceAnyNodeDto",
  "AudienceNotNodeDto",
  "AudienceLocaleNodeDto",
  "AudienceLanguageNodeDto",
  "AudienceCountryNodeDto",
  "AudienceUserAttributeNodeDto",
  "AudienceSegmentMembershipNodeDto",
]);
requireSchemaProperties("PublishSegmentRevisionDto", [
  "key",
  "name",
  "description",
  "rule",
  "catalogRevision",
  "expectedCurrentRevisionId",
]);
requireRequiredProperties("PublishSegmentRevisionDto", [
  "name",
  "rule",
  "catalogRevision",
  "expectedCurrentRevisionId",
]);
requireSchemaProperties("ValidateScenarioRuleResponseDto", ["audience"]);
requireSchemaProperties("PreviewScenarioRuleResponseDto", ["audience"]);
requireSchemaProperties("PublishScenarioResponseDto", [
  "audienceCost",
  "audiencePolicy",
  "dependencies",
]);
requireSchemaProperties("PublishedScenarioDependenciesResponseDto", [
  "userAttributeRevisionIds",
  "segmentRevisionIds",
]);
requireSchemaProperties("SegmentDetailResponseDto", [
  "segmentId",
  "key",
  "name",
  "status",
  "currentRevision",
  "revisions",
]);
requireSchemaProperties("SegmentRevisionDetailResponseDto", [
  "segmentRevisionId",
  "revision",
  "catalogRevision",
  "contentHash",
  "publishedAt",
  "rule",
]);
requireRequiredProperties("SegmentRevisionDetailResponseDto", [
  "segmentRevisionId",
  "revision",
  "catalogRevision",
  "contentHash",
  "publishedAt",
  "rule",
]);
requireSchemaProperties("ScenarioRunExplainResponseDto", [
  "eligibility",
  "audience",
  "delivery",
]);
requireRequiredProperties("ScenarioRunExplainResponseDto", [
  "eligibility",
  "audience",
  "delivery",
]);
requireSchemaProperties("ScenarioRunAudienceResponseDto", [
  "decision",
  "fidelity",
  "evaluatedAt",
  "root",
  "segmentRevisionIds",
  "attributeRevisionIds",
  "lastRecheck",
]);
requireRequiredProperties("ScenarioRunAudienceResponseDto", [
  "decision",
  "fidelity",
  "root",
  "segmentRevisionIds",
  "attributeRevisionIds",
]);
requireSchemaProperties("ScenarioRunAudienceRecheckResponseDto", [
  "decision",
  "evaluatedAt",
  "root",
]);
requireRequiredProperties("ScenarioRunAudienceRecheckResponseDto", [
  "decision",
  "root",
]);
requireSchemaProperties("ScenarioRunEligibilityResponseDto", [
  "decision",
  "fidelity",
  "evaluatedAt",
  "root",
  "lastRecheck",
]);
requireSchemaProperties("ScenarioRunEligibilityRecheckResponseDto", [
  "decision",
  "fidelity",
  "evaluatedAt",
]);
requireRequiredProperties("ScenarioRunEligibilityRecheckResponseDto", [
  "decision",
  "fidelity",
]);
requireSchemaProperties("EventCatalogDefinitionResponseDto", [
  "definitionKeyId",
  "currentRevisionId",
  "isCurrent",
  "origin",
  "readOnly",
]);
requireSchemaProperties("EventDefinitionCatalogResponseDto", [
  "id",
  "currentRevision",
  "lifecycle",
  "lifecycleVersion",
  "policy",
  "origin",
  "readOnly",
]);
requireSchemaProperties("EventDefinitionRevisionResponseDto", [
  "id",
  "definitionKeyId",
  "isCurrent",
  "compatibility",
  "pinnedScenarioRevisionCount",
  "number",
  "publishedAt",
  "payloadSchema",
]);
requireSchemaProperties("ActivitySettingsResponseDto", [
  "timezone",
  "visitInactivitySeconds",
  "reconnectGraceSeconds",
  "limits",
  "semantics",
]);
requireSchemaProperties("UpdateActivitySettingsDto", [
  "timezone",
  "visitInactivitySeconds",
  "reconnectGraceSeconds",
]);
requireRequiredProperties("UpdateActivitySettingsDto", [
  "timezone",
  "visitInactivitySeconds",
  "reconnectGraceSeconds",
]);
requireSchemaProperties("EndUserPageResponseDto", ["items", "nextCursor"]);
requireSchemaProperties("ScenarioRunPageResponseDto", ["items", "nextCursor"]);
requireDiscriminatedUnion("PublishScenarioDto", "deliveryPolicy", "kind", [
  "ImmediateDeliveryPolicyDto",
  "SkipIfOfflineDeliveryPolicyDto",
  "FailIfOfflineDeliveryPolicyDto",
  "WaitUntilOnlineDeliveryPolicyDto",
]);

requireSchemaProperties("CreateEventCatalogDefinitionDto", [
  "countsAsActivity",
  "payloadSchema",
]);

requireSchemaProperties("NotificationOperationsHealthResponseDto", [
  "observedAt",
  "queues",
  "permanentCount",
  "ambiguousCount",
  "suppressedCount",
  "deadLetterCount",
  "providers",
  "telegramProductAdmission",
  "retention",
]);
requireRequiredProperties("NotificationOperationsHealthResponseDto", [
  "observedAt",
  "queues",
  "permanentCount",
  "ambiguousCount",
  "suppressedCount",
  "deadLetterCount",
  "providers",
  "telegramProductAdmission",
  "retention",
]);
requireSchemaProperties("NotificationOperationsDeliveryResponseDto", [
  "id",
  "projectId",
  "channel",
  "status",
  "errorCategory",
  "attemptCount",
  "operationsVersion",
  "replayEligibility",
  "contentAvailable",
  "createdAt",
  "updatedAt",
]);
requireRequiredProperties("NotificationOperationsDeliveryResponseDto", [
  "id",
  "projectId",
  "channel",
  "status",
  "errorCategory",
  "attemptCount",
  "operationsVersion",
  "replayEligibility",
  "contentAvailable",
]);
requireSchemaProperties("NotificationOperationsIntegrationResponseDto", [
  "integrationId",
  "kind",
  "projectId",
  "status",
  "version",
  "maskedIdentity",
  "quarantineAllowed",
]);
requireRequiredProperties("NotificationOperationsIntegrationResponseDto", [
  "integrationId",
  "kind",
  "projectId",
  "status",
  "version",
  "maskedIdentity",
  "quarantineAllowed",
]);
requireSchemaProperties("NotificationQuarantineDto", [
  "reason",
  "confirmation",
]);
requireRequiredProperties("NotificationQuarantineDto", [
  "reason",
  "confirmation",
]);

for (const schemaName of [
  "NotificationOperationsHealthResponseDto",
  "NotificationOperationsDeliveryResponseDto",
  "NotificationOperationsIntegrationResponseDto",
  "NotificationOperationsReplayResponseDto",
  "NotificationOperationsQuarantineResponseDto",
]) {
  const exposedProperties = Object.keys(
    contractSchema(schemaName).properties ?? {},
  );
  const forbiddenProperties = exposedProperties.filter((propertyName) =>
    /recipient|payload|content(?!Available)|webhook|token|secret|providerRef/i.test(
      propertyName,
    ),
  );
  if (forbiddenProperties.length) {
    throw new Error(
      `${schemaName} exposes forbidden notification operations data: ${forbiddenProperties.join(", ")}`,
    );
  }
}

console.log(
  `OpenAPI contract check passed (${requiredOperations.size} required operations)`,
);
