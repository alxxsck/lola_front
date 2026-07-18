<script setup lang="ts">
import { ref, watch } from 'vue'

import { adaptRunExplain, runtimeExplainLabel, type RunExplainView } from '../model'
import { scenarioAuthoringRepository } from '@/shared/api/repository/scenario-authoring'

const props = defineProps<{ projectId: string; runId: string }>()
const loading = ref(false)
const error = ref('')
const explain = ref<RunExplainView | null>(null)
let sequence = 0

function date(value?: string | null) {
  return value ? new Date(value).toLocaleString('ru-RU') : '—'
}

function kindLabel(kind: string) {
  if (kind === 'all') return 'Все условия'
  if (kind === 'any') return 'Хотя бы одно условие'
  if (kind === 'not') return 'Инверсия результата'
  if (kind === 'eventField') return 'Поле события запуска'
  if (kind === 'eventAggregate') return 'История событий'
  if (kind === 'activityDayStreak') return 'Активные дни'
  if (kind === 'locale') return 'Locale пользователя'
  if (kind === 'language') return 'Язык пользователя'
  if (kind === 'country') return 'Страна пользователя'
  if (kind === 'userAttribute') return 'Атрибут пользователя'
  if (kind === 'segmentMembership') return 'Участие в сегменте'
  if (kind === 'legacy') return 'Устаревшие условия'
  if (kind === 'unavailable') return 'Объяснение недоступно'
  return kind
}

async function load() {
  if (!props.projectId || !props.runId) return
  const request = ++sequence
  loading.value = true
  error.value = ''
  try {
    const response = await scenarioAuthoringRepository.explainRun(props.projectId, props.runId)
    if (request === sequence) explain.value = adaptRunExplain(response)
  } catch (cause) {
    if (request === sequence) error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить объяснение Run'
  } finally {
    if (request === sequence) loading.value = false
  }
}

watch(() => [props.projectId, props.runId] as const, load, { immediate: true })
</script>

<template>
  <section class="run-explain" aria-labelledby="run-explain-title">
    <header><span>Фактический Run</span><h3 id="run-explain-title">Почему сценарий выполнился именно так</h3><p>Показываем зафиксированную версию и сохранённые факты запуска, а не последний черновик.</p></header>
    <p v-if="loading" role="status" class="explain-state"><i class="pi pi-spin pi-spinner" /> Загружаем explain…</p>
    <div v-else-if="error" role="alert" class="explain-error"><span>{{ error }}</span><button type="button" @click="load">Повторить</button></div>
    <template v-else-if="explain">
      <div class="revision-card" :class="{ unavailable: !explain.revision.pinned }">
        <i :class="explain.revision.pinned ? 'pi pi-lock' : 'pi pi-question-circle'" />
        <div><strong>{{ explain.revision.label }}</strong><template v-if="explain.revision.pinned"><span>{{ explain.revision.id }} · catalog {{ explain.revision.catalogRevision }}</span><small>Опубликована {{ date(explain.revision.publishedAt) }} · hash {{ explain.revision.contentHash }}</small><a :href="`/scenarios/${explain.revision.scenarioId}`">Открыть сценарий</a></template><small v-else>Нельзя утверждать, что Run использовал текущий draft.</small></div>
      </div>

      <section class="explain-section"><h4>Trigger</h4><div class="fact-grid"><div><span>Событие</span><strong>{{ explain.trigger.code }}</strong></div><div><span>Schema</span><strong>v{{ explain.trigger.schemaVersion }}</strong></div><div><span>Получено</span><strong>{{ date(explain.trigger.receivedAt) }}</strong></div><div><span>Источник</span><strong>{{ runtimeExplainLabel(explain.trigger.source) }}</strong></div></div><a :href="`/event-logs?eventId=${encodeURIComponent(explain.trigger.eventLogId)}`">Открыть Event Log</a></section>

      <section class="explain-section"><div class="section-title"><h4>Eligibility</h4><span>{{ runtimeExplainLabel(explain.eligibility.decision) }} · {{ runtimeExplainLabel(explain.eligibility.fidelity) }}</span></div><ol class="eligibility-tree"><li v-for="row in explain.eligibility.rows" :key="row.id" :style="{ '--depth': row.depth }" :class="row.state"><div><i :class="row.state === 'matched' ? 'pi pi-check-circle' : row.state === 'unavailable' ? 'pi pi-question-circle' : 'pi pi-times-circle'" /><strong>{{ kindLabel(row.kind) }}</strong><span v-if="row.state === 'unavailable'">Данные недоступны</span></div><dl><template v-if="row.actual"><dt>Фактически</dt><dd>{{ row.actual }}</dd></template><template v-if="row.expected"><dt>Ожидалось</dt><dd>{{ row.expected }}</dd></template><template v-if="row.matchedCount"><dt>Событий</dt><dd>{{ row.matchedCount }}</dd></template><template v-if="row.window"><dt>Окно</dt><dd>{{ row.window }}</dd></template></dl></li></ol><div v-if="explain.eligibility.lastRecheck" class="recheck-card"><div class="section-title"><h4>Eligibility recheck</h4><span>{{ runtimeExplainLabel(explain.eligibility.lastRecheck.decision) }} · {{ runtimeExplainLabel(explain.eligibility.lastRecheck.fidelity) }}</span></div><p>Независимая повторная проверка на {{ date(explain.eligibility.lastRecheck.evaluatedAt) }}.</p></div></section>

      <section class="explain-section audience-explain">
        <div class="section-title"><h4>Audience при запуске</h4><span>{{ runtimeExplainLabel(explain.audience.decision) }} · {{ runtimeExplainLabel(explain.audience.fidelity) }}</span></div>
        <p class="snapshot-copy">Первоначальное решение сохранено в Run {{ date(explain.audience.evaluatedAt) }} и не пересчитывается по текущему профилю.</p>
        <div class="dependency-counts"><span>{{ explain.audience.segmentRevisionIds.length }} segment revision</span><span>{{ explain.audience.attributeRevisionIds.length }} attribute revision</span></div>
        <div class="dependency-ids"><div v-if="explain.audience.segmentRevisionIds.length"><strong>Segment revisions</strong><code v-for="id in explain.audience.segmentRevisionIds" :key="id">{{ id }}</code></div><div v-if="explain.audience.attributeRevisionIds.length"><strong>Attribute revisions</strong><code v-for="id in explain.audience.attributeRevisionIds" :key="id">{{ id }}</code></div></div>
        <ol class="eligibility-tree"><li v-for="row in explain.audience.rows" :key="`audience-${row.id}`" :style="{ '--depth': row.depth }" :class="row.state"><div><i :class="row.state === 'matched' ? 'pi pi-check-circle' : row.state === 'unavailable' ? 'pi pi-question-circle' : 'pi pi-times-circle'" /><strong>{{ kindLabel(row.kind) }}</strong><span v-if="row.state === 'unavailable'">Данные недоступны</span></div><dl><template v-if="row.definitionId"><dt>Attribute definition</dt><dd>{{ row.definitionId }}</dd></template><template v-if="row.segmentRevisionId"><dt>Segment revision</dt><dd>{{ row.segmentRevisionId }}</dd></template><template v-if="row.actual"><dt>Фактически</dt><dd>{{ row.actual }}</dd></template><template v-if="row.expected"><dt>Ожидалось</dt><dd>{{ row.expected }}</dd></template></dl></li></ol>
        <div v-if="explain.audience.lastRecheck" class="recheck-card"><div class="section-title"><h4>Повторная проверка перед доставкой · Audience recheck</h4><span>{{ runtimeExplainLabel(explain.audience.lastRecheck.decision) }}</span></div><p>Это отдельное решение на {{ date(explain.audience.lastRecheck.evaluatedAt) }}; оно не изменяет первоначальный снимок и не подменяет Eligibility recheck.</p><ol class="eligibility-tree"><li v-for="row in explain.audience.lastRecheck.rows" :key="`recheck-${row.id}`" :style="{ '--depth': row.depth }" :class="row.state"><div><i :class="row.state === 'matched' ? 'pi pi-check-circle' : row.state === 'unavailable' ? 'pi pi-question-circle' : 'pi pi-times-circle'" /><strong>{{ kindLabel(row.kind) }}</strong><span v-if="row.state === 'unavailable'">Данные недоступны</span></div><dl><template v-if="row.segmentRevisionId"><dt>Segment revision</dt><dd>{{ row.segmentRevisionId }}</dd></template><template v-if="row.actual"><dt>Фактически</dt><dd>{{ row.actual }}</dd></template><template v-if="row.expected"><dt>Ожидалось</dt><dd>{{ row.expected }}</dd></template></dl></li></ol></div>
      </section>

      <section class="explain-section"><div class="section-title"><h4>Goal и Deadline</h4><span>{{ explain.goals.length }} ожиданий</span></div><p v-if="!explain.goals.length" class="empty-copy">В этом Run не было Goal-ожиданий.</p><div v-else class="goal-list"><article v-for="goal in explain.goals" :key="goal.waitId"><div><strong>{{ goal.winnerLabel }}</strong><span>{{ runtimeExplainLabel(goal.outcome) }}</span></div><dl><dt>Deadline</dt><dd>{{ date(goal.deadlineAt) }}</dd><dt>Результат</dt><dd>{{ date(goal.resolvedAt) }}</dd><dt>Ветка</dt><dd>{{ runtimeExplainLabel(goal.selectedBranch) }} → {{ goal.targetNodeKey ?? 'завершение' }}</dd></dl><a v-if="goal.winningEventLogId" :href="`/event-logs?eventId=${encodeURIComponent(goal.winningEventLogId)}`">Событие-победитель</a></article></div></section>

      <section class="explain-section"><div class="section-title"><h4>Доставка</h4><span>{{ runtimeExplainLabel(explain.delivery.policy.kind) }}</span></div><p>{{ explain.delivery.summary }}</p><div v-if="explain.delivery.waits.length" class="wait-list"><span v-for="wait in explain.delivery.waits" :key="wait.waitId"><strong>{{ runtimeExplainLabel(wait.outcome) }}</strong> · до {{ date(wait.deadlineAt) }}</span></div></section>

      <section class="explain-section"><div class="section-title"><h4>Actions и continuations</h4><span>{{ explain.actions.length }} actions · {{ explain.continuations.length }} continuations</span></div><div class="action-list"><article v-for="action in explain.actions" :key="action.id"><strong>{{ runtimeExplainLabel(action.actionType) }}</strong><span>{{ action.nodeKey }} · {{ runtimeExplainLabel(action.status) }}</span><small>{{ action.errorCode ? runtimeExplainLabel(action.errorCode) : runtimeExplainLabel(action.executor) }}</small></article><article v-for="continuation in explain.continuations" :key="continuation.id"><strong>Continuation · {{ runtimeExplainLabel(continuation.outcome) }}</strong><span>{{ runtimeExplainLabel(continuation.status) }} → {{ continuation.targetNodeKey ?? 'завершение' }}</span><small>Попыток: {{ continuation.attemptCount }}</small></article></div></section>

      <section class="explain-section"><h4>Timeline</h4><ol class="timeline"><li v-for="entry in explain.timeline" :key="entry.id"><i class="pi pi-circle-fill" /><div><strong>{{ runtimeExplainLabel(entry.type) }}</strong><span>{{ date(entry.occurredAt) }}</span></div></li></ol></section>
    </template>
  </section>
</template>

<style scoped>
.run-explain{display:grid;gap:16px;padding-top:18px;border-top:1px solid var(--line)}header>span{color:var(--text-small-muted);font-size:.62rem;text-transform:uppercase;letter-spacing:.1em}header h3{margin:4px 0 0}header p,.empty-copy{margin:5px 0 0;color:var(--text-small-muted);font-size:.69rem}.explain-state,.explain-error{padding:12px;border-radius:11px;background:var(--surface-subtle)}.explain-error{display:flex;align-items:center;justify-content:space-between;background:var(--status-danger-soft);color:var(--status-danger-text)}.explain-error button{border:0;border-radius:8px;padding:7px}.revision-card{display:flex;gap:10px;padding:13px;border-radius:13px;background:var(--status-success-soft)}.revision-card.unavailable{background:var(--surface-subtle)}.revision-card strong,.revision-card span,.revision-card small{display:block}.revision-card strong{font-size:.77rem}.revision-card span,.revision-card small{margin-top:4px;font-size:.65rem}.revision-card a,.explain-section>a,.goal-list a{display:inline-block;margin-top:6px;color:var(--status-violet-text);font-size:.67rem}.explain-section{display:grid;gap:9px}.explain-section h4{margin:0;font-size:.83rem}.section-title{display:flex;align-items:center;justify-content:space-between;gap:10px}.section-title>span{color:var(--text-small-muted);font-size:.64rem}.fact-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.fact-grid>div{padding:9px;border-radius:9px;background:var(--surface-subtle)}.fact-grid span,.fact-grid strong{display:block}.fact-grid span{color:var(--text-small-muted);font-size:.59rem}.fact-grid strong{margin-top:3px;font-size:.68rem}.eligibility-tree,.timeline{display:grid;gap:7px;margin:0;padding:0;list-style:none}.eligibility-tree li{margin-left:calc(var(--depth) * 10px);padding:9px;border:1px solid var(--status-danger);border-radius:10px}.eligibility-tree li.matched{border-color:var(--status-success)}.eligibility-tree li.unavailable{border-color:var(--status-warning);background:var(--status-warning-soft)}.eligibility-tree li>div{display:flex;align-items:center;gap:7px}.eligibility-tree li>div>span{color:var(--text-small-muted);font-size:.61rem}.eligibility-tree strong{font-size:.7rem}.eligibility-tree dl,.goal-list dl{display:grid;grid-template-columns:max-content 1fr;gap:3px 8px;margin:7px 0 0;font-size:.63rem}.eligibility-tree dt,.goal-list dt{color:var(--text-small-muted)}.eligibility-tree dd,.goal-list dd{margin:0;overflow-wrap:anywhere}.goal-list,.action-list{display:grid;gap:8px}.goal-list article,.action-list article{padding:10px;border:1px solid var(--line);border-radius:10px}.goal-list article>div{display:flex;justify-content:space-between;gap:8px}.goal-list strong,.goal-list span,.action-list strong,.action-list span,.action-list small{font-size:.68rem}.action-list strong,.action-list span,.action-list small{display:block}.action-list span,.action-list small{margin-top:3px;color:var(--text-small-muted)}.wait-list{display:grid;gap:5px}.wait-list span{padding:8px;border-radius:8px;background:var(--surface-subtle);font-size:.65rem}.timeline li{display:flex;gap:9px}.timeline i{margin-top:5px;color:var(--status-violet-text);font-size:.42rem}.timeline strong,.timeline span{display:block;font-size:.65rem}.timeline span{margin-top:2px;color:var(--text-small-muted)}@media(max-width:480px){.fact-grid{grid-template-columns:1fr}}
.snapshot-copy,.recheck-card p{margin:0;color:var(--text-small-muted);font-size:.66rem}.dependency-counts{display:flex;flex-wrap:wrap;gap:6px}.dependency-counts span{padding:5px 7px;border-radius:8px;background:var(--status-violet-soft);color:var(--status-violet-text);font-size:.61rem}.dependency-ids{display:grid;gap:6px}.dependency-ids>div{display:flex;flex-wrap:wrap;gap:5px;align-items:center}.dependency-ids strong,.dependency-ids code{font-size:.6rem}.dependency-ids code{padding:3px 5px;border-radius:6px;background:var(--surface-subtle)}.recheck-card{display:grid;gap:8px;padding:11px;border-left:3px solid var(--status-violet-text);border-radius:10px;background:var(--status-violet-soft)}
</style>
