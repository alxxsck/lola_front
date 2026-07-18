<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import { repository } from '@/shared/api/repository'
import type { ActivitySettings } from '@/shared/types/domain'

const props = defineProps<{ projectId: string; editable: boolean }>()
const emit = defineEmits<{ change: [settings: ActivitySettings] }>()
const toast = useToast()
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const settings = ref<ActivitySettings | null>(null)
const form = reactive({ timezone: 'UTC', visitInactivitySeconds: 1800, reconnectGraceSeconds: 30 })

onMounted(load)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const value = await repository.getActivitySettings(props.projectId)
    fill(value)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить настройки активности'
  } finally {
    loading.value = false
  }
}

function fill(value: ActivitySettings) {
  settings.value = value
  emit('change', value)
  Object.assign(form, {
    timezone: value.timezone,
    visitInactivitySeconds: value.visitInactivitySeconds,
    reconnectGraceSeconds: value.reconnectGraceSeconds,
  })
}

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('ru-RU', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

async function save() {
  if (!settings.value || !props.editable) return
  if (!validTimezone(form.timezone.trim())) {
    error.value = 'Укажите корректный часовой пояс IANA, например Europe/Madrid или UTC.'
    return
  }
  saving.value = true
  error.value = ''
  try {
    fill(await repository.updateActivitySettings(props.projectId, {
      timezone: form.timezone.trim(),
      visitInactivitySeconds: form.visitInactivitySeconds,
      reconnectGraceSeconds: form.reconnectGraceSeconds,
    }))
    toast.add({ severity: 'success', summary: 'Настройки активности сохранены', life: 2800 })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось сохранить настройки активности'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="settings-section card activity-settings">
    <header class="section-title">
      <span class="section-icon lime"><i class="pi pi-clock" /></span>
      <div><h2>Активность и визиты</h2><p>Границы дня активности, визита и повторного подключения задаются независимо.</p></div>
    </header>
    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
    <p v-if="loading">Загружаем настройки активности…</p>
    <form v-else-if="settings" class="activity-form" @submit.prevent="save">
      <label>
        <span>Часовой пояс IANA для дня активности</span>
        <InputText data-testid="activity-timezone" v-model="form.timezone" :disabled="!editable" />
        <small>День активности считается в этой временной зоне.</small>
      </label>
      <label>
        <span>Новый визит после паузы, секунд</span>
        <InputNumber data-testid="visit-inactivity" v-model="form.visitInactivitySeconds" :min="settings.limits.visitInactivitySeconds.min" :max="settings.limits.visitInactivitySeconds.max" :use-grouping="false" :disabled="!editable" />
        <small>Допустимо {{ settings.limits.visitInactivitySeconds.min }}–{{ settings.limits.visitInactivitySeconds.max }}.</small>
      </label>
      <label>
        <span>Период повторного подключения, секунд</span>
        <InputNumber data-testid="reconnect-grace" v-model="form.reconnectGraceSeconds" :min="settings.limits.reconnectGraceSeconds.min" :max="settings.limits.reconnectGraceSeconds.max" :use-grouping="false" :disabled="!editable" />
        <small>Переход в офлайн откладывается на {{ settings.limits.reconnectGraceSeconds.min }}–{{ settings.limits.reconnectGraceSeconds.max }} секунд.</small>
      </label>
      <Button v-if="editable" type="submit" label="Сохранить настройки активности" icon="pi pi-save" :loading="saving" />
    </form>
  </section>
</template>

<style scoped>
.activity-form { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; align-items: end; }
.activity-form label { display: grid; gap: 7px; }
.activity-form label > span { font-size: .76rem; font-weight: 700; }
.activity-form small { color: var(--text-small-muted); font-size: .68rem; line-height: 1.4; }
.activity-form :deep(button) { align-self: end; }
@media (max-width: 900px) { .activity-form { grid-template-columns: 1fr; } }
</style>
