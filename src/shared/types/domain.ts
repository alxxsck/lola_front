export type EntityKind = 'BUTTON' | 'MODAL' | 'PAGE' | 'ELEMENT' | 'HANDLER'
export type ScenarioStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED'
export type ActionType = string
export type ActionExecutor = 'SERVER' | 'FRONTEND'
export type ActionControl = 'text' | 'textarea' | 'number' | 'select' | 'target' | 'event' | 'json' | 'boolean'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export interface ActionConfigPropertySchema extends Record<string, unknown> {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array'
  title?: string
  description?: string
  default?: JsonValue
  enum?: JsonValue[]
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  minItems?: number
  maxItems?: number
  pattern?: string
  items?: ActionConfigPropertySchema
  properties?: Record<string, ActionConfigPropertySchema>
  required?: string[]
  additionalProperties?: boolean | ActionConfigPropertySchema
}

export interface ActionConfigSchema extends Record<string, unknown> {
  type: 'object'
  properties: Record<string, ActionConfigPropertySchema>
  required: string[]
  additionalProperties?: boolean | ActionConfigPropertySchema
}

export type ActionUiOption = JsonValue | { label: string; value: JsonValue }

export interface ActionUiField extends Record<string, unknown> {
  key: string
  label: string
  control: ActionControl
  options?: ActionUiOption[]
  allowCustom?: boolean
  supportsTemplates?: boolean
  targetKinds?: EntityKind[]
  visibleWhen?: Record<string, unknown>
}

export interface ActionUiSchema extends Record<string, unknown> {
  fields: ActionUiField[]
}

export interface ScenarioActionDefinition {
  id: string
  projectId: string
  type: ActionType
  name: string
  description: string | null
  executor: ActionExecutor
  serverHandler: string | null
  commandType: string | null
  configSchema: ActionConfigSchema
  uiSchema: ActionUiSchema
  enabled: boolean
  builtIn: boolean
  createdAt: string
  updatedAt: string
}

export interface Organization { id: string; name: string; slug: string }

export interface Project {
  id: string
  name: string
  slug: string
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED'
  publicKey: string
  defaultLocale: string
  supportedLocales: string[]
  assistantName: string
  systemPrompt: string
  voiceInstructions: string
  settings: Record<string, unknown> & {
    description?: string
    timezone?: string
    voiceEnabled?: boolean
    voiceTranscriptEnabled?: boolean
    voice?: string
  }
  organization?: Organization
  _count?: { users: number; scenarios: number; eventLogs: number }
}

export interface CmsUser {
  id: string
  email: string
  name: string
  role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER'
}

export interface UiElement {
  id: string
  projectId: string
  code: string
  name: string
  kind: EntityKind
  selector?: string
  route?: string
  handler?: string
  config: Record<string, unknown>
  enabled: boolean
  createdAt?: string
  updatedAt?: string
}

export type EventFieldType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array'
export interface EventField { id: string; name: string; code: string; type: EventFieldType; required: boolean }

export interface EventDefinition {
  id: string
  projectId: string
  code: string
  name: string
  description?: string
  version: number
  payloadSchema: Record<string, any>
  enabled: boolean
  createdAt?: string
  updatedAt?: string
}

export interface ScenarioAction {
  id?: string
  position: number
  nodeKey?: string
  nextNodeKey?: string | null
  type: ActionType
  config: Record<string, any>
}

export interface ScenarioCondition {
  path: string
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'exists' | 'contains'
  value?: unknown
}

export interface Scenario {
  id: string
  projectId: string
  code: string
  name: string
  description?: string
  eventDefinitionId: string
  eventDefinition?: EventDefinition
  status: ScenarioStatus
  priority: number
  conditions: ScenarioCondition[]
  cooldownSeconds?: number
  maxRunsPerUser?: number
  activeFrom?: string
  activeTo?: string
  actions: ScenarioAction[]
  createdAt?: string
  updatedAt?: string
}

export interface EndUser {
  id: string
  projectId: string
  externalId: string
  isGuest: boolean
  locale?: string
  segment?: string
  profile: Record<string, any>
  attributes: Record<string, any>
  preferences: Record<string, any>
  lastSeenAt: string
  createdAt?: string
}

export interface ActiveSession {
  id: string
  userId: string
  externalId: string
  userName: string
  currentPage?: string
  device: string
  transport?: 'SOCKET_IO' | 'ANY_CABLE'
  connectionCount?: number
  sessionCount?: number
  startedAt: string
  lastSeenAt: string
  status: 'ONLINE' | 'STALE'
}

export interface Conversation {
  id: string
  userId: string
  title: string
  status: 'ACTIVE' | 'ARCHIVED'
  lastMessageAt: string
  messageCount: number
}

export interface ConversationMessage {
  id: string
  conversationId: string
  author: 'USER' | 'ASSISTANT' | 'ADMIN' | 'SCENARIO' | 'SYSTEM'
  text: string
  status: 'PENDING' | 'WRITING' | 'COMPLETED' | 'FAILED'
  createdAt: string
}

export interface ActivityItem {
  id: string
  userId: string
  type: 'EVENT' | 'MESSAGE' | 'SCENARIO' | 'COMMAND' | 'ERROR'
  title: string
  description: string
  timestamp: string
  status?: string
}

export type ManualAction =
  | { type: 'TEXT'; text: string }
  | { type: 'VOICE'; text: string; voice?: string }
  | { type: 'BUTTON'; label: string; action: 'OPEN_PAGE' | 'OPEN_MODAL' | 'HIGHLIGHT_ELEMENT'; target: string }
  | { type: 'ANIMATION'; animation: string }
  | { type: 'COMMAND'; action: 'OPEN_PAGE' | 'OPEN_MODAL' | 'HIGHLIGHT_ELEMENT'; target: string }
  | { type: 'BONUS'; integrationCode: string; amount: number; currency: string }

export interface DashboardStats {
  users: number
  online: number
  events: number
  scenarios: number
  conversations: number
  ctaConversion: number
  integrationErrors: number
}

export type EventLogStatus = 'RECEIVED' | 'PROCESSED' | 'FAILED'
export interface EventLog {
  id: string
  eventCode: string
  eventName: string
  userId: string
  userExternalId: string
  source: 'SERVER' | 'FRONTEND' | 'INTERNAL'
  status: EventLogStatus
  occurredAt: string
  receivedAt: string
  payload: Record<string, unknown>
  context: Record<string, unknown>
  processingResult?: Record<string, unknown>
  error?: Record<string, unknown>
}

export interface ScenarioRunCommand {
  id: string
  type: string
  status: string
  sequence: number
  payload: Record<string, unknown>
  createdAt: string
  expiresAt?: string
}

export interface ScenarioRunStep {
  id: string
  position: number
  nodeKey?: string
  nextNodeKey?: string
  actionType: string
  status: 'PENDING' | 'RUNNING' | 'WAITING_TIME' | 'WAITING_ACK' | 'WAITING_INPUT' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED' | 'SKIPPED'
  config: Record<string, unknown>
  errorCode?: string
  error?: Record<string, unknown>
  result?: Record<string, unknown>
  command?: ScenarioRunCommand
}

export interface ScenarioRun {
  id: string
  scenarioId: string
  scenarioCode: string
  scenarioName: string
  eventLogId: string
  userId: string
  userExternalId: string
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'CANCELLED' | 'EXPIRED'
  context: Record<string, unknown>
  error?: Record<string, unknown>
  startedAt: string
  finishedAt?: string
  currentStep: number
  steps: ScenarioRunStep[]
}

export interface AuditLog {
  id: string
  actor: { id?: string; email?: string; name?: string }
  action: string
  status: 'SUCCEEDED' | 'FAILED'
  resourceType?: string
  resourceId?: string
  requestId?: string
  metadata: Record<string, unknown>
  createdAt: string
}

export type DirectAdminActionType =
  | 'SHOW_ASSISTANT' | 'HIDE_ASSISTANT' | 'OPEN_CHAT' | 'CLOSE_CHAT'
  | 'PLAY_ANIMATION' | 'HIGHLIGHT_ELEMENT' | 'REMOVE_HIGHLIGHT'
  | 'SHOW_CTA' | 'OPEN_PAGE' | 'OPEN_MODAL'
export interface DirectAdminAction { type: DirectAdminActionType; config: Record<string, unknown> }
export interface AdminMessageRequest {
  text: string
  conversationPolicy: 'reuse_active' | 'create_new'
  interactionSessionId?: string
  actions?: DirectAdminAction[]
  idempotencyKey?: string
}
export interface AdminMessageResult {
  duplicate: boolean
  messageId: string
  threadId: string
  commandIds: string[]
  status: string
}
