<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/features/auth/auth.store'
import { DocumentationCallout } from '@/features/documentation/ui'
import { eventDefinitionError, type EventDefinitionError } from '@/features/events/event-definition-error'
import { buildEventSchemaExample, parseEventSchema, serializeEventSchema, validateEventSchemaDraft } from '@/features/event-schema/model/event-schema'
import type { EventSchemaDraft, EventSchemaDraftIssue } from '@/features/event-schema/model/event-schema'
import { findCatalogEventForDefinition } from '@/features/event-schema/model/event-schema-capability'
import EventPayloadStudio from '@/features/event-schema/ui/EventPayloadStudio.vue'
import EventDefinitionHistory from '@/features/events/EventDefinitionHistory.vue'
import { repository } from '@/shared/api/repository'
import { scenarioAuthoringRepository } from '@/shared/api/repository/scenario-authoring'
import type { ScenarioAuthoringContract } from '@/shared/api/repository/scenario-authoring'
import { slugify } from '@/shared/lib/format'
import { useUnsavedChangesGuard } from '@/shared/lib/use-unsaved-changes-guard'
import type { EventDefinition } from '@/shared/types/domain'

interface EventForm {
  id?: string
  name: string
  code: string
  description: string
  enabled: boolean
  clientIngestible: boolean
  countsAsActivity: boolean
  schema: EventSchemaDraft
}

type EventPayload = Partial<EventDefinition> & Pick<EventDefinition, 'name' | 'code' | 'payloadSchema'>

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const events = ref<EventDefinition[]>([])
const search = ref('')
const loading = ref(true)
const saving = ref(false)
const togglingId = ref<string | null>(null)
const loadError = ref('')
const catalogError = ref('')
const authoringContract = ref<ScenarioAuthoringContract | null>(null)
const formError = ref<EventDefinitionError | null>(null)
const dialogVisible = ref(false)
const eventFormStep = ref(0)
const nameError = ref('')
const codeError = ref('')
const schemaIssues = ref<EventSchemaDraftIssue[]>([])
const formErrorSummary = ref<HTMLElement | null>(null)
const eventStepPanel = ref<HTMLElement | null>(null)
const payloadStudio = ref<{ discardAdvancedDraft?: () => void } | null>(null)
const hasTechnicalDraft = ref(false)
const codeTouched = ref(false)
const form = ref<EventForm>(emptyForm())
const canManage = computed(() => auth.user?.role === 'OWNER' || auth.user?.role === 'ADMIN')
const initialFormSnapshot = ref('')
const initialSchemaSnapshot = ref('')
const baselineSchema = ref<Record<string, unknown> | undefined>()
const isFormDirty = computed(() => dialogVisible.value && (
  hasTechnicalDraft.value
  || (Boolean(initialFormSnapshot.value) && JSON.stringify(form.value) !== initialFormSnapshot.value)
))
const { confirmDiscard } = useUnsavedChangesGuard(isFormDirty, 'Есть несохранённые изменения события. Закрыть форму?')

const eventSteps = [
  { label: 'Смысл', description: 'Что произошло' },
  { label: 'Данные', description: 'Какие поля придут' },
  { label: 'Пример', description: 'Как выглядит событие' },
  { label: 'Изменения', description: 'Что будет опубликовано' },
] as const

const activeStudioSection = computed(() => (['payload', 'sample', 'review'] as const)[eventFormStep.value - 1])

const filteredEvents = computed(() => {
  const query = search.value.trim().toLowerCase()
  return events.value
    .filter((item) => !query || item.name.toLowerCase().includes(query) || item.code.toLowerCase().includes(query))
    .sort((left, right) => Number(isSystemEvent(right)) - Number(isSystemEvent(left)))
})

const eventExample = computed(() => JSON.stringify({
  userId: 'customer_12345',
  externalEventId: 'event_12345',
  eventCode: form.value.code.trim(),
  payload: buildEventSchemaExample(form.value.schema),
}, null, 2))
const enabledCount = computed(() => events.value.filter((item) => item.enabled).length)
const catalogEvent = computed(() => findCatalogEventForDefinition(authoringContract.value, form.value.id))

onMounted(async () => {
  await loadEvents()
  await loadAuthoringContract()
  const requestedEvent = typeof route.query.event === 'string' ? route.query.event : ''
  const item = events.value.find((event) => event.id === requestedEvent || event.code === requestedEvent)
  if (item) openEdit(item)
})

function emptyForm(): EventForm {
  return {
    name: '',
    code: '',
    description: '',
    enabled: true,
    clientIngestible: false,
    countsAsActivity: false,
    schema: parseEventSchema({ type: 'object', additionalProperties: false, properties: {}, required: [] }),
  }
}

async function loadEvents() {
  const projectId = auth.project?.id
  if (!projectId) return
  loading.value = true
  loadError.value = ''
  try {
    events.value = await repository.getEvents(projectId)
  } catch (cause) {
    loadError.value = errorMessage(cause, 'Не удалось загрузить события')
  } finally {
    loading.value = false
  }
}

async function loadAuthoringContract() {
  const projectId = auth.project?.id
  if (!projectId || repository.mode === 'mock') return
  catalogError.value = ''
  try {
    authoringContract.value = await scenarioAuthoringRepository.getContract(projectId)
  } catch (cause) {
    catalogError.value = errorMessage(cause, 'Не удалось загрузить capabilities сценариев')
  }
}

function openCreate() {
  if (!canManage.value) return
  form.value = emptyForm()
  codeTouched.value = false
  formError.value = null
  resetLocalValidation()
  eventFormStep.value = 0
  hasTechnicalDraft.value = false
  initialSchemaSnapshot.value = ''
  baselineSchema.value = undefined
  initialFormSnapshot.value = JSON.stringify(form.value)
  dialogVisible.value = true
}

function openEdit(item: EventDefinition) {
  return router.push({
    name: 'event-definition-workspace',
    params: { definitionKeyId: item.definitionKeyId ?? item.id },
  })
}

function requestDialogVisibility(value: boolean) {
  if (value) {
    dialogVisible.value = true
    return
  }
  afterTechnicalDraftGuard(() => {
    if (!confirmDiscard()) return
    dialogVisible.value = false
  })
}

function onEventNameInput() {
  nameError.value = ''
  if (!codeTouched.value && !form.value.id) form.value.code = slugify(form.value.name)
}

function onEventCodeInput() {
  codeTouched.value = true
  codeError.value = ''
}

async function copyEventExample() {
  try {
    await navigator.clipboard.writeText(eventExample.value)
    toast.add({ severity: 'success', summary: 'JSON скопирован', life: 2200 })
  } catch {
    toast.add({ severity: 'error', summary: 'Не удалось скопировать', detail: 'Выделите и скопируйте JSON вручную.', life: 3200 })
  }
}

function resetLocalValidation() {
  nameError.value = ''
  codeError.value = ''
  schemaIssues.value = []
}

function validateMeaning(): string | null {
  nameError.value = form.value.name.trim() ? '' : 'Укажите понятное название события.'
  codeError.value = !/^[a-z][a-z0-9_.-]*$/.test(form.value.code.trim())
    ? 'Имя для интеграции должно начинаться с латинской буквы и содержать только a–z, 0–9, точку, дефис или подчёркивание.'
    : !form.value.id && events.value.some((item) => item.code === form.value.code.trim())
      ? 'Событие с таким именем для интеграции уже существует.'
      : ''
  return nameError.value || codeError.value || null
}

function validatePayload(): string | null {
  schemaIssues.value = validateEventSchemaDraft(form.value.schema)
  return schemaIssues.value[0]?.message ?? null
}

function showLocalError(message: string, step: number) {
  formError.value = { message, scenarios: [] }
  eventFormStep.value = step
  void nextTick(() => formErrorSummary.value?.focus())
}

function setStep(step: number) {
  formError.value = null
  eventFormStep.value = step
  void nextTick(() => eventStepPanel.value?.focus())
}

function goToStep(step: number) {
  if (step === eventFormStep.value) return
  afterTechnicalDraftGuard(() => setStep(step))
}

function goToNextStep() {
  const error = eventFormStep.value === 0
    ? validateMeaning()
    : eventFormStep.value === 1
      ? validatePayload()
      : null
  if (error) {
    showLocalError(error, eventFormStep.value)
    return
  }
  afterTechnicalDraftGuard(() => setStep(Math.min(3, eventFormStep.value + 1)))
}

function afterTechnicalDraftGuard(action: () => void) {
  if (!hasTechnicalDraft.value) {
    action()
    return
  }
  confirm.require({
    header: 'Отменить изменения JSON?',
    message: 'В технических деталях есть неприменённые изменения. Они не попадут в настройку события.',
    rejectLabel: 'Продолжить редактирование',
    acceptLabel: 'Отменить изменения',
    accept: () => {
      payloadStudio.value?.discardAdvancedDraft?.()
      hasTechnicalDraft.value = false
      action()
    },
  })
}

function updateSchema(schema: EventSchemaDraft) {
  form.value.schema = schema
  schemaIssues.value = []
}

function focusFirstSchemaIssue() {
  const fieldId = schemaIssues.value[0]?.fieldId
  if (fieldId) document.getElementById(`field-wire-${fieldId}`)?.focus()
}

function submitEvent() {
  const projectId = auth.project?.id
  if (!projectId) return
  const meaningError = validateMeaning()
  if (meaningError) {
    showLocalError(meaningError, 0)
    return
  }
  const payloadError = validatePayload()
  if (payloadError) {
    showLocalError(payloadError, 1)
    return
  }
  formError.value = null

  const common = {
    name: form.value.name.trim(),
    description: form.value.description.trim() || undefined,
    payloadSchema: serializeEventSchema(form.value.schema),
    clientIngestible: form.value.clientIngestible,
    countsAsActivity: form.value.countsAsActivity,
    enabled: form.value.enabled,
  }
  const value = form.value.id
    ? ({ ...common } as EventPayload)
    : ({ ...common, code: form.value.code.trim() } as EventPayload)
  if (form.value.id) attachUpdateIdentity(value, form.value.id, form.value.code.trim())

  const schemaChanged = Boolean(form.value.id)
    && canonicalJson(value.payloadSchema) !== initialSchemaSnapshot.value
  if (schemaChanged) {
    confirm.require({
      header: 'Опубликовать новую версию события?',
      message: 'Система не может проверить приложения, которые отправляют это событие. Убедитесь, что они готовы передавать данные в новом формате.',
      icon: 'pi pi-exclamation-triangle',
      rejectLabel: 'Вернуться к проверке',
      acceptLabel: 'Опубликовать версию',
      accept: () => persistEvent(projectId, value),
    })
    return
  }

  return persistEvent(projectId, value)
}

async function persistEvent(projectId: string, value: EventPayload) {
  saving.value = true
  try {
    const saved = await repository.saveEvent(projectId, value)
    const index = events.value.findIndex((item) => item.id === saved.id)
    if (index >= 0) events.value.splice(index, 1, saved)
    else events.value.unshift(saved)
    initialFormSnapshot.value = ''
    dialogVisible.value = false
    toast.add({ severity: 'success', summary: form.value.id ? 'Событие обновлено' : 'Событие создано', detail: saved.name, life: 2800 })
    void loadAuthoringContract()
  } catch (cause) {
    formError.value = eventDefinitionError(cause, 'Не удалось сохранить событие')
    void nextTick(() => formErrorSummary.value?.focus())
  } finally {
    saving.value = false
  }
}

async function toggleEvent(item: EventDefinition, enabled: boolean) {
  const projectId = auth.project?.id
  if (!projectId || item.readOnly) return
  const value = { name: item.name, description: item.description, payloadSchema: item.payloadSchema, clientIngestible: item.clientIngestible, countsAsActivity: item.countsAsActivity, enabled } as Partial<EventDefinition> & Pick<EventDefinition, 'name' | 'code' | 'payloadSchema'>
  attachUpdateIdentity(value, item.id, item.code)
  togglingId.value = item.id
  try {
    const saved = await repository.saveEvent(projectId, value)
    Object.assign(item, saved)
  } catch (cause) {
    toast.add({ severity: 'error', summary: 'Статус не изменён', detail: eventDefinitionError(cause, 'Произошла ошибка').message, life: 3500 })
  } finally {
    togglingId.value = null
  }
}

function attachUpdateIdentity(value: Partial<EventDefinition>, id: string, code: string) {
  if (repository.mode === 'mock') {
    value.id = id
    value.code = code
    return
  }
  Object.defineProperties(value, {
    id: { value: id, enumerable: false },
    code: { value: code, enumerable: false },
  })
}

function eventFields(item: EventDefinition) {
  const properties = item.payloadSchema?.properties
  return properties && typeof properties === 'object' ? Object.keys(properties) : []
}

function isSystemEvent(item: EventDefinition) {
  return item.origin === 'LOLA_MANAGED' || Boolean(item.readOnly)
}

function openEventLogs(item: EventDefinition) {
  return router.push({ name: 'event-logs', query: { eventCode: item.code } })
}

function requiredCount(item: EventDefinition) {
  return Array.isArray(item.payloadSchema?.required) ? item.payloadSchema.required.length : 0
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function errorMessage(cause: unknown, fallback = 'Произошла ошибка') {
  return cause instanceof Error ? cause.message : fallback
}
</script>

<template>
  <section class="page events-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">Каталог событий</div>
        <h1>События</h1>
        <p class="subtitle">Опишите сигналы продукта и данные, с которыми будут запускаться сценарии.</p>
      </div>
      <div v-if="canManage" class="header-actions"><Button label="Журнал" icon="pi pi-list" severity="secondary" outlined @click="router.push({ name: 'event-logs' })" /><Button label="Новое событие" icon="pi pi-plus" @click="openCreate" /></div>
    </header>

    <DocumentationCallout title="Как события запускают сценарии" text="Разберитесь в событиях, версиях схемы, передаваемых данных и условиях запуска перед настройкой каталога." icon="pi pi-bolt" />

    <div class="summary-grid">
      <div class="summary-card card"><span class="summary-icon bolt"><i class="pi pi-bolt" /></span><div><strong>{{ events.length }}</strong><small>событий в каталоге</small></div></div>
      <div class="summary-card card"><span class="summary-icon live"><i class="pi pi-check" /></span><div><strong>{{ enabledCount }}</strong><small>принимают данные</small></div></div>
      <div class="contract-note card"><i class="pi pi-shield" /><div><strong>Проверка данных</strong><span>Система сверяет поля, типы и обязательность до запуска сценария.</span></div></div>
    </div>

    <div class="toolbar card">
      <span class="search-box"><i class="pi pi-search" /><InputText v-model="search" placeholder="Поиск по названию или коду" /></span>
      <span class="result-count">Показано {{ filteredEvents.length }}</span>
    </div>

    <Message v-if="loadError" severity="error" :closable="false"><div class="message-content"><span>{{ loadError }}</span><Button label="Повторить" size="small" text @click="loadEvents" /></div></Message>

    <div v-if="loading" class="events-list">
      <div v-for="index in 4" :key="index" class="event-card card"><Skeleton shape="circle" size="3rem" /><div class="skeleton-copy"><Skeleton width="48%" height="1.15rem" /><Skeleton width="70%" /></div></div>
    </div>
    <div v-else-if="filteredEvents.length" class="events-list">
      <article v-for="item in filteredEvents" :key="item.id" class="event-card card" :class="{ inactive: !item.enabled, system: isSystemEvent(item) }">
        <span class="event-icon"><i class="pi pi-bolt" /></span>
        <div class="event-main">
          <div class="event-heading">
            <div class="event-title">
              <h2>{{ item.name }}</h2>
              <span v-if="!item.enabled" class="event-status">Выключено</span>
              <span
                v-if="isSystemEvent(item)"
                class="system-lock"
                tabindex="0"
                aria-label="Почему событие нельзя изменить"
                :aria-describedby="`system-event-tooltip-${item.id}`"
              >
                <i class="pi pi-lock" aria-hidden="true" />
                <span :id="`system-event-tooltip-${item.id}`" class="system-tooltip" role="tooltip">Это системное событие Lola. Его техническое имя и схема данных задаются системой и недоступны для изменения.</span>
              </span>
            </div>
            <p v-if="isSystemEvent(item) && item.description" class="event-description system-description">{{ item.description }}</p>
          </div>
          <div class="event-meta"><code>{{ item.code }}</code><span>Версия {{ item.version }}</span></div>
          <p v-if="!isSystemEvent(item) && item.description" class="event-description">{{ item.description }}</p>
          <div class="field-pills">
            <span v-for="field in eventFields(item).slice(0, 5)" :key="field"><code>{{ field }}</code><i v-if="item.payloadSchema.required?.includes(field)" title="Обязательное поле">*</i></span>
            <span v-if="eventFields(item).length > 5">+{{ eventFields(item).length - 5 }}</span>
            <small v-if="!eventFields(item).length">Без дополнительных данных</small>
          </div>
        </div>
        <div class="event-stats"><strong>{{ eventFields(item).length }}</strong><span>полей</span><small>{{ requiredCount(item) }} обязательных</small></div>
        <div class="event-actions">
          <ToggleSwitch :model-value="item.enabled" :disabled="!canManage || item.readOnly || togglingId === item.id" :aria-label="`Включить ${item.name}`" @update:model-value="toggleEvent(item, $event)" />
          <Button v-if="canManage" icon="pi pi-list" severity="secondary" text rounded :aria-label="`Открыть журнал ${item.name}`" @click="openEventLogs(item)" />
          <EventDefinitionHistory v-if="auth.project?.id && item.definitionKeyId" :project-id="auth.project.id" :event="item" />
          <Button :icon="item.readOnly ? 'pi pi-eye' : 'pi pi-pencil'" severity="secondary" text rounded :aria-label="`${item.readOnly ? 'Просмотреть' : 'Редактировать'} ${item.name}`" @click="openEdit(item)" />
        </div>
      </article>
    </div>
    <div v-else class="empty card">
      <i :class="search ? 'pi pi-search' : 'pi pi-bolt'" />
      <strong>{{ search ? 'События не найдены' : 'Каталог событий пока пуст' }}</strong>
      <p>{{ search ? 'Попробуйте изменить поисковый запрос.' : 'Опишите первое событие, которое сможет запускать сценарий.' }}</p>
      <Button v-if="!search" label="Создать событие" icon="pi pi-plus" size="small" @click="openCreate" />
    </div>

    <Dialog :visible="dialogVisible" modal :header="form.id ? 'Изменить событие' : 'Новое событие'" class="event-dialog" :style="{ width: 'min(920px, calc(100vw - 28px))' }" @update:visible="requestDialogVisibility">
      <form id="event-form" class="dialog-form" @submit.prevent="eventFormStep === 3 ? submitEvent() : goToNextStep()">
        <nav class="event-steps" aria-label="Шаги настройки события">
          <button v-for="(step, index) in eventSteps" :key="step.label" type="button" :class="{ active: eventFormStep === index }" :aria-current="eventFormStep === index ? 'step' : undefined" @click="goToStep(index)">
            <span>{{ index + 1 }}</span><strong>{{ step.label }}</strong><small>{{ step.description }}</small>
          </button>
        </nav>

        <section v-if="eventFormStep === 0" ref="eventStepPanel" class="event-step-panel" aria-labelledby="event-meaning-title" tabindex="-1">
          <header class="step-intro"><span>Шаг 1 из 4</span><h3 id="event-meaning-title">Что означает событие?</h3><p>Опишите бизнес-факт понятными словами. Техническое имя потребуется интеграции один раз.</p></header>
          <div class="form-grid">
            <div class="field"><label for="event-name">Название</label><InputText id="event-name" v-model="form.name" autofocus placeholder="Успешный депозит" :invalid="Boolean(nameError)" :aria-describedby="nameError ? 'event-name-error' : undefined" @input="onEventNameInput" /><small v-if="nameError" id="event-name-error" class="field-error">{{ nameError }}</small></div>
            <div class="field"><label for="event-code">Имя для интеграции</label><InputText id="event-code" v-model="form.code" class="mono" :disabled="Boolean(form.id)" placeholder="deposit.succeeded" :invalid="Boolean(codeError)" :aria-describedby="codeError ? 'event-code-error' : undefined" @input="onEventCodeInput" /><small v-if="codeError" id="event-code-error" class="field-error">{{ codeError }}</small><small v-else-if="form.id">После первой публикации это имя не меняется.</small></div>
          </div>
          <div class="field"><label for="event-description">Описание <span>необязательно</span></label><Textarea id="event-description" v-model="form.description" rows="3" auto-resize placeholder="Когда именно продукт отправляет это событие и что оно означает" /></div>
          <div class="toggle-grid">
            <div class="enabled-row surface-soft"><div><strong>Принимать событие</strong><span>Если выключить, настройка останется в каталоге, но новые события приниматься не будут.</span></div><ToggleSwitch v-model="form.enabled" aria-label="Принимать событие" /></div>
            <div class="enabled-row surface-soft"><div><strong>Можно отправлять из браузера</strong><span>Включайте только для данных, которым можно доверять со стороны клиента.</span></div><ToggleSwitch v-model="form.clientIngestible" aria-label="Можно отправлять из браузера" /></div>
            <div class="enabled-row activity-setting surface-soft"><div><strong>Засчитывать как активность пользователя</strong><span>Событие продлевает текущий визит и отмечает активный календарный день. Техническое переподключение само по себе новым визитом не считается.</span></div><ToggleSwitch v-model="form.countsAsActivity" aria-label="Засчитывать событие как активность" /></div>
          </div>
        </section>

        <section v-else ref="eventStepPanel" class="fields-builder surface-soft event-step-panel" tabindex="-1">
          <div v-if="eventFormStep === 1" class="catalog-status">
            <span v-if="catalogError">Возможности полей могут быть устаревшими: {{ catalogError }}</span>
            <span v-else-if="authoringContract">Возможности использования полей в сценариях обновлены.</span>
            <span v-else>После создания события здесь появится информация о его использовании в сценариях.</span>
            <Button v-if="repository.mode === 'api'" type="button" label="Обновить возможности" icon="pi pi-refresh" size="small" severity="secondary" text @click="loadAuthoringContract" />
          </div>
          <EventPayloadStudio ref="payloadStudio" :model-value="form.schema" :active-section="activeStudioSection" :issues="schemaIssues" :baseline-schema="baselineSchema" :catalog-event="catalogEvent" :catalog-revision="authoringContract?.revision" @update:model-value="updateSchema" @technical-draft-change="hasTechnicalDraft = $event" />
          <details v-if="eventFormStep === 2" class="integration-example">
            <summary>Технический пример для разработчика</summary>
            <header><span>Готовый формат события для интеграции.</span><Button type="button" icon="pi pi-copy" size="small" severity="secondary" aria-label="Копировать технический пример" title="Копировать" @click="copyEventExample" /></header>
            <pre>{{ eventExample }}</pre>
          </details>
          <div v-if="eventFormStep === 3" class="publication-note">
            <strong>{{ form.id ? 'Будет создана новая опубликованная версия' : 'Событие будет создано и станет доступно интеграции' }}</strong>
            <p v-if="form.id">Система публикует следующую версию сразу после подтверждения. Полная история и оценка влияния пока недоступны, поэтому проверьте интеграцию перед сохранением.</p>
            <p v-else>Проверьте смысл, поля и пример. Имя для интеграции после первой публикации не меняется; остальные настройки обновляются новой версией.</p>
            <dl class="event-review-summary">
              <div><dt>Название</dt><dd>{{ form.name || 'Не указано' }}</dd></div>
              <div><dt>Имя для интеграции</dt><dd><code>{{ form.code || 'Не указано' }}</code></dd></div>
              <div class="wide"><dt>Описание</dt><dd>{{ form.description || 'Не указано' }}</dd></div>
              <div><dt>Принимать событие</dt><dd>{{ form.enabled ? 'Да' : 'Нет' }}</dd></div>
              <div><dt>Можно отправлять из браузера</dt><dd>{{ form.clientIngestible ? 'Да' : 'Нет' }}</dd></div>
              <div><dt>Засчитывать как активность</dt><dd>{{ form.countsAsActivity ? 'Да' : 'Нет' }}</dd></div>
              <div><dt>Полей данных</dt><dd>{{ form.schema.fields.length }}</dd></div>
            </dl>
          </div>
        </section>

        <Message v-if="formError" severity="error" size="small" :closable="false">
          <div ref="formErrorSummary" class="event-error-message" tabindex="-1">
            <strong>{{ formError.message }}</strong><Button v-if="schemaIssues[0]?.fieldId" type="button" label="Перейти к полю" size="small" text @click="focusFirstSchemaIssue" />
            <ul v-if="formError.scenarios.length" class="dependency-list">
              <li v-for="scenario in formError.scenarios" :key="scenario.id || scenario.code">
                <div><span>{{ scenario.name }}</span><code v-if="scenario.code">{{ scenario.code }}</code></div>
                <ul v-if="scenario.issues.length"><li v-for="issue in scenario.issues" :key="issue">{{ issue }}</li></ul>
              </li>
            </ul>
          </div>
        </Message>
      </form>
      <template #footer>
        <div class="event-dialog-footer">
          <Button label="Отмена" severity="secondary" text @click="requestDialogVisibility(false)" />
          <div><Button v-if="eventFormStep > 0" label="Назад" severity="secondary" outlined @click="goToStep(eventFormStep - 1)" /><Button v-if="eventFormStep < 3" label="Далее" icon="pi pi-arrow-right" icon-pos="right" @click="goToNextStep" /><Button v-else form="event-form" type="submit" :label="form.id ? 'Создать новую версию' : 'Создать событие'" icon="pi pi-check" :loading="saving" /></div>
        </div>
      </template>
    </Dialog>

  </section>
</template>

<style scoped>
.events-page{display:flex;flex-direction:column;gap:20px}.events-page .page-header{margin-bottom:0}
.header-actions{display:flex;gap:9px}.toggle-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.activity-setting{grid-column:1/-1}.catalog-status{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--line);color:var(--muted);font-size:.76rem}.catalog-status code{font-size:.72rem}
.summary-grid{display:grid;grid-template-columns:minmax(190px,220px) minmax(190px,220px) minmax(360px,1fr);gap:12px;margin-bottom:18px}.summary-card,.contract-note{min-height:88px;padding:15px 17px;display:flex;align-items:center;gap:12px}.summary-icon,.event-icon{display:grid;place-items:center;width:42px;height:42px;flex:0 0 auto;border-radius:13px}.summary-icon.bolt,.event-icon{background:var(--status-violet-soft);color:var(--status-violet)}.summary-icon.live{background:var(--status-success-soft);color:var(--status-success)}.summary-card strong,.summary-card small{display:block}.summary-card strong{font:700 1.35rem Manrope}.summary-card small{color:var(--muted);font-size:.68rem;margin-top:2px}.contract-note{justify-content:flex-start;background:var(--surface-emphasis);color:var(--text-on-emphasis);border-color:var(--surface-emphasis)}.contract-note>i{display:grid;place-items:center;width:42px;height:42px;flex:0 0 auto;border-radius:13px;background:var(--surface-emphasis-raised);color:var(--brand)}.contract-note strong,.contract-note span{display:block}.contract-note strong{font-size:.78rem}.contract-note span{max-width:520px;color:var(--text-on-emphasis-muted);font-size:.68rem;line-height:1.45;margin-top:3px}.toolbar{padding:12px 15px;display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:15px}.search-box{position:relative;display:block;max-width:460px;flex:1}.search-box>i{position:absolute;left:13px;top:50%;transform:translateY(-50%);z-index:1;color:var(--text-secondary)}.search-box :deep(input){padding-left:38px;border:0;background:var(--surface-subtle)}.result-count{font-size:.75rem;color:var(--muted)}.message-content{display:flex;align-items:center;justify-content:space-between;gap:16px}
.events-list{display:flex;flex-direction:column;gap:12px}
.event-card{display:grid;grid-template-columns:auto minmax(0,1fr) 105px auto;align-items:start;gap:18px;padding:18px 20px;transition:box-shadow .18s ease,border-color .18s ease,background-color .18s ease}
.event-card:hover{box-shadow:var(--shadow-raised);border-color:var(--border-strong)}
.event-card.system{background:color-mix(in srgb,var(--status-violet-soft) 20%,var(--surface-card))}
.event-card>.event-icon{margin-top:2px}
.event-main{min-width:0}
.event-heading{min-width:0}
.event-title{display:flex;align-items:center;gap:8px;min-width:0}
.event-title h2{min-width:0;margin:0;font-size:1rem;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.event-status{display:inline-flex;align-items:center;gap:5px;flex:0 0 auto;padding:4px 8px;border:1px solid var(--border-default);border-radius:999px;background:var(--surface-subtle);color:var(--text-secondary);font-size:.66rem;font-weight:600;line-height:1}
.event-status::before{width:5px;height:5px;border-radius:50%;background:currentColor;content:''}
.system-lock{position:relative;display:grid;place-items:center;width:28px;height:28px;flex:0 0 auto;border:1px solid var(--border-default);border-radius:8px;background:var(--surface-card);color:var(--text-secondary);font-size:.76rem;cursor:help}
.system-lock:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}
.system-tooltip{position:absolute;left:50%;bottom:calc(100% + 9px);z-index:20;width:280px;padding:9px 11px;border-radius:9px;background:var(--surface-emphasis);box-shadow:var(--shadow-raised);color:var(--text-on-emphasis);font-size:.72rem;font-weight:500;line-height:1.45;text-align:left;transform:translate(-50%,4px);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .14s ease,transform .14s ease,visibility .14s ease}
.system-tooltip::after{position:absolute;top:100%;left:50%;width:8px;height:8px;background:var(--surface-emphasis);content:'';transform:translate(-50%,-50%) rotate(45deg)}
.system-lock:hover .system-tooltip,.system-lock:focus-visible .system-tooltip{opacity:1;visibility:visible;transform:translate(-50%,0)}
.event-description{margin:7px 0 0;color:var(--muted);font-size:.76rem;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.system-description{margin-top:4px}
.event-meta{display:flex;align-items:center;gap:7px;margin-top:9px;color:var(--text-secondary);font-size:.69rem;font-weight:600}
.event-meta code{max-width:min(360px,40vw);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:6px;background:var(--surface-subtle);padding:3px 7px;color:inherit;font-size:inherit;font-weight:500}
.event-meta span{white-space:nowrap}
.field-pills{display:flex;align-items:center;gap:5px;min-height:22px;margin-top:10px;flex-wrap:wrap}.field-pills>span{font-size:.66rem;border:1px solid var(--border-default);background:var(--surface-subtle);border-radius:6px;padding:3px 6px;color:var(--text-secondary)}.field-pills i{color:var(--status-danger);font-style:normal;margin-left:2px}.field-pills small{font-size:.67rem;color:var(--text-secondary)}
.event-stats{margin-top:2px;border-left:1px solid var(--line);padding-left:17px}.event-stats strong,.event-stats span,.event-stats small{display:block}.event-stats strong{font:700 1.1rem Manrope}.event-stats span{font-size:.67rem;color:var(--muted)}.event-stats small{font-size:.61rem;color:var(--text-secondary);margin-top:4px}
.event-actions{display:flex;align-items:center;gap:2px;margin-top:1px}
.skeleton-copy{flex:1;display:flex;flex-direction:column;gap:10px}.empty strong{display:block;color:var(--ink)}.empty p{margin:7px 0 18px}.dialog-form{display:flex;flex-direction:column;gap:18px;padding-top:4px}.event-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.event-steps button{display:grid;grid-template-columns:auto 1fr;gap:1px 8px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--surface-subtle);color:var(--muted);cursor:pointer;text-align:left}.event-steps button>span{grid-row:1/3;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--surface-active);color:var(--text-secondary);font-weight:700}.event-steps button strong{color:var(--text-primary);font-size:.76rem}.event-steps button small{font-size:.66rem}.event-steps button.active{border-color:var(--status-violet);background:var(--status-violet-soft)}.event-steps button.active>span{background:var(--action-primary);color:var(--on-action-primary)}.event-steps button.active strong{color:var(--status-violet-text)}.event-step-panel{display:flex;flex-direction:column;gap:17px}.event-step-panel:focus-visible{outline:2px solid var(--focus-ring);outline-offset:4px}.step-intro span{color:var(--status-violet);font-size:.72rem;font-weight:700}.step-intro h3{margin:4px 0 5px;font-size:1rem}.step-intro p{margin:0;color:var(--muted);font-size:.78rem;line-height:1.45}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.field label span,.field small{font-weight:400;color:var(--text-secondary)}.field small{font-size:.74rem}.field .field-error{color:var(--status-danger-text)}.fields-builder{padding:16px}.integration-example{overflow:hidden;border:1px solid var(--line);border-radius:11px;background:var(--surface-card)}.integration-example summary{padding:12px 14px;cursor:pointer;color:var(--text-link);font-size:.76rem;font-weight:700}.integration-example header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--surface-subtle);color:var(--muted);font-size:.74rem}.integration-example pre{margin:0;padding:15px;max-height:260px;overflow:auto;background:var(--code-background);color:var(--code-text);font-size:.74rem;line-height:1.55}.publication-note{padding:14px;border-radius:10px;background:var(--status-violet-soft)}.publication-note strong{font-size:.8rem}.publication-note p{margin:5px 0 0;color:var(--status-violet-text);font-size:.76rem;line-height:1.45}.event-review-summary{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0 0}.event-review-summary div{padding:9px;border-radius:8px;background:color-mix(in srgb,var(--surface-card) 70%,transparent)}.event-review-summary dt{color:var(--muted);font-size:.68rem}.event-review-summary dd{margin:3px 0 0;font-size:.76rem;font-weight:700}.enabled-row{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:13px 15px}.enabled-row strong,.enabled-row span{display:block}.enabled-row strong{font-size:.82rem}.enabled-row span{font-size:.74rem;color:var(--muted);margin-top:3px;line-height:1.4}.event-error-message>strong{display:block}.event-error-message:focus{outline:2px solid var(--focus-ring);outline-offset:4px}.event-dialog-footer{display:flex;width:100%;align-items:center;justify-content:space-between;gap:12px}.event-dialog-footer>div{display:flex;gap:8px}.dependency-list{margin:10px 0 0;padding-left:20px}.dependency-list>li+li{margin-top:9px}.dependency-list li>div{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.dependency-list code{font-size:.68rem;background:color-mix(in srgb,var(--surface-card) 65%,transparent);border-radius:5px;padding:2px 5px}.dependency-list ul{margin:5px 0 0;padding-left:19px;font-size:.72rem}.delete-error-content>p{margin:0;color:var(--muted)}.dependency-stat{display:flex;align-items:center;gap:9px;margin-top:16px;padding:11px 13px;background:var(--status-warning-soft);border-radius:11px;color:var(--status-warning-text);font-size:.8rem}
.event-review-summary .wide{grid-column:1/-1}
@media(max-width:1100px){.summary-grid{grid-template-columns:1fr 1fr}.contract-note{grid-column:1/-1}}@media(max-width:900px){.event-card{grid-template-columns:auto minmax(0,1fr) auto}.event-stats{display:none}}
@media(max-width:767px){.event-steps{grid-template-columns:1fr 1fr}.event-steps button small{display:none}.event-dialog-footer{align-items:stretch;flex-direction:column-reverse}.event-dialog-footer>div{display:grid;grid-template-columns:1fr 1fr}.event-dialog-footer :deep(.p-button){justify-content:center}.publication-note{padding:12px}}
@media(max-width:620px){.summary-grid{grid-template-columns:1fr}.contract-note{grid-column:auto}.toolbar{align-items:stretch;flex-direction:column}.search-box{max-width:none}.result-count{align-self:flex-end}.event-card{grid-template-columns:auto minmax(0,1fr)}.event-actions{grid-column:1/-1;justify-content:flex-end;border-top:1px solid var(--line);padding-top:8px}.event-title{align-items:center;flex-wrap:nowrap}.event-title h2{width:auto}.system-tooltip{right:-6px;left:auto;width:min(280px,calc(100vw - 48px));transform:translateY(4px)}.system-tooltip::after{right:8px;left:auto;transform:translateY(-50%) rotate(45deg)}.system-lock:hover .system-tooltip,.system-lock:focus-visible .system-tooltip{transform:translateY(0)}.form-grid{grid-template-columns:1fr}.enabled-row{align-items:flex-start}.header-actions{width:100%;display:grid;grid-template-columns:1fr 1fr}.toggle-grid{grid-template-columns:1fr}.fields-builder{padding:12px}}
</style>
