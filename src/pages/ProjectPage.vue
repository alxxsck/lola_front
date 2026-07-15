<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import MultiSelect from 'primevue/multiselect'
import Select from 'primevue/select'
import Skeleton from 'primevue/skeleton'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import AiUsageSection from '@/features/ai-usage/AiUsageSection.vue'
import { useAuthStore } from '@/features/auth/auth.store'
import SpeechSynthesisSection from '@/features/speech-synthesis/SpeechSynthesisSection.vue'
import type { RealtimeVoice } from '@/shared/api/generated/models'
import { repository } from '@/shared/api/repository'
import type { Project } from '@/shared/types/domain'

interface ProjectForm {
  name: string
  description: string
  defaultLocale: string
  supportedLocales: string[]
  assistantName: string
  systemPrompt: string
  timezone: string
  apiBaseUrl: string
  wsUrl: string
  allowedOrigins: string
  voiceEnabled: boolean
  voiceTranscriptEnabled: boolean
  voice: RealtimeVoice
  voiceInstructions: string
}

const localeOptions = [
  { label: 'Русский', value: 'ru' },
  { label: 'English', value: 'en' },
  { label: 'Español', value: 'es' },
  { label: 'Português', value: 'pt' },
  { label: 'Deutsch', value: 'de' },
  { label: 'Français', value: 'fr' },
  { label: 'Italiano', value: 'it' },
]

const voiceOptions: { label: string; value: RealtimeVoice }[] = [
  { label: 'Marin', value: 'marin' },
  { label: 'Cedar', value: 'cedar' },
  { label: 'Alloy', value: 'alloy' },
  { label: 'Ash', value: 'ash' },
  { label: 'Ballad', value: 'ballad' },
  { label: 'Coral', value: 'coral' },
  { label: 'Echo', value: 'echo' },
  { label: 'Sage', value: 'sage' },
  { label: 'Shimmer', value: 'shimmer' },
  { label: 'Verse', value: 'verse' },
]

function isRealtimeVoice(value: unknown): value is RealtimeVoice {
  return voiceOptions.some((option) => option.value === value)
}

const auth = useAuthStore()
const toast = useToast()
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const validationError = ref('')
const project = ref<Project | null>(null)
const initialSnapshot = ref('')
const form = reactive<ProjectForm>({
  name: '',
  description: '',
  defaultLocale: 'ru',
  supportedLocales: [],
  assistantName: '',
  systemPrompt: '',
  timezone: 'Europe/Madrid',
  apiBaseUrl: '',
  wsUrl: '',
  allowedOrigins: '',
  voiceEnabled: false,
  voiceTranscriptEnabled: true,
  voice: 'marin',
  voiceInstructions: '',
})

const formSnapshot = computed(() => JSON.stringify(form))
const isDirty = computed(() => Boolean(initialSnapshot.value) && formSnapshot.value !== initialSnapshot.value)
const assistantInitial = computed(() => form.assistantName.trim().slice(0, 1).toUpperCase() || 'L')

function fillForm(nextProject: Project) {
  project.value = nextProject
  Object.assign(form, {
    name: nextProject.name,
    description: nextProject.settings.description ?? '',
    defaultLocale: nextProject.defaultLocale,
    supportedLocales: [...nextProject.supportedLocales],
    assistantName: nextProject.assistantName,
    systemPrompt: nextProject.systemPrompt,
    timezone: typeof nextProject.settings.timezone === 'string' ? nextProject.settings.timezone : 'Europe/Madrid',
    apiBaseUrl: typeof nextProject.settings.apiBaseUrl === 'string' ? nextProject.settings.apiBaseUrl : '',
    wsUrl: typeof nextProject.settings.wsUrl === 'string' ? nextProject.settings.wsUrl : '',
    allowedOrigins: Array.isArray(nextProject.settings.allowedOrigins) ? nextProject.settings.allowedOrigins.join('\n') : '',
    voiceEnabled: nextProject.settings.voiceEnabled === true,
    voiceTranscriptEnabled: nextProject.settings.voiceTranscriptEnabled !== false,
    voice: isRealtimeVoice(nextProject.settings.voice) ? nextProject.settings.voice : 'marin',
    voiceInstructions: nextProject.voiceInstructions,
  })
  initialSnapshot.value = JSON.stringify(form)
}

async function loadProject() {
  const projectId = auth.project?.id
  if (!projectId) {
    error.value = 'Текущий проект не найден. Войдите заново.'
    loading.value = false
    return
  }

  loading.value = true
  error.value = ''
  try {
    fillForm(await repository.getProject(projectId))
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить настройки проекта'
  } finally {
    loading.value = false
  }
}

function validate() {
  validationError.value = ''
  if (!form.name.trim()) validationError.value = 'Укажите название проекта.'
  else if (!form.assistantName.trim()) validationError.value = 'Укажите имя ассистента.'
  else if (!form.systemPrompt.trim()) validationError.value = 'Добавьте системную инструкцию для ассистента.'
  else if (!form.supportedLocales.length) validationError.value = 'Выберите хотя бы один язык проекта.'
  else if (!form.supportedLocales.includes(form.defaultLocale)) validationError.value = 'Основной язык должен входить в список доступных языков.'
  else if (form.apiBaseUrl && !form.apiBaseUrl.startsWith('https://')) validationError.value = 'API URL должен использовать HTTPS.'
  else if (form.wsUrl && !form.wsUrl.startsWith('wss://')) validationError.value = 'WebSocket URL должен использовать WSS.'
  else if (form.voiceInstructions.length > 20_000) validationError.value = 'Инструкция для голосовой модели не должна превышать 20 000 символов.'
  return !validationError.value
}

async function saveProject() {
  if (!project.value || !validate()) return

  saving.value = true
  error.value = ''
  try {
    const savedProject = await repository.updateProject(project.value.id, {
      name: form.name.trim(),
      defaultLocale: form.defaultLocale,
      supportedLocales: [...form.supportedLocales],
      assistantName: form.assistantName.trim(),
      systemPrompt: form.systemPrompt.trim(),
      voiceInstructions: form.voiceInstructions,
      settings: {
        ...project.value.settings,
        description: form.description.trim(),
        timezone: form.timezone.trim(),
        apiBaseUrl: form.apiBaseUrl.trim(),
        wsUrl: form.wsUrl.trim(),
        allowedOrigins: form.allowedOrigins.split('\n').map((value) => value.trim()).filter(Boolean),
        voiceEnabled: form.voiceEnabled,
        voiceTranscriptEnabled: form.voiceTranscriptEnabled,
        voice: form.voice,
      },
    })
    fillForm(savedProject)
    auth.updateProject(savedProject)
    toast.add({ severity: 'success', summary: 'Настройки сохранены', detail: 'Проект и ассистент обновлены.', life: 3200 })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось сохранить настройки проекта'
    toast.add({ severity: 'error', summary: 'Ошибка сохранения', detail: error.value, life: 4500 })
  } finally {
    saving.value = false
  }
}

function confirmDiscard() {
  return !isDirty.value || window.confirm('Есть несохранённые изменения. Покинуть страницу?')
}

function beforeUnload(event: BeforeUnloadEvent) {
  if (!isDirty.value) return
  event.preventDefault()
}

onBeforeRouteLeave(confirmDiscard)
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload)
  void loadProject()
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
</script>

<template>
  <div class="page project-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">Конфигурация</div>
        <h1>Настройки проекта</h1>
        <p class="subtitle">Основные данные, языки и характер ассистента для {{ project?.name ?? auth.project?.name }}.</p>
      </div>
      <div v-if="project" class="project-status"><span class="status-dot" /><span><strong>Проект активен</strong><small class="mono">{{ project.slug }}</small></span></div>
    </header>

    <Message v-if="error" severity="error" class="page-message">
      <div class="message-row"><span>{{ error }}</span><Button v-if="!project" label="Повторить" icon="pi pi-refresh" size="small" text @click="loadProject" /></div>
    </Message>

    <div v-if="loading" class="settings-layout">
      <div class="card card-pad skeleton-card"><Skeleton width="9rem" height="1.5rem" /><Skeleton v-for="item in 4" :key="item" height="3.1rem" /></div>
      <div class="card card-pad skeleton-card"><Skeleton width="10rem" height="1.5rem" /><Skeleton height="13rem" /></div>
    </div>

    <form v-else-if="project" class="settings-layout" @submit.prevent="saveProject">
      <div class="settings-main stack">
        <section class="card card-pad settings-section">
          <div class="section-title"><span class="section-icon lime"><i class="pi pi-building" /></span><div><h2>О проекте</h2><p>Эти данные видны только администраторам.</p></div></div>
          <div class="form-grid">
            <div class="field full"><label for="project-name">Название проекта</label><InputText id="project-name" v-model="form.name" placeholder="Название продукта" :disabled="saving" /></div>
            <div class="field full"><label for="project-description">Описание</label><Textarea id="project-description" v-model="form.description" rows="4" maxlength="500" auto-resize placeholder="Коротко опишите назначение проекта" :disabled="saving" /><small>{{ form.description.length }}/500</small></div>
          </div>
        </section>

        <section class="card card-pad settings-section">
          <div class="section-title"><span class="section-icon violet"><i class="pi pi-language" /></span><div><h2>Языки</h2><p>Основной язык используется как fallback для сообщений.</p></div></div>
          <div class="form-grid columns">
            <div class="field"><label for="default-locale">Основной язык</label><Select id="default-locale" v-model="form.defaultLocale" :options="localeOptions" option-label="label" option-value="value" placeholder="Выберите язык" :disabled="saving" /></div>
            <div class="field"><label for="supported-locales">Доступные языки</label><MultiSelect id="supported-locales" v-model="form.supportedLocales" :options="localeOptions" option-label="label" option-value="value" display="chip" placeholder="Выберите языки" :max-selected-labels="3" :disabled="saving" /></div>
          </div>
        </section>

        <section class="card card-pad settings-section">
          <div class="section-title"><span class="section-icon green"><i class="pi pi-link" /></span><div><h2>Подключение продукта</h2><p>Публичные адреса SDK и разрешённые домены. Секреты здесь не отображаются.</p></div><span class="integration-unknown"><i class="pi pi-minus-circle" /> Не проверено</span></div>
          <div class="form-grid columns">
            <div class="field"><label for="api-url">Public API URL</label><InputText id="api-url" v-model="form.apiBaseUrl" class="mono" placeholder="https://api.example.com/api/v1" :disabled="saving" /></div>
            <div class="field"><label for="ws-url">WebSocket URL</label><InputText id="ws-url" v-model="form.wsUrl" class="mono" placeholder="wss://api.example.com/assistant" :disabled="saving" /></div>
            <div class="field"><label for="timezone">Часовой пояс</label><InputText id="timezone" v-model="form.timezone" placeholder="Europe/Madrid" :disabled="saving" /></div>
            <div class="field"><label for="allowed-origins">Разрешённые origins <span>по одному в строке</span></label><Textarea id="allowed-origins" v-model="form.allowedOrigins" rows="3" class="mono" placeholder="https://app.example.com" :disabled="saving" /></div>
          </div>
        </section>

        <section class="card card-pad settings-section">
          <div class="section-title"><span class="section-icon coral"><i class="pi pi-sparkles" /></span><div><h2>Ассистент</h2><p>Имя и базовая инструкция определяют голос Lola в этом проекте.</p></div></div>
          <div class="assistant-fields">
            <div class="assistant-preview"><div class="assistant-orbit"><span>{{ assistantInitial }}</span></div><small>Предпросмотр</small><strong>{{ form.assistantName || 'Имя ассистента' }}</strong></div>
            <div class="form-grid">
              <div class="field"><label for="assistant-name">Имя ассистента</label><InputText id="assistant-name" v-model="form.assistantName" placeholder="Lola" :disabled="saving" /></div>
              <div class="field"><label for="system-prompt">Системная инструкция</label><Textarea id="system-prompt" v-model="form.systemPrompt" rows="7" auto-resize placeholder="Как ассистент должен общаться и помогать пользователю?" :disabled="saving" /><small>{{ form.systemPrompt.length }} символов</small></div>
            </div>
          </div>
        </section>

        <section class="card card-pad settings-section">
          <div class="section-title"><span class="section-icon blue"><i class="pi pi-microphone" /></span><div><h2>Голосовой чат</h2><p>Настройте голосовые диалоги, голос Lola и манеру её речи.</p></div></div>
          <div class="voice-settings">
            <div class="setting-toggle surface-soft">
              <div><strong>Разрешить голосовые диалоги</strong><span>Пока настройка выключена, начать голосовой разговор нельзя.</span></div>
              <ToggleSwitch v-model="form.voiceEnabled" input-id="voice-enabled" :disabled="saving" aria-label="Разрешить голосовые диалоги" />
            </div>
            <div class="form-grid columns">
              <div class="field"><label for="voice">Голос по умолчанию</label><Select id="voice" v-model="form.voice" :options="voiceOptions" option-label="label" option-value="value" :disabled="saving || !form.voiceEnabled" /></div>
              <div class="setting-toggle compact surface-soft" :class="{ disabled: !form.voiceEnabled }">
                <div><strong>Сохранять транскрипты</strong><span>Реплики голосового диалога появятся в обычной истории сообщений.</span></div>
                <ToggleSwitch v-model="form.voiceTranscriptEnabled" input-id="voice-transcripts" :disabled="saving || !form.voiceEnabled" aria-label="Сохранять транскрипты голосового чата" />
              </div>
            </div>
            <div class="field">
              <label for="voice-instructions">Инструкция для голосовой модели</label>
              <Textarea id="voice-instructions" v-model="form.voiceInstructions" rows="6" maxlength="20000" auto-resize placeholder="Опишите тон, темп, эмоции и манеру речи" :disabled="saving" />
              <small>{{ form.voiceInstructions.length }}/20 000 символов</small>
            </div>
          </div>
        </section>
      </div>

      <aside class="settings-aside stack">
        <section class="card card-pad meta-card">
          <div class="eyebrow">Идентификаторы</div>
          <div class="meta-row"><span>Project ID</span><code>{{ project.id }}</code></div>
          <div class="meta-row"><span>Slug</span><code>{{ project.slug }}</code></div>
          <div class="meta-row"><span>Public key</span><code>{{ project.publicKey }}</code></div>
          <p><i class="pi pi-info-circle" /> Идентификаторы назначаются при создании проекта и недоступны для редактирования.</p>
        </section>

        <section class="save-card">
          <div><strong>{{ isDirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены' }}</strong><span>{{ isDirty ? 'Сохраните настройки, чтобы применить их в проекте.' : 'Настройки проекта актуальны.' }}</span></div>
          <Message v-if="validationError" severity="warn" size="small">{{ validationError }}</Message>
          <Button type="submit" label="Сохранить настройки" icon="pi pi-check" :loading="saving" :disabled="!isDirty" fluid />
        </section>
      </aside>
    </form>

    <SpeechSynthesisSection
      v-if="!loading && project"
      :project-id="project.id"
      :supported-locales="project.supportedLocales"
    />

    <AiUsageSection v-if="!loading && project" :project-id="project.id" />
  </div>
</template>

<style scoped>
.project-status{display:flex;align-items:center;gap:11px;padding:11px 14px;background:#fff;border:1px solid var(--line);border-radius:14px}.project-status>span:last-child{display:flex;flex-direction:column}.project-status strong{font-size:.78rem}.project-status small{font-size:.65rem;color:var(--muted);margin-top:2px}.page-message{margin-bottom:18px}.message-row{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%}.settings-layout{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:18px;align-items:start}.settings-section{padding:26px}.section-title{display:flex;align-items:flex-start;gap:13px;padding-bottom:21px;margin-bottom:21px;border-bottom:1px solid #eeeeea}.section-title h2{font-size:1.08rem}.section-title p{color:var(--muted);font-size:.76rem;margin:4px 0 0}.section-icon{display:grid;place-items:center;width:39px;height:39px;border-radius:12px;flex:0 0 auto}.section-icon.lime{background:#f1f8d8;color:#729500}.section-icon.violet{background:#f0edff;color:#755ce1}.section-icon.coral{background:#fff0eb;color:#d96747}.form-grid{display:grid;gap:18px}.form-grid.columns{grid-template-columns:minmax(180px,.7fr) minmax(260px,1.3fr)}.field small{font-size:.68rem;color:#999d94;text-align:right}.assistant-fields{display:grid;grid-template-columns:140px minmax(0,1fr);gap:24px}.assistant-preview{display:flex;flex-direction:column;align-items:center;padding:22px 12px;background:#f8f8f5;border:1px solid #ecece7;border-radius:17px}.assistant-orbit{display:grid;place-items:center;width:76px;height:76px;border-radius:50%;background:linear-gradient(145deg,#8e77f5,#755ce5);box-shadow:0 0 0 8px #eeebff,0 13px 26px rgba(117,92,229,.24);margin:8px 0 20px}.assistant-orbit span{font:700 1.7rem Manrope;color:#fff}.assistant-preview small{font-size:.62rem;text-transform:uppercase;letter-spacing:.09em;color:#979b92}.assistant-preview strong{font-size:.84rem;margin-top:4px;text-align:center}.settings-aside{position:sticky;top:24px}.meta-card .eyebrow{margin-bottom:14px}.meta-row{padding:12px 0;border-top:1px solid #eeeeea}.meta-row span,.meta-row code{display:block}.meta-row span{font-size:.68rem;color:var(--muted);margin-bottom:5px}.meta-row code{font-size:.72rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#343832}.meta-card p{display:flex;gap:8px;margin:14px 0 0;padding:11px;background:#f8f8f5;border-radius:11px;color:var(--muted);font-size:.68rem;line-height:1.45}.meta-card p i{margin-top:2px}.save-card{display:flex;flex-direction:column;gap:14px;padding:20px;background:#24271f;color:#fff;border-radius:18px}.save-card strong,.save-card span{display:block}.save-card strong{font-size:.83rem}.save-card span{font-size:.69rem;color:#a5aa9e;line-height:1.4;margin-top:4px}.save-card :deep(.p-message-text){font-size:.72rem}.skeleton-card{display:flex;flex-direction:column;gap:20px}.skeleton-card:nth-child(2){min-height:280px}
@media(max-width:1050px){.settings-layout{grid-template-columns:1fr}.settings-aside{position:static;display:grid;grid-template-columns:1fr 1fr}.save-card{align-self:stretch;justify-content:center}}
@media(max-width:700px){.settings-section{padding:20px}.form-grid.columns,.assistant-fields,.settings-aside{grid-template-columns:1fr}.assistant-preview{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;text-align:left;column-gap:18px}.assistant-orbit{grid-row:1/3;margin:4px 0}.assistant-preview small,.assistant-preview strong{text-align:left}.section-title{align-items:center}.project-status{width:100%}}
.section-icon.green{background:#e8f7e9;color:#469a51}.section-icon.blue{background:#e8f2fb;color:#397dad}.integration-unknown{margin-left:auto;display:flex;align-items:center;gap:7px;color:#777c72;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em}.voice-settings{display:flex;flex-direction:column;gap:18px}.setting-toggle{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:15px}.setting-toggle strong,.setting-toggle span{display:block}.setting-toggle strong{font-size:.82rem}.setting-toggle span{max-width:620px;margin-top:4px;color:var(--muted);font-size:.7rem;line-height:1.45}.setting-toggle.compact{min-height:67px}.setting-toggle.disabled{opacity:.6}
</style>
