<script setup lang="ts">
import { ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { repository } from '@/shared/api/repository'
import type { EventDefinition, EventDefinitionRevision } from '@/shared/types/domain'

const props = defineProps<{ projectId: string; event: EventDefinition }>()

const visible = ref(false)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const revisions = ref<EventDefinitionRevision[]>([])
const nextCursor = ref<string | null>(null)
const detail = ref<EventDefinitionRevision | null>(null)

async function open() {
  visible.value = true
  revisions.value = []
  nextCursor.value = null
  detail.value = null
  await loadPage()
}

async function loadPage(cursor?: string) {
  const definitionKeyId = props.event.definitionKeyId ?? props.event.id
  if (cursor) loadingMore.value = true
  else loading.value = true
  error.value = ''
  try {
    const page = await repository.getEventDefinitionRevisions(props.projectId, definitionKeyId, {
      limit: 25,
      ...(cursor ? { cursor } : {}),
    })
    revisions.value.push(...page.items)
    nextCursor.value = page.nextCursor
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить историю версий'
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

async function openDetail(revision: EventDefinitionRevision) {
  error.value = ''
  try {
    detail.value = await repository.getEventDefinitionRevision(
      props.projectId,
      props.event.definitionKeyId ?? props.event.id,
      revision.id,
    )
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить версию'
  }
}

function compatibilitySeverity(value: EventDefinitionRevision['compatibility']) {
  return value === 'CURRENT' ? 'success' : value === 'PINNED' ? 'warn' : 'secondary'
}

function compatibilityLabel(value: EventDefinitionRevision['compatibility']) {
  return value === 'CURRENT' ? 'Текущая' : value === 'PINNED' ? 'Используется публикациями' : 'Заменена'
}
</script>

<template>
  <Button label="История" icon="pi pi-history" severity="secondary" text size="small" @click="open" />
  <Dialog v-model:visible="visible" modal :header="`История: ${event.name}`" :style="{ width: 'min(760px, calc(100vw - 28px))' }">
    <div class="event-history-meta">
      <span>Постоянный ключ</span><code>{{ event.definitionKeyId ?? event.id }}</code>
      <span>Текущая версия</span><code>{{ event.currentRevisionId ?? event.id }}</code>
    </div>
    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
    <p v-if="loading">Загружаем историю…</p>
    <div v-else class="event-revisions">
      <button
        v-for="revision in revisions"
        :key="revision.id"
        type="button"
        class="event-revision-row"
        data-testid="event-revision-detail"
        @click="openDetail(revision)"
      >
        <strong>v{{ revision.version }}</strong>
        <Tag :value="compatibilityLabel(revision.compatibility)" :severity="compatibilitySeverity(revision.compatibility)" />
        <span>{{ revision.pinnedScenarioRevisionCount }} публикации сценариев</span>
        <small>{{ revision.createdAt ? new Date(revision.createdAt).toLocaleString('ru-RU') : revision.id }}</small>
      </button>
    </div>
    <Button v-if="nextCursor" label="Загрузить ещё" severity="secondary" outlined :loading="loadingMore" @click="loadPage(nextCursor)" />

    <section v-if="detail" class="event-revision-detail">
      <header><h3>Версия v{{ detail.version }}</h3><Tag :value="compatibilityLabel(detail.compatibility)" :severity="compatibilitySeverity(detail.compatibility)" /></header>
      <p>Эту схему фиксируют {{ detail.pinnedScenarioRevisionCount }} опубликованных ревизий сценариев.</p>
      <pre>{{ JSON.stringify(detail.payloadSchema, null, 2) }}</pre>
    </section>
  </Dialog>
</template>

<style scoped>
.event-history-meta { display: grid; grid-template-columns: max-content 1fr; gap: 6px 12px; margin-bottom: 14px; color: var(--text-muted); }
.event-history-meta code { color: var(--text-primary); overflow-wrap: anywhere; }
.event-revisions { display: grid; gap: 8px; margin-bottom: 12px; }
.event-revision-row { width: 100%; display: grid; grid-template-columns: auto auto 1fr auto; gap: 10px; align-items: center; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--surface-card); color: inherit; text-align: left; cursor: pointer; }
.event-revision-row small { color: var(--text-muted); }
.event-revision-detail { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border-color); }
.event-revision-detail header { display: flex; align-items: center; gap: 10px; }
.event-revision-detail h3 { margin: 0; }
.event-revision-detail pre { max-height: 320px; overflow: auto; padding: 12px; border-radius: 10px; background: var(--surface-ground); font-size: .78rem; }
@media (max-width: 640px) { .event-revision-row { grid-template-columns: auto 1fr; } }
</style>
