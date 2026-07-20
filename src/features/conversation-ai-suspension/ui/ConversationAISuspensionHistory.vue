<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import type { ConversationAISuspensionHistoryItemResponseDto } from '@/shared/api/generated/models'
import { repository } from '@/shared/api/repository'

const props = defineProps<{
  visible: boolean
  projectId: string
  endUserId: string
  conversationId: string
}>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()
const visibleModel = computed({ get: () => props.visible, set: (value) => emit('update:visible', value) })
const items = ref<ConversationAISuspensionHistoryItemResponseDto[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
let requestSequence = 0

watch(() => [props.visible, props.conversationId] as const, ([visible]) => {
  if (!visible) return
  items.value = []
  nextCursor.value = null
  void load()
}, { immediate: true })

async function load(cursor?: string): Promise<void> {
  const request = ++requestSequence
  if (cursor) loadingMore.value = true
  else loading.value = true
  error.value = ''
  try {
    const page = await repository.getConversationAISuspensionHistory(
      props.projectId,
      props.endUserId,
      props.conversationId,
      { limit: 20, ...(cursor ? { cursor } : {}) },
    )
    if (request !== requestSequence) return
    const byId = new Map(items.value.map((item) => [item.id, item]))
    page.items.forEach((item) => byId.set(item.id, item))
    items.value = [...byId.values()]
    nextCursor.value = page.nextCursor
  } catch {
    if (request === requestSequence) error.value = 'Не удалось загрузить историю. Попробуйте ещё раз.'
  } finally {
    if (request === requestSequence) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

function actionLabel(type: ConversationAISuspensionHistoryItemResponseDto['type']): string {
  return type === 'STARTED' ? 'AI приостановлен' : type === 'EXTENDED' ? 'Приостановка продлена' : 'Ответы AI возобновлены'
}

function reasonLabel(reason?: ConversationAISuspensionHistoryItemResponseDto['reason'] | null): string {
  return reason ? ({
    OPERATOR_TAKEOVER: 'Оператор отвечает пользователю',
    MANUAL_REVIEW: 'Требуется ручная проверка',
    INCIDENT_RESPONSE: 'Устраняется происшествие',
    OTHER: 'Другая причина',
  }[reason] ?? reason) : ''
}
</script>

<template>
  <Dialog v-model:visible="visibleModel" modal header="История приостановки AI" :style="{ width: 'min(680px, calc(100vw - 24px))' }">
    <Message v-if="error" severity="error" :closable="false">
      {{ error }} <Button label="Повторить" size="small" text @click="load()" />
    </Message>
    <p v-if="loading">Загружаем историю…</p>
    <p v-else-if="!items.length && !error" class="history-empty">История пока пуста.</p>
    <ol v-else class="suspension-history">
      <li v-for="item in items" :key="item.id">
        <span class="history-marker" aria-hidden="true"><i class="pi pi-circle-fill" /></span>
        <article>
          <header><strong>{{ actionLabel(item.type) }}</strong><time :datetime="item.acceptedAt">{{ new Date(item.acceptedAt).toLocaleString('ru-RU') }}</time></header>
          <p>{{ item.actor.displayName }} · версия {{ item.version }}</p>
          <p v-if="item.reason">Причина: {{ reasonLabel(item.reason) }}</p>
          <p v-if="item.newSuspendedUntil">До {{ new Date(item.newSuspendedUntil).toLocaleString('ru-RU') }}</p>
          <blockquote v-if="item.note">{{ item.note }}</blockquote>
        </article>
      </li>
    </ol>
    <Button v-if="nextCursor" label="Загрузить ещё" severity="secondary" outlined :loading="loadingMore" @click="load(nextCursor)" />
  </Dialog>
</template>

<style scoped>
.suspension-history { display: grid; gap: 0; margin: 0 0 14px; padding: 0; list-style: none; }
.suspension-history li { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 8px; }
.history-marker { position: relative; padding-top: 4px; color: var(--status-violet); font-size: .45rem; text-align: center; }
.history-marker::after { content: ''; position: absolute; top: 15px; bottom: -4px; left: 50%; width: 1px; background: var(--border-default); }
.suspension-history li:last-child .history-marker::after { display: none; }
.suspension-history article { padding: 0 0 18px; }
.suspension-history header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; }
.suspension-history time, .suspension-history p { color: var(--text-secondary); font-size: .7rem; }
.suspension-history p { margin: 5px 0 0; }
.suspension-history blockquote { margin: 7px 0 0; padding: 8px 10px; border-left: 3px solid var(--border-strong); background: var(--surface-subtle); font-size: .72rem; white-space: pre-wrap; }
.history-empty { color: var(--text-secondary); text-align: center; }
</style>
