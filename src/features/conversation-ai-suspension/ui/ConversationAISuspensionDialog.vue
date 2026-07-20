<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import Textarea from 'primevue/textarea'
import type { ExtendConversationAISuspensionDto, ResumeConversationAIDto, StartConversationAISuspensionDto } from '@/shared/api/generated/models'
import type { ConversationAISuspensionDetail } from '@/shared/types/domain'
import type { SuspensionError } from '../model/suspension-error'
import { MAX_SUSPENSION_SECONDS, roundedDurationSeconds } from '../model/suspension-state'

type Mode = 'START' | 'EXTEND' | 'RESUME'
type Command = StartConversationAISuspensionDto | ExtendConversationAISuspensionDto | ResumeConversationAIDto

const props = defineProps<{
  visible: boolean
  mode: Mode
  conversationLabel: string
  current: ConversationAISuspensionDetail | null
  serverOffsetMs: number
  busy: boolean
  error: SuspensionError | null
}>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  submit: [value: { key: string; command: Command }]
}>()

const durationSeconds = ref(3_600)
const customDeadline = ref<Date | null>(null)
const reason = ref<StartConversationAISuspensionDto['reason'] | ''>('')
const note = ref('')
const resumeReason = ref('')
const showResumeReason = ref(false)
const submitted = ref(false)
const idempotencyKey = ref('')

const visibleModel = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value),
})
const estimatedServerNow = computed(() => Date.now() + props.serverOffsetMs)
const durationOptions = [
  { value: 900, label: '15 минут' },
  { value: 1_800, label: '30 минут' },
  { value: 3_600, label: '1 час' },
  { value: 14_400, label: '4 часа' },
  { value: 86_400, label: '24 часа' },
  { value: 0, label: 'Указать дату и время' },
]
const extendOptions = durationOptions.filter((option) => option.value > 0)
const reasonOptions = [
  { value: 'OPERATOR_TAKEOVER', label: 'Оператор отвечает пользователю' },
  { value: 'MANUAL_REVIEW', label: 'Требуется ручная проверка' },
  { value: 'INCIDENT_RESPONSE', label: 'Устраняется происшествие' },
  { value: 'OTHER', label: 'Другая причина' },
] as const

watch(() => [props.visible, props.mode] as const, ([visible]) => {
  if (!visible) return
  durationSeconds.value = 3_600
  customDeadline.value = null
  reason.value = ''
  note.value = ''
  resumeReason.value = ''
  showResumeReason.value = false
  submitted.value = false
  idempotencyKey.value = crypto.randomUUID()
}, { immediate: true })

watch(
  [durationSeconds, () => customDeadline.value?.getTime(), reason, note, resumeReason],
  () => {
    if (submitted.value && !props.busy) idempotencyKey.value = crypto.randomUUID()
  },
)

const targetDeadline = computed(() => {
  if (props.mode === 'RESUME') return null
  if (props.mode === 'START') {
    if (durationSeconds.value === 0) return customDeadline.value
    return new Date(estimatedServerNow.value + durationSeconds.value * 1_000)
  }
  if (!props.current?.suspendedUntil) return null
  return new Date(Date.parse(props.current.suspendedUntil) + durationSeconds.value * 1_000)
})

const deadlineLabel = computed(() => targetDeadline.value
  ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(targetDeadline.value)
  : '')

const validationMessage = computed(() => {
  if (!submitted.value) return ''
  if ((props.mode === 'EXTEND' || props.mode === 'RESUME') && !props.current) {
    return 'Не удалось определить текущее состояние. Обновите данные.'
  }
  if (props.mode === 'START') {
    if (!reason.value) return 'Выберите причину.'
    if (reason.value === 'OTHER' && !note.value.trim()) return 'Поясните причину в комментарии.'
    if (note.value.length > 500) return 'Комментарий не может быть длиннее 500 символов.'
    try {
      if (durationSeconds.value === 0) roundedDurationSeconds((customDeadline.value?.getTime() ?? 0) - estimatedServerNow.value)
    } catch (cause) {
      return cause instanceof Error ? cause.message : 'Проверьте срок.'
    }
  }
  if (props.mode === 'EXTEND') {
    if (!props.current?.suspendedUntil) return 'Не удалось определить текущий срок.'
    if (!targetDeadline.value || targetDeadline.value.getTime() > estimatedServerNow.value + MAX_SUSPENSION_SECONDS * 1_000) return 'Итоговый срок не может превышать семь дней.'
  }
  if (resumeReason.value.length > 200) return 'Комментарий не может быть длиннее 200 символов.'
  return ''
})

const title = computed(() => props.mode === 'START'
  ? 'Приостановить AI в этом диалоге'
  : props.mode === 'EXTEND'
    ? 'Продлить приостановку AI'
    : 'Возобновить ответы AI в этом диалоге?')

function submit(): void {
  if (props.busy) return
  submitted.value = true
  if (validationMessage.value) return
  let command: Command
  if (props.mode === 'START') {
    const seconds = durationSeconds.value === 0
      ? roundedDurationSeconds((customDeadline.value?.getTime() ?? 0) - estimatedServerNow.value)
      : durationSeconds.value
    command = {
      durationSeconds: seconds,
      reason: reason.value as StartConversationAISuspensionDto['reason'],
      ...(note.value.trim() ? { note: note.value.trim() } : {}),
    }
  } else if (props.mode === 'EXTEND') {
    command = { additionalSeconds: durationSeconds.value, expectedVersion: props.current!.version }
  } else {
    command = {
      expectedVersion: props.current!.version,
      ...(resumeReason.value.trim() ? { reason: resumeReason.value.trim() } : {}),
    }
  }
  emit('submit', { key: idempotencyKey.value, command })
}
</script>

<template>
  <Dialog v-model:visible="visibleModel" modal :header="title" :style="{ width: 'min(560px, calc(100vw - 24px))' }">
    <form class="suspension-form" @submit.prevent="submit">
      <p class="conversation-name"><strong>{{ conversationLabel }}</strong></p>

      <template v-if="mode === 'START'">
        <fieldset>
          <legend>Срок</legend>
          <div class="choice-grid">
            <label v-for="option in durationOptions" :key="option.value" :class="{ selected: durationSeconds === option.value }">
              <input v-model="durationSeconds" type="radio" name="duration" :value="option.value" />{{ option.label }}
            </label>
          </div>
        </fieldset>
        <label v-if="durationSeconds === 0" class="field">
          <span>Дата и время возобновления</span>
          <DatePicker v-model="customDeadline" show-time hour-format="24" fluid />
        </label>
        <label class="field">
          <span>Причина</span>
          <select v-model="reason" name="reason" required>
            <option value="" disabled>Выберите причину</option>
            <option v-for="option in reasonOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
        <label class="field">
          <span>Внутренний комментарий <small>{{ note.length }}/500</small></span>
          <Textarea v-model="note" rows="3" maxlength="500" placeholder="Необязательно, кроме причины «Другая»" />
        </label>
        <p v-if="deadlineLabel" class="result-line">AI автоматически возобновит ответы {{ deadlineLabel }}.</p>
        <p class="explanation">Пользователь сможет писать сюда и общаться с AI в других диалогах.</p>
      </template>

      <template v-else-if="mode === 'EXTEND'">
        <p>Текущее окончание: <strong>{{ current?.suspendedUntil ? new Date(current.suspendedUntil).toLocaleString('ru-RU') : 'неизвестно' }}</strong></p>
        <fieldset>
          <legend>Добавить время</legend>
          <div class="choice-grid">
            <label v-for="option in extendOptions" :key="option.value" :class="{ selected: durationSeconds === option.value }">
              <input v-model="durationSeconds" type="radio" name="duration" :value="option.value" />+{{ option.label }}
            </label>
          </div>
        </fieldset>
        <p v-if="deadlineLabel" class="result-line">Новое окончание: {{ deadlineLabel }}.</p>
      </template>

      <template v-else>
        <p>Следующее сообщение пользователя снова сможет получить автоматический ответ.</p>
        <button v-if="!showResumeReason" type="button" class="comment-toggle" @click="showResumeReason = true">Добавить комментарий</button>
        <label v-else class="field">
          <span>Комментарий <small>{{ resumeReason.length }}/200</small></span>
          <Textarea v-model="resumeReason" rows="2" maxlength="200" />
        </label>
      </template>

      <Message v-if="validationMessage" severity="error" :closable="false">{{ validationMessage }}</Message>
      <Message v-if="error" severity="warn" :closable="false">
        {{ error.message }}<small v-if="error.requestId"> Номер обращения: {{ error.requestId }}.</small>
      </Message>

      <div class="dialog-actions">
        <Button type="button" label="Отмена" severity="secondary" text :disabled="busy" @click="visibleModel = false" />
        <Button
          type="submit"
          :label="mode === 'START' ? `Приостановить${deadlineLabel ? ` до ${targetDeadline?.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : ''}` : mode === 'EXTEND' ? 'Продлить' : 'Возобновить AI'"
          :icon="mode === 'RESUME' ? 'pi pi-play' : 'pi pi-check'"
          :severity="mode === 'RESUME' ? 'danger' : undefined"
          :loading="busy"
          :disabled="busy"
        />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.suspension-form { display: grid; gap: 15px; }
.conversation-name { margin: 0; padding: 10px 12px; border-radius: 10px; background: var(--surface-subtle); overflow-wrap: anywhere; }
fieldset { margin: 0; padding: 0; border: 0; }
legend, .field > span { margin-bottom: 7px; color: var(--text-secondary); font-size: .72rem; font-weight: 800; }
.choice-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
.choice-grid label { display: flex; align-items: center; gap: 6px; min-height: 40px; padding: 8px 10px; border: 1px solid var(--border-default); border-radius: 9px; font-size: .72rem; cursor: pointer; }
.choice-grid label.selected { border-color: var(--action-primary); background: var(--status-violet-soft); }
.field { display: grid; }
.field > span { display: flex; justify-content: space-between; }
.field select { min-height: var(--control-height); padding: 0 11px; border: 1px solid var(--input-border); border-radius: 8px; background: var(--input-background); color: var(--text-primary); }
.result-line { margin: 0; font-weight: 800; }
.explanation { margin: 0; color: var(--text-secondary); font-size: .76rem; }
.comment-toggle { justify-self: start; padding: 0; border: 0; background: none; color: var(--text-link); cursor: pointer; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px; }
@media (max-width: 520px) { .choice-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .dialog-actions :deep(.p-button) { flex: 1; } }
</style>
