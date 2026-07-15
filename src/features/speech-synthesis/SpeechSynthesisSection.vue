<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Skeleton from 'primevue/skeleton'
import ToggleSwitch from 'primevue/toggleswitch'
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
const voicesLoading = ref(false)
const error = ref('')
const voicesError = ref('')
const validationError = ref('')
const response = shallowRef<SpeechSettingsResponseDto | null>(null)
const form = reactive<SpeechSettingsForm>({
  voiceId: DEFAULT_VOICE_VALUE,
  languageOverride: AUTO_LANGUAGE_VALUE,
  stability: 0.5,
  similarityBoost: 0.75,
  style: 0,
  speed: 1,
  seed: null,
  applyTextNormalization: 'auto',
  applyLanguageTextNormalization: false,
})
const initialSnapshot = ref('')
const voiceSearch = ref('')
const visibleVoices = shallowRef<SpeechVoiceResponseDto[]>([])
const knownVoices = shallowRef<SpeechVoiceResponseDto[]>([])
const nextCursor = ref<string | null>(null)
const hasMoreVoices = ref(false)
let settingsController: AbortController | undefined
let voicesController: AbortController | undefined
let searchTimer: ReturnType<typeof setTimeout> | undefined
let requestGeneration = 0
const VOICE_PAGE_SIZE = 20

const isDirty = computed(() => Boolean(initialSnapshot.value) && JSON.stringify(form) !== initialSnapshot.value)
const configured = computed(() => response.value?.integration.configured === true)
const integration = computed(() => response.value?.integration)
const effectiveVoiceId = computed(() => {
  if (form.voiceId !== DEFAULT_VOICE_VALUE) return form.voiceId
  const voiceId = integration.value?.defaults.voiceId
  return typeof voiceId === 'string' ? voiceId : ''
})
const selectedVoice = computed(() => knownVoices.value.find((voice) => voice.id === effectiveVoiceId.value))
const selectedPreviewUrl = computed(() => selectedVoice.value?.previewUrl ?? null)
const selectedVoiceDescription = computed(() => selectedVoice.value?.description ?? '')
const hasServerDefaultVoice = computed(() => {
  const voiceId = integration.value?.defaults.voiceId
  return typeof voiceId === 'string' && /^[A-Za-z0-9_-]{12,100}$/.test(voiceId)
})

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
    ids.add(DEFAULT_VOICE_VALUE)
    options.push({
      id: DEFAULT_VOICE_VALUE,
      name: 'Системный голос по умолчанию',
      meta: 'Настраивается на backend',
    })
  }
  for (const voice of visibleVoices.value) {
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

const normalizationOptions = [
  { label: 'Автоматически', value: 'auto' },
  { label: 'Всегда нормализовать', value: 'on' },
  { label: 'Не нормализовать', value: 'off' },
]

const stabilityRange = computed(() => response.value
  ? speechSettingRange(response.value, 'stability', { min: 0, max: 1 })
  : { min: 0, max: 1 })
const similarityRange = computed(() => response.value
  ? speechSettingRange(response.value, 'similarityBoost', { min: 0, max: 1 })
  : { min: 0, max: 1 })
const styleRange = computed(() => response.value
  ? speechSettingRange(response.value, 'style', { min: 0, max: 1 })
  : { min: 0, max: 1 })
const speedRange = computed(() => response.value
  ? speechSettingRange(response.value, 'speed', { min: 0.7, max: 1.2 })
  : { min: 0.7, max: 1.2 })

function supportsSetting(key: keyof SpeechSettingsForm): boolean {
  return Boolean(response.value?.integration.capabilities.settings[key])
}

function fillForm(nextResponse: SpeechSettingsResponseDto) {
  response.value = nextResponse
  Object.assign(form, createSpeechSettingsForm(nextResponse))
  initialSnapshot.value = JSON.stringify(form)
  validationError.value = ''
}

function mergeKnownVoices(items: SpeechVoiceResponseDto[]) {
  const voices = new Map(knownVoices.value.map((voice) => [voice.id, voice]))
  for (const voice of items) voices.set(voice.id, voice)
  knownVoices.value = [...voices.values()]
}

async function loadVoices(
  reset = true,
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
    const page = await fetchSpeechVoices(projectId, {
      search: voiceSearch.value.trim() || undefined,
      cursor: reset ? undefined : nextCursor.value ?? undefined,
      limit: VOICE_PAGE_SIZE,
    }, controller.signal)
    if (controller.signal.aborted || generation !== requestGeneration || projectId !== props.projectId) return
    visibleVoices.value = reset ? page.items : [...visibleVoices.value, ...page.items]
    mergeKnownVoices(page.items)
    nextCursor.value = page.nextCursor ?? null
    hasMoreVoices.value = page.hasMore && Boolean(page.nextCursor)
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
  if (searchTimer) clearTimeout(searchTimer)
  const controller = new AbortController()
  settingsController = controller
  loading.value = true
  saving.value = false
  voicesLoading.value = false
  error.value = ''
  voicesError.value = ''
  response.value = null
  initialSnapshot.value = ''
  visibleVoices.value = []
  knownVoices.value = []
  try {
    const nextResponse = await fetchSpeechSettings(projectId, controller.signal)
    if (controller.signal.aborted || generation !== requestGeneration || projectId !== props.projectId) return
    fillForm(nextResponse)
    await loadVoices(true, projectId, generation)
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

watch(voiceSearch, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => void loadVoices(), 300)
})

watch(() => props.projectId, () => void load(), { flush: 'sync' })

useUnsavedChangesGuard(isDirty, 'Есть несохранённые настройки Text-to-Speech. Покинуть страницу?')

onMounted(() => void load())
onBeforeUnmount(() => {
  requestGeneration += 1
  settingsController?.abort()
  voicesController?.abort()
  if (searchTimer) clearTimeout(searchTimer)
})
</script>

<template>
  <section class="tts-section card" aria-labelledby="tts-title">
    <header class="tts-header">
      <div class="tts-heading">
        <span class="tts-icon"><i class="pi pi-volume-up" /></span>
        <div>
          <div class="eyebrow">Text-to-Speech · SPEAK_TEXT</div>
          <h2 id="tts-title">Озвучивание текста</h2>
          <p>Команды SPEAK_TEXT озвучиваются через ElevenLabs. Настройки OpenAI Realtime-диалогов выше остаются без изменений.</p>
        </div>
      </div>
      <div v-if="integration" class="provider-state" :class="{ ready: configured }">
        <span class="provider-dot" />
        <span><strong>{{ integration.name }} · {{ integration.model }}</strong><small>{{ configured ? 'Провайдер подключён' : 'Провайдер не настроен' }}</small></span>
      </div>
    </header>

    <Message v-if="error" severity="error" :closable="false">
      <div class="message-row"><span>{{ error }}</span><Button v-if="!response" label="Повторить" icon="pi pi-refresh" size="small" text @click="load" /></div>
    </Message>

    <div v-if="loading" class="tts-skeleton" aria-label="Загрузка настроек Text-to-Speech">
      <Skeleton height="5rem" border-radius="14px" />
      <div><Skeleton v-for="item in 4" :key="item" height="4.7rem" border-radius="14px" /></div>
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
        <div class="voice-panel-copy">
          <h3>Голос ElevenLabs</h3>
          <p>Показываем по 20 доступных голосов. Поиск и следующие страницы идут через backend, поэтому API key ElevenLabs не попадает в браузер.</p>
        </div>
        <div class="voice-fields">
          <div class="field">
            <label for="tts-voice-search">Поиск по каталогу</label>
            <span class="search-input"><i class="pi pi-search" /><InputText id="tts-voice-search" v-model="voiceSearch" maxlength="100" placeholder="Имя или описание голоса" :disabled="!configured" /></span>
          </div>
          <div class="field">
            <label for="tts-voice">Голос для SPEAK_TEXT</label>
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
          <small v-if="form.voiceId === DEFAULT_VOICE_VALUE">Будет использован server default без сохранения его ID в проекте.</small>
          <small v-else-if="!form.voiceId">На backend нет голоса по умолчанию — выберите голос проекта.</small>
          </div>
        </div>
        <Message v-if="voicesError" severity="warn" size="small" :closable="false">
          <div class="message-row"><span>{{ voicesError }}</span><Button label="Повторить" size="small" text @click="loadVoices()" /></div>
        </Message>
        <Button v-if="hasMoreVoices" type="button" label="Загрузить ещё голоса" icon="pi pi-plus" severity="secondary" text :loading="voicesLoading" @click="loadVoices(false)" />
        <div v-if="selectedVoice" class="voice-preview surface-soft">
          <span><strong>{{ selectedVoice.name }}</strong><small>{{ selectedVoiceDescription || selectedVoice.id }}</small></span>
          <audio v-if="selectedPreviewUrl" :src="selectedPreviewUrl" controls preload="none" :aria-label="`Предпрослушивание голоса ${selectedVoice.name}`">Предпрослушивание голоса не поддерживается браузером.</audio>
          <span v-else class="preview-unavailable"><i class="pi pi-volume-off" /> Превью недоступно</span>
        </div>
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
          <small>Ниже — эмоциональнее, выше — стабильнее.</small>
        </div>
        <div v-if="supportsSetting('similarityBoost')" class="field setting-field">
          <label for="tts-similarity">Сходство с голосом</label>
          <InputNumber id="tts-similarity" v-model="form.similarityBoost" :min="similarityRange.min" :max="similarityRange.max" :min-fraction-digits="2" :max-fraction-digits="2" :step="0.05" :disabled="saving || !configured" />
          <small>Насколько близко держаться к исходному голосу.</small>
        </div>
        <div v-if="supportsSetting('style')" class="field setting-field">
          <label for="tts-style">Выразительность</label>
          <InputNumber id="tts-style" v-model="form.style" :min="styleRange.min" :max="styleRange.max" :min-fraction-digits="2" :max-fraction-digits="2" :step="0.05" :disabled="saving || !configured" />
          <small>Усиливает стиль и эмоциональную подачу.</small>
        </div>
        <div v-if="supportsSetting('speed')" class="field setting-field">
          <label for="tts-speed">Скорость</label>
          <InputNumber id="tts-speed" v-model="form.speed" :min="speedRange.min" :max="speedRange.max" :min-fraction-digits="2" :max-fraction-digits="2" :step="0.05" suffix="×" :disabled="saving || !configured" />
          <small>Допустимый диапазон {{ speedRange.min }}–{{ speedRange.max }}×.</small>
        </div>
        <div v-if="supportsSetting('seed')" class="field setting-field">
          <label for="tts-seed">Seed</label>
          <InputNumber id="tts-seed" v-model="form.seed" :min="0" :max="4294967295" :use-grouping="false" placeholder="Случайный" :disabled="saving || !configured" />
          <small>Одинаковый seed делает результат более воспроизводимым.</small>
        </div>
        <div v-if="supportsSetting('applyTextNormalization')" class="field setting-field">
          <label for="tts-normalization">Нормализация текста</label>
          <Select id="tts-normalization" v-model="form.applyTextNormalization" :options="normalizationOptions" option-label="label" option-value="value" :disabled="saving || !configured" />
          <small>Преобразование чисел, дат и сокращений перед озвучиванием.</small>
        </div>
        <div v-if="supportsSetting('applyLanguageTextNormalization')" class="normalization-toggle surface-soft">
          <div><strong>Языковая нормализация</strong><span>Поддерживается только для японского и может увеличить задержку.</span></div>
          <ToggleSwitch v-model="form.applyLanguageTextNormalization" input-id="tts-language-normalization" :disabled="saving || !configured" aria-label="Языковая нормализация ElevenLabs" />
        </div>
      </div>

      <footer class="tts-save">
        <div><strong>{{ isDirty ? 'Есть несохранённые TTS-настройки' : 'Text-to-Speech настроен' }}</strong><span>Изменения относятся только к SPEAK_TEXT и не влияют на голосовой чат.</span></div>
        <Message v-if="validationError" severity="warn" size="small">{{ validationError }}</Message>
        <Button type="submit" label="Сохранить Text-to-Speech" icon="pi pi-check" :loading="saving" :disabled="!isDirty || !configured" />
      </footer>
    </form>
  </section>
</template>

<style scoped>
.tts-section{margin-top:22px;padding:26px}.tts-header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding-bottom:22px;margin-bottom:22px;border-bottom:1px solid #ecece7}.tts-heading{display:flex;align-items:flex-start;gap:14px}.tts-heading h2{font-size:1.18rem}.tts-heading p{max-width:680px;margin:5px 0 0;color:var(--muted);font-size:.76rem;line-height:1.5}.tts-icon{display:grid;place-items:center;width:43px;height:43px;flex:0 0 auto;border-radius:13px;background:#fff0eb;color:#d96747;box-shadow:inset 0 0 0 1px #f7ded5}.provider-state{display:flex;align-items:center;gap:9px;min-width:190px;padding:10px 12px;border:1px solid #eadfd9;border-radius:13px;background:#fff8f5}.provider-state.ready{border-color:#dce9be;background:#f7fbe9}.provider-state>span:last-child{display:flex;flex-direction:column}.provider-state strong{font-size:.7rem}.provider-state small{margin-top:2px;color:var(--muted);font-size:.61rem}.provider-dot{width:8px;height:8px;border-radius:50%;background:#d76e4f;box-shadow:0 0 0 4px #f6ddd5}.provider-state.ready .provider-dot{background:#88aa29;box-shadow:0 0 0 4px #e6efcd}.message-row{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%}.tts-skeleton{display:flex;flex-direction:column;gap:18px}.tts-skeleton>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.tts-form{display:flex;flex-direction:column;gap:20px}.tts-provider-note{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.tts-provider-note span{display:flex;align-items:center;gap:9px;padding:12px 14px;border:1px solid #e7e8e2;border-radius:12px;background:#fafbf7;color:#62675d;font-size:.7rem}.tts-provider-note i{color:#8ca52e}.voice-panel{padding:20px;border:1px solid #e6e7e1;border-radius:17px;background:#fff}.voice-panel-copy h3{font-size:.91rem}.voice-panel-copy p{margin:4px 0 18px;color:var(--muted);font-size:.69rem}.voice-fields{display:grid;grid-template-columns:minmax(220px,.8fr) minmax(300px,1.2fr);gap:16px}.search-input{position:relative}.search-input i{position:absolute;z-index:1;top:50%;left:12px;transform:translateY(-50%);color:#999e94;font-size:.75rem}.search-input :deep(input){padding-left:34px}.voice-option{display:flex;min-width:0;flex-direction:column}.voice-option strong{font-size:.75rem}.voice-option small{overflow:hidden;margin-top:2px;color:var(--muted);font-size:.62rem;text-overflow:ellipsis;white-space:nowrap}.voice-preview{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:16px;padding:14px}.voice-preview>span:first-child{min-width:0}.voice-preview strong,.voice-preview small{display:block}.voice-preview strong{font-size:.78rem}.voice-preview small{overflow:hidden;max-width:480px;margin-top:3px;color:var(--muted);font-size:.65rem;text-overflow:ellipsis;white-space:nowrap}.voice-preview audio{width:min(310px,45%);height:34px}.preview-unavailable{color:var(--muted);font-size:.67rem}.settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.setting-field,.normalization-toggle{min-height:106px;padding:16px;border:1px solid #e7e8e2;border-radius:14px;background:#fafbf7}.setting-field small{min-height:1.9em;text-align:left;line-height:1.4}.normalization-toggle{display:flex;align-items:center;justify-content:space-between;gap:16px}.normalization-toggle strong,.normalization-toggle span{display:block}.normalization-toggle strong{font-size:.78rem}.normalization-toggle span{max-width:390px;margin-top:4px;color:var(--muted);font-size:.66rem;line-height:1.4}.tts-save{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px 20px;border-radius:16px;background:#252920;color:#fff}.tts-save>div{min-width:180px}.tts-save strong,.tts-save span{display:block}.tts-save strong{font-size:.8rem}.tts-save span{margin-top:4px;color:#aeb3a8;font-size:.66rem}.tts-save :deep(.p-message){flex:1;margin:0}.tts-save :deep(.p-message-text){font-size:.69rem}
@media(max-width:1100px){.voice-fields{grid-template-columns:1fr}}
@media(max-width:900px){.tts-header{flex-direction:column}.provider-state{width:100%}.settings-grid{grid-template-columns:1fr}.tts-save{align-items:stretch;flex-direction:column}.tts-save :deep(.p-button){width:100%}.tts-provider-note{grid-template-columns:1fr}.voice-preview{align-items:flex-start;flex-direction:column}.voice-preview audio{width:100%}}
@media(max-width:650px){.tts-section{padding:20px}.tts-heading p{line-height:1.45}.tts-skeleton>div{grid-template-columns:1fr}}
</style>
