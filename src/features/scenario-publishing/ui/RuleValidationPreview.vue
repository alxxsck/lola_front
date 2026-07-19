<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'

import { createLatestRuleRequestStateMachine } from '@/features/scenario-publishing/model'
import { mapAudienceIssues, serializeAudienceDraft, summarizeAudience, type AudienceDomainContext, type AudienceDraft, type AudienceDraftNode, type AudiencePathIndex } from '@/features/scenario-audience/model'
import { mapBackendRuleIssues, serializeRuleDraft, summarizeRule } from '@/features/scenario-rules/model'
import type { DraftIssue, RuleDomainContext, RuleDraft, RuleDraftNode, RulePathIndex } from '@/features/scenario-rules/model'
import { repository } from '@/shared/api/repository'
import type { EventLogFilters } from '@/shared/api/repository/contracts'
import { scenarioAuthoringRepository, type AudienceRuleDto, type PreviewScenarioRuleResponseDto, type ScenarioRuleDto, type ValidateScenarioRuleResponseDto } from '@/shared/api/repository/scenario-authoring'
import type { EventLog } from '@/shared/types/domain'

const props = defineProps<{
  projectId: string
  draft: RuleDraft
  context: RuleDomainContext
  draftRevision: number
  audienceDraft?: AudienceDraft
  audienceContext?: AudienceDomainContext
  audienceDraftRevision?: number
}>()

const emit = defineEmits<{
  'focus-node': [target: { nodeId?: string; fieldPath?: string; message?: string }]
  'focus-audience-node': [target: { nodeId?: string; fieldPath?: string; message?: string }]
}>()

interface ValidationRequest {
  projectId: string
  rule: ScenarioRuleDto
  pathIndex: RulePathIndex
  audience?: AudienceRuleDto
  audiencePathIndex: AudiencePathIndex
}

interface PreviewRequest extends ValidationRequest {
  draft: RuleDraft
  audienceDraft?: AudienceDraft
  eventLogId: string
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isIssue(value: unknown) {
  return record(value)
    && typeof value.code === 'string'
    && typeof value.message === 'string'
    && typeof value.path === 'string'
}

function isDependency(value: unknown) {
  return record(value)
    && typeof value.eventCode === 'string'
    && typeof value.definitionKeyId === 'string'
    && typeof value.eventDefinitionRevisionId === 'string'
    && typeof value.schemaVersion === 'number'
}

function isWarning(value: unknown) {
  return record(value) && typeof value.code === 'string'
}

function isCost(value: unknown) {
  return value === null || (record(value)
    && ['LOW', 'MEDIUM', 'HIGH'].includes(String(value.class))
    && typeof value.leaves === 'number'
    && typeof value.aggregateLeaves === 'number'
    && typeof value.historyWindowDays === 'number')
}

function isAudienceReport(value: unknown) {
  return record(value)
    && typeof value.valid === 'boolean'
    && Array.isArray(value.issues)
    && value.issues.every(isIssue)
    && record(value.dependencies)
    && Array.isArray(value.dependencies.attributeRevisionIds)
    && Array.isArray(value.dependencies.segmentRevisionIds)
    && Array.isArray(value.warnings)
}

function isValidationResponse(value: unknown): value is ValidateScenarioRuleResponseDto {
  return record(value)
    && typeof value.valid === 'boolean'
    && Array.isArray(value.issues)
    && value.issues.every(isIssue)
    && Array.isArray(value.dependencies)
    && value.dependencies.every(isDependency)
    && Array.isArray(value.warnings)
    && value.warnings.every(isWarning)
    && Object.prototype.hasOwnProperty.call(value, 'cost')
    && isCost(value.cost)
    && (!('audience' in value) || value.audience === undefined || isAudienceReport(value.audience))
}

function isExplainValue(value: unknown) {
  return record(value)
    && ['VISIBLE', 'REDACTED', 'UNAVAILABLE'].includes(String(value.visibility))
}

function isExplanation(value: unknown, depth = 0): boolean {
  if (!record(value) || depth > 5 || typeof value.matched !== 'boolean' || typeof value.kind !== 'string') return false
  if (value.kind === 'all' || value.kind === 'any') {
    return Array.isArray(value.children) && value.children.every((child) => isExplanation(child, depth + 1))
  }
  if (value.kind === 'not') return isExplanation(value.child, depth + 1)
  if (!['eventField', 'eventAggregate', 'activityDayStreak', 'legacy', 'unavailable'].includes(value.kind)) return false
  return (!('actual' in value) || isExplainValue(value.actual))
    && (!('expected' in value) || isExplainValue(value.expected))
    && (!('matchedCount' in value) || typeof value.matchedCount === 'string')
    && (!('window' in value) || (record(value.window) && typeof value.window.from === 'string' && typeof value.window.to === 'string'))
}

function isPreviewResponse(value: unknown): value is PreviewScenarioRuleResponseDto {
  return isValidationResponse(value)
    && typeof (value as unknown as Record<string, unknown>).matched === 'boolean'
    && (!('explanation' in value) || isExplanation(value.explanation))
}

function audienceExplanationMatches(node: AudienceDraftNode, explanation: unknown): boolean {
  if (!record(explanation) || explanation.kind !== node.kind || typeof explanation.matched !== 'boolean') return false
  const children = explanation.children
  if (node.kind === 'all' || node.kind === 'any') return Array.isArray(children)
    && children.length === node.children.length
    && node.children.every((child, index) => audienceExplanationMatches(child, children[index]))
  if (node.kind === 'not') return Array.isArray(children) && children.length === 1 && audienceExplanationMatches(node.child, children[0])
  return ['locale', 'language', 'country', 'userAttribute', 'segmentMembership', 'opaque'].includes(node.kind)
}

function explanationMatches(node: RuleDraftNode, explanation: unknown): boolean {
  if (!record(explanation) || explanation.kind !== node.kind) return false
  if (node.kind === 'all' || node.kind === 'any') {
    const children = explanation.children
    return Array.isArray(children)
      && children.length === node.children.length
      && node.children.every((child, index) => explanationMatches(child, children[index]))
  }
  if (node.kind === 'not') return explanationMatches(node.child, explanation.child)
  return ['eventField', 'eventAggregate', 'activityDayStreak'].includes(node.kind)
}

function preparedValidation() {
  const serialized = serializeRuleDraft(props.draft, props.context)
  const audienceSummary = props.audienceDraft && props.audienceContext ? summarizeAudience(props.audienceDraft, props.audienceContext) : null
  const serializedAudience = props.audienceDraft && props.audienceContext && audienceSummary?.status !== 'empty'
    ? serializeAudienceDraft(props.audienceDraft, props.audienceContext)
    : null
  const localIssues = [
    ...(serialized.ok ? [] : serialized.issues),
    ...(serializedAudience && !serializedAudience.ok ? serializedAudience.issues : []),
  ]
  return serialized.ok && (!serializedAudience || serializedAudience.ok)
    ? { valid: true as const, request: { projectId: props.projectId, rule: serialized.value, pathIndex: serialized.pathIndex, audience: serializedAudience?.value, audiencePathIndex: serializedAudience?.pathIndex ?? {} } }
    : { valid: false as const, issues: localIssues }
}

const validationMachine = createLatestRuleRequestStateMachine<ValidationRequest, ValidateScenarioRuleResponseDto, DraftIssue>({
  debounceMs: 400,
  execute: (request, { signal }) => request.audience
    ? scenarioAuthoringRepository.validateRule(request.projectId, request.rule, { signal }, request.audience)
    : scenarioAuthoringRepository.validateRule(request.projectId, request.rule, { signal }),
  isResponse: isValidationResponse,
})
const validationState = shallowRef(validationMachine.getState())
const unsubscribeValidation = validationMachine.subscribe((state) => { validationState.value = state })
const validationPathIndex = ref<RulePathIndex>({})
const validationAudiencePathIndex = ref<AudiencePathIndex>({})

watch(
  () => [props.projectId, props.draftRevision, props.context.contract.revision, props.audienceDraftRevision, props.audienceContext?.catalog.revision] as const,
  () => {
    const prepared = preparedValidation()
    validationPathIndex.value = prepared.valid ? prepared.request.pathIndex : {}
    validationAudiencePathIndex.value = prepared.valid ? prepared.request.audiencePathIndex : {}
    validationMachine.schedule(prepared)
  },
  { immediate: true },
)

const validationResponse = computed(() => (
  validationState.value.status === 'valid' || validationState.value.status === 'semantic-invalid'
    ? validationState.value.response
    : null
))
const validationIssues = computed(() => {
  if (validationState.value.status === 'local-invalid') return validationState.value.issues
  if (validationState.value.status === 'semantic-invalid') {
    return mapBackendRuleIssues(validationState.value.response.issues, validationPathIndex.value)
  }
  return []
})
const validationAudienceIssues = computed(() => {
  if (validationState.value.status !== 'semantic-invalid') return []
  return validationState.value.response.audience
    ? mapAudienceIssues(validationState.value.response.audience.issues, validationAudiencePathIndex.value)
    : []
})

function validateNow() {
  const prepared = preparedValidation()
  validationPathIndex.value = prepared.valid ? prepared.request.pathIndex : {}
  validationAudiencePathIndex.value = prepared.valid ? prepared.request.audiencePathIndex : {}
  return validationMachine.runNow(prepared)
}

function focusIssue(issue: { nodeId?: string; fieldPath?: string; message?: string }) {
  emit('focus-node', { ...(issue.nodeId ? { nodeId: issue.nodeId } : {}), ...(issue.fieldPath ? { fieldPath: issue.fieldPath } : {}), ...(issue.message ? { message: issue.message } : {}) })
}

function focusAudienceIssue(issue: { nodeId?: string; fieldPath?: string; message?: string }) {
  emit('focus-audience-node', { ...(issue.nodeId ? { nodeId: issue.nodeId } : {}), ...(issue.fieldPath ? { fieldPath: issue.fieldPath } : {}), ...(issue.message ? { message: issue.message } : {}) })
}

const logs = ref<EventLog[]>([])
const logsLoading = ref(false)
const logsError = ref('')
const nextCursor = ref<string | null>(null)
const pageIndex = ref(0)
const pageCursors = ref<Array<string | undefined>>([undefined])
const selectedEventLogId = ref('')
const logFilters = reactive({
  externalUserId: '',
  source: '',
  status: '',
  receivedFrom: '',
  receivedTo: '',
  occurredFrom: '',
  occurredTo: '',
  limit: 25,
})
const appliedLogFilters = ref<EventLogFilters>({})
const failedLogsRequest = ref<{
  cursor?: string
  index: number
  filters: EventLogFilters
  afterSuccess?: () => void
} | null>(null)
let logsSequence = 0

function eventLogFilters(): EventLogFilters {
  const iso = (value: string) => {
    if (!value) return undefined
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
  }
  return {
    eventCode: [props.context.triggerEventCode],
    limit: logFilters.limit,
    ...(logFilters.externalUserId.trim() ? { externalUserId: logFilters.externalUserId.trim() } : {}),
    ...(logFilters.source ? { source: [logFilters.source as EventLog['source']] } : {}),
    ...(logFilters.status ? { status: [logFilters.status as EventLog['status']] } : {}),
    ...(iso(logFilters.receivedFrom) ? { receivedFrom: iso(logFilters.receivedFrom) } : {}),
    ...(iso(logFilters.receivedTo) ? { receivedTo: iso(logFilters.receivedTo) } : {}),
    ...(iso(logFilters.occurredFrom) ? { occurredFrom: iso(logFilters.occurredFrom) } : {}),
    ...(iso(logFilters.occurredTo) ? { occurredTo: iso(logFilters.occurredTo) } : {}),
  }
}

async function loadLogs(
  cursor?: string,
  index = 0,
  requestFilters: EventLogFilters = appliedLogFilters.value,
  afterSuccess?: () => void,
) {
  const sequence = ++logsSequence
  logsLoading.value = true
  logsError.value = ''
  try {
    const page = await repository.getEventLogPage(props.projectId, {
      ...requestFilters,
      ...(cursor ? { cursor } : {}),
    })
    if (sequence !== logsSequence) return false
    logs.value = page.items.filter((item) => item.eventDefinitionId === props.context.triggerEventDefinitionId)
    nextCursor.value = page.nextCursor
    pageIndex.value = index
    failedLogsRequest.value = null
    afterSuccess?.()
    return true
  } catch (error) {
    if (sequence !== logsSequence) return false
    logsError.value = error instanceof Error ? error.message : 'Не удалось загрузить события'
    failedLogsRequest.value = { cursor, index, filters: { ...requestFilters }, afterSuccess }
    return false
  } finally {
    if (sequence === logsSequence) logsLoading.value = false
  }
}

async function applyLogFilters() {
  const nextFilters = eventLogFilters()
  await loadLogs(undefined, 0, nextFilters, () => {
    appliedLogFilters.value = nextFilters
    pageCursors.value = [undefined]
    selectedEventLogId.value = ''
  })
}

function refreshLogs() {
  return loadLogs(undefined, 0, appliedLogFilters.value, () => {
    pageCursors.value = [undefined]
    selectedEventLogId.value = ''
  })
}

function retryLogs() {
  const request = failedLogsRequest.value
  if (!request) return
  return loadLogs(request.cursor, request.index, request.filters, request.afterSuccess)
}

function nextLogsPage() {
  if (!nextCursor.value) return
  const index = pageIndex.value + 1
  pageCursors.value[index] = nextCursor.value
  return loadLogs(nextCursor.value, index, appliedLogFilters.value)
}

function previousLogsPage() {
  if (!pageIndex.value) return
  const index = pageIndex.value - 1
  return loadLogs(pageCursors.value[index], index, appliedLogFilters.value)
}

const previewMachine = createLatestRuleRequestStateMachine<PreviewRequest, PreviewScenarioRuleResponseDto, DraftIssue>({
  execute: async (request, { signal }) => {
    const scope = { kind: 'eventLog' as const, eventLogId: request.eventLogId }
    const response = request.audience
      ? await scenarioAuthoringRepository.previewRule(request.projectId, request.rule, scope, { signal }, request.audience)
      : await scenarioAuthoringRepository.previewRule(request.projectId, request.rule, scope, { signal })
    return isPreviewResponse(response)
      && (!response.valid || (response.explanation && explanationMatches(request.draft.root, response.explanation)))
      && (!request.audienceDraft || !response.audience?.explanation || audienceExplanationMatches(request.audienceDraft.root, response.audience.explanation))
      ? response
      : null
  },
  isResponse: isPreviewResponse,
})
const previewState = shallowRef(previewMachine.getState())
const unsubscribePreview = previewMachine.subscribe((state) => { previewState.value = state })

function previewNow() {
  const validation = preparedValidation()
  const prepared = validation.valid
    ? {
        valid: true as const,
        request: {
          ...validation.request,
          draft: props.draft,
          ...(props.audienceDraft ? { audienceDraft: props.audienceDraft } : {}),
          eventLogId: selectedEventLogId.value,
        },
      }
    : { valid: false as const, issues: validation.issues }
  return previewMachine.runNow(prepared)
}

watch(() => selectedEventLogId.value, () => previewMachine.cancel())
watch(() => [props.draftRevision, props.audienceDraftRevision, props.context.triggerEventDefinitionId, props.context.triggerEventCode, props.context.contract.revision, props.audienceContext?.catalog.revision] as const, () => previewMachine.cancel())
watch(() => [props.projectId, props.context.triggerEventDefinitionId, props.context.triggerEventCode] as const, () => {
  logsSequence += 1
  logs.value = []
  nextCursor.value = null
  pageIndex.value = 0
  pageCursors.value = [undefined]
  selectedEventLogId.value = ''
  appliedLogFilters.value = eventLogFilters()
  void loadLogs(undefined, 0, appliedLogFilters.value)
})

interface ExplanationRow {
  key: string
  depth: number
  summary: string
  matched: boolean
  actual?: string
  expected?: string
  matchedCount?: string
  window?: string
}

function explainValue(value: unknown): string | undefined {
  if (!record(value)) return undefined
  if (value.visibility === 'REDACTED') return 'Скрыто из-за чувствительности данных'
  if (value.visibility === 'UNAVAILABLE') return 'Значение недоступно'
  if (!('value' in value)) return undefined
  return typeof value.value === 'string' ? value.value : JSON.stringify(value.value)
}

function flattenExplanation(node: RuleDraftNode, explanation: unknown, depth = 0, key = 'root'): ExplanationRow[] {
  if (!record(explanation)) return []
  const row: ExplanationRow = {
    key,
    depth,
    summary: summarizeRule({ version: 1, root: node }, props.context).text,
    matched: Boolean(explanation.matched),
    ...(explainValue(explanation.actual) ? { actual: explainValue(explanation.actual) } : {}),
    ...(explainValue(explanation.expected) ? { expected: explainValue(explanation.expected) } : {}),
    ...(typeof explanation.matchedCount === 'string' ? { matchedCount: explanation.matchedCount } : {}),
    ...(record(explanation.window) && typeof explanation.window.from === 'string' && typeof explanation.window.to === 'string'
      ? { window: `${new Date(explanation.window.from).toLocaleString('ru-RU')} — ${new Date(explanation.window.to).toLocaleString('ru-RU')}` }
      : {}),
  }
  const children = explanation.children
  if ((node.kind === 'all' || node.kind === 'any') && Array.isArray(children)) {
    return [row, ...node.children.flatMap((child, index) => flattenExplanation(child, children[index], depth + 1, `${key}.${index}`))]
  }
  if (node.kind === 'not') return [row, ...flattenExplanation(node.child, explanation.child, depth + 1, `${key}.child`)]
  return [row]
}

const explanationRows = computed(() => previewState.value.status === 'valid' && previewState.value.response.explanation
  ? flattenExplanation(props.draft.root, previewState.value.response.explanation)
  : [])
const audienceExplanationRows = computed(() => previewState.value.status === 'valid' && props.audienceDraft && props.audienceContext && previewState.value.response.audience?.explanation
  ? flattenAudienceExplanation(props.audienceDraft.root, previewState.value.response.audience.explanation)
  : [])

function flattenAudienceExplanation(node: AudienceDraftNode, explanation: unknown, depth = 0, key = 'audience-root'): ExplanationRow[] {
  if (!record(explanation)) return []
  const row: ExplanationRow = {
    key,
    depth,
    summary: props.audienceContext ? summarizeAudience({ version: 1, root: node }, props.audienceContext).text : node.kind,
    matched: Boolean(explanation.matched),
    ...(explainValue(explanation.actual) ? { actual: explainValue(explanation.actual) } : {}),
    ...(explainValue(explanation.expected) ? { expected: explainValue(explanation.expected) } : {}),
  }
  const children = Array.isArray(explanation.children) ? explanation.children : []
  if (node.kind === 'all' || node.kind === 'any') return [row, ...node.children.flatMap((child, index) => flattenAudienceExplanation(child, children[index], depth + 1, `${key}.${index}`))]
  if (node.kind === 'not') return [row, ...flattenAudienceExplanation(node.child, children[0], depth + 1, `${key}.child`)]
  return [row, ...children.flatMap((child, index) => flattenAudienceEvidence(child, depth + 1, `${key}.segment.${index}`))]
}

function flattenAudienceEvidence(explanation: unknown, depth: number, key: string): ExplanationRow[] {
  if (!record(explanation)) return []
  const kind = typeof explanation.kind === 'string' ? explanation.kind : 'unknown'
  const identity = typeof explanation.definitionId === 'string'
    ? ` · поле ${explanation.definitionId}`
    : typeof explanation.segmentRevisionId === 'string' ? ` · версия сегмента ${explanation.segmentRevisionId}` : ''
  const row: ExplanationRow = {
    key, depth, summary: `${kind}${identity}`, matched: Boolean(explanation.matched),
    ...(explainValue(explanation.actual) ? { actual: explainValue(explanation.actual) } : {}),
    ...(explainValue(explanation.expected) ? { expected: explainValue(explanation.expected) } : {}),
  }
  const children = Array.isArray(explanation.children) ? explanation.children : []
  return [row, ...children.flatMap((child, index) => flattenAudienceEvidence(child, depth + 1, `${key}.${index}`))]
}
const summaryResponse = computed(() => previewState.value.status === 'valid' || previewState.value.status === 'semantic-invalid'
  ? previewState.value.response
  : validationResponse.value)
const summaryWarnings = computed(() => summaryResponse.value ? [
  ...summaryResponse.value.warnings.map((warning) => ({ scope: 'Условия', code: warning.code })),
  ...(summaryResponse.value.audience?.warnings ?? []).map((warning) => ({ scope: 'Аудитория', code: warning.code })),
] : [])

onMounted(() => {
  appliedLogFilters.value = eventLogFilters()
  void loadLogs(undefined, 0, appliedLogFilters.value)
})
onBeforeUnmount(() => {
  logsSequence += 1
  validationMachine.cancel()
  unsubscribeValidation()
  previewMachine.cancel()
  unsubscribePreview()
})
</script>

<template>
  <section class="validation-preview rule-validation-preview" aria-labelledby="validation-title">
    <header class="section-header">
      <div>
        <p class="eyebrow">Проверка правила</p>
        <h2 id="validation-title">Работает ли это условие?</h2>
      </div>
      <button type="button" class="primary-button" @click="validateNow">Проверить сейчас</button>
    </header>

    <div role="status" aria-live="polite" class="validation-status" :class="validationState.status">
      <span v-if="validationState.status === 'idle'">Проверка ещё не запускалась.</span>
      <span v-else-if="validationState.status === 'debounce'">Подготовка проверки после изменений…</span>
      <span v-else-if="validationState.status === 'pending'">Проверяем правило…</span>
      <span v-else-if="validationState.status === 'valid'">Правило прошло проверку.</span>
      <span v-else-if="validationState.status === 'local-invalid'">Сначала заполните обязательные поля правила.</span>
      <span v-else-if="validationState.status === 'semantic-invalid'">Сервер нашёл ошибки в условии.</span>
      <span v-else-if="validationState.status === 'network-error'">Не удалось связаться с сервером.</span>
      <span v-else>Ответ сервера имеет неподдерживаемый формат.</span>
    </div>

    <ul v-if="validationIssues.length" class="issue-list" aria-label="Ошибки правила">
      <li v-for="issue in validationIssues" :key="`${issue.code}:${issue.nodeId}:${issue.fieldPath}`">
        <span>{{ issue.message }}</span>
        <button type="button" @click="focusIssue(issue)">Открыть условие</button>
      </li>
    </ul>
    <ul v-if="validationAudienceIssues.length" class="issue-list audience-issues" aria-label="Ошибки аудитории">
      <li v-for="issue in validationAudienceIssues" :key="`${issue.code}:${issue.nodeId}:${issue.fieldPath}`">
        <span><strong>Аудитория:</strong> {{ issue.message }}</span>
        <button type="button" @click="focusAudienceIssue(issue)">Открыть аудиторию</button>
      </li>
    </ul>
    <button v-if="validationState.status === 'network-error'" type="button" @click="validateNow">Повторить проверку</button>

    <section class="anchor-section" aria-labelledby="anchor-title">
      <div class="section-header compact">
        <div><p class="eyebrow">Событие для проверки</p><h3 id="anchor-title">Выберите реальное событие</h3></div>
        <button type="button" :disabled="logsLoading" @click="refreshLogs">Обновить события</button>
      </div>
      <p>Показываем только события <code>{{ context.triggerEventCode }}</code> этого проекта.</p>
      <details class="log-filters">
        <summary>Фильтры событий</summary>
        <form @submit.prevent="applyLogFilters">
          <label>ID пользователя в вашем продукте<input v-model="logFilters.externalUserId" aria-label="ID пользователя для проверки" placeholder="customer-42"></label>
          <label>Источник<select v-model="logFilters.source" aria-label="Источник события для проверки"><option value="">Все</option><option value="SERVER">Сервер продукта</option><option value="FRONTEND">Интерфейс продукта</option><option value="INTERNAL">Внутренние</option></select></label>
          <label>Статус<select v-model="logFilters.status" aria-label="Статус события для проверки"><option value="">Все</option><option value="PROCESSED">Обработано</option><option value="FAILED">Ошибка</option><option value="RECEIVED">Получено</option></select></label>
          <label>Получено с<input v-model="logFilters.receivedFrom" type="datetime-local" aria-label="Получено с для проверки"></label>
          <label>Получено по<input v-model="logFilters.receivedTo" type="datetime-local" aria-label="Получено по для проверки"></label>
          <label>Событие с<input v-model="logFilters.occurredFrom" type="datetime-local" aria-label="Событие с для проверки"></label>
          <label>Событие по<input v-model="logFilters.occurredTo" type="datetime-local" aria-label="Событие по для проверки"></label>
          <label>На странице<select v-model.number="logFilters.limit" aria-label="Размер страницы событий"><option :value="25">25</option><option :value="50">50</option><option :value="100">100</option></select></label>
          <button type="button" aria-label="Применить фильтры событий" @click="applyLogFilters">Применить фильтры</button>
        </form>
      </details>
      <p v-if="logsLoading" role="status">Загружаем события…</p>
      <div v-else-if="logsError" role="alert"><span>{{ logsError }}</span> <button type="button" @click="retryLogs">Повторить</button></div>
      <p v-else-if="!logs.length">Подходящих событий пока нет.</p>
      <ul v-else class="event-list">
        <li v-for="log in logs" :key="log.id">
          <label>
            <input v-model="selectedEventLogId" type="radio" name="preview-event-log" :value="log.id">
            <span><strong>{{ log.eventName }}</strong><small>{{ log.userExternalId }} · {{ new Date(log.receivedAt).toLocaleString('ru-RU') }}</small></span>
          </label>
        </li>
      </ul>
      <nav class="pagination" aria-label="Страницы событий">
        <button type="button" :disabled="pageIndex === 0 || logsLoading" @click="previousLogsPage">Назад</button>
        <span>Страница {{ pageIndex + 1 }}</span>
        <button type="button" :disabled="!nextCursor || logsLoading" @click="nextLogsPage">Дальше</button>
      </nav>
      <button type="button" class="primary-button preview-button" aria-label="Проверить правило на событии" :disabled="!selectedEventLogId || previewState.status === 'pending'" @click="previewNow">Проверить на выбранном событии</button>
      <div class="preview-status" aria-live="polite">
        <p v-if="previewState.status === 'pending'" role="status">Строим объяснение…</p>
        <p v-else-if="previewState.status === 'valid'" :class="previewState.response.matched ? 'matched' : 'not-matched'">
          {{ previewState.response.matched ? 'Условие совпало' : 'Условие не совпало' }}
        </p>
        <p v-if="previewState.status === 'valid' && previewState.response.audience" :class="previewState.response.audience.matched ? 'matched' : 'not-matched'">
          {{ previewState.response.audience.matched ? 'Аудитория подходит' : 'Аудитория не подходит' }}
        </p>
        <p v-else-if="previewState.status === 'semantic-invalid'">Предварительная проверка недоступна: исправьте ошибки правила.</p>
        <p v-else-if="previewState.status === 'local-invalid'">Сначала заполните обязательные поля правила.</p>
        <p v-else-if="previewState.status === 'network-error'" role="alert">Не удалось выполнить preview. <button type="button" @click="previewNow">Повторить preview</button></p>
        <p v-else-if="previewState.status === 'contract-error'" role="alert">Сервер вернул ответ, который пока нельзя показать.</p>
      </div>
      <ol v-if="explanationRows.length" class="explanation-tree" aria-label="Объяснение результата">
        <li v-for="row in explanationRows" :key="row.key" :style="{ '--depth': row.depth }">
          <div><strong>{{ row.matched ? 'Совпало' : 'Не совпало' }}</strong><span>{{ row.summary }}</span></div>
          <dl>
            <template v-if="row.actual"><dt>Фактически</dt><dd>{{ row.actual }}</dd></template>
            <template v-if="row.expected"><dt>Ожидалось</dt><dd>{{ row.expected }}</dd></template>
            <template v-if="row.matchedCount"><dt>Найдено событий</dt><dd>{{ row.matchedCount }}</dd></template>
            <template v-if="row.window"><dt>Окно</dt><dd>{{ row.window }}</dd></template>
          </dl>
        </li>
      </ol>
      <section v-if="audienceExplanationRows.length" class="audience-explanation" aria-labelledby="audience-explanation-title"><h4 id="audience-explanation-title">Почему пользователь подходит аудитории</h4><p>Здесь показаны только разрешённые данные профиля. Чувствительные значения скрывает сервер.</p><ol class="explanation-tree" aria-label="Объяснение аудитории"><li v-for="row in audienceExplanationRows" :key="row.key" :style="{ '--depth': row.depth }"><div><strong>{{ row.matched ? 'Совпало' : 'Не совпало' }}</strong><span>{{ row.summary }}</span></div><dl><template v-if="row.actual"><dt>Фактически</dt><dd>{{ row.actual }}</dd></template><template v-if="row.expected"><dt>Ожидалось</dt><dd>{{ row.expected }}</dd></template></dl></li></ol></section>
    </section>

    <section v-if="summaryResponse" class="summary-grid" aria-label="Стоимость и зависимости">
      <article><h3>Сложность проверки</h3><template v-if="summaryResponse.cost"><strong>{{ summaryResponse.cost.class }}</strong><p>{{ summaryResponse.cost.leaves }} условий · {{ summaryResponse.cost.aggregateLeaves }} вычислений · {{ summaryResponse.cost.historyWindowDays }} дней истории</p></template><p v-else>Сервер не рассчитал сложность.</p></article>
      <article><h3>Зависимости</h3><ul v-if="summaryResponse.dependencies.length"><li v-for="dependency in summaryResponse.dependencies" :key="dependency.eventDefinitionRevisionId">{{ dependency.eventCode }} · schema v{{ dependency.schemaVersion }}</li></ul><p v-else>Нет внешних зависимостей.</p></article>
      <article><h3>Предупреждения</h3><ul v-if="summaryWarnings.length"><li v-for="warning in summaryWarnings" :key="`${warning.scope}:${warning.code}`">{{ warning.scope }} · {{ warning.code }}</li></ul><p v-else>Нет предупреждений.</p></article>
      <article v-if="summaryResponse.audience"><h3>Аудитория</h3><template v-if="summaryResponse.audience.cost"><strong>{{ summaryResponse.audience.cost.leaves }} условий</strong><p>{{ summaryResponse.audience.cost.segmentLeaves }} проверок сегментов</p></template><p>{{ summaryResponse.audience.dependencies.attributeRevisionIds.length }} версий полей · {{ summaryResponse.audience.dependencies.segmentRevisionIds.length }} версий сегментов</p><code v-for="id in summaryResponse.audience.dependencies.attributeRevisionIds" :key="id">{{ id }}</code><code v-for="id in summaryResponse.audience.dependencies.segmentRevisionIds" :key="id">{{ id }}</code></article>
    </section>
  </section>
</template>

<style scoped>
.validation-preview{container:validation-preview / inline-size;display:grid;gap:20px;min-width:0}.section-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.section-header.compact{align-items:center}.section-header h2,.section-header h3{margin:3px 0 0}.eyebrow{margin:0;color:var(--text-small-muted);font-size:.7rem;text-transform:uppercase;letter-spacing:.08em}.primary-button,button,.log-filters input,.log-filters select{min-height:40px;border:1px solid var(--line);border-radius:10px;padding:8px 13px;background:var(--surface-card);color:var(--ink);font:inherit}.primary-button,button{cursor:pointer}.primary-button{background:var(--surface-emphasis);color:var(--text-on-emphasis);border-color:var(--surface-emphasis)}.validation-status{padding:13px 15px;border-radius:12px;background:var(--surface-subtle)}.validation-status.valid{background:var(--status-success-soft);color:var(--status-success-text)}.validation-status.local-invalid,.validation-status.semantic-invalid,.validation-status.contract-error{background:var(--status-danger-soft);color:var(--status-danger-text)}.validation-status.network-error{background:var(--status-warning-soft);color:var(--status-warning-text)}.issue-list,.event-list{display:grid;gap:9px;margin:0;padding:0;list-style:none}.issue-list li,.event-list li{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid var(--line);border-radius:11px}.audience-issues li{border-color:var(--status-violet);background:var(--status-violet-soft)}.event-list label{display:flex;align-items:center;gap:12px;width:100%;cursor:pointer}.event-list label span{display:grid;gap:3px}.event-list small{color:var(--text-small-muted)}.anchor-section{display:grid;gap:12px;padding-top:20px;border-top:1px solid var(--line)}.log-filters summary{cursor:pointer;font-weight:700}.log-filters form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:12px}.log-filters label{display:grid;gap:5px;font-size:.72rem}.log-filters form button{align-self:end}.pagination{display:flex;align-items:center;justify-content:flex-end;gap:10px}.preview-button{justify-self:end}.matched{color:var(--status-success-text);font-weight:700}.not-matched{color:var(--status-danger-text);font-weight:700}.explanation-tree{display:grid;gap:10px;margin:0;padding:0;list-style:none}.explanation-tree>li{margin-left:calc(var(--depth) * 18px);padding:13px;border:1px solid var(--line);border-radius:11px}.explanation-tree>li>div{display:grid;gap:3px}.explanation-tree dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;margin:10px 0 0;font-size:.78rem}.explanation-tree dt{color:var(--text-small-muted)}.explanation-tree dd{margin:0;overflow-wrap:anywhere}.audience-explanation{display:grid;gap:8px;padding-top:14px;border-top:1px solid var(--line)}.audience-explanation h4,.audience-explanation p{margin:0}.audience-explanation p{color:var(--text-small-muted);font-size:.68rem}.summary-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.summary-grid article{padding:15px;border:1px solid var(--line);border-radius:12px}.summary-grid h3{margin:0 0 9px;font-size:.86rem}.summary-grid p,.summary-grid ul{margin:5px 0 0;padding-left:18px;font-size:.76rem}button:disabled{cursor:not-allowed;opacity:.5}@container validation-preview (max-width:900px){.log-filters form{grid-template-columns:repeat(2,minmax(0,1fr))}.summary-grid{grid-template-columns:1fr}}@container validation-preview (max-width:700px){.section-header{align-items:stretch;flex-direction:column}.section-header>button,.preview-button{width:100%}.issue-list li{align-items:flex-start;flex-direction:column}.log-filters form{grid-template-columns:1fr}.pagination{justify-content:space-between}.pagination span{font-size:.78rem}.explanation-tree>li{margin-left:calc(var(--depth) * 8px)}}
</style>
