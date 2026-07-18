<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Skeleton from 'primevue/skeleton'
import type { SpeechSettingsResponseDto, SpeechVoiceResponseDto } from '@/shared/api/generated/models'
import { useUnsavedChangesGuard } from '@/shared/lib/use-unsaved-changes-guard'
import { fetchSpeechSettings, fetchSpeechVoices, updateSpeechSettings } from './speech-synthesis.api'
import {
  AUTO_LANGUAGE_VALUE,
  DEFAULT_VOICE_VALUE,
  createSpeechSettingsForm,
  speechSettingRange,
  toSpeechSettingsDto,
  toVoiceOption,
  validateSpeechSettings,
  type SpeechSettingsForm,
  type SpeechVoiceOption,
} from './speech-synthesis.model'

const props = defineProps<{
  projectId: string
  supportedLocales: string[]
}>()

const toast = useToast()
const loading = ref(true)
const saving = ref(false)
const isExpanded = ref(false)
const voicesLoading = ref(false)
const error = ref('')
const voicesError = ref('')
const validationError = ref('')
const response = shallowRef<SpeechSettingsResponseDto | null>(null)
const form = reactive<SpeechSettingsForm>({
  voiceId: DEFAULT_VOICE_VALUE,
  languageOverride: AUTO_LANGUAGE_VALUE,
  stability: 0.5,
})
const initialSnapshot = ref('')
const knownVoices = shallowRef<SpeechVoiceResponseDto[]>([])
let settingsController: AbortController | undefined
let voicesController: AbortController | undefined
let requestGeneration = 0
const VOICE_PAGE_SIZE = 20

const isDirty = computed(() => Boolean(initialSnapshot.value) && JSON.stringify(form) !== initialSnapshot.value)
const configured = computed(() => response.value?.integration.configured === true)
const integration = computed(() => response.value?.integration)
const serverDefaultVoiceId = computed(() => {
  const voiceId = integration.value?.defaults.voiceId
  return typeof voiceId === 'string' ? voiceId : ''
})
const hasServerDefaultVoice = computed(() => {
  return /^[A-Za-z0-9_-]{12,100}$/.test(serverDefaultVoiceId.value)
})
const serverDefaultVoice = computed(() => knownVoices.value.find((voice) => voice.id === serverDefaultVoiceId.value))

const localeNames: Record<string, string> = {
  de: 'Deutsch',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  ja: '日本語',
  pt: 'Português',
  ru: 'Русский',
}

const languageOptions = computed(() => {
  const languages = new Set(props.supportedLocales.filter((value) => /^[a-z]{2}$/.test(value)))
  for (const voice of knownVoices.value) {
    for (const language of voice.languages) if (/^[a-z]{2}$/.test(language)) languages.add(language)
  }
  if (form.languageOverride !== AUTO_LANGUAGE_VALUE) languages.add(form.languageOverride)
  return [
    { label: 'Определять автоматически', value: AUTO_LANGUAGE_VALUE },
    ...[...languages].sort().map((value) => ({ label: localeNames[value] ?? value.toUpperCase(), value })),
  ]
})

const voiceOptions = computed<SpeechVoiceOption[]>(() => {
  const options: SpeechVoiceOption[] = []
  const ids = new Set<string>()
  if (hasServerDefaultVoice.value) {
    const voiceId = serverDefaultVoiceId.value
    const voice = serverDefaultVoice.value
    ids.add(DEFAULT_VOICE_VALUE)
    options.push({
      id: DEFAULT_VOICE_VALUE,
      name: `По умолчанию: ${voice?.name ?? voiceId}`,
      meta: voice ? `ElevenLabs · ${voiceId}` : voiceId,
    })
  }
  for (const voice of knownVoices.value) {
    if (ids.has(voice.id)) continue
    ids.add(voice.id)
    options.push(toVoiceOption(voice))
  }
  if (form.voiceId && form.voiceId !== DEFAULT_VOICE_VALUE && !ids.has(form.voiceId)) {
    const current = knownVoices.value.find((voice) => voice.id === form.voiceId)
    options.push(current
      ? toVoiceOption(current)
      : { id: form.voiceId, name: 'Текущий голос', meta: form.voiceId })
  }
  return options
})

const stabilityRange = computed(() => response.value
  ? speechSettingRange(response.value, 'stability', { min: 0, max: 1 })
  : { min: 0, max: 1 })

function supportsSetting(key: keyof SpeechSettingsForm): boolean {
  return Boolean(response.value?.integration.capabilities.settings[key])
}

function fillForm(nextResponse: SpeechSettingsResponseDto) {
  response.value = nextResponse
  Object.assign(form, createSpeechSettingsForm(nextResponse))
  initialSnapshot.value = JSON.stringify(form)
  validationError.value = ''
}

async function loadVoices(
  projectId = props.projectId,
  generation = requestGeneration,
) {
  if (!configured.value || integration.value?.capabilities.voices !== true) {
    voicesLoading.value = false
    return
  }
  voicesController?.abort()
  const controller = new AbortController()
  voicesController = controller
  voicesLoading.value = true
  voicesError.value = ''
  try {
    const page = await fetchSpeechVoices(projectId, { limit: VOICE_PAGE_SIZE }, controller.signal)
    if (controller.signal.aborted || generation !== requestGeneration || projectId !== props.projectId) return
    knownVoices.value = page.items
  } catch (cause) {
    if (controller.signal.aborted || generation !== requestGeneration || projectId !== props.projectId) return
    voicesError.value = cause instanceof Error ? cause.message : 'Не удалось загрузить доступные голоса'
  } finally {
    if (!controller.signal.aborted && generation === requestGeneration) voicesLoading.value = false
  }
}

async function load() {
  const projectId = props.projectId
  const generation = ++requestGeneration
  settingsController?.abort()
  voicesController?.abort()
  const controller = new AbortController()
  settingsController = controller
  loading.value = true
  saving.value = false
  voicesLoading.value = false
  error.value = ''
  voicesError.value = ''
  response.value = null
  initialSnapshot.value = ''
  knownVoices.value = []
  try {
    const nextResponse = await fetchSpeechSettings(projectId, controller.signal)
    if (controller.signal.aborted || generation !== requestGeneration || projectId !== props.projectId) return
    fillForm(nextResponse)
    await loadVoices(projectId, generation)
  } catch (cause) {
    if (controller.signal.aborted || generation !== requestGeneration || projectId !== props.projectId) return
    error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить настройки озвучивания'
  } finally {
    if (!controller.signal.aborted && generation === requestGeneration) loading.value = false
  }
}

async function save() {
  if (!response.value || !configured.value) return
  const projectId = props.projectId
  const generation = requestGeneration
  validationError.value = validateSpeechSettings(form, response.value)
  if (validationError.value) return

  saving.value = true
  error.value = ''
  try {
    const nextResponse = await updateSpeechSettings(projectId, toSpeechSettingsDto(form))
    if (generation !== requestGeneration || projectId !== props.projectId) return
    fillForm(nextResponse)
    toast.add({
      severity: 'success',
      summary: 'Text-to-Speech сохранён',
      detail: 'Новые настройки применятся к следующим командам SPEAK_TEXT.',
      life: 3500,
    })
  } catch (cause) {
    if (generation !== requestGeneration || projectId !== props.projectId) return
    error.value = cause instanceof Error ? cause.message : 'Не удалось сохранить настройки озвучивания'
    toast.add({ severity: 'error', summary: 'Ошибка сохранения TTS', detail: error.value, life: 4500 })
  } finally {
    if (generation === requestGeneration) saving.value = false
  }
}

watch(() => props.projectId, () => void load(), { flush: 'sync' })

useUnsavedChangesGuard(isDirty, 'Есть несохранённые настройки Text-to-Speech. Покинуть страницу?')

onMounted(() => void load())
onBeforeUnmount(() => {
  requestGeneration += 1
  settingsController?.abort()
  voicesController?.abort()
})
</script>

<template>
  <section class="tts-section card" :class="{ collapsed: !isExpanded }" aria-labelledby="tts-title">
    <header class="tts-header">
      <div class="tts-heading">
        <span class="tts-icon"><i class="pi pi-volume-up" /></span>
        <div>
          <h2 id="tts-title">Озвучивание текста</h2>
          <p>Команды SPEAK_TEXT озвучиваются через ElevenLabs. Настройте голос тут.</p>
        </div>
      </div>
      <div class="tts-header-actions">
        <div v-if="integration" class="provider-state" :class="{ ready: configured }">
          <span class="provider-dot" />
          <span><strong>{{ integration.name }} · {{ integration.model }}</strong><small>{{ configured ? 'Провайдер подключён' : 'Провайдер не настроен' }}</small></span>
        </div>
        <Button
          type="button"
          :icon="isExpanded ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
          severity="secondary"
          text
          rounded
          :aria-label="isExpanded ? 'Свернуть настройки озвучивания' : 'Развернуть настройки озвучивания'"
          :aria-expanded="isExpanded"
          aria-controls="tts-content"
          @click="isExpanded = !isExpanded"
        />
      </div>
    </header>

    <div id="tts-content" v-show="isExpanded" class="tts-content">
      <Message v-if="error" severity="error" :closable="false">
        <div class="message-row"><span>{{ error }}</span><Button v-if="!response" label="Повторить" icon="pi pi-refresh" size="small" text @click="load" /></div>
      </Message>

      <div v-if="loading" class="tts-skeleton" aria-label="Загрузка настроек Text-to-Speech">
        <Skeleton height="5rem" border-radius="14px" />
        <div><Skeleton v-for="item in 2" :key="item" height="4.7rem" border-radius="14px" /></div>
      </div>

      <form v-else-if="response" class="tts-form" @submit.prevent="save">
      <Message v-if="!configured" severity="warn" :closable="false">
        ElevenLabs не настроен на backend. Добавьте server API key и голос по умолчанию перед изменением TTS.
      </Message>

      <div class="tts-provider-note">
        <span><i class="pi pi-wave-pulse" /><strong>PCM16 mono · 24 kHz</strong></span>
        <span><i class="pi pi-align-left" /><strong>До 5 000 символов</strong></span>
        <span><i class="pi pi-bolt" /><strong>Потоковая выдача</strong></span>
      </div>

      <div class="voice-panel">
        <div class="field">
          <label for="tts-voice">Голос для озвучивания текста</label>
          <Select
            id="tts-voice"
            v-model="form.voiceId"
            :options="voiceOptions"
            option-label="name"
            option-value="id"
            :loading="voicesLoading"
            :disabled="saving || !configured"
            placeholder="Выберите голос"
          >
            <template #option="{ option }">
              <span class="voice-option"><strong>{{ option.name }}</strong><small>{{ option.meta }}</small></span>
            </template>
          </Select>
          <small v-if="form.voiceId === DEFAULT_VOICE_VALUE">Server default: {{ serverDefaultVoice?.name ?? serverDefaultVoiceId }}. ID голоса не сохраняется в проекте.</small>
          <small v-else-if="!form.voiceId">На backend нет голоса по умолчанию — выберите голос проекта.</small>
        </div>
        <Message v-if="voicesError" severity="warn" size="small" :closable="false">
          <div class="message-row"><span>{{ voicesError }}</span><Button label="Повторить" size="small" text @click="loadVoices()" /></div>
        </Message>
      </div>

      <div class="settings-grid">
        <div v-if="response.integration.capabilities.languageOverride" class="field setting-field">
          <label for="tts-language">Язык текста</label>
          <Select id="tts-language" v-model="form.languageOverride" :options="languageOptions" option-label="label" option-value="value" :disabled="saving || !configured" />
          <small>Auto-detection подходит для многоязычных сценариев.</small>
        </div>
        <div v-if="supportsSetting('stability')" class="field setting-field">
          <label for="tts-stability">Стабильность</label>
          <InputNumber id="tts-stability" v-model="form.stability" :min="stabilityRange.min" :max="stabilityRange.max" :min-fraction-digits="2" :max-fraction-digits="2" :step="0.05" :disabled="saving || !configured" />
          <small>Ниже — эмоциональнее, выше — стабильнее. Темп и подачу задавайте audio tags в тексте.</small>
        </div>
      </div>

      <footer class="tts-save">
        <div><strong>{{ isDirty ? 'Есть несохранённые TTS-настройки' : 'Text-to-Speech настроен' }}</strong><span>Изменения относятся только к SPEAK_TEXT и не влияют на голосовой чат.</span></div>
        <Message v-if="validationError" severity="warn" size="small">{{ validationError }}</Message>
        <Button type="submit" label="Сохранить Text-to-Speech" icon="pi pi-check" :loading="saving" :disabled="!isDirty || !configured" />
      </footer>
      </form>
    </div>
  </section>
</template>

<style scoped>
.tts-section{margin-top:22px;padding:26px}.tts-header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding-bottom:22px;margin-bottom:22px;border-bottom:1px solid var(--border-subtle)}.tts-section.collapsed .tts-header{padding-bottom:0;margin-bottom:0;border-bottom:0}.tts-heading{display:flex;align-items:flex-start;gap:14px}.tts-heading h2{font-size:1.18rem}.tts-heading p{max-width:680px;margin:5px 0 0;color:var(--muted);font-size:.76rem;line-height:1.5}.tts-icon{display:grid;place-items:center;width:43px;height:43px;flex:0 0 auto;border-radius:13px;background:var(--project-tone-coral-soft);color:var(--project-tone-coral-foreground);box-shadow:inset 0 0 0 1px var(--border-default)}.tts-header-actions{display:flex;align-items:center;gap:8px}.provider-state{display:flex;align-items:center;gap:9px;min-width:190px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--status-danger) 25%,var(--border-default));border-radius:13px;background:var(--status-danger-soft)}.provider-state.ready{border-color:color-mix(in srgb,var(--status-success) 25%,var(--border-default));background:var(--status-success-soft)}.provider-state>span:last-child{display:flex;flex-direction:column}.provider-state strong{font-size:.7rem}.provider-state small{margin-top:2px;color:var(--status-danger-text);font-size:.61rem}.provider-state.ready small{color:var(--status-success-text)}.provider-dot{width:8px;height:8px;border-radius:50%;background:var(--status-danger);box-shadow:0 0 0 4px var(--status-danger-soft)}.provider-state.ready .provider-dot{background:var(--status-success);box-shadow:0 0 0 4px var(--status-success-soft)}.tts-content{display:flex;flex-direction:column;gap:20px}.message-row{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%}.tts-skeleton{display:flex;flex-direction:column;gap:18px}.tts-skeleton>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.tts-form{display:flex;flex-direction:column;gap:20px}.tts-provider-note{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.tts-provider-note span{display:flex;align-items:center;gap:9px;padding:12px 14px;border:1px solid var(--border-default);border-radius:12px;background:var(--surface-subtle);color:var(--text-small-muted);font-size:.7rem}.tts-provider-note i{color:var(--text-brand)}.voice-panel{padding:20px;border:1px solid var(--border-default);border-radius:17px;background:var(--surface-card)}.voice-option{display:flex;min-width:0;flex-direction:column}.voice-option strong{font-size:.75rem}.voice-option small{overflow:hidden;margin-top:2px;color:var(--muted);font-size:.62rem;text-overflow:ellipsis;white-space:nowrap}.settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.setting-field{min-height:106px;padding:16px;border:1px solid var(--border-default);border-radius:14px;background:var(--surface-subtle)}.setting-field small{min-height:1.9em;text-align:left;line-height:1.4}.tts-save{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px 20px;border-radius:16px;background:var(--surface-emphasis);color:var(--text-on-emphasis)}.tts-save>div{min-width:180px}.tts-save strong,.tts-save span{display:block}.tts-save strong{font-size:.8rem}.tts-save span{margin-top:4px;color:var(--text-on-emphasis-muted);font-size:.66rem}.tts-save :deep(.p-message){flex:1;margin:0}.tts-save :deep(.p-message-text){font-size:.69rem}
@media(max-width:900px){.tts-header{flex-direction:column}.provider-state{width:100%}.settings-grid{grid-template-columns:1fr}.tts-save{align-items:stretch;flex-direction:column}.tts-save :deep(.p-button){width:100%}.tts-provider-note{grid-template-columns:1fr}}
@media(max-width:650px){.tts-section{padding:20px}.tts-heading p{line-height:1.45}.tts-skeleton>div{grid-template-columns:1fr}}
</style>
