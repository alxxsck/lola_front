import { readFile } from 'node:fs/promises'

const snapshotUrl = new URL('../openapi/lola-backend.json', import.meta.url)
const document = JSON.parse(await readFile(snapshotUrl, 'utf8'))

const requiredOperations = new Map([
  ['CmsAuth_login', { label: 'auth login', request: 'CmsLoginDto', response: 'CmsAuthResponseDto' }],
  ['CmsAuth_refresh', { label: 'auth refresh', request: 'RefreshTokenDto', response: 'CmsAuthResponseDto' }],
  ['CmsAuth_logout', { label: 'auth logout', request: 'LogoutDto', response: 'SuccessResponseDto' }],
  ['CmsAuth_me', { label: 'current admin', response: 'AdminUserResponseDto' }],
  ['Platform_createProject', { label: 'project creation', request: 'CreateProjectDto', response: 'CreateProjectResponseDto' }],
  ['Platform_listProjects', { label: 'projects', response: 'ProjectResponseDto' }],
  ['Platform_createScenario', { label: 'scenario creation', request: 'CreateScenarioDto', response: 'ScenarioResponseDto' }],
  ['Platform_scenarios', { label: 'scenarios', response: 'ScenarioResponseDto' }],
  ['Platform_actionDefinitions', { label: 'scenario action definitions', response: 'ScenarioActionDefinitionResponseDto' }],
  ['Events_list', { label: 'paginated legacy event logs', response: 'LegacyEventLogPageResponseDto' }],
  ['AdminEventLogs_list', { label: 'cursor-paginated event logs', response: 'EventLogPageResponseDto' }],
  ['AdminEventLogs_get', { label: 'event log detail', response: 'EventLogResponseDto' }],
  ['Platform_userAttributeDefinitions', { label: 'user attribute schema', response: 'UserAttributeSchemaResponseDto' }],
  ['Platform_createUserAttributeDefinition', { label: 'user attribute creation', request: 'CreateUserAttributeDefinitionDto', response: 'UserAttributeDefinitionMutationResponseDto' }],
  ['Platform_updateUserAttributeDefinition', { label: 'user attribute update', request: 'UpdateUserAttributeDefinitionDto', response: 'UserAttributeDefinitionMutationResponseDto' }],
  ['Platform_deleteUserAttributeDefinition', { label: 'user attribute deletion', response: 'UserAttributeDefinitionMutationResponseDto' }],
  ['ScenarioRuns_list', { label: 'scenario runs', response: 'ScenarioRunResponseDto' }],
  ['ScenarioAuthoring_catalog', { label: 'scenario authoring catalog', response: 'ConditionCatalogResponseDto' }],
  ['ScenarioAuthoring_validate', { label: 'scenario rule validation', request: 'ValidateScenarioRuleDto', response: 'ValidateScenarioRuleResponseDto' }],
  ['ScenarioAuthoring_preview', { label: 'scenario rule preview', request: 'PreviewScenarioRuleDto', response: 'PreviewScenarioRuleResponseDto' }],
  ['ScenarioAuthoring_publishScenario', { label: 'scenario publication', request: 'PublishScenarioDto', response: 'PublishScenarioResponseDto' }],
  ['ScenarioAuthoring_rollbackScenario', { label: 'scenario rollback', request: 'RollbackScenarioDto' }],
  ['ScenarioRuns_explain', { label: 'scenario run explanation', response: 'ScenarioRunExplainResponseDto' }],
  ['AdminMessaging_send', { label: 'admin messaging', request: 'SendAdminMessageDto', response: 'SendAdminMessageResponseDto' }],
  ['Audit_list', { label: 'audit logs', response: 'AuditLogResponseDto' }],
  ['Presence_list', { label: 'active sessions', response: 'ActiveUserResponseDto' }],
  ['AdminSpeech_get', { label: 'speech synthesis settings', response: 'SpeechSettingsResponseDto' }],
  ['AdminSpeech_update', { label: 'speech synthesis update', request: 'UpdateSpeechSettingsDto', response: 'SpeechSettingsResponseDto' }],
  ['AdminSpeech_voices', { label: 'speech synthesis voices', response: 'SpeechVoicePageResponseDto' }],
  ['AiUsage_report', { label: 'AI usage report', response: 'AiUsageReportResponseDto' }],
  ['ProviderBilling_get', { label: 'ElevenLabs provider billing snapshot', response: 'ProviderBillingSnapshotResponseDto' }],
  ['ProviderBilling_sync', { label: 'ElevenLabs provider billing refresh', response: 'ProviderBillingSnapshotResponseDto' }],
])

const operations = Object.values(document.paths ?? {}).flatMap((path) =>
  Object.values(path).filter((operation) => operation && typeof operation === 'object'),
)

function containsSchema(schema, schemaName) {
  if (!schema) return false
  if (schema.$ref === `#/components/schemas/${schemaName}`) return true

  return Object.values(schema).some((value) =>
    typeof value === 'object' && value !== null ? containsSchema(value, schemaName) : false,
  )
}

function contractSchema(schemaName) {
  const schema = document.components?.schemas?.[schemaName]
  if (!schema) throw new Error(`OpenAPI snapshot is missing ${schemaName} schema`)
  return schema
}

function requireSchemaProperties(schemaName, propertyNames) {
  const properties = contractSchema(schemaName).properties ?? {}
  const missing = propertyNames.filter((propertyName) => !Object.hasOwn(properties, propertyName))
  if (missing.length) throw new Error(`${schemaName} is missing contract properties: ${missing.join(', ')}`)
}

function requireRequiredProperties(schemaName, propertyNames) {
  const required = new Set(contractSchema(schemaName).required ?? [])
  const missing = propertyNames.filter((propertyName) => !required.has(propertyName))
  if (missing.length) throw new Error(`${schemaName} no longer requires: ${missing.join(', ')}`)
}

function requireDiscriminatedUnion(schemaName, propertyName, discriminator, schemaNames) {
  const property = contractSchema(schemaName).properties?.[propertyName]
  if (property?.discriminator?.propertyName !== discriminator) {
    throw new Error(`${schemaName}.${propertyName} must be discriminated by ${discriminator}`)
  }
  const references = new Set((property.oneOf ?? []).map((item) => item.$ref?.split('/').at(-1)))
  const missing = schemaNames.filter((candidate) => !references.has(candidate))
  if (missing.length) throw new Error(`${schemaName}.${propertyName} is missing union members: ${missing.join(', ')}`)
}

for (const [operationId, expectation] of requiredOperations) {
  const operation = operations.find((candidate) => candidate.operationId === operationId)

  if (!operation) {
    throw new Error(`OpenAPI snapshot is missing ${expectation.label} operation (${operationId})`)
  }

  const requestSchema = operation.requestBody?.content?.['application/json']?.schema
  const successResponse = Object.entries(operation.responses ?? {}).find(([status]) => /^2\d\d$/.test(status))
  const responseSchema = successResponse?.[1]?.content?.['application/json']?.schema

  if (!successResponse) {
    throw new Error(`OpenAPI operation ${operationId} has no success response`)
  }

  if (expectation.response && !responseSchema) {
    throw new Error(`OpenAPI operation ${operationId} has no typed JSON success response`)
  }

  if (expectation.request && !containsSchema(requestSchema, expectation.request)) {
    throw new Error(`OpenAPI operation ${operationId} does not use ${expectation.request} as its JSON request`)
  }

  if (expectation.response && !containsSchema(responseSchema, expectation.response)) {
    throw new Error(`OpenAPI operation ${operationId} does not return ${expectation.response}`)
  }
}

for (const schemaName of ['CreateProjectDto', 'UpdateProjectDto']) {
  const properties = document.components?.schemas?.[schemaName]?.properties ?? {}
  if (properties.settings?.type !== 'object' || properties.settings?.additionalProperties !== true) {
    throw new Error(`${schemaName} must expose general project settings`)
  }
}

requireSchemaProperties('ConditionCatalogResponseDto', ['version', 'revision', 'projectId', 'events'])
requireRequiredProperties('ConditionCatalogResponseDto', ['version', 'revision', 'projectId', 'events'])
requireSchemaProperties('ConditionCatalogEventResponseDto', ['definitionKeyId', 'definitionId', 'code', 'schemaVersion', 'fields'])
requireSchemaProperties('ConditionCatalogFieldResponseDto', [
  'fieldKey',
  'path',
  'valueType',
  'required',
  'operators',
  'aggregations',
  'control',
  'semanticType',
  'unit',
  'sensitive',
])

requireSchemaProperties('ValidateScenarioRuleDto', ['rule'])
requireRequiredProperties('ValidateScenarioRuleDto', ['rule'])
requireSchemaProperties('PreviewScenarioRuleDto', ['rule', 'scope'])
requireRequiredProperties('PreviewScenarioRuleDto', ['rule', 'scope'])
requireSchemaProperties('PreviewScenarioScopeDto', ['kind', 'eventLogId'])
requireRequiredProperties('PreviewScenarioScopeDto', ['kind', 'eventLogId'])
if (JSON.stringify(contractSchema('PreviewScenarioScopeDto').properties?.kind?.enum) !== JSON.stringify(['eventLog'])) {
  throw new Error('PreviewScenarioScopeDto.kind must only allow eventLog')
}
requireSchemaProperties('PublishScenarioDto', ['rule', 'deliveryPolicy', 'expectedCurrentRevisionId', 'catalogRevision'])
requireRequiredProperties('PublishScenarioDto', ['expectedCurrentRevisionId', 'catalogRevision'])
requireSchemaProperties('RollbackScenarioDto', ['expectedCurrentRevisionId'])

requireSchemaProperties('ScenarioRuleDto', ['version', 'root'])
requireRequiredProperties('ScenarioRuleDto', ['version', 'root'])
requireDiscriminatedUnion('ScenarioRuleDto', 'root', 'kind', [
  'AllRuleNodeDto',
  'AnyRuleNodeDto',
  'NotRuleNodeDto',
  'EventFieldRuleNodeDto',
  'EventAggregateRuleNodeDto',
  'ActivityDayStreakRuleNodeDto',
])
requireDiscriminatedUnion('PublishScenarioDto', 'deliveryPolicy', 'kind', [
  'ImmediateDeliveryPolicyDto',
  'SkipIfOfflineDeliveryPolicyDto',
  'FailIfOfflineDeliveryPolicyDto',
  'WaitUntilOnlineDeliveryPolicyDto',
])

for (const schemaName of ['CreateEventDefinitionDto', 'UpdateEventDefinitionDto']) {
  requireSchemaProperties(schemaName, ['countsAsActivity', 'payloadSchema'])
}

console.log(`OpenAPI contract check passed (${requiredOperations.size} required operations)`)
