import {
  contractOperation as operation,
  operationParameter as parameter,
  requireOperationPermission as requirePermission,
  requireSchemaProperties as requireProperties,
  requireSchemaPropertyEnum as requirePropertyEnum,
} from "./openapi-contract-assertions.mjs";

function requireAllPermissions(operationValue, codes) {
  const actual = new Set(
    operationValue["x-iam-all-permissions"]?.map((value) => value.code) ?? [],
  );
  for (const code of codes) {
    if (!actual.has(code)) {
      throw new Error(`${operationValue.operationId} must require ${code}`);
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

function requireBound(operationValue, name, key, expected) {
  const actual = parameter(operationValue, name).schema?.[key];
  if (actual !== expected) {
    throw new Error(
      `${operationValue.operationId}.${name}.${key} must remain ${expected}`,
    );
  }
}

function requireRequestSchema(operationValue, schemaName) {
  const requestSchema =
    operationValue.requestBody?.content?.["application/json"]?.schema;
  const directRef = requestSchema?.$ref;
  const composedRefs = requestSchema?.allOf?.map((item) => item.$ref) ?? [];
  if (
    directRef !== `#/components/schemas/${schemaName}` &&
    !composedRefs.includes(`#/components/schemas/${schemaName}`)
  ) {
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

function requireArrayItemEnum(document, schemaName, propertyName, values) {
  const schema = document.components?.schemas?.[schemaName];
  const actual = new Set(schema?.properties?.[propertyName]?.items?.enum ?? []);
  for (const value of values) {
    if (!actual.has(value)) {
      throw new Error(`${schemaName}.${propertyName} must retain ${value}`);
    }
  }
}

function requireInlineErrorEnum(operationValue, status, values) {
  const actual = new Set(
    operationValue.responses?.[status]?.content?.["application/json"]?.schema
      ?.properties?.error?.properties?.code?.enum ?? [],
  );
  for (const value of values) {
    if (!actual.has(value)) {
      throw new Error(
        `${operationValue.operationId} ${status} must retain ${value}`,
      );
    }
  }
}

function requireBrowserNotificationsPublished(document) {
  const preferencesRead = operation(
    document,
    "PersonalSupportNotification_readPreferences",
  );
  const preferencesUpdate = operation(
    document,
    "PersonalSupportNotification_updatePreference",
  );
  const admissionRead = operation(
    document,
    "PersonalSupportNotification_readAdmission",
  );
  const subscriptionsList = operation(
    document,
    "PersonalBrowserPush_listSubscriptions",
  );
  const subscriptionsRegister = operation(
    document,
    "PersonalBrowserPush_registerSubscription",
  );
  const subscriptionsRevoke = operation(
    document,
    "PersonalBrowserPush_revokeSubscription",
  );
  const deepLinkResolve = operation(
    document,
    "PersonalSupportNotification_resolveDeepLink",
  );

  requireHeader(preferencesUpdate, "Idempotency-Key");
  requireHeader(subscriptionsRegister, "Idempotency-Key");
  requireHeader(subscriptionsRevoke, "Idempotency-Key");
  requireRequestSchema(
    preferencesUpdate,
    "UpdatePersonalSupportNotificationPreferenceDto",
  );
  requireRequestSchema(
    subscriptionsRegister,
    "RegisterBrowserPushSubscriptionDto",
  );
  requireRequestSchema(subscriptionsRevoke, "RevokeBrowserPushSubscriptionDto");
  requireResponseSchema(
    preferencesRead,
    "200",
    "PersonalSupportNotificationSettingsResponseDto",
  );
  requireResponseSchema(
    preferencesUpdate,
    "200",
    "PersonalSupportNotificationSettingsResponseDto",
  );
  requireResponseSchema(
    admissionRead,
    "200",
    "PersonalSupportNotificationAdmissionResponseDto",
  );
  requireResponseSchema(
    subscriptionsList,
    "200",
    "BrowserPushSubscriptionListResponseDto",
  );
  requireResponseSchema(
    subscriptionsRegister,
    "200",
    "BrowserPushSubscriptionResponseDto",
  );
  requireResponseSchema(
    subscriptionsRevoke,
    "200",
    "BrowserPushSubscriptionResponseDto",
  );
  requireResponseSchema(
    deepLinkResolve,
    "200",
    "PersonalSupportNotificationDeepLinkTargetDto",
  );
}

function requireNewCaseNotificationPolicyPublished(document) {
  const permission = "project.support.notification_policy.manage";
  const readCurrent = operation(
    document,
    "SupportCaseNotificationPolicy_readCurrent",
  );
  const listTeams = operation(
    document,
    "SupportCaseNotificationPolicy_listAvailableTeams",
  );
  const readCommandResult = operation(
    document,
    "SupportCaseNotificationPolicy_readCommandResult",
  );
  const preview = operation(document, "SupportCaseNotificationPolicy_preview");
  const metrics = operation(
    document,
    "SupportCaseNotificationPolicy_readMetrics",
  );
  const saveDraft = operation(
    document,
    "SupportCaseNotificationPolicy_saveDraft",
  );
  const publish = operation(document, "SupportCaseNotificationPolicy_publish");
  const disable = operation(document, "SupportCaseNotificationPolicy_disable");
  const restore = operation(document, "SupportCaseNotificationPolicy_restore");

  for (const operationValue of [
    readCurrent,
    listTeams,
    readCommandResult,
    preview,
    metrics,
    saveDraft,
    publish,
    disable,
    restore,
  ]) {
    requirePermission(operationValue, permission);
  }
  for (const operationValue of [saveDraft, publish, disable, restore]) {
    requireHeader(operationValue, "Idempotency-Key");
    requireResponseSchema(
      operationValue,
      "200",
      "SupportCaseNotificationPolicyReceiptResponseDto",
    );
  }
  requireBound(listTeams, "limit", "maximum", 100);
  if (parameter(listTeams, "cursor").schema?.format !== "uuid") {
    throw new Error(
      "Notification policy team cursor must remain an opaque UUID",
    );
  }
  requireRequestSchema(
    readCommandResult,
    "ReadSupportCaseNotificationCommandResultDto",
  );
  requireRequestSchema(preview, "SupportCaseNotificationPolicyInputDto");
  requireRequestSchema(saveDraft, "SaveSupportCaseNotificationDraftDto");
  requireRequestSchema(publish, "PublishSupportCaseNotificationPolicyDto");
  requireRequestSchema(disable, "DisableSupportCaseNotificationPolicyDto");
  requireRequestSchema(restore, "RestoreSupportCaseNotificationPolicyDto");
  requireResponseSchema(
    readCurrent,
    "200",
    "SupportCaseNotificationPolicyCurrentResponseDto",
  );
  requireResponseSchema(
    listTeams,
    "200",
    "SupportCaseNotificationAvailableTeamsResponseDto",
  );
  requireResponseSchema(
    readCommandResult,
    "200",
    "SupportCaseNotificationCommandResultResponseDto",
  );
  requireResponseSchema(
    preview,
    "200",
    "SupportCaseNotificationPolicyPreviewResponseDto",
  );
  requireResponseSchema(
    metrics,
    "200",
    "SupportCaseNotificationMetricsResponseDto",
  );

  requirePropertyEnum(
    document,
    "SupportCaseNotificationPolicyInputDto",
    "mode",
    ["OFF", "IMMEDIATE", "DIGEST"],
  );
  requireArrayItemEnum(
    document,
    "SupportCaseNotificationPolicyInputDto",
    "occurrences",
    ["CREATED", "REOPENED"],
  );
  requireArrayItemEnum(
    document,
    "SupportCaseNotificationPolicyInputDto",
    "channels",
    ["BROWSER_PUSH"],
  );
  requirePropertyEnum(
    document,
    "SupportCaseNotificationPolicyInputDto",
    "recipientRule",
    ["ALL_ELIGIBLE_SUBSCRIBERS", "TEAM_SUBSCRIBERS"],
  );
  requireProperties(
    document,
    "SupportCaseNotificationPolicyPreviewResponseDto",
    [
      "issues",
      "estimatedEligibleRecipients",
      "matchingOccurrencesLast7Days",
      "estimatedImmediateDeliveriesLast7Days",
      "estimatedDigestWindowsLast7Days",
      "examples",
      "publishable",
    ],
  );
  const examples =
    document.components.schemas.SupportCaseNotificationPolicyPreviewResponseDto
      .properties.examples;
  if (examples.maxItems !== 5) {
    throw new Error(
      "Notification policy preview must expose at most five examples",
    );
  }
  requireProperties(
    document,
    "SupportCaseNotificationPolicyPreviewExampleDto",
    ["occurrence", "conversationClass", "topicCode", "priority", "occurredAt"],
  );
  for (const forbidden of ["caseId", "title", "message", "endUserId"]) {
    if (
      document.components.schemas.SupportCaseNotificationPolicyPreviewExampleDto
        .properties[forbidden]
    ) {
      throw new Error(
        `Notification preview example must not expose ${forbidden}`,
      );
    }
  }
  requireProperties(
    document,
    "SupportCaseNotificationPolicyReceiptResponseDto",
    ["receiptId", "replayed", "policy"],
  );
  requirePropertyEnum(
    document,
    "ReadSupportCaseNotificationCommandResultDto",
    "operation",
    ["SAVE_DRAFT", "PUBLISH", "DISABLE", "RESTORE"],
  );
  requireProperties(
    document,
    "SupportCaseNotificationCommandResultResponseDto",
    ["found", "operation"],
  );
  requirePropertyEnum(
    document,
    "UpdatePersonalSupportNotificationPreferenceDto",
    "topic",
    ["SUPPORT_CASE_CREATED"],
  );
  requireProperties(
    document,
    "PersonalSupportNotificationAdmissionCapabilitiesDto",
    ["newCases"],
  );
}

export function validateSupportContentLeadNotificationContract(document) {
  const noteList = operation(document, "SupportInternalNote_list");
  const noteCreate = operation(document, "SupportInternalNote_create");
  const noteCorrection = operation(document, "SupportInternalNote_correct");
  const noteRevisions = operation(document, "SupportInternalNote_revisions");
  const noteTombstone = operation(document, "SupportInternalNote_tombstone");
  requirePermission(noteList, "project.support.internal_notes.read");
  requirePermission(noteCreate, "project.support.internal_notes.write");
  requirePermission(noteCorrection, "project.support.internal_notes.write");
  requirePermission(noteTombstone, "project.support.internal_notes.redact");
  requireAllPermissions(noteRevisions, [
    "project.support.internal_notes.read",
    "project.support.internal_notes.history_read",
  ]);
  requireBound(noteList, "limit", "maximum", 100);
  requireBound(noteList, "cursor", "maxLength", 1024);
  requireBound(noteRevisions, "limit", "maximum", 100);
  requireBound(noteRevisions, "cursor", "maxLength", 1024);
  requireHeader(noteCreate, "Idempotency-Key");
  for (const operationValue of [noteCorrection, noteTombstone]) {
    requireHeader(operationValue, "Idempotency-Key");
    requireHeader(operationValue, "If-Match");
  }
  requireRequestSchema(noteCreate, "CreateSupportInternalNoteDto");
  requireRequestSchema(noteCorrection, "CorrectSupportInternalNoteDto");
  requireRequestSchema(noteTombstone, "TombstoneSupportInternalNoteDto");
  requireResponseSchema(noteList, "200", "SupportInternalNotePageResponseDto");
  requireResponseSchema(
    noteRevisions,
    "200",
    "SupportInternalNoteRevisionPageResponseDto",
  );
  for (const operationValue of [noteCreate, noteCorrection, noteTombstone]) {
    requireResponseSchema(
      operationValue,
      "200",
      "SupportInternalNoteResponseDto",
    );
  }
  requireProperties(document, "SupportInternalNoteResponseDto", [
    "id",
    "endUserCaseId",
    "hasUnavailableReferences",
    "lifecycle",
    "version",
    "currentRevisionNumber",
    "body",
    "creator",
    "actionEtag",
  ]);
  requirePropertyEnum(document, "SupportInternalNoteResponseDto", "lifecycle", [
    "ACTIVE",
    "TOMBSTONED",
    "PURGED",
  ]);
  requireProperties(document, "SupportInternalNoteRevisionResponseDto", [
    "id",
    "noteId",
    "revisionNumber",
    "body",
    "reasonCode",
    "author",
    "createdAt",
  ]);

  const contentPanel = operation(document, "SupportContentPanel_read");
  requireAllPermissions(contentPanel, [
    "project.support.macros.read",
    "project.cases.read",
  ]);
  requireBound(contentPanel, "q", "maxLength", 128);
  requireBound(contentPanel, "macroLimit", "maximum", 100);
  requireBound(contentPanel, "knowledgeLimit", "maximum", 100);
  requireResponseSchema(contentPanel, "200", "SupportContentPanelResponseDto");
  requireProperties(document, "SupportContentPanelResponseDto", [
    "macros",
    "knowledge",
  ]);
  requirePropertyEnum(document, "SupportContentPanelMacrosDto", "state", [
    "READY",
    "UNAVAILABLE",
  ]);
  requirePropertyEnum(document, "SupportContentPanelKnowledgeDto", "state", [
    "READY",
    "UNAVAILABLE",
    "NOT_REQUESTED",
  ]);

  const macroCatalog = operation(document, "SupportMacro_catalog");
  const macroRead = operation(document, "SupportMacro_read");
  const macroCreate = operation(document, "SupportMacro_create");
  const macroReplace = operation(document, "SupportMacro_replaceDraft");
  const macroPublish = operation(document, "SupportMacro_publish");
  const macroArchive = operation(document, "SupportMacro_archive");
  for (const operationValue of [macroCatalog, macroRead]) {
    requirePermission(operationValue, "project.support.macros.read");
  }
  for (const operationValue of [
    macroCreate,
    macroReplace,
    macroPublish,
    macroArchive,
  ]) {
    requirePermission(operationValue, "project.support.macros.manage");
    requireHeader(operationValue, "Idempotency-Key");
  }
  for (const operationValue of [macroReplace, macroPublish, macroArchive]) {
    requireHeader(operationValue, "If-Match");
  }
  requireBound(macroCatalog, "query", "maxLength", 128);
  requireBound(macroCatalog, "limit", "maximum", 100);
  requireRequestSchema(macroCreate, "CreateSupportMacroDto");
  requireRequestSchema(macroReplace, "ReplaceSupportMacroDraftDto");
  requireResponseSchema(macroCatalog, "200", "SupportMacroCatalogResponseDto");
  for (const operationValue of [
    macroRead,
    macroCreate,
    macroReplace,
    macroPublish,
    macroArchive,
  ]) {
    requireResponseSchema(operationValue, "200", "SupportMacroResponseDto");
  }
  requireProperties(document, "SupportMacroResponseDto", [
    "id",
    "stableCode",
    "lifecycle",
    "version",
    "draft",
    "publishedRevision",
    "actionEtag",
  ]);
  requireProperties(document, "SupportMacroDraftProjectionDto", [
    "generation",
    "version",
    "contentHash",
    "configuration",
  ]);
  requireProperties(document, "SupportMacroPublishedRevisionDto", [
    "id",
    "revisionNumber",
    "contentHash",
    "publishedAt",
    "configuration",
  ]);

  const macroDraftCreate = operation(document, "SupportMacroReplyDraft_create");
  const macroDraftRead = operation(document, "SupportMacroReplyDraft_read");
  const macroDraftEdit = operation(document, "SupportMacroReplyDraft_edit");
  for (const operationValue of [
    macroDraftCreate,
    macroDraftRead,
    macroDraftEdit,
  ]) {
    requireAllPermissions(operationValue, [
      "project.conversations.reply",
      "project.support.macros.read",
      "project.support.macros.use",
    ]);
  }
  requireHeader(macroDraftCreate, "Idempotency-Key");
  requireHeader(macroDraftEdit, "If-Match");
  requireRequestSchema(macroDraftCreate, "CreateSupportMacroReplyDraftDto");
  requireRequestSchema(macroDraftEdit, "EditSupportMacroReplyDraftDto");
  for (const operationValue of [
    macroDraftCreate,
    macroDraftRead,
    macroDraftEdit,
  ]) {
    requireResponseSchema(
      operationValue,
      "200",
      "SupportMacroReplyDraftResponseDto",
    );
  }
  requireProperties(document, "SupportMacroReplyDraftResponseDto", [
    "id",
    "macroId",
    "macroRevisionId",
    "macroRevisionNumber",
    "conversationId",
    "endUserCaseId",
    "state",
    "version",
    "text",
    "renderedHash",
    "expiresAt",
    "actionEtag",
  ]);
  requirePropertyEnum(document, "SupportMacroReplyDraftResponseDto", "state", [
    "READY",
    "CONSUMED",
    "EXPIRED",
  ]);

  const knowledgeSearch = operation(
    document,
    "SupportInternalKnowledge_search",
  );
  const knowledgeOpen = operation(document, "SupportInternalKnowledge_open");
  const knowledgeDownloadGrant = operation(
    document,
    "SupportInternalKnowledge_createDownloadGrant",
  );
  const knowledgeDownload = operation(
    document,
    "SupportInternalKnowledge_exchangeDownloadGrant",
  );
  for (const operationValue of [
    knowledgeSearch,
    knowledgeOpen,
    knowledgeDownloadGrant,
    knowledgeDownload,
  ]) {
    requireAllPermissions(operationValue, [
      "project.support.knowledge.read",
      "project.cases.read",
    ]);
    if (parameter(operationValue, "caseId").required !== true) {
      throw new Error(`${operationValue.operationId}.caseId must be required`);
    }
  }
  requireBound(knowledgeSearch, "q", "minLength", 1);
  requireBound(knowledgeSearch, "q", "maxLength", 240);
  requireBound(knowledgeSearch, "cursor", "maxLength", 2000);
  requireBound(knowledgeSearch, "limit", "maximum", 100);
  requireResponseSchema(
    knowledgeSearch,
    "200",
    "SupportKnowledgeSearchPageResponseDto",
  );
  requireResponseSchema(
    knowledgeOpen,
    "200",
    "SupportKnowledgeTextDocumentResponseDto",
  );
  requireResponseSchema(
    knowledgeDownloadGrant,
    "200",
    "SupportKnowledgeDownloadGrantResponseDto",
  );
  requireResponseSchema(
    knowledgeDownload,
    "200",
    "SupportKnowledgeFileDownloadResponseDto",
  );
  requireProperties(document, "SupportKnowledgeSearchItemResponseDto", [
    "documentId",
    "revisionId",
    "sourceType",
    "title",
    "publishedAt",
    "snippet",
  ]);
  requireProperties(document, "SupportKnowledgeTextDocumentResponseDto", [
    "documentId",
    "revisionId",
    "sourceType",
    "title",
    "publishedAt",
    "contentText",
  ]);
  requireProperties(document, "SupportKnowledgeFileDownloadResponseDto", [
    "documentId",
    "revisionId",
    "filename",
    "url",
    "expiresAt",
  ]);
  const citationOperations = [
    "SupportInternalKnowledge_createCitationDraft",
    "SupportInternalKnowledge_readCitationDraft",
    "SupportInternalKnowledge_updateCitationDraft",
  ].map((operationId) => operation(document, operationId));
  for (const operationValue of citationOperations) {
    requireAllPermissions(operationValue, [
      "project.support.knowledge.read",
      "project.cases.read",
      "project.conversations.reply",
    ]);
    requireResponseSchema(
      operationValue,
      "200",
      "SupportKnowledgeCitationDraftResponseDto",
    );
  }
  requireProperties(document, "SupportKnowledgeCitationDraftResponseDto", [
    "id",
    "documentId",
    "revisionId",
    "revisionNumber",
    "mode",
    "state",
    "version",
    "expiresAt",
    "actionEtag",
  ]);
  if (
    !document.components?.schemas?.SendAdminMessageDto?.properties
      ?.supportKnowledgeCitationDraftId
  )
    throw new Error(
      "SendAdminMessageDto must publish supportKnowledgeCitationDraftId",
    );
  for (const schemaName of [
    "AdminConversationMessageResponseDto",
    "AdminStoredMessageResponseDto",
    "CmsConversationMessageRealtimeStateDto",
  ])
    requireProperties(document, schemaName, ["knowledgeProvenance"]);

  const knowledgeManageOperations = [
    "SupportInternalKnowledge_listManagedDocuments",
    "SupportInternalKnowledge_readManagedDocument",
    "SupportInternalKnowledge_createTextDocument",
    "SupportInternalKnowledge_createTextRevision",
    "SupportInternalKnowledge_updateTextDraft",
    "SupportInternalKnowledge_startFileUpload",
    "SupportInternalKnowledge_completeFileUpload",
    "SupportInternalKnowledge_submitForScan",
    "SupportInternalKnowledge_publish",
    "SupportInternalKnowledge_archive",
    "SupportInternalKnowledge_rollbackRevision",
  ].map((operationId) => operation(document, operationId));
  for (const operationValue of knowledgeManageOperations) {
    requirePermission(operationValue, "project.support.knowledge.manage");
  }
  requireResponseSchema(
    knowledgeManageOperations[0],
    "200",
    "SupportKnowledgeManagedDocumentsPageResponseDto",
  );
  requireResponseSchema(
    knowledgeManageOperations[1],
    "200",
    "SupportKnowledgeManagedDocumentDetailResponseDto",
  );
  for (const operationId of [
    "SupportInternalKnowledge_createTextDocument",
    "SupportInternalKnowledge_createTextRevision",
    "SupportInternalKnowledge_updateTextDraft",
    "SupportInternalKnowledge_startFileUpload",
    "SupportInternalKnowledge_completeFileUpload",
    "SupportInternalKnowledge_submitForScan",
    "SupportInternalKnowledge_publish",
    "SupportInternalKnowledge_archive",
    "SupportInternalKnowledge_rollbackRevision",
  ]) {
    requireHeader(operation(document, operationId), "Idempotency-Key");
  }
  requireResponseSchema(
    operation(document, "SupportInternalKnowledge_startFileUpload"),
    "200",
    "SupportKnowledgeFileUploadStartResponseDto",
  );
  for (const operationId of [
    "SupportInternalKnowledge_createTextDocument",
    "SupportInternalKnowledge_createTextRevision",
    "SupportInternalKnowledge_updateTextDraft",
    "SupportInternalKnowledge_completeFileUpload",
    "SupportInternalKnowledge_submitForScan",
    "SupportInternalKnowledge_publish",
    "SupportInternalKnowledge_archive",
    "SupportInternalKnowledge_rollbackRevision",
  ]) {
    requireResponseSchema(
      operation(document, operationId),
      "200",
      "SupportKnowledgeCommandReceiptResponseDto",
    );
  }
  requireProperties(document, "SupportKnowledgeManagedRevisionResponseDto", [
    "revisionId",
    "revisionNumber",
    "state",
    "sourceType",
    "title",
    "visibility",
    "scan",
    "createdAt",
    "updatedAt",
  ]);
  requirePropertyEnum(
    document,
    "SupportKnowledgeManagedRevisionResponseDto",
    "state",
    [
      "EDITING",
      "QUARANTINED",
      "SCANNING",
      "PUBLISHABLE",
      "PUBLISHED",
      "REJECTED",
    ],
  );
  requireProperties(document, "SupportKnowledgeCommandReceiptResponseDto", [
    "documentId",
    "revisionId",
    "state",
    "replayed",
  ]);

  const retentionRead = operation(
    document,
    "SupportContentGovernance_retention",
  );
  const retentionReplace = operation(
    document,
    "SupportContentGovernance_replaceRetentionDraft",
  );
  const retentionPublish = operation(
    document,
    "SupportContentGovernance_publishRetention",
  );
  const retentionPreview = operation(
    document,
    "SupportContentGovernance_previewRetention",
  );
  for (const operationValue of [
    retentionRead,
    retentionReplace,
    retentionPublish,
    retentionPreview,
  ]) {
    requirePermission(
      operationValue,
      "project.support.content_retention.manage",
    );
  }
  for (const operationValue of [
    retentionRead,
    retentionReplace,
    retentionPublish,
  ]) {
    requireResponseSchema(
      operationValue,
      "200",
      "SupportContentRetentionPolicyResponseDto",
    );
  }
  for (const operationValue of [retentionReplace, retentionPublish]) {
    requireHeader(operationValue, "If-Match");
    requireHeader(operationValue, "Idempotency-Key");
  }
  requireProperties(document, "SupportContentRetentionPolicyResponseDto", [
    "version",
    "draft",
    "publishedRevision",
    "actionEtag",
  ]);
  requireBound(retentionPreview, "batchSize", "maximum", 100);

  const holdList = operation(document, "SupportContentGovernance_listHolds");
  const holdCreate = operation(document, "SupportContentGovernance_createHold");
  const holdRelease = operation(
    document,
    "SupportContentGovernance_releaseHold",
  );
  for (const operationValue of [holdList, holdCreate, holdRelease]) {
    requirePermission(
      operationValue,
      "project.support.content_legal_hold.manage",
    );
  }
  requireResponseSchema(
    holdList,
    "200",
    "SupportContentLegalHoldPageResponseDto",
  );
  for (const operationValue of [holdCreate, holdRelease]) {
    requireResponseSchema(
      operationValue,
      "200",
      "SupportContentLegalHoldResponseDto",
    );
  }
  requireHeader(holdCreate, "Idempotency-Key");
  requireHeader(holdRelease, "Idempotency-Key");
  requireHeader(holdRelease, "If-Match");
  requireBound(holdList, "limit", "maximum", 200);
  requireBound(holdList, "cursor", "maxLength", 1024);
  requireProperties(document, "SupportContentLegalHoldResponseDto", [
    "id",
    "scope",
    "targetId",
    "state",
    "reason",
    "version",
    "createdAt",
    "releasedAt",
    "actionEtag",
  ]);

  const leadSummary = operation(document, "SupportLead_summary");
  const leadCaseRisks = operation(document, "SupportLead_caseRisks");
  const leadCapacityRisks = operation(document, "SupportLead_capacityRisks");
  const leadInvestigation = operation(document, "SupportLead_investigation");
  for (const operationValue of [
    leadSummary,
    leadCaseRisks,
    leadCapacityRisks,
    leadInvestigation,
  ]) {
    requirePermission(operationValue, "project.support.lead_control.read");
  }
  const leadActivity = operation(document, "SupportLead_activity");
  requirePermission(leadActivity, "project.support.activity.read");
  for (const [operationValue, schemaName] of [
    [leadSummary, "SupportLeadSummaryResponseDto"],
    [leadCaseRisks, "SupportLeadCaseRisksResponseDto"],
    [leadCapacityRisks, "SupportLeadCapacityRisksResponseDto"],
    [leadInvestigation, "SupportLeadInvestigationResponseDto"],
    [leadActivity, "SupportActivityResponseDto"],
  ]) {
    requireResponseSchema(operationValue, "200", schemaName);
  }
  for (const operationValue of [
    leadCaseRisks,
    leadCapacityRisks,
    leadActivity,
  ]) {
    requireBound(operationValue, "limit", "maximum", 200);
    requireBound(operationValue, "cursor", "maxLength", 2048);
  }
  requireBound(leadInvestigation, "limit", "maximum", 500);
  requireBound(leadInvestigation, "cursor", "maxLength", 2048);
  if (parameter(leadCaseRisks, "riskType").required !== true) {
    throw new Error("SupportLead_caseRisks.riskType must remain required");
  }
  for (const schemaName of [
    "SupportLeadSummaryResponseDto",
    "SupportLeadCaseRisksResponseDto",
    "SupportLeadCapacityRisksResponseDto",
    "SupportLeadInvestigationResponseDto",
    "SupportActivityResponseDto",
  ]) {
    requireProperties(document, schemaName, [
      "projectionGeneration",
      "checkpoint",
      "sourceHighWater",
      "freshnessState",
      "computedAt",
      "effectiveWindow",
      "capabilities",
      "kind",
      "data",
    ]);
    requirePropertyEnum(document, schemaName, "freshnessState", [
      "BUILDING",
      "READY",
      "STALE",
      "DEGRADED",
    ]);
  }
  requireProperties(document, "SupportLeadInvestigationDataDto", [
    "evidenceSource",
    "routingFactsState",
    "timelineSources",
    "pinned",
    "actionTokens",
    "facts",
  ]);
  requireProperties(document, "SupportLeadInvestigationActionTokensDto", [
    "caseVersion",
    "caseReadToken",
    "assignmentEtag",
    "slaClockEtags",
    "availabilityVersions",
  ]);
  requireProperties(document, "SupportLeadCaseRiskItemDto", [
    "caseId",
    "riskType",
    "riskSortAt",
    "detectedAt",
    "dueAt",
    "caseVersion",
    "assignmentVersion",
    "slaClockVersion",
    "deliveryVersion",
  ]);
  requirePropertyEnum(document, "SupportLeadCapacityRisksDataDto", "state", [
    "AVAILABLE",
  ]);
  requireProperties(document, "SupportLeadCapacityRisksDataDto", [
    "state",
    "snapshotAt",
    "items",
  ]);
  requireProperties(document, "SupportLeadCapacityRiskItemDto", [
    "riskId",
    "riskVersion",
    "lastDecisionId",
    "queue",
    "teamId",
    "requiredCapacityUnits",
    "eligibilityExclusionCounts",
    "observedAt",
  ]);

  const alertList = operation(document, "SupportOperationalAlert_list");
  const alertDetail = operation(document, "SupportOperationalAlert_detail");
  requirePermission(alertList, "project.support.alerts.read");
  requirePermission(alertDetail, "project.support.alerts.read");
  requireResponseSchema(
    alertList,
    "200",
    "SupportOperationalAlertListResponseDto",
  );
  requireResponseSchema(
    alertDetail,
    "200",
    "SupportOperationalAlertDetailResponseDto",
  );
  requireBound(alertList, "limit", "maximum", 200);
  requireBound(alertList, "cursor", "maxLength", 2048);
  requireBound(alertDetail, "limit", "maximum", 500);
  requireBound(alertDetail, "cursor", "maxLength", 2048);
  requireProperties(document, "SupportOperationalAlertItemDto", [
    "id",
    "sourceKind",
    "state",
    "currentSeverity",
    "currentGeneration",
    "version",
    "occurrenceCount",
    "sourceHighWater",
    "sourceVersion",
    "currentPolicyRevisionId",
    "ownerCmsUserId",
    "firstObservedAt",
    "lastObservedAt",
  ]);
  requireProperties(document, "SupportOperationalAlertMaterializationDto", [
    "state",
    "checkpoint",
    "sourceHighWater",
    "diagnosticCode",
    "computedAt",
  ]);
  requirePropertyEnum(document, "SupportOperationalAlertItemDto", "state", [
    "NEW",
    "ACKNOWLEDGED",
    "RESOLVED",
  ]);
  requirePropertyEnum(
    document,
    "SupportOperationalAlertMaterializationDto",
    "state",
    ["READY", "DEGRADED"],
  );

  const alertAcknowledge = operation(
    document,
    "SupportOperationalAlertCommand_acknowledge",
  );
  const alertChangeOwner = operation(
    document,
    "SupportOperationalAlertCommand_changeOwner",
  );
  const alertResolve = operation(
    document,
    "SupportOperationalAlertCommand_resolve",
  );
  for (const operationValue of [
    alertAcknowledge,
    alertChangeOwner,
    alertResolve,
  ]) {
    requirePermission(operationValue, "project.support.alerts.manage");
    requireHeader(operationValue, "If-Match");
    requireHeader(operationValue, "Idempotency-Key");
    requireResponseSchema(
      operationValue,
      "200",
      "SupportOperationalAlertCommandReceiptDto",
    );
    requireInlineErrorEnum(operationValue, "409", [
      "SUPPORT_OPERATIONAL_ALERT_IDEMPOTENCY_KEY_REUSED",
      "SUPPORT_OPERATIONAL_ALERT_SOURCE_ADVANCED",
      "SUPPORT_OPERATIONAL_ALERT_VERSION_CONFLICT",
      "SUPPORT_OPERATIONAL_ALERT_STATE_TRANSITION_INVALID",
    ]);
    requireInlineErrorEnum(operationValue, "503", [
      "SUPPORT_OPERATIONAL_ALERT_COMMAND_TIMEOUT",
      "SUPPORT_OPERATIONAL_ALERT_COMMAND_RECEIPT_INVALID",
      "SUPPORT_OPERATIONAL_ALERT_COMMAND_FAILED",
    ]);
  }
  requireRequestSchema(
    alertAcknowledge,
    "AcknowledgeSupportOperationalAlertDto",
  );
  requireRequestSchema(
    alertChangeOwner,
    "ChangeSupportOperationalAlertOwnerDto",
  );
  requireRequestSchema(alertResolve, "ResolveSupportOperationalAlertDto");
  requireProperties(document, "SupportOperationalAlertCommandReceiptDto", [
    "commandId",
    "alertId",
    "eventId",
    "activityId",
    "outboxId",
    "state",
    "ownerCmsUserId",
    "version",
    "occurredAt",
    "replayed",
  ]);
  requirePropertyEnum(
    document,
    "SupportOperationalAlertCommandReceiptDto",
    "state",
    ["NEW", "ACKNOWLEDGED", "RESOLVED"],
  );
  requirePropertyEnum(
    document,
    "AcknowledgeSupportOperationalAlertDto",
    "reasonCode",
    ["INVESTIGATING", "OWNERSHIP_ACCEPTED", "ESCALATED"],
  );
  requirePropertyEnum(
    document,
    "ResolveSupportOperationalAlertDto",
    "reasonCode",
    [
      "RISK_CLEARED",
      "MITIGATED",
      "FALSE_POSITIVE",
      "DUPLICATE",
      "EXTERNAL_INCIDENT_HANDOFF",
    ],
  );

  requireBrowserNotificationsPublished(document);
  requireNewCaseNotificationPolicyPublished(document);
}
