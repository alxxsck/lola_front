<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Drawer from 'primevue/drawer'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import MultiSelect from 'primevue/multiselect'
import Select from 'primevue/select'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/features/auth/auth.store'
import { repository } from '@/shared/api/repository'
import type { EventLogFilters } from '@/shared/api/repository/contracts'
import { buildEventLogFilters, eventPayloadHighlights } from '@/shared/lib/event-logs'
import { formatDate, relativeTime } from '@/shared/lib/format'
import type { EventDefinition, EventLog } from '@/shared/types/domain'

type ViewMode = 'table' | 'timeline'
interface FailedPageRequest {
  cursor: string | undefined
  index: number
  filters: EventLogFilters
  afterSuccess?: () => void
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()
const sourceValues: EventLog['source'][] = ['SERVER', 'FRONTEND', 'INTERNAL']
const statusValues: EventLog['status'][] = ['PROCESSED', 'FAILED', 'RECEIVED']
const eventDefinitions = ref<EventDefinition[]>([])
const logs = ref<EventLog[]>([])
const nextCursor = ref<string | null>(null)
const pageCursors = ref<Array<string | undefined>>([undefined])
const pageIndex = ref(0)
const loading = ref(true)
const detailLoading = ref(false)
const error = ref('')
const filterError = ref('')
const selectedLog = ref<EventLog | null>(null)
const advancedFilters = ref(false)
const viewMode = ref<ViewMode>(typeof window !== 'undefined' && window.matchMedia?.('(max-width: 700px)').matches ? 'timeline' : 'table')
const filters = reactive({
  eventCode: queryValues('eventCode').slice(0, 50),
  externalUserId: queryValue('user'),
  source: queryValues('source').filter((value): value is EventLog['source'] => sourceValues.includes(value as EventLog['source'])),
  status: queryValues('status').filter((value): value is EventLog['status'] => statusValues.includes(value as EventLog['status'])),
  receivedFrom: queryValue('receivedFrom'),
  receivedTo: queryValue('receivedTo'),
  occurredFrom: queryValue('occurredFrom'),
  occurredTo: queryValue('occurredTo'),
  limit: [25, 50, 100].includes(Number(queryValue('limit'))) ? Number(queryValue('limit')) : 25,
})
const appliedFilters = ref<EventLogFilters>({})
const failedRequest = ref<FailedPageRequest | null>(null)
const canRead = computed(() => auth.user?.role === 'OWNER' || auth.user?.role === 'ADMIN')
const eventOptions = computed(() => eventDefinitions.value.map((item) => ({ label: `${item.name} · ${item.code}`, value: item.code })))
const sourceOptions = [
  { label: 'Backend', value: 'SERVER' },
  { label: 'Frontend', value: 'FRONTEND' },
  { label: 'Внутренние', value: 'INTERNAL' },
]
const statusOptions = [
  { label: 'Обработано', value: 'PROCESSED' },
  { label: 'Ошибка', value: 'FAILED' },
  { label: 'Получено', value: 'RECEIVED' },
]
const limitOptions = [
  { label: '25 на странице', value: 25 },
  { label: '50 на странице', value: 50 },
  { label: '100 на странице', value: 100 },
]
const activeFilterCount = computed(() => [filters.eventCode.length, filters.externalUserId.trim(), filters.source.length, filters.status.length, filters.receivedFrom, filters.receivedTo, filters.occurredFrom, filters.occurredTo].filter(Boolean).length)
const failedCount = computed(() => logs.value.filter((item) => item.status === 'FAILED').length)
const frontendCount = computed(() => logs.value.filter((item) => item.source === 'FRONTEND').length)
const appliedUserId = computed(() => appliedFilters.value.externalUserId ?? '')
let loadSequence = 0
let detailSequence = 0

onMounted(async () => {
  if (!canRead.value) {
    loading.value = false
    return
  }
  appliedFilters.value = buildEventLogFilters(filters)
  const projectId = auth.project?.id
  if (projectId) {
    const definitionsPromise = repository.getEvents(projectId).then((items) => { eventDefinitions.value = items }).catch(() => undefined)
    await Promise.all([definitionsPromise, loadPage(undefined, 0)])
    const linkedEventId = queryValue('eventId')
    if (linkedEventId) await openLinkedDetail(projectId, linkedEventId)
  }
})

async function openLinkedDetail(projectId: string, eventId: string) {
  const sequence = ++detailSequence
  detailLoading.value = true
  try {
    const detail = await repository.getEventLog(projectId, eventId)
    if (sequence === detailSequence) selectedLog.value = detail
  } catch (cause) {
    if (sequence === detailSequence) toast.add({ severity: 'error', summary: 'Event Log не найден', detail: cause instanceof Error ? cause.message : 'Произошла ошибка', life: 3500 })
  } finally {
    if (sequence === detailSequence) detailLoading.value = false
  }
}

function queryValue(key: string) {
  return typeof route.query[key] === 'string' ? route.query[key] : ''
}

function queryValues(key: string): string[] {
  const value = route.query[key]
  const values = Array.isArray(value) ? value : [value]
  return [...new Set(values.filter((item): item is string => typeof item === 'string' && Boolean(item)))]
}

async function loadPage(cursor: string | undefined, index: number, requestFilters: EventLogFilters = appliedFilters.value, afterSuccess?: () => void) {
  const projectId = auth.project?.id
  if (!projectId || !canRead.value) return false
  const sequence = ++loadSequence
  loading.value = true
  error.value = ''
  try {
    const page = await repository.getEventLogPage(projectId, { ...requestFilters, ...(cursor ? { cursor } : {}) })
    if (sequence !== loadSequence) return false
    logs.value = page.items
    nextCursor.value = page.nextCursor
    pageIndex.value = index
    failedRequest.value = null
    afterSuccess?.()
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return true
  } catch (cause) {
    if (sequence !== loadSequence) return false
    error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить журнал событий'
    failedRequest.value = { cursor, index, filters: { ...requestFilters }, afterSuccess }
    return false
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

function validateDates() {
  const ranges: Array<[string, string, string]> = [
    [filters.receivedFrom, filters.receivedTo, 'Время получения «с» должно быть раньше времени «по».'],
    [filters.occurredFrom, filters.occurredTo, 'Время события «с» должно быть раньше времени «по».'],
  ]
  const invalid = ranges.find(([from, to]) => from && to && new Date(from) > new Date(to))
  filterError.value = invalid?.[2] ?? ''
  return !filterError.value
}

async function applyFilters() {
  if (!validateDates()) return
  const nextFilters = buildEventLogFilters(filters)
  return loadPage(undefined, 0, nextFilters, () => commitAppliedFilters(nextFilters))
}

function commitAppliedFilters(nextFilters: EventLogFilters) {
  appliedFilters.value = { ...nextFilters }
  pageCursors.value = [undefined]
  void router.replace({ query: {
    ...(nextFilters.eventCode ? { eventCode: nextFilters.eventCode } : {}),
    ...(nextFilters.externalUserId ? { user: nextFilters.externalUserId } : {}),
    ...(nextFilters.source ? { source: nextFilters.source } : {}),
    ...(nextFilters.status ? { status: nextFilters.status } : {}),
    ...(nextFilters.receivedFrom ? { receivedFrom: nextFilters.receivedFrom } : {}),
    ...(nextFilters.receivedTo ? { receivedTo: nextFilters.receivedTo } : {}),
    ...(nextFilters.occurredFrom ? { occurredFrom: nextFilters.occurredFrom } : {}),
    ...(nextFilters.occurredTo ? { occurredTo: nextFilters.occurredTo } : {}),
    ...(nextFilters.limit !== 25 ? { limit: String(nextFilters.limit) } : {}),
  } })
}

function resetFilters() {
  Object.assign(filters, { eventCode: [], externalUserId: '', source: [], status: [], receivedFrom: '', receivedTo: '', occurredFrom: '', occurredTo: '', limit: 25 })
  filterError.value = ''
  return applyFilters()
}

function nextPage() {
  if (!nextCursor.value) return
  const nextIndex = pageIndex.value + 1
  pageCursors.value[nextIndex] = nextCursor.value
  return loadPage(nextCursor.value, nextIndex)
}

function previousPage() {
  if (pageIndex.value === 0) return
  const previousIndex = pageIndex.value - 1
  return loadPage(pageCursors.value[previousIndex], previousIndex)
}

async function openDetail(item: EventLog) {
  const projectId = auth.project?.id
  if (!projectId) return
  const sequence = ++detailSequence
  selectedLog.value = item
  detailLoading.value = true
  try {
    const detail = await repository.getEventLog(projectId, item.id)
    if (sequence === detailSequence && selectedLog.value?.id === item.id) selectedLog.value = detail
  } catch (cause) {
    if (sequence === detailSequence && selectedLog.value?.id === item.id) toast.add({ severity: 'error', summary: 'Детали не загружены', detail: cause instanceof Error ? cause.message : 'Произошла ошибка', life: 3500 })
  } finally {
    if (sequence === detailSequence) detailLoading.value = false
  }
}

function closeDetail() {
  detailSequence += 1
  detailLoading.value = false
  selectedLog.value = null
}

function refreshLogs() {
  return loadPage(undefined, 0, appliedFilters.value, () => { pageCursors.value = [undefined] })
}

function retryFailedRequest() {
  const request = failedRequest.value
  if (!request) return
  return loadPage(request.cursor, request.index, request.filters, request.afterSuccess)
}

function openEventDefinition(item: EventLog) {
  return router.push({ name: 'events', query: { event: item.eventDefinitionId } })
}

function severity(status: EventLog['status']): 'success' | 'danger' | 'warn' {
  if (status === 'PROCESSED') return 'success'
  if (status === 'FAILED') return 'danger'
  return 'warn'
}

function statusLabel(status: EventLog['status']) {
  return { PROCESSED: 'Обработано', FAILED: 'Ошибка', RECEIVED: 'Получено' }[status]
}

function sourceLabel(source: EventLog['source']) {
  return { SERVER: 'Backend', FRONTEND: 'Frontend', INTERNAL: 'Internal' }[source]
}

function json(value: unknown) {
  return JSON.stringify(value, null, 2)
}
</script>

<template>
  <section class="page event-logs-page">
    <header class="page-header">
      <div><div class="eyebrow">Observability · Event stream</div><h1>Журнал событий</h1><p class="subtitle">Восстановите путь пользователя, проверьте входные данные и результат обработки каждого события.</p></div>
      <div class="header-actions"><div class="view-switch" role="group" aria-label="Вид журнала"><button type="button" :class="{ active: viewMode === 'table' }" :aria-pressed="viewMode === 'table'" @click="viewMode = 'table'"><i class="pi pi-table" /> Таблица</button><button type="button" :class="{ active: viewMode === 'timeline' }" :aria-pressed="viewMode === 'timeline'" @click="viewMode = 'timeline'"><i class="pi pi-align-left" /> Путь</button></div><Button icon="pi pi-refresh" label="Обновить" severity="secondary" outlined :loading="loading" @click="refreshLogs" /></div>
    </header>

    <Message v-if="!canRead" severity="warn" :closable="false">Журнал содержит чувствительные диагностические данные и доступен только OWNER и ADMIN.</Message>
    <template v-else>
      <section class="filter-panel card">
        <div class="filter-main"><div class="field"><label for="event-filter">Событие</label><MultiSelect id="event-filter" v-model="filters.eventCode" :options="eventOptions" option-label="label" option-value="value" display="chip" placeholder="Все события" filter :selection-limit="50" :max-selected-labels="1" selected-items-label="{0} событий" /></div><div class="field user-filter"><label for="user-filter">External user ID</label><span class="input-icon"><i class="pi pi-user" /><InputText id="user-filter" v-model="filters.externalUserId" class="mono" placeholder="user_123" @keydown.enter="applyFilters" /></span></div><div class="field"><label for="status-filter">Статус</label><MultiSelect id="status-filter" v-model="filters.status" :options="statusOptions" option-label="label" option-value="value" display="chip" placeholder="Все статусы" :selection-limit="3" :max-selected-labels="1" selected-items-label="{0} статуса" /></div><div class="field"><label for="source-filter">Источник</label><MultiSelect id="source-filter" v-model="filters.source" :options="sourceOptions" option-label="label" option-value="value" display="chip" placeholder="Все источники" :selection-limit="3" :max-selected-labels="1" selected-items-label="{0} источника" /></div></div>
        <div v-if="advancedFilters" class="filter-advanced"><div class="field"><label for="received-from">Получено с</label><InputText id="received-from" v-model="filters.receivedFrom" type="datetime-local" /></div><div class="field"><label for="received-to">Получено по</label><InputText id="received-to" v-model="filters.receivedTo" type="datetime-local" /></div><div class="field"><label for="occurred-from">Событие с</label><InputText id="occurred-from" v-model="filters.occurredFrom" type="datetime-local" /></div><div class="field"><label for="occurred-to">Событие по</label><InputText id="occurred-to" v-model="filters.occurredTo" type="datetime-local" /></div></div>
        <Message v-if="filterError" severity="warn" size="small" :closable="false">{{ filterError }}</Message>
        <footer><button type="button" class="advanced-button" @click="advancedFilters = !advancedFilters"><i :class="advancedFilters ? 'pi pi-chevron-up' : 'pi pi-sliders-h'" /> {{ advancedFilters ? 'Скрыть даты' : 'Фильтры по времени' }}</button><span v-if="activeFilterCount" class="filter-count">{{ activeFilterCount }} активных</span><Button v-if="activeFilterCount" label="Сбросить" severity="secondary" text size="small" @click="resetFilters" /><Select v-model="filters.limit" :options="limitOptions" option-label="label" option-value="value" class="limit-select" /><Button label="Применить" icon="pi pi-search" @click="applyFilters" /></footer>
      </section>

      <div class="stream-summary"><span><i class="pi pi-lock" /> Список зафиксирован на момент загрузки. Новые события появятся после обновления.</span><span v-if="appliedUserId"><i class="pi pi-user" /> Путь <strong class="mono">{{ appliedUserId }}</strong></span><span><i class="pi pi-desktop" /> {{ frontendCount }} frontend</span><span :class="{ danger: failedCount }"><i class="pi pi-exclamation-circle" /> {{ failedCount }} ошибок</span></div>
      <Message v-if="error" severity="error" :closable="false"><div class="message-row"><span>{{ error }}</span><Button label="Повторить" size="small" text @click="retryFailedRequest" /></div></Message>

      <div v-if="loading" class="loading-list card"><Skeleton v-for="item in 8" :key="item" height="68px" /></div>
      <div v-else-if="!logs.length" class="empty card"><i class="pi pi-search" /><strong>События не найдены</strong><p>Измените фильтры или временной диапазон.</p><Button v-if="activeFilterCount" label="Сбросить фильтры" severity="secondary" @click="resetFilters" /></div>

      <div v-else-if="viewMode === 'table'" class="log-table card">
        <DataTable :value="logs" data-key="id" row-hover @row-click="openDetail($event.data)">
          <Column header="Событие"><template #body="{ data }"><div class="event-cell"><span class="event-dot" :class="data.status.toLowerCase()" /><div><strong>{{ data.eventName }}</strong><small class="mono">{{ data.eventCode }} · v{{ data.eventVersion }}</small></div></div></template></Column>
          <Column header="Пользователь"><template #body="{ data }"><div class="user-cell"><strong class="mono">{{ data.userExternalId }}</strong><small>{{ sourceLabel(data.source) }}</small></div></template></Column>
          <Column header="Главные параметры"><template #body="{ data }"><div v-if="eventPayloadHighlights(data.payload).length" class="payload-pills"><span v-for="entry in eventPayloadHighlights(data.payload)" :key="entry.key"><b>{{ entry.key }}</b> {{ entry.value }}</span><small v-if="Object.keys(data.payload).length > 3">+{{ Object.keys(data.payload).length - 3 }}</small></div><span v-else class="muted">Пустой payload</span></template></Column>
          <Column header="Статус"><template #body="{ data }"><Tag :value="statusLabel(data.status)" :severity="severity(data.status)" rounded /></template></Column>
          <Column header="Получено"><template #body="{ data }"><div class="time-cell"><strong :title="formatDate(data.receivedAt)">{{ relativeTime(data.receivedAt) }}</strong><small>{{ new Date(data.receivedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }}</small></div></template></Column>
          <Column><template #body="{ data }"><Button icon="pi pi-chevron-right" text rounded severity="secondary" :aria-label="`Открыть лог ${data.eventName}`" @click.stop="openDetail(data)" /></template></Column>
        </DataTable>
      </div>

      <div v-else class="timeline card">
        <header><div><span class="timeline-kicker">{{ appliedUserId ? 'User journey' : 'Event stream' }}</span><h2>{{ appliedUserId ? 'Путь пользователя' : 'Хронология событий' }}</h2></div><Tag :value="`${logs.length} на странице`" severity="secondary" /></header>
        <div class="timeline-list"><button v-for="item in logs" :key="item.id" type="button" class="timeline-item" @click="openDetail(item)"><span class="timeline-rail"><i :class="item.status.toLowerCase()" /></span><span class="timeline-time"><strong>{{ new Date(item.receivedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }}</strong><small>{{ new Date(item.receivedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' }) }}</small></span><span class="timeline-body"><span class="timeline-title"><strong>{{ item.eventName }}</strong><code>{{ item.eventCode }}</code></span><span class="timeline-user"><i :class="item.source === 'FRONTEND' ? 'pi pi-desktop' : 'pi pi-server'" /> {{ item.userExternalId }} · {{ sourceLabel(item.source) }}</span><span v-if="eventPayloadHighlights(item.payload).length" class="timeline-payload"><span v-for="entry in eventPayloadHighlights(item.payload, 2)" :key="entry.key"><b>{{ entry.key }}</b> {{ entry.value }}</span></span></span><Tag :value="statusLabel(item.status)" :severity="severity(item.status)" rounded /><i class="pi pi-arrow-up-right open-icon" /></button></div>
      </div>

      <footer v-if="logs.length" class="pagination"><span>Страница {{ pageIndex + 1 }} · {{ logs.length }} записей</span><div><Button label="Назад" icon="pi pi-arrow-left" severity="secondary" outlined :disabled="pageIndex === 0 || loading" @click="previousPage" /><Button label="Дальше" icon="pi pi-arrow-right" icon-pos="right" :disabled="!nextCursor || loading" @click="nextPage" /></div></footer>
    </template>
  </section>

  <Drawer :visible="Boolean(selectedLog)" position="right" :style="{ width: 'min(680px, 100vw)' }" @update:visible="!$event && closeDetail()">
    <template #header><div v-if="selectedLog" class="drawer-title"><div class="eyebrow">Event log · {{ selectedLog.eventCode }}</div><h2>{{ selectedLog.eventName }}</h2></div></template>
    <div v-if="selectedLog" class="detail-stack">
      <Skeleton v-if="detailLoading" height="140px" />
      <template v-else>
        <div class="detail-hero"><div><span>Статус</span><Tag :value="statusLabel(selectedLog.status)" :severity="severity(selectedLog.status)" /></div><div><span>Источник</span><strong>{{ sourceLabel(selectedLog.source) }}</strong></div><div><span>Получено</span><strong>{{ formatDate(selectedLog.receivedAt) }}</strong></div><div><span>Пользователь</span><strong class="mono">{{ selectedLog.userExternalId }}</strong></div></div>
        <Message v-if="selectedLog.status === 'FAILED'" severity="error" :closable="false"><div><strong>Событие завершилось ошибкой</strong><p>{{ selectedLog.error || selectedLog.message || 'Backend не вернул текст ошибки.' }}</p></div></Message>
        <section class="detail-section"><header><div><span class="section-index">01</span><div><h3>Что произошло</h3><p>Событие и связь с каталогом</p></div></div><Button label="Открыть event" icon="pi pi-arrow-up-right" size="small" severity="secondary" outlined @click="openEventDefinition(selectedLog)" /></header><div class="identity-grid"><div><span>Event code</span><code>{{ selectedLog.eventCode }}</code></div><div><span>Definition</span><code>{{ selectedLog.eventDefinitionId }}</code></div><div><span>Log ID</span><code>{{ selectedLog.id }}</code></div><div><span>Idempotency</span><code>{{ selectedLog.externalEventId || '—' }}</code></div></div></section>
        <section class="detail-section"><header><div><span class="section-index">02</span><div><h3>Payload</h3><p>{{ Object.keys(selectedLog.payload).length }} параметров от продукта</p></div></div></header><pre>{{ json(selectedLog.payload) }}</pre></section>
        <section class="detail-section"><header><div><span class="section-index">03</span><div><h3>Context</h3><p>Контекст получения, не используемый как доверенный input</p></div></div></header><pre>{{ json(selectedLog.context) }}</pre></section>
        <section v-if="selectedLog.processingResult" class="detail-section"><header><div><span class="section-index">04</span><div><h3>Результат обработки</h3><p>Совпавшие сценарии и созданные runs</p></div></div></header><pre>{{ json(selectedLog.processingResult) }}</pre></section>
        <div class="timestamps"><span>Произошло: {{ formatDate(selectedLog.occurredAt) }}</span><span>Получено: {{ formatDate(selectedLog.receivedAt) }}</span></div>
      </template>
    </div>
  </Drawer>
</template>

<style scoped>
.header-actions{display:flex;align-items:center;gap:10px}.view-switch{display:flex;padding:4px;background:#e8eae3;border-radius:13px}.view-switch button{display:flex;align-items:center;gap:6px;border:0;background:transparent;color:#74796f;padding:8px 10px;border-radius:9px;cursor:pointer;font-size:.72rem;font-weight:700}.view-switch button.active{background:white;color:var(--ink);box-shadow:0 2px 8px rgba(35,39,31,.08)}.filter-panel{padding:17px;margin-bottom:12px}.filter-main,.filter-advanced{display:grid;grid-template-columns:1.2fr 1.1fr .75fr .75fr;gap:10px}.filter-advanced{padding-top:13px;margin-top:13px;border-top:1px solid var(--line)}.filter-panel .field{gap:5px;min-width:0}.filter-panel :deep(.p-multiselect){width:100%;min-width:0}.filter-panel :deep(.p-multiselect-label-container),.filter-panel :deep(.p-multiselect-label){min-width:0;overflow:hidden}.filter-panel .field label{font-size:.66rem;text-transform:uppercase;letter-spacing:.07em;color:#83877f}.input-icon{position:relative}.input-icon>i{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#9a9e96;z-index:1}.input-icon :deep(input){padding-left:36px}.filter-panel footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding-top:13px}.advanced-button{margin-right:auto;border:0;background:transparent;color:#62675e;font-size:.7rem;font-weight:700;cursor:pointer;padding:8px}.advanced-button i{margin-right:5px}.filter-count{font-size:.65rem;color:#696f64;background:#eff8d7;padding:5px 8px;border-radius:9px}.limit-select{width:160px}.stream-summary{display:flex;gap:18px;align-items:center;min-height:35px;padding:0 6px;color:#7c8177;font-size:.66rem;overflow:auto;white-space:nowrap}.stream-summary span:first-child{margin-right:auto}.stream-summary i{margin-right:5px}.stream-summary .danger{color:#c4513f}.message-row{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%}.loading-list{display:grid;gap:9px;padding:16px}.log-table{overflow:hidden}.log-table :deep(tbody tr){cursor:pointer}.event-cell{display:flex;align-items:center;gap:10px}.event-dot{width:9px;height:9px;border-radius:50%;background:#d49d38;box-shadow:0 0 0 4px #fbf3df}.event-dot.processed{background:#63bd6d;box-shadow:0 0 0 4px #e8f7e9}.event-dot.failed{background:#df6550;box-shadow:0 0 0 4px #fff0ec}.event-cell strong,.event-cell small,.user-cell strong,.user-cell small,.time-cell strong,.time-cell small{display:block}.event-cell strong{font-size:.78rem}.event-cell small,.user-cell small,.time-cell small{font-size:.63rem;color:var(--muted);margin-top:3px}.user-cell strong{font-size:.69rem}.payload-pills{display:flex;gap:5px;align-items:center;max-width:390px;overflow:hidden}.payload-pills span{max-width:145px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:4px 6px;border-radius:7px;background:#f3f3ef;color:#62675e;font-size:.62rem}.payload-pills b{color:#8a8f85;margin-right:3px}.payload-pills small{font-size:.61rem;color:var(--muted)}.time-cell strong{font-size:.7rem}.timeline{padding:22px}.timeline>header{display:flex;align-items:center;justify-content:space-between;padding:0 4px 17px;border-bottom:1px solid var(--line)}.timeline-kicker{font-size:.6rem;text-transform:uppercase;letter-spacing:.1em;color:#7a8075;font-weight:700}.timeline h2{font-size:1rem;margin-top:3px}.timeline-list{padding-top:4px}.timeline-item{position:relative;display:grid;grid-template-columns:24px 78px minmax(0,1fr) auto 18px;align-items:center;gap:10px;width:100%;border:0;background:transparent;color:inherit;text-align:left;padding:13px 5px;cursor:pointer;border-radius:12px}.timeline-item:hover{background:#f8f8f5}.timeline-rail{position:relative;align-self:stretch;display:flex;justify-content:center}.timeline-rail:before,.timeline-rail:after{content:'';position:absolute;left:11px;width:1px;background:#dfe1da}.timeline-rail:before{top:-13px;height:calc(50% + 13px)}.timeline-rail:after{top:50%;bottom:-13px}.timeline-item:first-child .timeline-rail:before,.timeline-item:last-child .timeline-rail:after{display:none}.timeline-rail i{position:relative;z-index:1;align-self:center;width:9px;height:9px;border-radius:50%;background:#d49d38;box-shadow:0 0 0 4px #fbf3df}.timeline-rail i.processed{background:#63bd6d;box-shadow:0 0 0 4px #e8f7e9}.timeline-rail i.failed{background:#df6550;box-shadow:0 0 0 4px #fff0ec}.timeline-time strong,.timeline-time small{display:block}.timeline-time strong{font-size:.7rem}.timeline-time small{font-size:.61rem;color:var(--muted);margin-top:3px}.timeline-body{min-width:0}.timeline-title{display:flex;gap:8px;align-items:center}.timeline-title strong{font-size:.78rem}.timeline-title code{font-size:.62rem;color:#74796f}.timeline-user{display:block;font-size:.63rem;color:var(--muted);margin-top:4px}.timeline-payload{display:flex;gap:5px;margin-top:7px}.timeline-payload>span{font-size:.6rem;background:#f0f1ec;border-radius:6px;padding:3px 5px;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.timeline-payload b{color:#858a81}.open-icon{font-size:.65rem;color:#999e94}.pagination{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 2px}.pagination>span{font-size:.7rem;color:var(--muted)}.pagination>div{display:flex;gap:8px}.drawer-title h2{font-size:1.15rem}.detail-stack{display:flex;flex-direction:column;gap:16px}.detail-hero{display:grid;grid-template-columns:1fr 1fr;gap:9px;padding:13px;background:#f5f6f1;border-radius:14px}.detail-hero>div{min-width:0;padding:5px}.detail-hero span,.detail-hero strong{display:block}.detail-hero span{font-size:.58rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px}.detail-hero strong{font-size:.72rem;overflow:hidden;text-overflow:ellipsis}.detail-stack :deep(.p-message p){margin:5px 0 0;font-size:.73rem}.detail-section{border:1px solid var(--line);border-radius:15px;overflow:hidden}.detail-section>header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 14px;background:#fafaf8;border-bottom:1px solid var(--line)}.detail-section>header>div{display:flex;align-items:center;gap:10px}.section-index{display:grid;place-items:center;width:29px;height:29px;border-radius:9px;background:#ece9fb;color:#6e58d5;font-size:.62rem;font-weight:800}.detail-section h3{font-size:.82rem;margin:0}.detail-section header p{font-size:.63rem;color:var(--muted);margin:2px 0 0}.detail-section pre{margin:0;max-height:320px;overflow:auto;padding:14px;background:#252821;color:#e2e9d3;font:500 .68rem/1.55 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere}.identity-grid{display:grid;grid-template-columns:1fr 1fr;gap:0}.identity-grid>div{padding:12px 14px;min-width:0}.identity-grid>div:nth-child(odd){border-right:1px solid var(--line)}.identity-grid>div:nth-child(-n+2){border-bottom:1px solid var(--line)}.identity-grid span,.identity-grid code{display:block}.identity-grid span{font-size:.58rem;text-transform:uppercase;color:var(--muted);margin-bottom:5px}.identity-grid code{font-size:.65rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.timestamps{display:flex;justify-content:space-between;gap:10px;color:var(--muted);font-size:.62rem}.empty strong{display:block;color:var(--ink)}.empty p{margin:7px 0 16px}
@media(max-width:1050px){.filter-main,.filter-advanced{grid-template-columns:1fr 1fr}.payload-pills{max-width:260px}.log-table :deep(th:nth-child(3)),.log-table :deep(td:nth-child(3)){display:none}}
@media(max-width:700px){.header-actions{width:100%;justify-content:space-between}.filter-main,.filter-advanced{grid-template-columns:1fr}.filter-panel footer{flex-wrap:wrap}.advanced-button{width:100%;text-align:left}.filter-count{margin-right:auto}.limit-select{width:100%;order:5}.filter-panel footer>.p-button:last-child{width:100%;order:6}.stream-summary span:first-child{margin-right:0}.log-table{overflow:auto}.log-table :deep(th:nth-child(2)),.log-table :deep(td:nth-child(2)){display:none}.timeline{padding:14px}.timeline-item{grid-template-columns:20px 64px minmax(0,1fr) auto}.timeline-item>.p-tag{grid-column:3;justify-self:start;margin-top:5px}.timeline-item>.open-icon{display:none}.timeline-title{display:block}.timeline-title code{display:block;margin-top:3px}.timeline-user{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.timeline-payload{display:none}.pagination{align-items:stretch;flex-direction:column}.pagination>div{display:grid;grid-template-columns:1fr 1fr}.identity-grid{grid-template-columns:1fr}.identity-grid>div:nth-child(odd){border-right:0}.identity-grid>div{border-bottom:1px solid var(--line)}.identity-grid>div:last-child{border-bottom:0}.timestamps{flex-direction:column}}
@media(max-width:700px){.stream-summary span:not(:first-child){display:none}}
</style>
