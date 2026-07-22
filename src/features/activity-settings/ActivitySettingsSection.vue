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
      expectedVersion: settings.value.projectVersion,
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
    <header class="activity-header">
      <span class="activity-icon"><i class="pi pi-clock" /></span>
      <div>
        <h2>Активность и визиты</h2>
        <p>Определите, когда начинается новый день и завершается визит пользователя.</p>
      </div>
    </header>
    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
    <p v-if="loading" class="activity-loading"><i class="pi pi-spin pi-spinner" /> Загружаем настройки активности…</p>
    <form v-else-if="settings" class="activity-form" @submit.prevent="save">
      <div class="activity-fields">
        <label class="activity-field" for="activity-timezone">
          <span>Часовой пояс</span>
          <InputText id="activity-timezone" data-testid="activity-timezone" v-model="form.timezone" :disabled="!editable" />
          <small>IANA: Europe/Madrid или UTC. По нему считается день активности.</small>
        </label>
        <label class="activity-field" for="visit-inactivity">
          <span>Пауза между визитами, секунд</span>
          <InputNumber input-id="visit-inactivity" data-testid="visit-inactivity" v-model="form.visitInactivitySeconds" :min="settings.limits.visitInactivitySeconds.min" :max="settings.limits.visitInactivitySeconds.max" :use-grouping="false" :disabled="!editable" />
          <small>После этой паузы следующее подключение станет новым визитом. Допустимо {{ settings.limits.visitInactivitySeconds.min }}–{{ settings.limits.visitInactivitySeconds.max }}.</small>
        </label>
        <label class="activity-field" for="reconnect-grace">
          <span>Задержка перехода в офлайн, секунд</span>
          <InputNumber input-id="reconnect-grace" data-testid="reconnect-grace" v-model="form.reconnectGraceSeconds" :min="settings.limits.reconnectGraceSeconds.min" :max="settings.limits.reconnectGraceSeconds.max" :use-grouping="false" :disabled="!editable" />
          <small>Сохраняет сессию при коротком разрыве соединения. Допустимо {{ settings.limits.reconnectGraceSeconds.min }}–{{ settings.limits.reconnectGraceSeconds.max }}.</small>
        </label>
      </div>
      <footer v-if="editable" class="activity-actions">
        <p><i class="pi pi-info-circle" /> Эти параметры сохраняются отдельно от основных настроек проекта.</p>
        <Button type="submit" label="Сохранить активность" icon="pi pi-check" :loading="saving" />
      </footer>
    </form>
  </section>
</template>

<style scoped>
.activity-settings{padding:26px}.activity-header{display:flex;align-items:flex-start;gap:13px;padding-bottom:21px;margin-bottom:21px;border-bottom:1px solid var(--border-subtle)}.activity-header>div{min-width:0;flex:1}.activity-header h2{font-size:1.08rem}.activity-header p{margin:4px 0 0;color:var(--muted);font-size:.76rem;line-height:1.55}.activity-icon{display:grid;place-items:center;width:39px;height:39px;flex:0 0 auto;border-radius:12px;background:var(--project-tone-lime-soft);color:var(--project-tone-lime-foreground)}.activity-loading{display:flex;align-items:center;gap:9px;margin:0;padding:15px;border:1px solid var(--border-subtle);border-radius:14px;background:var(--surface-subtle);color:var(--text-small-muted);font-size:.72rem}.activity-form{display:flex;flex-direction:column;gap:20px}.activity-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:14px}.activity-field{display:flex;min-width:0;flex-direction:column;gap:7px;padding:15px;border:1px solid var(--border-subtle);border-radius:14px;background:var(--surface-subtle)}.activity-field>span{color:var(--text-primary);font-size:.76rem;font-weight:700;line-height:1.35}.activity-field small{min-height:2.8em;color:var(--text-small-muted);font-size:.66rem;line-height:1.4}.activity-actions{display:flex;align-items:center;justify-content:space-between;gap:18px;padding-top:18px;border-top:1px solid var(--border-subtle)}.activity-actions p{display:flex;align-items:flex-start;gap:8px;margin:0;color:var(--text-small-muted);font-size:.68rem;line-height:1.45}.activity-actions p i{margin-top:2px}.activity-actions :deep(.p-button){flex:0 0 auto}
@media(max-width:700px){.activity-settings{padding:20px}.activity-header{align-items:center}.activity-actions{align-items:stretch;flex-direction:column}.activity-actions :deep(.p-button){width:100%}}
</style>
