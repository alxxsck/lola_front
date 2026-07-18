<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { repository } from '@/shared/api/repository'
import { scenarioAuthoringRepository, type PreviewScenarioGoalResponseDto, type ScenarioAuthoringContract } from '@/shared/api/repository/scenario-authoring'
import type { EventLog } from '@/shared/types/domain'
import { goalDraftFromConfig, serializeGoalDraft } from '../model'

const props = defineProps<{ projectId: string; config: Record<string, unknown>; contract: ScenarioAuthoringContract }>()
const eventLogs = ref<EventLog[]>([])
const eventLogId = ref('')
const loadingLogs = ref(false)
const previewing = ref(false)
const error = ref('')
const result = ref<PreviewScenarioGoalResponseDto | null>(null)
let previewSequence = 0
const eventLogOptions = computed(() => eventLogs.value.map((item) => ({
  value: item.id,
  label: `${item.userExternalId} · ${item.eventCode} · ${new Date(item.receivedAt).toLocaleString('ru-RU')}`,
})))

onMounted(loadEventLogs)

async function loadEventLogs() {
  loadingLogs.value = true
  error.value = ''
  try {
    const page = await repository.getEventLogPage(props.projectId, { limit: 20 })
    eventLogs.value = page.items
    eventLogId.value = page.items[0]?.id ?? ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить журнал событий для предпросмотра'
  } finally {
    loadingLogs.value = false
  }
}

async function preview() {
  if (!eventLogId.value) return
  const requestId = ++previewSequence
  const requestedEventLogId = eventLogId.value
  const serialized = serializeGoalDraft(goalDraftFromConfig(props.config), props.contract)
  if (!serialized.ok) {
    error.value = serialized.issues.map((issue) => issue.message).join(' ')
    return
  }
  previewing.value = true
  error.value = ''
  result.value = null
  try {
    const response = await scenarioAuthoringRepository.previewGoal(props.projectId, {
      goal: serialized.value.goal,
      timeoutMs: serialized.value.timeoutMs,
      scope: { kind: 'eventLog', eventLogId: requestedEventLogId },
    })
    if (requestId === previewSequence && requestedEventLogId === eventLogId.value) result.value = response
  } catch (cause) {
    if (requestId === previewSequence) error.value = cause instanceof Error ? cause.message : 'Не удалось проверить цель'
  } finally {
    if (requestId === previewSequence) previewing.value = false
  }
}

watch([() => props.config, eventLogId], () => {
  previewSequence += 1
  previewing.value = false
  result.value = null
}, { deep: true })

onBeforeUnmount(() => { previewSequence += 1 })

function actualLabel() {
  if (!result.value?.actual) return 'Нет значения'
  return result.value.actual.visibility === 'VISIBLE'
    ? result.value.actual.value ?? 'Нет значения'
    : 'Данные скрыты политикой доступа'
}
</script>

<template>
  <div class="goal-preview">
    <header><strong>Предпросмотр цели</strong><small>Проверка привязана к записи события и конкретной версии его определения.</small></header>
    <Select v-model="eventLogId" :options="eventLogOptions" option-label="label" option-value="value" placeholder="Выберите запись события пользователя" aria-label="Запись события для предпросмотра цели" :loading="loadingLogs" fluid />
    <Button label="Проверить цель" icon="pi pi-play" severity="secondary" outlined :disabled="!eventLogId" :loading="previewing" @click="preview" />
    <Message v-if="error" severity="error" size="small" :closable="false">{{ error }}</Message>
    <section v-if="result" class="goal-preview-result">
      <div><Tag :value="result.matched ? 'Цель достигнута' : 'Цель не достигнута'" :severity="result.matched ? 'success' : 'secondary'" /><span>Совпадений: {{ result.matchedCount ?? result.explanation?.matchedCount ?? '—' }}</span></div>
      <p><strong>Фактическое значение:</strong> {{ actualLabel() }}</p>
      <p v-if="result.window"><strong>Окно:</strong> {{ result.window.from }} — {{ result.window.to }} · срок {{ result.window.deadlineAt }}</p>
      <p v-if="result.dependency"><strong>Зафиксированная версия события:</strong> <code>{{ result.dependency.eventDefinitionRevisionId }}</code> · схема v{{ result.dependency.schemaVersion }} · постоянный ключ <code>{{ result.dependency.definitionKeyId }}</code></p>
      <ul v-if="result.issues.length"><li v-for="issue in result.issues" :key="`${issue.code}:${issue.path}`">{{ issue.message }}</li></ul>
    </section>
  </div>
</template>

<style scoped>
.goal-preview { display: grid; gap: 9px; margin-top: 14px; padding: 12px; border: 1px solid #ddd9f5; border-radius: 12px; background: #faf9ff; }
.goal-preview header { display: grid; gap: 3px; }
.goal-preview header strong { font-size: .72rem; }
.goal-preview header small, .goal-preview-result { color: var(--muted); font-size: .66rem; line-height: 1.45; }
.goal-preview-result { display: grid; gap: 7px; padding-top: 8px; border-top: 1px solid #e5e2f6; }
.goal-preview-result > div { display: flex; align-items: center; gap: 8px; }
.goal-preview-result p, .goal-preview-result ul { margin: 0; }
.goal-preview-result code { overflow-wrap: anywhere; }
</style>
