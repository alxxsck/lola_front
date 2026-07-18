<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/features/auth/auth.store'
import { eventDefinitionError, type EventDefinitionError } from '@/features/events/event-definition-error'
import { buildEventSchemaExample, parseEventSchema, serializeEventSchema, validateEventSchemaDraft } from '@/features/event-schema/model/event-schema'
import type { EventSchemaDraft } from '@/features/event-schema/model/event-schema'
import { findCatalogEventForDefinition } from '@/features/event-schema/model/event-schema-capability'
import EventPayloadStudio from '@/features/event-schema/ui/EventPayloadStudio.vue'
import { ApiError } from '@/shared/api/http/api-error'
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
const deleteError = ref<EventDefinitionError | null>(null)
const dialogVisible = ref(false)
const codeTouched = ref(false)
const form = ref<EventForm>(emptyForm())
const canManage = computed(() => auth.user?.role === 'OWNER' || auth.user?.role === 'ADMIN')
const initialFormSnapshot = ref('')
const initialSchemaSnapshot = ref('')
const baselineSchema = ref<Record<string, unknown> | undefined>()
const isFormDirty = computed(() => dialogVisible.value && Boolean(initialFormSnapshot.value) && JSON.stringify(form.value) !== initialFormSnapshot.value)
const deleteErrorVisible = computed({
  get: () => Boolean(deleteError.value),
  set: (value: boolean) => { if (!value) deleteError.value = null },
})
const { confirmDiscard } = useUnsavedChangesGuard(isFormDirty, 'Есть несохранённые изменения события. Закрыть форму?')

const filteredEvents = computed(() => {
  const query = search.value.trim().toLowerCase()
  return events.value.filter((item) => !query || item.name.toLowerCase().includes(query) || item.code.toLowerCase().includes(query))
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
  initialSchemaSnapshot.value = ''
  baselineSchema.value = undefined
  initialFormSnapshot.value = JSON.stringify(form.value)
  dialogVisible.value = true
}

function openEdit(item: EventDefinition) {
  if (!canManage.value) return
  form.value = {
    id: item.id,
    name: item.name,
    code: item.code,
    description: item.description ?? '',
    enabled: item.enabled,
    clientIngestible: item.clientIngestible,
    countsAsActivity: item.countsAsActivity,
    schema: parseEventSchema(item.payloadSchema),
  }
  codeTouched.value = true
  formError.value = null
  initialFormSnapshot.value = JSON.stringify(form.value)
  initialSchemaSnapshot.value = canonicalJson(item.payloadSchema)
  baselineSchema.value = item.payloadSchema
  dialogVisible.value = true
}

function requestDialogVisibility(value: boolean) {
  if (!value && !confirmDiscard()) return
  dialogVisible.value = value
}

function onEventNameInput() {
  if (!codeTouched.value && !form.value.id) form.value.code = slugify(form.value.name)
}

function onEventCodeInput() {
  codeTouched.value = true
}

async function copyEventExample() {
  try {
    await navigator.clipboard.writeText(eventExample.value)
    toast.add({ severity: 'success', summary: 'JSON скопирован', life: 2200 })
  } catch {
    toast.add({ severity: 'error', summary: 'Не удалось скопировать', detail: 'Выделите и скопируйте JSON вручную.', life: 3200 })
  }
}

function validateForm(): string | null {
  if (!form.value.name.trim()) return 'Укажите название события.'
  if (!/^[a-z][a-z0-9_.-]*$/.test(form.value.code.trim())) return 'Код должен начинаться с буквы и содержать только a–z, 0–9, точку, дефис или подчёркивание.'
  if (events.value.some((item) => item.code === form.value.code.trim() && item.id !== form.value.id)) return 'Событие с таким кодом уже существует.'
  const schemaIssue = validateEventSchemaDraft(form.value.schema)[0]
  if (schemaIssue) return schemaIssue.message
  return null
}

function submitEvent() {
  const projectId = auth.project?.id
  if (!projectId) return
  const validationError = validateForm()
  formError.value = validationError ? { message: validationError, scenarios: [] } : null
  if (formError.value) return

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
      header: 'Изменить схему события?',
      message: 'Backend не может проверить внешние системы, которые отправляют это событие. Перед сохранением убедитесь, что они готовы к новому payload.',
      icon: 'pi pi-exclamation-triangle',
      rejectLabel: 'Вернуться к форме',
      acceptLabel: 'Сохранить схему',
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
  } finally {
    saving.value = false
  }
}

async function toggleEvent(item: EventDefinition, enabled: boolean) {
  const projectId = auth.project?.id
  if (!projectId) return
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

function askDelete(item: EventDefinition) {
  confirm.require({
    header: 'Удалить событие?',
    message: `Событие «${item.name}» может использоваться в сценариях.`,
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Отмена',
    acceptLabel: 'Удалить',
    acceptProps: { severity: 'danger' },
    accept: () => deleteEvent(item),
  })
}

async function deleteEvent(item: EventDefinition) {
  const projectId = auth.project?.id
  if (!projectId) return
  try {
    await repository.deleteEvent(projectId, item.id)
    events.value = events.value.filter((value) => value.id !== item.id)
    toast.add({ severity: 'success', summary: 'Событие удалено', detail: item.name, life: 2500 })
  } catch (cause) {
    const error = eventDefinitionError(cause, 'Не удалось удалить событие')
    if (cause instanceof ApiError && ['EVENT_DEFINITION_IN_USE', 'RESOURCE_IN_USE'].includes(cause.code ?? '')) {
      deleteError.value = error
    } else {
      toast.add({ severity: 'error', summary: 'Не удалось удалить', detail: error.message, life: 4500 })
    }
  }
}

function eventFields(item: EventDefinition) {
  const properties = item.payloadSchema?.properties
  return properties && typeof properties === 'object' ? Object.keys(properties) : []
}

function openEventLogs(item: EventDefinition) {
  return router.push({ name: 'event-logs', query: { eventCode: item.code } })
}

function requiredCount(item: EventDefinition) {
  return Array.isArray(item.payloadSchema?.required) ? item.payloadSchema.required.length : 0
}

function scenarioStatus(status?: string) {
  return status ? ({ ACTIVE: 'Активен', DRAFT: 'Черновик', PAUSED: 'На паузе', ARCHIVED: 'Архив' }[status] ?? status) : ''
}

function eventLogCountLabel(count: number) {
  const mod100 = count % 100
  const mod10 = count % 10
  const noun = mod100 >= 11 && mod100 <= 14 ? 'записей' : mod10 === 1 ? 'запись' : mod10 >= 2 && mod10 <= 4 ? 'записи' : 'записей'
  return `${count} ${noun} в истории событий`
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
        <div class="eyebrow">Event catalog</div>
        <h1>События</h1>
        <p class="subtitle">Опишите сигналы продукта и данные, с которыми будут запускаться сценарии.</p>
      </div>
      <div v-if="canManage" class="header-actions"><Button label="Журнал" icon="pi pi-list" severity="secondary" outlined @click="router.push({ name: 'event-logs' })" /><Button label="Новое событие" icon="pi pi-plus" @click="openCreate" /></div>
    </header>

    <div class="summary-grid">
      <div class="summary-card card"><span class="summary-icon bolt"><i class="pi pi-bolt" /></span><div><strong>{{ events.length }}</strong><small>событий в каталоге</small></div></div>
      <div class="summary-card card"><span class="summary-icon live"><i class="pi pi-check" /></span><div><strong>{{ enabledCount }}</strong><small>принимают данные</small></div></div>
      <div class="contract-note card"><i class="pi pi-shield" /><div><strong>Проверка payload</strong><span>Backend сверяет поля, типы и обязательность до запуска сценария.</span></div></div>
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
      <article v-for="item in filteredEvents" :key="item.id" class="event-card card" :class="{ disabled: !item.enabled }">
        <span class="event-icon"><i class="pi pi-bolt" /></span>
        <div class="event-main">
          <div class="event-title"><h2>{{ item.name }}</h2><code>{{ item.code }}</code><Tag :value="`v${item.version}`" severity="secondary" /></div>
          <p>{{ item.description || 'Описание не добавлено' }}</p>
          <div class="field-pills">
            <span v-for="field in eventFields(item).slice(0, 5)" :key="field"><code>{{ field }}</code><i v-if="item.payloadSchema.required?.includes(field)" title="Обязательное поле">*</i></span>
            <span v-if="eventFields(item).length > 5">+{{ eventFields(item).length - 5 }}</span>
            <small v-if="!eventFields(item).length">Без полей payload</small>
          </div>
        </div>
        <div class="event-stats"><strong>{{ eventFields(item).length }}</strong><span>полей</span><small>{{ requiredCount(item) }} обязательных</small></div>
        <div class="event-actions">
          <ToggleSwitch :model-value="item.enabled" :disabled="!canManage || togglingId === item.id" :aria-label="`Включить ${item.name}`" @update:model-value="toggleEvent(item, $event)" />
          <Button v-if="canManage" icon="pi pi-list" severity="secondary" text rounded :aria-label="`Открыть журнал ${item.name}`" @click="openEventLogs(item)" />
          <Button v-if="canManage" icon="pi pi-pencil" severity="secondary" text rounded :aria-label="`Изменить ${item.name}`" @click="openEdit(item)" />
          <Button v-if="canManage" icon="pi pi-trash" severity="danger" text rounded :aria-label="`Удалить ${item.name}`" @click="askDelete(item)" />
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
      <form id="event-form" class="dialog-form" @submit.prevent="submitEvent">
        <div class="form-grid">
          <div class="field"><label for="event-name">Название</label><InputText id="event-name" v-model="form.name" autofocus placeholder="Регистрация завершена" @input="onEventNameInput" /></div>
          <div class="field"><label for="event-code">Код события</label><InputText id="event-code" v-model="form.code" class="mono" :disabled="Boolean(form.id)" placeholder="registration_completed" @input="onEventCodeInput" /><small v-if="form.id">Код опубликованного события не изменяется.</small></div>
        </div>
        <div class="field"><label for="event-description">Описание <span>необязательно</span></label><Textarea id="event-description" v-model="form.description" rows="2" auto-resize placeholder="Когда и почему продукт отправляет это событие" /></div>

        <section class="fields-builder surface-soft">
          <div class="catalog-status">
            <span v-if="catalogError">Capabilities могут быть устаревшими: {{ catalogError }}</span>
            <span v-else-if="authoringContract">Scenario catalog revision <code>{{ authoringContract.revision }}</code></span>
            <span v-else>Capabilities появятся после сохранения Event и обновления catalog.</span>
            <Button v-if="repository.mode === 'api'" type="button" label="Обновить catalog" icon="pi pi-refresh" size="small" severity="secondary" text @click="loadAuthoringContract" />
          </div>
          <EventPayloadStudio v-model="form.schema" :baseline-schema="baselineSchema" :catalog-event="catalogEvent" :catalog-revision="authoringContract?.revision" />
        </section>

        <section class="event-example">
          <header>
            <strong><i class="pi pi-code" /> Пример события для интеграции</strong>
            <Button type="button" icon="pi pi-copy" size="small" severity="secondary" aria-label="Копировать JSON" title="Копировать JSON" @click="copyEventExample" />
          </header>
          <pre>{{ eventExample }}</pre>
        </section>
        <div class="toggle-grid">
          <div class="enabled-row surface-soft"><div><strong>Событие активно</strong><span>Неактивное событие останется в каталоге, но backend не примет его.</span></div><ToggleSwitch v-model="form.enabled" /></div>
          <div class="enabled-row surface-soft"><div><strong>Принимать из браузера</strong><span>Разрешает отправку через interaction JWT. По умолчанию доступ закрыт.</span></div><ToggleSwitch v-model="form.clientIngestible" /></div>
          <div class="enabled-row activity-setting surface-soft"><div><strong>Засчитывать как активность</strong><span>Валидное событие продлевает Visit и засчитывает календарный Activity Day. Пересоздание session само по себе новым Visit не считается.</span></div><ToggleSwitch v-model="form.countsAsActivity" aria-label="Засчитывать событие как активность" /></div>
        </div>
        <Message v-if="formError" severity="error" size="small" :closable="false">
          <div class="event-error-message">
            <strong>{{ formError.message }}</strong>
            <ul v-if="formError.scenarios.length" class="dependency-list">
              <li v-for="scenario in formError.scenarios" :key="scenario.id || scenario.code">
                <div><span>{{ scenario.name }}</span><code v-if="scenario.code">{{ scenario.code }}</code></div>
                <ul v-if="scenario.issues.length"><li v-for="issue in scenario.issues" :key="issue">{{ issue }}</li></ul>
              </li>
            </ul>
          </div>
        </Message>
      </form>
      <template #footer><Button label="Отмена" severity="secondary" text @click="requestDialogVisibility(false)" /><Button form="event-form" type="submit" label="Сохранить событие" icon="pi pi-check" :loading="saving" /></template>
    </Dialog>

    <Dialog v-model:visible="deleteErrorVisible" modal header="Событие нельзя удалить" :style="{ width: 'min(620px, calc(100vw - 28px))' }">
      <div v-if="deleteError" class="delete-error-content">
        <p>{{ deleteError.message }}</p>
        <div v-if="deleteError.eventLogCount" class="dependency-stat"><i class="pi pi-history" /><span>{{ eventLogCountLabel(deleteError.eventLogCount) }}</span></div>
        <ul v-if="deleteError.scenarios.length" class="dependency-list">
          <li v-for="scenario in deleteError.scenarios" :key="scenario.id || scenario.code">
            <div><span>{{ scenario.name }}</span><code v-if="scenario.code">{{ scenario.code }}</code><Tag v-if="scenario.status" :value="scenarioStatus(scenario.status)" severity="secondary" /></div>
          </li>
        </ul>
      </div>
      <template #footer><Button label="Понятно" @click="deleteErrorVisible = false" /></template>
    </Dialog>
  </section>
</template>

<style scoped>
.header-actions{display:flex;gap:9px}.toggle-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.activity-setting{grid-column:1/-1}.catalog-status{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--line);color:var(--muted);font-size:.67rem}.catalog-status code{font-size:.65rem}
.summary-grid{display:grid;grid-template-columns:minmax(190px,220px) minmax(190px,220px) minmax(360px,1fr);gap:12px;margin-bottom:18px}.summary-card,.contract-note{min-height:88px;padding:15px 17px;display:flex;align-items:center;gap:12px}.summary-icon,.event-icon{display:grid;place-items:center;width:42px;height:42px;flex:0 0 auto;border-radius:13px}.summary-icon.bolt,.event-icon{background:#f0edff;color:#7059df}.summary-icon.live{background:#e8f7e9;color:#4ba75a}.summary-card strong,.summary-card small{display:block}.summary-card strong{font:700 1.35rem Manrope}.summary-card small{color:var(--muted);font-size:.68rem;margin-top:2px}.contract-note{justify-content:flex-start;background:#292c26;color:#f5f6f0;border-color:#292c26}.contract-note>i{display:grid;place-items:center;width:42px;height:42px;flex:0 0 auto;border-radius:13px;background:#373c32;color:var(--accent)}.contract-note strong,.contract-note span{display:block}.contract-note strong{font-size:.78rem}.contract-note span{max-width:520px;color:#b9bdb3;font-size:.68rem;line-height:1.45;margin-top:3px}.toolbar{padding:12px 15px;display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:15px}.search-box{position:relative;display:block;max-width:460px;flex:1}.search-box>i{position:absolute;left:13px;top:50%;transform:translateY(-50%);z-index:1;color:#90948b}.search-box :deep(input){padding-left:38px;border:0;background:#f6f6f3}.result-count{font-size:.75rem;color:var(--muted)}.message-content{display:flex;align-items:center;justify-content:space-between;gap:16px}.events-list{display:flex;flex-direction:column;gap:10px}.event-card{display:grid;grid-template-columns:auto minmax(0,1fr) 105px auto;align-items:center;gap:16px;padding:16px 18px;transition:.18s ease}.event-card:hover{box-shadow:0 10px 32px rgba(41,45,35,.07);border-color:#d9dad3}.event-card.disabled{opacity:.62}.event-main{min-width:0}.event-title{display:flex;align-items:center;gap:9px;min-width:0}.event-title h2{font-size:.98rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.event-title code{max-width:min(320px,38vw);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.69rem;color:#686d63;background:#f2f2ee;border-radius:6px;padding:3px 6px}.event-main p{font-size:.76rem;color:var(--muted);margin:6px 0 9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.field-pills{display:flex;align-items:center;gap:5px;min-height:22px;flex-wrap:wrap}.field-pills>span{font-size:.64rem;border:1px solid #e7e7e1;background:#fafaf8;border-radius:6px;padding:3px 6px;color:#696e64}.field-pills i{color:#d35e42;font-style:normal;margin-left:2px}.field-pills small{font-size:.67rem;color:#a0a49b}.event-stats{border-left:1px solid var(--line);padding-left:17px}.event-stats strong,.event-stats span,.event-stats small{display:block}.event-stats strong{font:700 1.1rem Manrope}.event-stats span{font-size:.67rem;color:var(--muted)}.event-stats small{font-size:.61rem;color:#989c93;margin-top:4px}.event-actions{display:flex;align-items:center;gap:2px}.skeleton-copy{flex:1;display:flex;flex-direction:column;gap:10px}.empty strong{display:block;color:var(--ink)}.empty p{margin:7px 0 18px}.dialog-form{display:flex;flex-direction:column;gap:18px;padding-top:4px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.field label span,.field small{font-weight:400;color:#999d94}.field small{font-size:.68rem}.fields-builder{padding:16px}.event-example{border:1px solid var(--line);border-radius:13px;overflow:hidden}.event-example>header{padding:12px 14px;background:#fafaf8;display:flex;align-items:center;justify-content:space-between;gap:12px}.event-example header strong,.event-example header span{display:block}.event-example header strong{font-size:.76rem}.event-example header strong i{color:#7059df;margin-right:5px}.event-example header span{color:var(--muted);font-size:.68rem;font-weight:400;margin-top:3px}.event-example pre{margin:0;padding:15px;max-height:260px;overflow:auto;background:#252821;color:#dce7c1;font-size:.7rem;line-height:1.55}.enabled-row{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:13px 15px}.enabled-row strong,.enabled-row span{display:block}.enabled-row strong{font-size:.82rem}.enabled-row span{font-size:.7rem;color:var(--muted);margin-top:3px}.event-error-message>strong{display:block}.dependency-list{margin:10px 0 0;padding-left:20px}.dependency-list>li+li{margin-top:9px}.dependency-list li>div{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.dependency-list code{font-size:.68rem;background:rgba(255,255,255,.65);border-radius:5px;padding:2px 5px}.dependency-list ul{margin:5px 0 0;padding-left:19px;font-size:.72rem}.delete-error-content>p{margin:0;color:var(--muted)}.dependency-stat{display:flex;align-items:center;gap:9px;margin-top:16px;padding:11px 13px;background:#f8f3e8;border-radius:11px;color:#796125;font-size:.8rem}
@media(max-width:1100px){.summary-grid{grid-template-columns:1fr 1fr}.contract-note{grid-column:1/-1}}@media(max-width:900px){.event-card{grid-template-columns:auto minmax(0,1fr) auto}.event-stats{display:none}}
@media(max-width:620px){.summary-grid{grid-template-columns:1fr}.contract-note{grid-column:auto}.toolbar{align-items:stretch;flex-direction:column}.search-box{max-width:none}.result-count{align-self:flex-end}.event-card{grid-template-columns:auto minmax(0,1fr)}.event-actions{grid-column:1/-1;justify-content:flex-end;border-top:1px solid var(--line);padding-top:8px}.event-title{align-items:flex-start;flex-wrap:wrap}.event-title h2{width:100%}.form-grid{grid-template-columns:1fr}.enabled-row{align-items:flex-start}}
@media(max-width:620px){.header-actions{width:100%;display:grid;grid-template-columns:1fr 1fr}.toggle-grid{grid-template-columns:1fr}}
</style>
