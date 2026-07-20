<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import type { ConversationAISuspensionEntry } from '../model/conversation-ai-suspension.store'
import { isConversationAISuspended } from '../model/suspension-state'

const props = defineProps<{
  entry: ConversationAISuspensionEntry
  canManage: boolean
  conversationOpen: boolean
}>()

defineEmits<{
  start: []
  extend: []
  resume: []
  history: []
  retry: []
}>()

const clientNow = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  ticker = setInterval(() => { clientNow.value = Date.now() }, 1_000)
})
onBeforeUnmount(() => ticker && clearInterval(ticker))

const estimatedServerNow = computed(() => clientNow.value + props.entry.serverOffsetMs)
const active = computed(() => !props.entry.error && !props.entry.locallyExpired && isConversationAISuspended(props.entry.summary, estimatedServerNow.value))
const detail = computed(() => props.entry.detail)
const deadline = computed(() => props.entry.summary.suspendedUntil)
const remainingSeconds = computed(() => deadline.value
  ? Math.max(0, Math.ceil((Date.parse(deadline.value) - estimatedServerNow.value) / 1_000))
  : 0)

const remainingLabel = computed(() => {
  const seconds = remainingSeconds.value
  if (seconds < 60) return `осталось ${seconds} сек.`
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `осталось ${minutes} мин`
  const hours = Math.floor(minutes / 60)
  const tail = minutes % 60
  return tail ? `осталось ${hours} ч ${tail} мин` : `осталось ${hours} ч`
})

const deadlineLabel = computed(() => deadline.value
  ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(deadline.value))
  : 'срок не указан')
const countdownAnnouncement = computed(() => {
  if (remainingSeconds.value <= 0) return 'Срок приостановки истёк.'
  if (remainingSeconds.value < 60) return 'До возобновления AI осталось меньше минуты.'
  return `AI приостановлен до ${deadlineLabel.value}.`
})

const reasonLabels = {
  OPERATOR_TAKEOVER: 'оператор отвечает пользователю',
  MANUAL_REVIEW: 'требуется ручная проверка',
  INCIDENT_RESPONSE: 'устраняется происшествие',
  OTHER: 'другая причина',
} as const
const reasonLabel = computed(() => detail.value?.reason ? reasonLabels[detail.value.reason] : 'не указана')
</script>

<template>
  <Message v-if="entry.error" severity="warn" :closable="false" class="suspension-read-error">
    <div>
      <strong>Не удалось проверить состояние AI</strong>
      <span>{{ entry.error.message }}</span>
    </div>
    <Button label="Повторить" size="small" text @click="$emit('retry')" />
  </Message>

  <section v-if="active" class="suspension-banner" aria-labelledby="suspension-title">
    <div class="suspension-icon" aria-hidden="true"><i class="pi pi-pause-circle" /></div>
    <div class="suspension-copy">
      <h4 id="suspension-title">AI приостановлен в этом диалоге</h4>
      <p class="deadline">
        До {{ deadlineLabel }} · <span aria-hidden="true">{{ remainingLabel }}</span>
        <span class="sr-only" aria-live="polite">{{ countdownAnnouncement }}</span>
      </p>
      <p v-if="canManage && detail" class="suspension-meta">
        Причина: {{ reasonLabel }}<template v-if="detail.startedBy"> · включил {{ detail.startedBy.displayName }}</template>
      </p>
      <p v-if="canManage && detail?.note" class="suspension-note">{{ detail.note }}</p>
      <p v-if="entry.cancellationRequested" class="suspension-progress">
        <i class="pi pi-spin pi-spinner" aria-hidden="true" /> Завершаем уже начатый ответ AI…
      </p>
      <p v-if="!canManage" class="suspension-readonly">Управлять могут владелец и администратор.</p>
    </div>
    <div class="suspension-actions">
      <Button v-if="canManage && conversationOpen" label="Продлить" icon="pi pi-clock" severity="secondary" outlined size="small" @click="$emit('extend')" />
      <Button v-if="canManage" label="Возобновить AI" icon="pi pi-play" severity="danger" size="small" @click="$emit('resume')" />
      <Button label="История" icon="pi pi-history" severity="secondary" text size="small" @click="$emit('history')" />
    </div>
  </section>

  <div v-else-if="!entry.error" class="automatic-actions">
    <Button
      v-if="canManage && conversationOpen"
      label="Приостановить AI"
      icon="pi pi-pause-circle"
      severity="danger"
      outlined
      size="small"
      @click="$emit('start')"
    />
    <Button v-if="entry.summary.version !== '0'" label="История" icon="pi pi-history" severity="secondary" text size="small" @click="$emit('history')" />
  </div>
</template>

<style scoped>
.suspension-banner {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  margin-bottom: 12px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--status-danger) 42%, var(--border-default));
  border-radius: 14px;
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.suspension-icon { font-size: 1.35rem; }
.suspension-copy h4 { margin: 0; font-size: .84rem; }
.suspension-copy p { margin: 5px 0 0; font-size: .72rem; line-height: 1.45; }
.deadline { font-weight: 700; }
.suspension-note { padding: 7px 9px; border-radius: 8px; background: color-mix(in srgb, var(--surface-card) 55%, transparent); color: var(--text-primary); white-space: pre-wrap; }
.suspension-progress { display: flex; align-items: center; gap: 6px; }
.suspension-actions, .automatic-actions { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: flex-end; gap: 6px; }
.suspension-read-error { margin-bottom: 12px; }
.suspension-read-error :deep(.p-message-content) { justify-content: space-between; }
.suspension-read-error div { display: grid; gap: 3px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@media (max-width: 560px) {
  .suspension-banner { grid-template-columns: auto minmax(0, 1fr); }
  .suspension-actions { grid-column: 1 / -1; justify-content: stretch; }
  .suspension-actions :deep(.p-button) { flex: 1 1 140px; }
}
</style>
