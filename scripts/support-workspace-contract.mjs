function schema(document, name) {
  const value = document?.components?.schemas?.[name];
  if (!value) throw new Error(`OpenAPI is missing ${name}`);
  return value;
}

function requireProperties(document, schemaName, properties) {
  const required = new Set(schema(document, schemaName).required ?? []);
  for (const property of properties) {
    if (!required.has(property)) {
      throw new Error(`${schemaName} must require ${property}`);
    }
  }
}

function operation(document, operationId) {
  for (const pathItem of Object.values(document?.paths ?? {})) {
    for (const value of Object.values(pathItem ?? {})) {
      if (value?.operationId === operationId) return value;
    }
  }
  throw new Error(`OpenAPI is missing operation ${operationId}`);
}

function parameter(operationValue, name) {
  const value = operationValue.parameters?.find(
    (candidate) => candidate.name === name,
  );
  if (!value) throw new Error(`${operationValue.operationId} is missing ${name}`);
  return value;
}

function requirePermission(operationValue, code) {
  if (operationValue["x-iam-permission"]?.code !== code) {
    throw new Error(`${operationValue.operationId} must require ${code}`);
  }
}

function requireEnumValues(document, schemaName, propertyName, values) {
  const property = schema(document, schemaName).properties?.[propertyName];
  const actual = new Set(property?.enum ?? []);
  for (const value of values) {
    if (!actual.has(value)) {
      throw new Error(`${schemaName}.${propertyName} must retain ${value}`);
    }
  }
}

function requireSchemaEnumValues(document, schemaName, values) {
  const actual = new Set(schema(document, schemaName).enum ?? []);
  for (const value of values) {
    if (!actual.has(value)) throw new Error(`${schemaName} must retain ${value}`);
  }
}

export function validateSupportWorkspaceMessagingContract(document) {
  const workspaceRead = operation(document, "SupportWorkspace_read");
  const messageHistory = operation(
    document,
    "AdminConversations_listMessages",
  );
  const sendMessage = operation(document, "AdminMessaging_send");
  const workspacePermissions = new Set(
    workspaceRead["x-iam-any-permission"]?.map((value) => value.code) ?? [],
  );
  for (const code of ["project.cases.read", "project.conversations.read"]) {
    if (!workspacePermissions.has(code)) {
      throw new Error(`SupportWorkspace_read must allow ${code}`);
    }
  }
  requirePermission(messageHistory, "project.conversations.read");
  requirePermission(sendMessage, "project.conversations.reply");
  if (parameter(workspaceRead, "messageLimit").schema?.maximum !== 100) {
    throw new Error("SupportWorkspace_read messageLimit must remain bounded at 100");
  }
  const idempotencyKey = parameter(sendMessage, "Idempotency-Key");
  if (idempotencyKey.in !== "header" || idempotencyKey.required !== true) {
    throw new Error("AdminMessaging_send must require Idempotency-Key header");
  }
  requireProperties(document, "SupportWorkspaceSelectionResponseDto", [
    "mode",
    "endUser",
    "case",
    "conversation",
    "messages",
    "relatedCases",
    "relatedConversations",
    "relatedCasesTruncated",
    "relatedConversationsTruncated",
    "classificationOptions",
    "capabilities",
    "checkpoint",
    "capabilitiesRevision",
    "actionRevisions",
  ]);
  requireProperties(document, "SupportWorkspaceCapabilitiesResponseDto", [
    "reply",
    "replyWithoutTranslation",
    "suspendAi",
    "manageCase",
    "assignCase",
    "claimAssignment",
    "releaseAssignment",
    "transferAssignment",
    "escalateCase",
  ]);
  requireProperties(document, "SupportWorkspaceMessagePageResponseDto", [
    "items",
  ]);
  requireProperties(document, "AdminConversationMessageResponseDto", [
    "id",
    "threadId",
    "role",
    "status",
    "text",
    "ordinal",
    "author",
    "createdAt",
    "updatedAt",
  ]);
  requireProperties(document, "AdminMessageAuthorResponseDto", [
    "type",
    "cmsUserId",
    "displayName",
    "avatarUrl",
  ]);
  requireProperties(document, "AdminMessageDeliveryResponseDto", [
    "status",
    "commandIds",
  ]);
  requireSchemaEnumValues(document, "SupportWorkspaceMode", [
    "CASES",
    "ALL_CONVERSATIONS",
    "SELECTION",
  ]);
  requireEnumValues(
    document,
    "AdminMessageDeliveryResponseDto",
    "status",
    [
      "PENDING",
      "DELIVERING",
      "DELIVERED",
      "READ",
      "FAILED",
      "CANCELLED",
      "NOT_REDELIVERED",
    ],
  );
  requireSchemaEnumValues(document, "MessageRole", [
    "USER",
    "ASSISTANT",
    "ADMIN",
    "SCENARIO",
    "SYSTEM",
  ]);
  requireSchemaEnumValues(document, "MessageStatus", [
    "WRITING",
    "COMPLETED",
    "FAILED",
    "CANCELLED",
  ]);
  requireEnumValues(document, "AdminMessageAuthorResponseDto", "type", [
    "CMS_USER",
    "SYSTEM",
    "BREAK_GLASS",
    "UNKNOWN",
  ]);
}
