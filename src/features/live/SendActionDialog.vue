<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import { repository } from '@/shared/api/repository'
import type { ActiveSession, ManualAction, UiElement } from '@/shared/types/domain'
import { adminMessageError } from './admin-message'
import { buildDirectActions, resolveIdempotencyAttempt } from './direct-action'
import { relativeTime } from '@/shared/lib/format'

const props = defineProps<{
  visible: boolean
  projectId?: string
  userId?: string
  recipientName?: string
  session: ActiveSession | null
  sessions?: ActiveSession[]
}>()
const emit = defineEmits<{ 'update:visible': [value: boolean]; sent: [] }>()
const toast = useToast()
const loading = ref(false)
const error = ref('')
const elements = ref<UiElement[]>([])
const targetsLoading = ref(false)
const pendingIdempotency = ref<{ fingerprint: string; key: string } | null>(null)
const selectedSessionId = ref('')
const form = reactive({ type: 'TEXT', text: '', policy: 'reuse_active', label: '', action: 'OPEN_PAGE', target: '', animation: 'greeting', voice: 'eve', integrationCode: 'welcome_bonus', amount: 10, currency: 'EUR' })

const availableSessions = computed(() => props.sessions?.length ? props.sessions : props.session ? [props.session] : [])
const selectedSession = computed(() => availableSessions.value.find((item) => item.id === selectedSessionId.value) ?? null)
const sessionOptions = computed(() => availableSessions.value.map((item) => ({
  label: `${item.device} · ${item.id.slice(0, 8)} · ${relativeTime(item.lastSeenAt)}`,
  value: item.id,
})))
const apiTypes = computed(() => [
  { label: 'Текст от Lola', value: 'TEXT' },
  ...(availableSessions.value.length ? [
    { label: 'CTA-кнопка', value: 'BUTTON' },
    { label: 'Анимация', value: 'ANIMATION' },
    { label: 'Frontend-команда', value: 'COMMAND' },
  ] : []),
])
const mockTypes = computed(() => [
  ...apiTypes.value,
  { label: 'Голосовое сообщение · demo', value: 'VOICE' },
  { label: 'Выдать бонус · demo', value: 'BONUS' },
])
const types = computed(() => repository.mode === 'api' ? apiTypes.value : mockTypes.value)
const commandActions = [
  { label: 'Открыть страницу', value: 'OPEN_PAGE' },
  { label: 'Открыть модалку', value: 'OPEN_MODAL' },
  { label: 'Подсветить элемент', value: 'HIGHLIGHT_ELEMENT' },
]
const buttonActions = computed(() => form.type === 'BUTTON' ? commandActions.slice(0, 2) : commandActions)
const policies = [
  { label: 'Продолжить активный диалог', value: 'reuse_active' },
  { label: 'Создать новый диалог', value: 'create_new' },
]
const animations = ['greeting', 'attention', 'celebrating', 'pointing', 'success', 'thinking'].map((value) => ({ label: value, value }))
const recipient = computed(() => props.recipientName ?? props.session?.userName ?? '')
const internalUserId = computed(() => props.userId ?? props.session?.userId)
const targetKind = computed(() => form.action === 'OPEN_MODAL' ? 'MODAL' : form.action === 'HIGHLIGHT_ELEMENT' ? 'ELEMENT' : 'PAGE')
const targetOptions = computed(() => elements.value
  .filter((item) => item.enabled && (targetKind.value === 'ELEMENT' ? ['ELEMENT', 'BUTTON'].includes(item.kind) : item.kind === targetKind.value))
  .map((item) => ({ label: `${item.name} · ${item.code}`, value: item.code })))
const valid = computed(() => {
  if (!internalUserId.value || !props.projectId) return false
  if (form.type === 'ANIMATION') return Boolean(form.animation && selectedSession.value)
  if (form.type === 'BUTTON') return Boolean(['OPEN_PAGE', 'OPEN_MODAL'].includes(form.action) && form.label.trim() && form.target.trim() && selectedSession.value)
  if (form.type === 'COMMAND') return Boolean(form.action && form.target.trim() && selectedSession.value)
  if (form.type === 'BONUS') return Boolean(selectedSession.value && form.integrationCode.trim() && form.amount > 0 && form.currency.trim())
  return Boolean(form.text.trim())
})

watch(() => props.visible, async (value) => {
  if (!value) return
  error.value = ''
  form.type = 'TEXT'
  form.text = ''
  form.label = ''
  form.target = ''
  selectedSessionId.value = props.session?.id ?? availableSessions.value[0]?.id ?? ''
  pendingIdempotency.value = null
  if (!props.projectId) return
  targetsLoading.value = true
  try {
    elements.value = await repository.getElements(props.projectId)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить опубликованные цели'
    elements.value = []
  } finally {
    targetsLoading.value = false
  }
})

watch(() => form.action, () => { form.target = '' })
watch(() => form.type, (type) => {
  if (type === 'BUTTON' && !['OPEN_PAGE', 'OPEN_MODAL'].includes(form.action)) form.action = 'OPEN_PAGE'
})

const directActions = () => buildDirectActions(form)

function demoAction(): ManualAction {
  if (form.type === 'VOICE') return { type: 'VOICE', text: form.text, voice: form.voice }
  return { type: 'BONUS', integrationCode: form.integrationCode, amount: form.amount, currency: form.currency }
}

async function send() {
  if (!valid.value || !internalUserId.value || !props.projectId) return
  loading.value = true
  error.value = ''
  try {
    if (repository.mode === 'mock' && (form.type === 'VOICE' || form.type === 'BONUS')) {
      if (!selectedSession.value) return
      await repository.sendAction(selectedSession.value, demoAction())
      toast.add({ severity: 'success', summary: 'Demo-команда отправлена', detail: 'Действие записано в локальный журнал.', life: 3500 })
      emit('sent')
      emit('update:visible', false)
      return
    }
    const request = {
      text: form.text.trim() || (form.type === 'ANIMATION' ? 'Анимация от администратора' : form.label.trim() || 'Команда администратора'),
      conversationPolicy: form.policy as 'reuse_active' | 'create_new',
      interactionSessionId: directActions()?.length ? selectedSession.value?.id : undefined,
      actions: directActions(),
    }
    const fingerprint = JSON.stringify(request)
    const attempt = resolveIdempotencyAttempt(fingerprint, pendingIdempotency.value)
    pendingIdempotency.value = attempt
    const result = await repository.sendAdminMessage(props.projectId, internalUserId.value, { ...request, idempotencyKey: attempt.key })
    pendingIdempotency.value = null
    toast.add({
      severity: result.duplicate ? 'info' : 'success',
      summary: result.duplicate ? 'Сообщение уже было принято' : 'Сообщение отправлено',
      detail: result.duplicate ? 'Backend вернул сохранённый результат без повторной доставки.' : `${recipient.value} получит сообщение от Lola.`,
      life: 4000,
    })
    emit('sent')
    emit('update:visible', false)
  } catch (cause) {
    error.value = adminMessageError(cause)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Dialog :visible="visible" modal :header="`Написать · ${recipient}`" :style="{ width: '560px' }" :breakpoints="{ '640px': 'calc(100vw - 24px)' }" @update:visible="emit('update:visible', $event)">
    <div class="stack">
      <div class="recipient surface-soft">
        <span :class="availableSessions.length ? 'status-dot' : 'offline-dot'" />
        <div><strong>{{ recipient }}</strong><small>{{ availableSessions.length ? `${availableSessions.length} активных сессий` : 'Пользователь сейчас offline' }}</small></div>
      </div>
      <div class="field"><label>Тип действия</label><Select v-model="form.type" :options="types" option-label="label" option-value="value" /></div>
      <div class="field"><label>Диалог</label><Select v-model="form.policy" :options="policies" option-label="label" option-value="value" /></div>
      <div v-if="availableSessions.length" class="field"><label>Активная сессия</label><Select v-model="selectedSessionId" :options="sessionOptions" option-label="label" option-value="value" /><small>Для текста backend может выбрать сессию автоматически. Кнопка или frontend-команда будет отправлена строго в выбранную сессию.</small></div>
      <template v-if="form.type === 'TEXT' || form.type === 'VOICE'">
        <div v-if="form.type === 'VOICE'" class="field"><label>Голос</label><Select v-model="form.voice" :options="['ara', 'eve', 'leo', 'rex', 'sal']" /></div>
        <div class="field"><label>{{ form.type === 'VOICE' ? 'Текст для озвучивания' : 'Сообщение' }}</label><Textarea v-model="form.text" rows="5" maxlength="10000" placeholder="Что Lola должна сказать пользователю?" /></div>
      </template>
      <template v-else-if="form.type === 'BUTTON' || form.type === 'COMMAND'">
        <div class="grid grid-2"><div v-if="form.type === 'BUTTON'" class="field"><label>Текст кнопки</label><InputText v-model="form.label" placeholder="Открыть бонусы" /></div><div class="field"><label>Действие</label><Select v-model="form.action" :options="buttonActions" option-label="label" option-value="value" /></div></div>
        <div class="field"><label>Опубликованная цель</label><Select v-model="form.target" :options="targetOptions" option-label="label" option-value="value" :loading="targetsLoading" :disabled="targetsLoading || !targetOptions.length" placeholder="Выберите активный элемент" /><small v-if="!targetsLoading && !targetOptions.length">Нет активных целей совместимого типа.</small></div>
      </template>
      <div v-else-if="form.type === 'ANIMATION'" class="field"><label>Анимация</label><Select v-model="form.animation" :options="animations" option-label="label" option-value="value" /></div>
      <template v-else-if="form.type === 'BONUS'">
        <div class="field"><label>Интеграция</label><InputText v-model="form.integrationCode" class="mono" /></div>
        <div class="grid grid-2"><div class="field"><label>Сумма</label><InputNumber v-model="form.amount" :min="1" /></div><div class="field"><label>Валюта</label><InputText v-model="form.currency" maxlength="3" /></div></div>
        <Message severity="secondary" size="small">Demo-only: действие записывается локально и не вызывается в production API.</Message>
      </template>
      <Message v-if="repository.mode === 'api' && !availableSessions.length" severity="info" size="small">Backend принимает сообщения только для online-пользователей. Кнопки и frontend-действия доступны при активной interaction session.</Message>
      <Message v-if="error" severity="error" size="small">{{ error }}</Message>
    </div>
    <template #footer><Button label="Отмена" severity="secondary" text @click="emit('update:visible', false)" /><Button label="Отправить" icon="pi pi-send" :disabled="!valid" :loading="loading" @click="send" /></template>
  </Dialog>
</template>

<style scoped>
.recipient{display:flex;align-items:center;gap:12px;padding:13px}.recipient strong,.recipient small{display:block}.recipient strong{font-size:.82rem}.recipient small{color:var(--muted);font-size:.72rem;margin-top:3px}.offline-dot{width:8px;height:8px;border-radius:50%;background:var(--text-secondary);box-shadow:0 0 0 5px var(--surface-subtle)}
</style>
