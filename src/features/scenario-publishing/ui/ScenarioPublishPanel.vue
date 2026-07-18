<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'

import { deliveryPolicySummary, serializeDeliveryPolicy, type DeliveryPolicyDraft } from '@/features/scenario-delivery/model'
import { serializeAudienceDraft, summarizeAudience, type AudienceDomainContext, type AudienceDraft } from '@/features/scenario-audience/model'
import { createScenarioPublishStateMachine } from '@/features/scenario-publishing/model'
import { serializeRuleDraft, summarizeRule, type RuleDomainContext, type RuleDraft } from '@/features/scenario-rules/model'
import { toPlainScenarioAction } from '@/features/scenarios/model/scenario-graph'
import { scenarioAuthoringRepository, type ScenarioAuthoringContract, type ScenarioPublishInput, type ValidateScenarioDraftResponseDto } from '@/shared/api/repository/scenario-authoring'
import type { ScenarioAction } from '@/shared/types/domain'

const props = defineProps<{
  projectId: string
  scenarioId: string
  draft: RuleDraft
  context: RuleDomainContext
  audienceDraft?: AudienceDraft
  audienceContext?: AudienceDomainContext
  deliveryPolicy: DeliveryPolicyDraft
  actions?: ScenarioAction[]
  authoringSnapshot?: string
  expectedCurrentRevisionId: string | null
  expectedDraftVersion?: number | null
  blockedReason?: string
  refreshCatalog: () => Promise<ScenarioAuthoringContract>
}>()

const emit = defineEmits<{
  published: [revisionId: string, snapshot: { ruleSnapshot: string; audienceSnapshot?: string; deliverySnapshot: string; authoringSnapshot: string }]
  publishing: [pending: boolean]
  'head-change': [revisionId: string]
  'reload-request': []
  'resave-required': []
  'focus-issue': [issue: { code: string; path: string; message: string }]
}>()

let submittedSnapshot: { ruleSnapshot: string; audienceSnapshot?: string; deliverySnapshot: string; authoringSnapshot: string } | null = null

const expectedHead = ref<string | null>(props.expectedCurrentRevisionId)
watch(() => props.expectedCurrentRevisionId, (value) => { expectedHead.value = value })
const recoveredContract = shallowRef<ScenarioAuthoringContract | null>(null)
const effectiveContext = computed<RuleDomainContext>(() => recoveredContract.value
  ? { ...props.context, contract: recoveredContract.value }
  : props.context)

const machine = createScenarioPublishStateMachine((request) => (
  scenarioAuthoringRepository.publishScenario(props.projectId, props.scenarioId, request)
))
const state = shallowRef(machine.getState())
const unsubscribe = machine.subscribe((next) => {
  state.value = next
  if (next.status === 'published') {
    expectedHead.value = next.currentRevisionId
    emit('head-change', next.currentRevisionId)
    if (submittedSnapshot) emit('published', next.currentRevisionId, submittedSnapshot)
  }
})
onBeforeUnmount(unsubscribe)

const ruleSummary = computed(() => summarizeRule(props.draft, effectiveContext.value))
const ruleResult = computed(() => ruleSummary.value.status === 'empty' ? null : serializeRuleDraft(props.draft, effectiveContext.value))
const effectiveAudienceContext = computed<AudienceDomainContext | null>(() => {
  if (!props.audienceContext) return null
  return recoveredContract.value?.audience
    ? { ...props.audienceContext, catalog: recoveredContract.value.audience }
    : props.audienceContext
})
const audienceSummary = computed(() => props.audienceDraft && effectiveAudienceContext.value
  ? summarizeAudience(props.audienceDraft, effectiveAudienceContext.value)
  : null)
const audienceResult = computed(() => {
  if (!props.audienceDraft || !effectiveAudienceContext.value || audienceSummary.value?.status === 'empty') return null
  return serializeAudienceDraft(props.audienceDraft, effectiveAudienceContext.value)
})
const deliveryResult = computed(() => serializeDeliveryPolicy(props.deliveryPolicy))
const localIssues = computed(() => [
  ...(!ruleResult.value || ruleResult.value.ok ? [] : ruleResult.value.issues.map((issue) => issue.message)),
  ...(audienceResult.value && !audienceResult.value.ok ? audienceResult.value.issues.map((issue) => issue.message) : []),
  ...(deliveryResult.value.ok ? [] : deliveryResult.value.issues.map((issue) => issue.message)),
])
const catalogLabel = computed(() => compactIdentifier(effectiveContext.value.contract.revision))
const actionTypes = computed(() => [...new Set((props.actions ?? []).map((action) => action.type))])
const goalEventCodes = computed(() => [...new Set((props.actions ?? [])
  .filter((action) => action.type === 'WAIT_FOR_GOAL')
  .map((action) => {
    const goal = action.config.goal
    return goal && typeof goal === 'object' && 'eventCode' in goal && typeof goal.eventCode === 'string' ? goal.eventCode : null
  })
  .filter((value): value is string => Boolean(value)))])
type ReviewState =
  | { status: 'idle' | 'pending' | 'error' }
  | { status: 'local-invalid' }
  | { status: 'ready' | 'semantic-invalid'; response: ValidateScenarioDraftResponseDto }
const reviewState = shallowRef<ReviewState>({ status: 'idle' })
const requiresResave = ref(false)
let reviewSequence = 0
const canPublish = computed(() => Boolean(props.projectId && props.scenarioId)
  && Boolean(props.expectedDraftVersion)
  && !requiresResave.value
  && !props.blockedReason
  && (!ruleResult.value || ruleResult.value.ok)
  && (!audienceResult.value || audienceResult.value.ok)
  && deliveryResult.value.ok
  && reviewState.value.status === 'ready'
  && (state.value.status === 'idle' || state.value.status === 'error'))

function compactIdentifier(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value
}

function focusIssue(issue: { code: string; path: string; message: string }) {
  emit('focus-issue', issue)
}

function focusAudienceIssue(issue: { code: string; path: string; message: string }) {
  emit('focus-issue', { ...issue, path: `audience.${issue.path}` })
}

function request(currentRevisionId = expectedHead.value): ScenarioPublishInput | null {
  if ((ruleResult.value && !ruleResult.value.ok) || !deliveryResult.value.ok) return null
  if (audienceResult.value && !audienceResult.value.ok) return null
  return {
    catalogRevision: effectiveContext.value.contract.revision,
    expectedCurrentRevisionId: currentRevisionId,
    deliveryPolicy: deliveryResult.value.value,
    ...(ruleResult.value?.ok ? { rule: ruleResult.value.value } : {}),
    ...(props.expectedDraftVersion ? { expectedDraftVersion: props.expectedDraftVersion } : {}),
    ...(audienceResult.value?.ok ? { audience: audienceResult.value.value } : {}),
  }
}

async function publish(currentRevisionId = expectedHead.value) {
  emit('publishing', true)
  try {
    if (!await reviewNow()) return
    if (props.blockedReason) return
    const prepared = request(currentRevisionId)
    if (!prepared) return
    submittedSnapshot = {
      ruleSnapshot: JSON.stringify(props.draft),
      ...(props.audienceDraft ? { audienceSnapshot: JSON.stringify(props.audienceDraft) } : {}),
      deliverySnapshot: JSON.stringify(props.deliveryPolicy),
      authoringSnapshot: props.authoringSnapshot ?? '',
    }
    await machine.publish(prepared)
    if (state.value.status === 'published' && submittedSnapshot
      && (submittedSnapshot.ruleSnapshot !== JSON.stringify(props.draft)
        || submittedSnapshot.audienceSnapshot !== (props.audienceDraft ? JSON.stringify(props.audienceDraft) : undefined)
        || submittedSnapshot.deliverySnapshot !== JSON.stringify(props.deliveryPolicy)
        || submittedSnapshot.authoringSnapshot !== (props.authoringSnapshot ?? ''))) {
      machine.reset()
    }
  } finally {
    submittedSnapshot = null
    emit('publishing', false)
  }
}

async function reviewNow(): Promise<boolean> {
  const requestId = ++reviewSequence
  if (!props.scenarioId) {
    reviewState.value = { status: 'idle' }
    return false
  }
  const serialized = ruleResult.value
  if (serialized && !serialized.ok) {
    reviewState.value = { status: 'local-invalid' }
    return false
  }
  reviewState.value = { status: 'pending' }
  try {
    const serializedAudience = audienceResult.value
    if (serializedAudience && !serializedAudience.ok) {
      reviewState.value = { status: 'local-invalid' }
      return false
    }
    if (!deliveryResult.value.ok) {
      reviewState.value = { status: 'local-invalid' }
      return false
    }
    const response = await scenarioAuthoringRepository.validateScenarioDraft(
      props.projectId,
      props.scenarioId,
      {
        catalogRevision: effectiveContext.value.contract.revision,
        ...(serialized?.ok ? { rule: serialized.value } : {}),
        ...(serializedAudience?.ok ? { audience: serializedAudience.value } : {}),
        deliveryPolicy: deliveryResult.value.value,
        graph: { actions: (props.actions ?? []).map((action, position) => {
          const plain = toPlainScenarioAction(action)
          return {
            position,
            type: plain.type,
            config: plain.config,
            ...(plain.nodeKey ? { nodeKey: plain.nodeKey } : {}),
            ...(plain.nextNodeKey !== undefined ? { nextNodeKey: plain.nextNodeKey } : {}),
          }
        }) },
      },
    )
    if (requestId !== reviewSequence) return false
    reviewState.value = response.valid ? { status: 'ready', response } : { status: 'semantic-invalid', response }
    return response.valid
  } catch {
    if (requestId === reviewSequence) reviewState.value = { status: 'error' }
    return false
  }
}

async function recoverCatalog() {
  try {
    recoveredContract.value = await props.refreshCatalog()
    requiresResave.value = true
    reviewState.value = { status: 'idle' }
    machine.reset()
    emit('resave-required')
  } catch {
    reviewState.value = { status: 'error' }
  }
}

watch(() => props.expectedDraftVersion, () => { requiresResave.value = false })

watch(
  () => [props.draft, props.audienceDraft, props.deliveryPolicy, props.actions, props.expectedDraftVersion, props.context.contract.revision, props.audienceContext?.catalog.revision] as const,
  () => {
    if (recoveredContract.value?.revision === props.context.contract.revision) recoveredContract.value = null
    machine.reset()
    void reviewNow()
  },
  { deep: true, immediate: true },
)

onBeforeUnmount(() => { reviewSequence += 1 })
</script>

<template>
  <section class="publish-panel" aria-labelledby="publish-title">
    <header><span>Проверка и публикация</span><h2 id="publish-title">Проверка перед публикацией</h2><p>Публикация атомарно создаёт неизменяемую версию и активирует её для новых запусков.</p></header>

    <div class="review-grid">
      <article><i class="pi pi-filter" /><div><strong>Условия</strong><span>{{ ruleSummary.text }}</span><small>{{ ruleSummary.leaves }} условий · {{ ruleSummary.aggregateLeaves }} агрегатов · каталог {{ catalogLabel }}</small></div></article>
      <article v-if="audienceSummary"><i class="pi pi-users" /><div><strong>Аудитория</strong><span>{{ audienceSummary.text }}</span><small>{{ audienceSummary.leaves }} условий · {{ audienceSummary.segmentLeaves }} сегментов · каталог {{ effectiveAudienceContext?.catalog.revision }}</small></div></article>
      <article><i class="pi pi-send" /><div><strong>Доставка</strong><span>{{ deliveryPolicySummary(deliveryPolicy) }}</span><small>Отдельно от срока цели</small></div></article>
      <article><i class="pi pi-lock" /><div><strong>Текущая опубликованная версия</strong><span>{{ expectedHead ?? 'Первая публикация в этой вкладке' }}</span><small>Защита от одновременных изменений</small></div></article>
    </div>

    <div v-if="reviewState.status === 'pending'" class="review-state" role="status">Проверяем весь черновик сценария на сервере…</div>
    <div v-else-if="reviewState.status === 'error'" class="review-state error" role="alert">Не удалось выполнить предпубликационную проверку. <button type="button" @click="reviewNow">Повторить</button></div>
    <div v-else-if="reviewState.status === 'semantic-invalid'" class="review-state error" role="alert"><strong>Сервер нашёл ошибки</strong><button v-for="issue in reviewState.response.issues" :key="`${issue.code}:${issue.path}`" type="button" class="validation-issue" @click="focusIssue(issue)"><span>{{ issue.message }}</span><code>{{ issue.code }} · {{ issue.path }}</code></button><button v-for="issue in reviewState.response.audience?.issues ?? []" :key="`audience:${issue.code}:${issue.path}`" type="button" class="validation-issue" @click="focusAudienceIssue(issue)"><span>Аудитория: {{ issue.message }}</span><code>{{ issue.code }} · {{ issue.path }}</code></button><span v-for="warning in reviewState.response.audience?.warnings ?? []" :key="`audience-warning:${warning.code}`">Предупреждение аудитории: {{ warning.code }}</span></div>
    <div v-else-if="reviewState.status === 'ready'" class="server-review" aria-label="Eligibility: стоимость, зависимости и предупреждения до публикации">
      <div><strong>Стоимость условий</strong><span>{{ reviewState.response.cost ? `${reviewState.response.cost.class} · ${reviewState.response.cost.leaves} условий · ${reviewState.response.cost.aggregateLeaves} агрегатов · ${reviewState.response.cost.historyWindowDays} дней истории` : 'Не рассчитана' }}</span></div>
      <div><strong>Зависимости условий</strong><span>{{ reviewState.response.dependencies.map((item) => `${item.eventCode} · схема v${item.schemaVersion}`).join('; ') || 'Нет' }}</span></div>
      <div><strong>Предупреждения условий</strong><span>{{ reviewState.response.warnings.map((item) => item.code).join(', ') || 'Нет' }}</span></div>
      <div v-if="reviewState.response.audience"><strong>Зависимости аудитории</strong><span>{{ reviewState.response.audience.dependencies.attributeRevisionIds.length }} атрибутов · {{ reviewState.response.audience.dependencies.segmentRevisionIds.length }} сегментов</span><code v-for="id in reviewState.response.audience.dependencies.attributeRevisionIds" :key="id">{{ id }}</code><code v-for="id in reviewState.response.audience.dependencies.segmentRevisionIds" :key="id">{{ id }}</code></div>
      <div v-if="reviewState.response.audience"><strong>Стоимость аудитории</strong><span>{{ reviewState.response.audience.cost ? `${reviewState.response.audience.cost.leaves} условий · ${reviewState.response.audience.cost.segmentLeaves} сегментов` : 'Не рассчитана' }}</span></div>
      <div v-if="reviewState.response.audience"><strong>Предупреждения аудитории</strong><span>{{ reviewState.response.audience.warnings.map((warning) => warning.code).join(', ') || 'Нет' }}</span></div>
    </div>
    <div class="document-dependencies"><strong>Зависимости действий и целей</strong><span>Типы действий: {{ actionTypes.join(', ') || 'нет' }}</span><span>События целей: {{ goalEventCodes.join(', ') || 'нет' }}</span></div>
    <p class="diff-gap"><i class="pi pi-info-circle" /> Сервер проверяет условия, аудиторию, граф, действия, цели и доставку как единый документ. Публикуется конкретная сохранённая версия черновика.</p>

    <ul v-if="localIssues.length" class="publish-issues"><li v-for="issue in localIssues" :key="issue">{{ issue }}</li></ul>
    <p v-if="blockedReason" class="blocked-reason"><i class="pi pi-save" /> {{ blockedReason }}</p>
    <p v-else-if="requiresResave" class="blocked-reason"><i class="pi pi-save" /> Каталог изменился. Проверьте поля и снова сохраните черновик перед публикацией.</p>
    <p v-else-if="!expectedDraftVersion" class="blocked-reason"><i class="pi pi-save" /> Сохраните черновик перед публикацией.</p>

    <div v-if="state.status === 'conflict'" class="conflict" role="alert">
      <template v-if="state.kind === 'catalog'">
        <strong>Каталог условий изменился</strong>
        <p>Обновите каталог, проверьте изменившиеся поля и обязательно снова сохраните черновик.</p>
        <button type="button" aria-label="Обновить каталог" @click="recoverCatalog">Обновить каталог</button>
      </template>
      <template v-else-if="state.kind === 'draft'">
        <strong>Черновик изменён в другой вкладке</strong>
        <p>Эта версия черновика устарела. Автоматическое объединение небезопасно: загрузите актуальный документ и повторите изменения.</p>
        <button type="button" @click="emit('reload-request')">Загрузить актуальный черновик</button>
      </template>
      <template v-else>
        <strong>Сценарий опубликован в другой вкладке</strong>
        <p>Текущая версия: {{ state.currentRevisionId ?? 'не указана сервером' }}. Автоматическое объединение недоступно: загрузите актуальную версию и сохраните новый черновик осознанно.</p>
        <button type="button" @click="emit('reload-request')">Загрузить актуальную версию</button>
      </template>
    </div>
    <div v-else-if="state.status === 'error'" class="publish-error" role="alert">Не удалось опубликовать. Черновик остаётся в этой вкладке.</div>

    <div v-if="state.status === 'published'" class="published-card" role="status">
      <div><i class="pi pi-check-circle" /><div><strong>Неизменяемая версия №{{ state.response.revision.revisionNumber }} опубликована</strong><span>{{ state.response.revision.id }} · {{ state.response.revision.contentHash }}</span></div></div>
      <p>Новые запуски используют эту версию. Уже начатые продолжают работать с версией, с которой стартовали.</p>
      <dl><dt>Стоимость</dt><dd>{{ state.response.cost.class }} · {{ state.response.cost.leaves }} условий · {{ state.response.cost.aggregateLeaves }} агрегатов</dd><template v-if="state.response.audienceCost"><dt>Снимок аудитории</dt><dd>{{ state.response.audienceCost.leaves }} условий · {{ state.response.dependencies.userAttributeRevisionIds?.length ?? 0 }} атрибутов · {{ state.response.dependencies.segmentRevisionIds?.length ?? 0 }} сегментов</dd></template><dt>Действия</dt><dd>{{ state.response.dependencies.actionTypes.join(', ') || 'Нет' }}</dd><dt>Версии событий</dt><dd>{{ state.response.dependencies.eventDefinitionRevisionIds.length }}</dd><dt>Предупреждения</dt><dd>{{ state.response.warnings.map((warning) => warning.code).join(', ') || 'Нет' }}</dd></dl>
    </div>

    <button type="button" class="publish-button" aria-label="Опубликовать immutable revision" :disabled="!canPublish" @click="publish()">{{ state.status === 'pending' ? 'Публикуем…' : 'Опубликовать версию' }}</button>
    <p class="session-warning"><i class="pi pi-database" /> Черновик хранится на сервере с защитой от одновременного изменения черновика и опубликованной версии.</p>
  </section>
</template>

<style scoped>
.validation-issue{display:grid!important;width:100%;margin-top:6px;text-align:left}.validation-issue code{font-size:.58rem;color:#7d5149}
.publish-panel{display:grid;gap:16px;width:min(820px,100%);padding-top:18px;border-top:1px solid var(--line)}header>span{color:var(--muted);font-size:.63rem;text-transform:uppercase;letter-spacing:.1em}header h2{margin:5px 0 0;font-size:1.15rem}header p{margin:5px 0 0;color:var(--muted);font-size:.7rem}.review-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.review-grid article{display:flex;gap:9px;padding:12px;border:1px solid #e0e2dc;border-radius:12px;background:#fff}.review-grid i{color:#7760d9}.review-grid strong,.review-grid span,.review-grid small{display:block}.review-grid strong{font-size:.72rem}.review-grid span{margin-top:4px;font-size:.66rem}.review-grid small{margin-top:5px;color:var(--muted);font-size:.61rem}.server-review{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.server-review>div,.review-state{padding:11px;border-radius:11px;background:#eef5e8}.server-review strong,.server-review span,.review-state strong,.review-state span{display:block;font-size:.66rem}.server-review span,.review-state span{margin-top:4px;color:var(--muted)}.review-state.error{background:#fff0ed;color:#91483c}.review-state button{border:0;border-radius:7px;padding:5px 8px}.document-dependencies{display:grid;gap:4px;padding:11px;border:1px solid var(--line);border-radius:11px}.document-dependencies strong,.document-dependencies span{font-size:.66rem}.document-dependencies span{color:var(--muted)}.diff-gap{margin:0;color:var(--muted);font-size:.65rem}.publish-issues{margin:0;padding:11px 11px 11px 30px;border-radius:12px;background:#fff0ed;color:#974a3d;font-size:.68rem}.conflict,.publish-error{padding:13px;border-radius:12px;background:#fff4d9;color:#725918}.conflict p{font-size:.69rem}.conflict button{min-height:38px;border:0;border-radius:9px;background:#25281f;color:#fff;padding:8px 12px}.published-card{display:grid;gap:10px;padding:15px;border-radius:14px;background:#edf7e5;color:#415c31}.published-card>div{display:flex;gap:10px}.published-card strong,.published-card span{display:block}.published-card span,.published-card p,.published-card dl{font-size:.67rem}.published-card dl{display:grid;grid-template-columns:max-content 1fr;gap:5px 12px;margin:0}.published-card dd{margin:0}.publish-button{min-height:46px;border:0;border-radius:11px;background:#25281f;color:#fff;font-weight:700;cursor:pointer}.publish-button:disabled{cursor:not-allowed;opacity:.45}.session-warning{margin:0;color:var(--muted);font-size:.65rem}.session-warning i{color:#b68726}@media(max-width:720px){.review-grid,.server-review{grid-template-columns:1fr}}
</style>
