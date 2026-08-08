import {
  contractOperation as operation,
  operationParameter as parameter,
  requireOperationPermission as requirePermission,
  requireSchemaEnum as requireSchemaEnumValues,
  requireSchemaFields as requireFields,
  requireSchemaProperties as requireProperties,
  requireSchemaPropertyEnum as requireEnumValues,
} from "./openapi-contract-assertions.mjs";

export function validateSupportWorkspaceMessagingContract(document) {
  const workspaceRead = operation(document, "SupportWorkspace_read");
  const messageHistory = operation(document, "AdminConversations_listMessages");
  const sendMessage = operation(document, "AdminMessaging_send");
  const lookupMessageOutcome = operation(
    document,
    "AdminMessaging_lookupOutcome",
  );
  const readPosition = operation(
    document,
    "AdminConversationCollaboration_get",
  );
  const markReadPosition = operation(
    document,
    "AdminConversationCollaboration_mark",
  );
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
  requirePermission(lookupMessageOutcome, "project.conversations.reply");
  requirePermission(readPosition, "project.conversations.read");
  requirePermission(markReadPosition, "project.conversations.read");
  if (parameter(workspaceRead, "messageLimit").schema?.maximum !== 100) {
    throw new Error(
      "SupportWorkspace_read messageLimit must remain bounded at 100",
    );
  }
  parameter(workspaceRead, "messageNewerCursor");
  const idempotencyKey = parameter(sendMessage, "Idempotency-Key");
  if (idempotencyKey.in !== "header" || idempotencyKey.required !== true) {
    throw new Error("AdminMessaging_send must require Idempotency-Key header");
  }
  const lookupIdempotencyKey = parameter(
    lookupMessageOutcome,
    "Idempotency-Key",
  );
  if (
    lookupIdempotencyKey.in !== "header" ||
    lookupIdempotencyKey.required !== true
  ) {
    throw new Error(
      "AdminMessaging_lookupOutcome must require Idempotency-Key header",
    );
  }
  if (
    lookupMessageOutcome.responses?.["200"]?.content?.["application/json"]
      ?.schema?.$ref !== "#/components/schemas/SendAdminMessageResponseDto" ||
    !lookupMessageOutcome.responses?.["404"]
  ) {
    throw new Error(
      "AdminMessaging_lookupOutcome must retain typed accepted and not-found outcomes",
    );
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
    "anchorOrdinal",
  ]);
  requireFields(document, "SupportWorkspaceMessagePageResponseDto", [
    "nextCursor",
    "newerCursor",
  ]);
  requireProperties(document, "CmsConversationReadPositionResponseDto", [
    "conversationId",
    "lastReadOrdinal",
    "highestOrdinal",
    "firstUnreadOrdinal",
    "unreadMessageCount",
    "unreadCustomerMessageCount",
  ]);
  requireProperties(document, "SupportWorkspaceConversationRowResponseDto", [
    "readState",
  ]);
  requireProperties(
    document,
    "SupportWorkspaceSelectionConversationResponseDto",
    ["readState"],
  );
  requireProperties(document, "MarkCmsConversationReadPositionDto", [
    "lastReadOrdinal",
  ]);
  const readPositionResponse =
    readPosition.responses?.["200"]?.content?.["application/json"]?.schema
      ?.$ref;
  const markReadPositionRequest =
    markReadPosition.requestBody?.content?.["application/json"]?.schema?.$ref;
  const markReadPositionResponse =
    markReadPosition.responses?.["200"]?.content?.["application/json"]?.schema
      ?.$ref;
  if (
    readPositionResponse !==
      "#/components/schemas/CmsConversationReadPositionResponseDto" ||
    markReadPositionRequest !==
      "#/components/schemas/MarkCmsConversationReadPositionDto" ||
    markReadPositionResponse !==
      "#/components/schemas/CmsConversationReadPositionResponseDto"
  ) {
    throw new Error(
      "Conversation read position operations must retain typed request and response schemas",
    );
  }
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
  requireEnumValues(document, "AdminMessageDeliveryResponseDto", "status", [
    "PENDING",
    "DELIVERING",
    "DELIVERED",
    "READ",
    "FAILED",
    "CANCELLED",
    "NOT_REDELIVERED",
  ]);
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
