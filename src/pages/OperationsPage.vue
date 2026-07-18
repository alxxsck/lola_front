<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Drawer from 'primevue/drawer'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useAuthStore } from '@/features/auth/auth.store'
import { RunExplainInspector } from '@/features/scenario-run-explain/ui'
import { repository } from '@/shared/api/repository'
import { formatDate, relativeTime } from '@/shared/lib/format'
import type { AuditLog, EventLog, ScenarioRun } from '@/shared/types/domain'

type Section = 'events' | 'runs' | 'audit'
const auth = useAuthStore()
const section = ref<Section>('events')
const eventLogs = ref<EventLog[]>([])
const eventPagination = reactive({ page: 1, limit: 12, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false })
const scenarioRuns = ref<ScenarioRun[]>([])
const runsNextCursor = ref<string | null>(null)
const loadingMoreRuns = ref(false)
const auditLogs = ref<AuditLog[]>([])
const loading = ref(true)
const eventLoading = ref(false)
const errors = reactive<Record<Section, string>>({ events: '', runs: '', audit: '' })
const search = ref('')
const status = ref('ALL')
const selectedEvent = ref<EventLog | null>(null)
const selectedRun = ref<ScenarioRun | null>(null)

const sections = [
  { value: 'events' as const, label: 'События', icon: 'pi pi-bolt' },
  { value: 'runs' as const, label: 'Запуски сценариев', icon: 'pi pi-sitemap' },
  { value: 'audit' as const, label: 'Аудит', icon: 'pi pi-shield' },
]
const statusOptions = computed(() => {
  const values = section.value === 'events' ? ['RECEIVED', 'PROCESSED', 'FAILED']
    : section.value === 'runs' ? ['RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED', 'CANCELLED', 'EXPIRED']
      : ['SUCCEEDED', 'FAILED']
  return [{ label: 'Все статусы', value: 'ALL' }, ...values.map((value) => ({ label: value, value }))]
})
const sectionError = computed(() => errors[section.value])

const query = computed(() => search.value.trim().toLowerCase())
const filteredRuns = computed(() => scenarioRuns.value.filter((item) =>
  (status.value === 'ALL' || item.status === status.value)
  && (!query.value || [item.scenarioCode, item.scenarioName, item.userExternalId, item.id].some((value) => value.toLowerCase().includes(query.value))),
))
const filteredAudit = computed(() => auditLogs.value.filter((item) =>
  (status.value === 'ALL' || item.status === status.value)
  && (!query.value || [item.action, item.actor.name, item.actor.email, item.resourceType, item.resourceId].some((value) => value?.toLowerCase().includes(query.value))),
))

const severity = (value: string): 'success' | 'danger' | 'warn' | 'info' | 'secondary' => {
  if (['PROCESSED', 'COMPLETED', 'SUCCEEDED'].includes(value)) return 'success'
  if (['FAILED', 'EXPIRED', 'CANCELLED'].includes(value)) return 'danger'
  if (['RUNNING', 'WAITING_ACK', 'WAITING_INPUT', 'WAITING_TIME', 'RECEIVED'].includes(value)) return 'warn'
  return 'secondary'
}
const json = (value: unknown) => JSON.stringify(value, null, 2)
let eventRequestId = 0
let loadRequestId = 0
let runsRequestId = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined

function eventRequest(page = eventPagination.page, limit = eventPagination.limit) {
  return {
    page,
    limit,
    ...(search.value.trim() ? { search: search.value.trim() } : {}),
    ...(status.value !== 'ALL' ? { status: status.value as EventLog['status'] } : {}),
  }
}

async function loadEventPage(page = eventPagination.page, limit = eventPagination.limit) {
  const projectId = auth.project?.id
  if (!projectId) return
  const requestId = ++eventRequestId
  eventLoading.value = true
  errors.events = ''
  try {
    const response = await repository.getEventLogs(projectId, eventRequest(page, limit))
    if (requestId !== eventRequestId) return
    eventLogs.value = response.items
    Object.assign(eventPagination, response.pagination)
  } catch (cause) {
    if (requestId === eventRequestId) errors.events = cause instanceof Error ? cause.message : 'Не удалось загрузить события'
  } finally {
    if (requestId === eventRequestId) eventLoading.value = false
  }
}

async function load() {
  const projectId = auth.project?.id
  if (!projectId) return
  const requestId = ++loadRequestId
  const currentEventRequestId = ++eventRequestId
  const currentRunsRequestId = ++runsRequestId
  loading.value = true
  errors.events = ''
  errors.runs = ''
  errors.audit = ''
  eventLogs.value = []
  scenarioRuns.value = []
  runsNextCursor.value = null
  auditLogs.value = []
  const results = await Promise.allSettled([
    repository.getEventLogs(projectId, eventRequest(1)),
    repository.getScenarioRunsPage(projectId, { limit: 50 }),
    repository.getAuditLogs(projectId),
  ] as const)
  const message = (cause: unknown) => cause instanceof Error ? cause.message : 'Не удалось загрузить раздел'
  if (requestId !== loadRequestId) return
  if (results[0].status === 'fulfilled' && currentEventRequestId === eventRequestId) {
    eventLogs.value = results[0].value.items
    Object.assign(eventPagination, results[0].value.pagination)
  } else if (results[0].status === 'rejected' && currentEventRequestId === eventRequestId) errors.events = message(results[0].reason)
  if (results[1].status === 'fulfilled' && currentRunsRequestId === runsRequestId) {
    scenarioRuns.value = results[1].value.items
    runsNextCursor.value = results[1].value.nextCursor
  }
  else if (results[1].status === 'rejected' && currentRunsRequestId === runsRequestId) errors.runs = message(results[1].reason)
  if (results[2].status === 'fulfilled') auditLogs.value = results[2].value
  else errors.audit = message(results[2].reason)
  if (currentEventRequestId === eventRequestId) eventLoading.value = false
  if (requestId === loadRequestId) loading.value = false
}

async function loadMoreRuns() {
  const projectId = auth.project?.id
  if (!projectId || !runsNextCursor.value) return
  const requestId = ++runsRequestId
  loadingMoreRuns.value = true
  errors.runs = ''
  try {
    const page = await repository.getScenarioRunsPage(projectId, { limit: 50, cursor: runsNextCursor.value })
    if (requestId === runsRequestId) {
      scenarioRuns.value.push(...page.items)
      runsNextCursor.value = page.nextCursor
    }
  } catch (cause) {
    if (requestId === runsRequestId) errors.runs = cause instanceof Error ? cause.message : 'Не удалось загрузить следующую страницу запусков'
  } finally {
    if (requestId === runsRequestId) loadingMoreRuns.value = false
  }
}

function changeSection(value: Section) {
  section.value = value
  status.value = 'ALL'
  search.value = ''
}

function changeEventPage(event: { page: number, rows: number }) {
  void loadEventPage(event.page + 1, event.rows)
}

watch([section, search, status], ([currentSection], [previousSection]) => {
  clearTimeout(searchTimer)
  if (currentSection !== 'events') return
  searchTimer = setTimeout(
    () => void loadEventPage(1),
    previousSection === 'events' ? 300 : 0,
  )
})

onBeforeUnmount(() => clearTimeout(searchTimer))
onMounted(load)
</script>

<template>
  <section class="page operations-page">
    <header class="page-header">
      <div><div class="eyebrow">Наблюдаемость</div><h1>Операционный центр</h1><p class="subtitle">События, выполнение сценариев и действия администраторов в одном потоке.</p></div>
      <Button label="Обновить" icon="pi pi-refresh" severity="secondary" outlined :loading="loading || eventLoading" @click="load" />
    </header>
    <Message v-if="sectionError" severity="error" class="mb"><span>{{ sectionError }}</span><Button label="Повторить" icon="pi pi-refresh" size="small" text @click="load" /></Message>

    <div class="section-tabs" role="tablist" aria-label="Операционные разделы">
      <button v-for="item in sections" :key="item.value" type="button" role="tab" :aria-selected="section === item.value" :class="{ active: section === item.value }" @click="changeSection(item.value)">
        <i :class="item.icon" /><span>{{ item.label }}</span>
        <strong>{{ item.value === 'events' ? eventPagination.total : item.value === 'runs' ? `${scenarioRuns.length}${runsNextCursor ? '+' : ''}` : auditLogs.length }}</strong>
      </button>
    </div>

    <div class="filters card">
      <span class="search"><i class="pi pi-search" /><InputText v-model="search" :placeholder="section === 'audit' ? 'Действие, актор или ресурс' : section === 'events' ? 'Код, пользователь или полный ID' : 'Код, пользователь или ID'" /></span>
      <Select v-model="status" :options="statusOptions" option-label="label" option-value="value" />
      <span class="data-source"><i class="pi pi-database" /> {{ repository.mode === 'api' ? 'Lola Backend · live data' : 'Демонстрационные данные' }}</span>
    </div>

    <div class="card table-card">
      <div v-if="loading" class="loading-list"><Skeleton v-for="item in 7" :key="item" height="58px" /></div>
      <DataTable
        v-else-if="section === 'events'"
        :value="eventLogs"
        lazy
        paginator
        :first="(eventPagination.page - 1) * eventPagination.limit"
        :rows="eventPagination.limit"
        :rows-per-page-options="[12, 25, 50]"
        :total-records="eventPagination.total"
        :loading="eventLoading"
        paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown CurrentPageReport"
        current-page-report-template="Показано {first}–{last} из {totalRecords}"
        row-hover
        data-key="id"
        @page="changeEventPage"
        @row-click="selectedEvent = $event.data"
      >
        <template #empty><div class="empty"><i class="pi pi-bolt" />Событий по выбранным фильтрам нет.</div></template>
        <Column header="Событие"><template #body="{ data }"><div class="primary-cell"><strong>{{ data.eventName }}</strong><small class="mono">{{ data.eventCode }}</small></div></template></Column>
        <Column header="Пользователь"><template #body="{ data }"><span class="mono compact">{{ data.userExternalId }}</span></template></Column>
        <Column field="source" header="Источник" class="mobile-hide" />
        <Column header="Статус"><template #body="{ data }"><Tag :value="data.status" :severity="severity(data.status)" rounded /></template></Column>
        <Column header="Получено"><template #body="{ data }"><span :title="formatDate(data.receivedAt)">{{ relativeTime(data.receivedAt) }}</span></template></Column>
        <Column><template #body><i class="pi pi-chevron-right muted" /></template></Column>
      </DataTable>

      <DataTable v-else-if="section === 'runs'" :value="filteredRuns" paginator :rows="12" row-hover data-key="id" @row-click="selectedRun = $event.data">
        <template #empty><div class="empty"><i class="pi pi-sitemap" />Запусков по выбранным фильтрам нет.</div></template>
        <Column header="Сценарий"><template #body="{ data }"><div class="primary-cell"><strong>{{ data.scenarioName }}</strong><small class="mono">{{ data.scenarioCode }}</small></div></template></Column>
        <Column header="Пользователь"><template #body="{ data }"><span class="mono compact">{{ data.userExternalId }}</span></template></Column>
        <Column header="Прогресс" class="mobile-hide"><template #body="{ data }"><span>{{ data.currentStep }} / {{ data.steps.length }}</span></template></Column>
        <Column header="Статус"><template #body="{ data }"><Tag :value="data.status" :severity="severity(data.status)" rounded /></template></Column>
        <Column header="Старт"><template #body="{ data }"><span :title="formatDate(data.startedAt)">{{ relativeTime(data.startedAt) }}</span></template></Column>
        <Column><template #body><i class="pi pi-chevron-right muted" /></template></Column>
      </DataTable>
      <div v-if="section === 'runs' && runsNextCursor" class="load-more"><Button label="Загрузить ещё запусков" icon="pi pi-chevron-down" severity="secondary" outlined :loading="loadingMoreRuns" @click="loadMoreRuns" /></div>

      <DataTable v-if="section === 'audit'" :value="filteredAudit" paginator :rows="12" data-key="id">
        <template #empty><div class="empty"><i class="pi pi-shield" />Записей аудита по выбранным фильтрам нет.</div></template>
        <Column header="Действие"><template #body="{ data }"><div class="primary-cell"><strong>{{ data.action }}</strong><small class="mono">{{ data.id }}</small></div></template></Column>
        <Column header="Администратор"><template #body="{ data }"><div class="primary-cell"><strong>{{ data.actor.name || 'Система' }}</strong><small>{{ data.actor.email || 'service actor' }}</small></div></template></Column>
        <Column header="Ресурс" class="mobile-hide"><template #body="{ data }"><div class="primary-cell"><strong>{{ data.resourceType || '—' }}</strong><small class="mono">{{ data.resourceId || '—' }}</small></div></template></Column>
        <Column header="Статус"><template #body="{ data }"><Tag :value="data.status" :severity="severity(data.status)" rounded /></template></Column>
        <Column header="Время"><template #body="{ data }"><span :title="formatDate(data.createdAt)">{{ relativeTime(data.createdAt) }}</span></template></Column>
      </DataTable>
    </div>
  </section>

  <Drawer :visible="Boolean(selectedEvent)" position="right" :style="{ width: 'min(620px, 100vw)' }" @update:visible="!$event && (selectedEvent = null)">
    <template #header><div><div class="eyebrow">Event log</div><h2>{{ selectedEvent?.eventName }}</h2></div></template>
    <div v-if="selectedEvent" class="detail-stack">
      <div class="detail-hero"><div><span>Статус</span><Tag :value="selectedEvent.status" :severity="severity(selectedEvent.status)" /></div><div><span>Источник</span><strong>{{ selectedEvent.source }}</strong></div><div><span>Пользователь</span><strong class="mono">{{ selectedEvent.userExternalId }}</strong></div></div>
      <div><h3>Payload</h3><pre>{{ json(selectedEvent.payload) }}</pre></div>
      <div><h3>Context</h3><pre>{{ json(selectedEvent.context) }}</pre></div>
      <Message v-if="selectedEvent.error" severity="error"><pre>{{ json(selectedEvent.error) }}</pre></Message>
      <small class="mono muted">{{ selectedEvent.id }}</small>
    </div>
  </Drawer>

  <Drawer :visible="Boolean(selectedRun)" position="right" :style="{ width: 'min(700px, 100vw)' }" @update:visible="!$event && (selectedRun = null)">
    <template #header><div><div class="eyebrow">Scenario run</div><h2>{{ selectedRun?.scenarioName }}</h2></div></template>
    <div v-if="selectedRun" class="detail-stack">
      <div class="detail-hero"><div><span>Статус</span><Tag :value="selectedRun.status" :severity="severity(selectedRun.status)" /></div><div><span>Пользователь</span><strong class="mono">{{ selectedRun.userExternalId }}</strong></div><div><span>Начало</span><strong>{{ formatDate(selectedRun.startedAt) }}</strong></div></div>
      <Message v-if="selectedRun.errorCode" severity="error">{{ selectedRun.errorCode }}</Message>
      <RunExplainInspector :project-id="auth.project?.id ?? ''" :run-id="selectedRun.id" />
      <div><h3>Шаги выполнения</h3><div class="steps">
        <article v-for="step in selectedRun.steps" :key="step.id" class="step-card">
          <span class="step-index">{{ step.position + 1 }}</span>
          <div class="step-copy"><div><strong>{{ step.actionType }}</strong><Tag :value="step.status" :severity="severity(step.status)" /></div><small class="mono muted">{{ step.nodeKey }} · {{ step.executor }}</small><small v-if="step.errorCode" class="error-code">{{ step.errorCode }}</small>
            <div v-if="step.command" class="command"><span><i class="pi pi-send" /> Command #{{ step.command.sequence }}</span><Tag :value="step.command.status" severity="secondary" /><small class="mono">{{ step.command.id }}</small></div>
          </div>
        </article>
      </div></div>
      <small class="mono muted">Run {{ selectedRun.id }} · Event {{ selectedRun.eventLogId }}</small>
    </div>
  </Drawer>
</template>

<style scoped>
.mb{margin-bottom:16px}.section-tabs{display:flex;gap:8px;margin-bottom:14px;padding:5px;background:#e9ebe4;border-radius:15px;width:max-content;max-width:100%;overflow:auto}.section-tabs button{display:flex;align-items:center;gap:8px;border:0;background:transparent;padding:10px 13px;border-radius:11px;color:#686d63;font-weight:600;white-space:nowrap;cursor:pointer}.section-tabs button.active{background:#fff;color:var(--ink);box-shadow:0 2px 8px rgba(32,36,29,.08)}.section-tabs strong{padding:2px 7px;background:#dde0d8;border-radius:10px;font-size:.66rem}.section-tabs .active strong{background:var(--accent)}.filters{display:grid;grid-template-columns:minmax(260px,1fr) 220px auto;align-items:center;gap:12px;padding:14px;margin-bottom:18px}.search{position:relative}.search>i{position:absolute;left:14px;top:50%;transform:translateY(-50%);z-index:2;color:#92968e}.search :deep(input){padding-left:40px}.data-source{font-size:.7rem;color:var(--muted);white-space:nowrap}.data-source i{margin-right:5px}.table-card{overflow:hidden}.table-card :deep(tbody tr){cursor:pointer}.loading-list{display:grid;gap:10px;padding:18px}.primary-cell strong,.primary-cell small{display:block}.primary-cell strong{font-size:.82rem}.primary-cell small{font-size:.68rem;color:var(--muted);margin-top:3px}.compact{font-size:.72rem}.detail-stack{display:flex;flex-direction:column;gap:20px}.detail-hero{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:14px;background:#f5f6f1;border-radius:14px}.detail-hero>div{min-width:0}.detail-hero span,.detail-hero strong{display:block}.detail-hero>div>span{font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}.detail-hero strong{font-size:.78rem;overflow:hidden;text-overflow:ellipsis}.detail-stack h3{font-size:.9rem;margin:0 0 9px}.detail-stack pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;padding:12px;border:1px solid var(--line);background:#252821;color:#e9eddf;border-radius:12px;font:500 .69rem/1.55 'SFMono-Regular',Consolas,monospace}.steps{display:flex;flex-direction:column;gap:11px}.step-card{display:grid;grid-template-columns:34px 1fr;gap:11px}.step-index{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;background:#ece9fb;color:#6b57c8;font-weight:700;font-size:.75rem}.step-copy{padding:13px;border:1px solid var(--line);border-radius:14px;min-width:0}.step-copy>div:first-child{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}.step-copy strong{font-size:.78rem}.step-copy pre{font-size:.65rem}.error-code{display:block;color:#bd4c39;margin-bottom:8px}.command{display:grid;grid-template-columns:1fr auto;gap:7px;margin-top:10px;padding:10px;background:#f5f6f1;border-radius:10px}.command span{font-size:.7rem;font-weight:700}.command small{grid-column:1/-1;color:var(--muted)}
@media(max-width:760px){.filters{grid-template-columns:1fr}.detail-hero{grid-template-columns:1fr 1fr}.table-card{overflow:auto}:deep(.mobile-hide){display:none}.data-source{white-space:normal}}
</style>
