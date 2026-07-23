import type { AdminMessageAISuspensionDto } from "@/shared/api/generated/models";

export type EntityKind = "BUTTON" | "MODAL" | "PAGE" | "ELEMENT" | "HANDLER";
export type ScenarioStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
export type ConversationPolicy = "reuse_active" | "create_new";
export type ActionType = string;
export type ActionExecutor = "SERVER" | "FRONTEND";
export type ActionControl =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "target"
  | "event"
  | "json"
  | "boolean"
  | "goal-builder"
  | "duration"
  | "node";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface ActionConfigPropertySchema extends Record<string, unknown> {
  type?: "string" | "number" | "integer" | "boolean" | "object" | "array";
  title?: string;
  description?: string;
  default?: JsonValue;
  enum?: JsonValue[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  items?: ActionConfigPropertySchema;
  properties?: Record<string, ActionConfigPropertySchema>;
  required?: string[];
  additionalProperties?: boolean | ActionConfigPropertySchema;
}

export interface ActionConfigSchema extends Record<string, unknown> {
  type: "object";
  properties: Record<string, ActionConfigPropertySchema>;
  required: string[];
  additionalProperties?: boolean | ActionConfigPropertySchema;
}

export type ActionUiOption = JsonValue | { label: string; value: JsonValue };

export interface ActionUiField extends Record<string, unknown> {
  key: string;
  label: string;
  control: ActionControl;
  options?: ActionUiOption[];
  allowCustom?: boolean;
  supportsTemplates?: boolean;
  targetKinds?: EntityKind[];
  visibleWhen?: Record<string, unknown>;
}

export interface ActionUiSchema extends Record<string, unknown> {
  fields: ActionUiField[];
}

export interface ScenarioActionCatalogItem {
  id: string;
  type: ActionType;
  name: string;
  description: string | null;
  executor: ActionExecutor;
  configSchema: ActionConfigSchema;
  uiSchema: ActionUiSchema;
  enabled: boolean;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface AuthProject {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  version?: number;
  publicKey?: string;
  defaultLocale?: string;
  supportedLocales?: string[];
  assistantName?: string;
  systemPrompt?: string;
  voiceInstructions?: string;
  settings?: Record<string, unknown> & {
    description?: string;
    timezone?: string;
    voiceEnabled?: boolean;
    voiceTranscriptEnabled?: boolean;
    voice?: string;
  };
  organization?: Organization;
  _count?: { users: number; scenarios: number; eventLogs: number };
  membershipId?: string;
  membershipStatus?: "ACTIVE" | "REMOVED";
  membershipVersion?: number;
  roleKeys?: string[];
  effectivePermissionCodes?: string[];
}

export interface Project extends AuthProject {
  version: number;
  publicKey: string;
  defaultLocale: string;
  supportedLocales: string[];
  assistantName: string;
  systemPrompt: string;
  voiceInstructions: string;
  settings: NonNullable<AuthProject["settings"]>;
}

export interface CmsUser {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt?: string | null;
  pendingEmail?: string | null;
  emailVerificationRetryAfterSeconds?: number;
  platformPermissionCodes?: string[];
}

export interface UiElement {
  id: string;
  projectId: string;
  code: string;
  name: string;
  kind: EntityKind;
  selector?: string;
  route?: string;
  modalName?: string;
  /** @deprecated Legacy CMS value. Runtime commands never use this field. */
  handler?: string;
  config: Record<string, unknown>;
  enabled: boolean;
  aiEnabled: boolean;
  aiDescription: string | null;
  aiAliases: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface EventDefinition {
  id: string;
  definitionKeyId?: string;
  currentRevisionId?: string | null;
  isCurrent?: boolean;
  origin?: "CUSTOM" | "LOLA_MANAGED";
  readOnly?: boolean;
  policyVersion?: number;
  policyUpdatedAt?: string;
  metadataUpdatedAt?: string;
  lifecycle?: "ACTIVE" | "ARCHIVED";
  archivedAt?: string | null;
  projectId: string;
  code: string;
  name: string;
  description?: string;
  version: number;
  payloadSchema: Record<string, any>;
  clientIngestible: boolean;
  countsAsActivity: boolean;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface EventDefinitionRevision extends EventDefinition {
  definitionKeyId: string;
  currentRevisionId: string | null;
  isCurrent: boolean;
  origin: "CUSTOM" | "LOLA_MANAGED";
  readOnly: boolean;
  pinnedScenarioRevisionCount: number;
  compatibility: "CURRENT" | "PINNED" | "SUPERSEDED";
}

export interface ActivitySettingLimit {
  min: number;
  max: number;
}

export interface ActivitySettings {
  projectVersion: number;
  timezone: string;
  visitInactivitySeconds: number;
  reconnectGraceSeconds: number;
  limits: {
    visitInactivitySeconds: ActivitySettingLimit;
    reconnectGraceSeconds: ActivitySettingLimit;
  };
  semantics: {
    timezone: "IANA_TIME_ZONE_FOR_ACTIVITY_DAY";
    visitInactivitySeconds: "START_NEW_VISIT_AFTER_GAP";
    reconnectGraceSeconds: "DEFER_OFFLINE_TRANSITION";
  };
}

export type UpdateActivitySettings = Pick<
  ActivitySettings,
  "timezone" | "visitInactivitySeconds" | "reconnectGraceSeconds"
> & { expectedVersion: number };

export type UserAttributeType = "STRING" | "NUMBER" | "BOOLEAN" | "DATETIME";
export type UserAttributeAllowedValue = string | number | boolean;

export interface UserAttributeValidation {
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  allowedValues?: UserAttributeAllowedValue[];
}

export interface UserAttributeDefinition {
  id: string;
  projectId: string;
  key: string;
  label: string;
  description?: string;
  type: UserAttributeType;
  required: boolean;
  clientVisible: boolean;
  validation: UserAttributeValidation;
  enabled: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserAttributeSchemaRevision {
  id: string;
  projectId: string;
  version: number;
  schema: Record<string, unknown>;
  clientVisibleKeys: string[];
  createdAt: string;
}

export interface UserAttributeSchema {
  definitions: UserAttributeDefinition[];
  currentRevision: UserAttributeSchemaRevision | null;
}

export interface UserAttributeMutation {
  definition: UserAttributeDefinition;
  currentRevision: UserAttributeSchemaRevision;
}

export interface ScenarioAction {
  id?: string;
  position: number;
  nodeKey?: string;
  nextNodeKey?: string | null;
  type: ActionType;
  config: Record<string, any>;
}

export interface ScenarioCondition {
  path: string;
  operator:
    "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "exists" | "contains";
  value?: unknown;
}

export interface Scenario {
  id: string;
  projectId: string;
  code: string;
  name: string;
  description?: string;
  eventDefinitionId: string;
  eventDefinition?: EventDefinition;
  status: ScenarioStatus;
  conversationPolicy: ConversationPolicy;
  priority: number;
  conditions: ScenarioCondition[];
  cooldownSeconds?: number;
  maxRunsPerUser?: number;
  activeFrom?: string;
  activeTo?: string;
  actions: ScenarioAction[];
  createdAt?: string;
  updatedAt?: string;
}

export interface EndUser {
  id: string;
  projectId: string;
  externalId: string;
  isGuest: boolean;
  locale?: string;
  segment?: string;
  profile: Record<string, any>;
  attributes: Record<string, any>;
  preferences: Record<string, any>;
  lastSeenAt: string;
  createdAt?: string;
}

export interface ActiveSession {
  id: string;
  userId: string;
  externalId: string;
  userName: string;
  currentPage?: string;
  device: string;
  transport?: "SOCKET_IO" | "ANY_CABLE";
  connectionCount?: number;
  sessionCount?: number;
  currentConversationId?: string | null;
  startedAt: string;
  lastSeenAt: string;
  status: "ONLINE" | "STALE";
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  status: "ACTIVE" | "ARCHIVED";
  updatedAt?: string;
  lastMessageAt: string;
  messageCount: number;
  isCurrent: boolean;
  currentInteractionSessionCount: number;
  aiSuspension: ConversationAISuspensionSummary;
}

export type ConversationAISuspensionLifecycle =
  "NONE" | "ACTIVE" | "EXPIRED" | "RESUMED";
export type SuspensionReason =
  "OPERATOR_TAKEOVER" | "MANUAL_REVIEW" | "INCIDENT_RESPONSE" | "OTHER";

export interface ConversationAISuspensionSummary {
  mode: "AUTOMATIC" | "SUSPENDED";
  lifecycle: ConversationAISuspensionLifecycle;
  version: string;
  suspendedUntil: string | null;
  serverTime: string;
}

export interface ConversationAISuspensionDetail extends ConversationAISuspensionSummary {
  startedAt: string | null;
  startedBy: { id: string; displayName: string } | null;
  reason: SuspensionReason | null;
  note: string | null;
  resumedAt: string | null;
  resumedBy: { id: string; displayName: string } | null;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  author: "USER" | "ASSISTANT" | "ADMIN" | "SCENARIO" | "SYSTEM";
  text: string;
  status: "PENDING" | "WRITING" | "COMPLETED" | "FAILED" | "CANCELLED";
  createdAt: string;
  updatedAt?: string;
}

export interface ActivityItem {
  id: string;
  userId: string;
  type: "EVENT" | "MESSAGE" | "SCENARIO" | "COMMAND" | "ERROR";
  title: string;
  description: string;
  timestamp: string;
  status?: string;
}

export type ManualAction =
  | { type: "TEXT"; text: string }
  | { type: "VOICE"; text: string; voice?: string }
  | {
      type: "BUTTON";
      label: string;
      action: "OPEN_PAGE" | "OPEN_MODAL" | "HIGHLIGHT_ELEMENT";
      target: string;
    }
  | { type: "ANIMATION"; animation: string }
  | {
      type: "COMMAND";
      action: "OPEN_PAGE" | "OPEN_MODAL" | "HIGHLIGHT_ELEMENT";
      target: string;
    }
  | {
      type: "BONUS";
      integrationCode: string;
      amount: number;
      currency: string;
    };

export interface DashboardStats {
  users: number;
  online: number;
  events: number;
  scenarios: number;
  conversations: number;
  ctaConversion: number;
  integrationErrors: number;
}

export type EventLogStatus = "RECEIVED" | "PROCESSED" | "FAILED";
export interface EventLog {
  id: string;
  eventCode: string;
  eventName: string;
  eventDefinitionId: string;
  eventDefinitionKeyId: string;
  eventVersion: number;
  ingestionPolicyVersion: number;
  ingestionPolicySnapshot: Record<string, unknown>;
  userId: string;
  userExternalId: string;
  source: "SERVER" | "FRONTEND" | "INTERNAL";
  status: EventLogStatus;
  externalEventId?: string;
  message?: string;
  occurredAt: string;
  receivedAt: string;
  payload: Record<string, unknown>;
  context: Record<string, unknown>;
  processingResult?: Record<string, unknown>;
  error?: string | Record<string, unknown>;
}

export interface ScenarioRunCommand {
  id: string;
  type: string;
  status: string;
  sequence: number;
  createdAt: string;
  expiresAt?: string;
  sentAt?: string;
  acknowledgedAt?: string;
  executedAt?: string;
}

export interface ScenarioRunStep {
  id: string;
  position: number;
  nodeKey: string;
  actionType: string;
  executor: ActionExecutor;
  status:
    | "PENDING"
    | "RUNNING"
    | "WAITING_TIME"
    | "WAITING_ACK"
    | "WAITING_INPUT"
    | "WAITING_DELIVERY"
    | "SUCCEEDED"
    | "FAILED"
    | "EXPIRED"
    | "SKIPPED";
  errorCode?: string;
  startedAt?: string;
  finishedAt?: string;
  resumeAt?: string;
  command?: ScenarioRunCommand;
}

export interface ScenarioRun {
  id: string;
  scenarioId: string;
  scenarioCode: string;
  scenarioName: string;
  eventLogId: string;
  userId: string;
  userExternalId: string;
  status:
    "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED" | "CANCELLED" | "EXPIRED";
  conversationPolicy: ConversationPolicy;
  conversationId?: string;
  interactionSessionId?: string;
  scenarioRevisionId?: string;
  errorCode?: string;
  startedAt: string;
  finishedAt?: string;
  currentStep: number;
  steps: ScenarioRunStep[];
}

export interface AuditEvent {
  id: string;
  actor: {
    type: "CMS_USER" | "SYSTEM" | "BREAK_GLASS";
    id: string;
    email?: string;
    name?: string;
  };
  target: {
    kind: string;
    id: string;
  };
  eventType: string;
  eventVersion: number;
  outcome: "SUCCESS" | "DENIED" | "FAILED";
  operation?: string;
  resourceType?: string;
  resourceId?: string;
  requiredPermissionCode?: string;
  reasonCode?: string;
  auditReason?: string;
  requestId?: string;
  correlationId?: string;
  ipAddress?: string;
  userAgent?: string;
  authorizationEvidence: Record<string, unknown>;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export type DirectAdminActionType =
  | "SHOW_ASSISTANT"
  | "HIDE_ASSISTANT"
  | "OPEN_CHAT"
  | "CLOSE_CHAT"
  | "PLAY_ANIMATION"
  | "HIGHLIGHT_ELEMENT"
  | "REMOVE_HIGHLIGHT"
  | "SHOW_CTA"
  | "OPEN_PAGE"
  | "OPEN_MODAL";
export interface DirectAdminAction {
  type: DirectAdminActionType;
  config: Record<string, unknown>;
}
export interface AdminMessageRequest {
  text: string;
  conversationId?: string;
  conversationPolicy?: ConversationPolicy;
  interactionSessionId?: string;
  actions?: DirectAdminAction[];
  aiSuspension?: AdminMessageAISuspensionDto;
  idempotencyKey?: string;
}
export interface AdminMessageResult {
  duplicate: boolean;
  messageId: string;
  threadId: string;
  commandIds: string[];
  status: string;
  deliveryStatus?: "DELIVERED" | "NOT_REDELIVERED";
  aiSuspension?: {
    state: ConversationAISuspensionDetail;
    replayed: boolean;
    inFlightCancellation?: { status?: "NOT_REQUIRED" | "REQUESTED" };
  };
}
