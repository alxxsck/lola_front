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
  ['Events_list', { label: 'event logs', response: 'EventLogResponseDto' }],
  ['ScenarioRuns_list', { label: 'scenario runs', response: 'ScenarioRunResponseDto' }],
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

for (const [operationId, expectation] of requiredOperations) {
  const operation = operations.find((candidate) => candidate.operationId === operationId)

  if (!operation) {
    throw new Error(`OpenAPI snapshot is missing ${expectation.label} operation (${operationId})`)
  }

  const requestSchema = operation.requestBody?.content?.['application/json']?.schema
  const successResponse = Object.entries(operation.responses ?? {}).find(([status]) => /^2\d\d$/.test(status))
  const responseSchema = successResponse?.[1]?.content?.['application/json']?.schema

  if (!responseSchema) {
    throw new Error(`OpenAPI operation ${operationId} has no typed JSON success response`)
  }

  if (expectation.request && !containsSchema(requestSchema, expectation.request)) {
    throw new Error(`OpenAPI operation ${operationId} does not use ${expectation.request} as its JSON request`)
  }

  if (!containsSchema(responseSchema, expectation.response)) {
    throw new Error(`OpenAPI operation ${operationId} does not return ${expectation.response}`)
  }
}

for (const schemaName of ['CreateProjectDto', 'UpdateProjectDto']) {
  const properties = document.components?.schemas?.[schemaName]?.properties ?? {}
  if (properties.settings?.type !== 'object' || properties.settings?.additionalProperties !== true) {
    throw new Error(`${schemaName} must expose general project settings`)
  }
}

console.log(`OpenAPI contract check passed (${requiredOperations.size} required operations)`)
