<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { useRouter } from 'vue-router'
import { DocumentationCallout } from '@/features/documentation/ui'
import { useActionDefinitionsStore } from '@/features/actions/action-definitions.store'
import { useAuthStore } from '@/features/auth/auth.store'
import { scenarioApiErrorMessage } from '@/features/scenarios/scenario-api-error'
import { repository } from '@/shared/api/repository'
import { formatDate } from '@/shared/lib/format'
import { findActionDefinition } from '@/shared/lib/action-definition'
import type { EventDefinition, Scenario, ScenarioAction, ScenarioActionDefinition, ScenarioStatus } from '@/shared/types/domain'

type ScenarioPayload = Partial<Scenario> &
  Pick<Scenario, 'name' | 'code' | 'eventDefinitionId' | 'actions'>

const auth = useAuthStore()
const actionDefinitionsStore = useActionDefinitionsStore()
const toast = useToast()
const confirm = useConfirm()
const router = useRouter()

const scenarios = ref<Scenario[]>([])
const events = ref<EventDefinition[]>([])
const loading = ref(true)
const loadError = ref('')
const search = ref('')
const statusFilter = ref<ScenarioStatus | 'ALL'>('ALL')
const pendingIds = ref(new Set<string>())
const actionDefinitions = computed<ScenarioActionDefinition[]>(() => actionDefinitionsStore.forProject(auth.project?.id ?? ''))

const statusOptions: { label: string; value: ScenarioStatus | 'ALL' }[] = [
  { label: 'Все статусы', value: 'ALL' },
  { label: 'Активные', value: 'ACTIVE' },
  { label: 'Черновики', value: 'DRAFT' },
  { label: 'На паузе', value: 'PAUSED' },
  { label: 'Архив', value: 'ARCHIVED' },
]

const filteredScenarios = computed(() => {
  const query = search.value.trim().toLowerCase()
  return scenarios.value.filter((scenario) => {
    const matchesStatus = statusFilter.value === 'ALL' || scenario.status === statusFilter.value
    const trigger = eventName(scenario).toLowerCase()
    const matchesSearch = !query || scenario.name.toLowerCase().includes(query) || scenario.code.toLowerCase().includes(query) || trigger.includes(query)
    return matchesStatus && matchesSearch
  })
})

const activeCount = computed(() => scenarios.value.filter((scenario) => scenario.status === 'ACTIVE').length)
const draftCount = computed(() => scenarios.value.filter((scenario) => scenario.status === 'DRAFT').length)
const totalActions = computed(() => scenarios.value.reduce((total, scenario) => total + scenario.actions.length, 0))

onMounted(load)

async function load() {
  const projectId = auth.project?.id
  if (!projectId) return
  loading.value = true
  loadError.value = ''
  try {
    const [scenarioItems, eventItems] = await Promise.all([
      repository.getScenarios(projectId),
      repository.getEvents(projectId),
      actionDefinitionsStore.ensureLoaded(projectId),
    ])
    scenarios.value = scenarioItems
    events.value = eventItems
  } catch (cause) {
    loadError.value = cause instanceof Error ? cause.message : 'Не удалось загрузить сценарии'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  router.push({ name: 'scenario-create' })
}

function openEdit(scenario: Scenario) {
  router.push({ name: 'scenario-edit', params: { scenarioId: scenario.id } })
}

async function toggleScenario(scenario: Scenario) {
  const projectId = auth.project?.id
  if (!projectId || pendingIds.value.has(scenario.id)) return
  if (scenario.status !== 'ACTIVE') {
    openEdit(scenario)
    toast.add({ severity: 'info', summary: 'Публикация выполняется в Studio', detail: 'Проверьте условия, Actions и Delivery перед запуском.', life: 4200 })
    return
  }
  const nextStatus: ScenarioStatus = 'PAUSED'
  pendingIds.value.add(scenario.id)
  try {
    const saved = await repository.saveScenario(projectId, toPayload(scenario, nextStatus))
    replaceScenario(saved)
    toast.add({
      severity: 'secondary',
      summary: 'Сценарий приостановлен',
      detail: scenario.name,
      life: 2600,
    })
  } catch (cause) {
    toast.add({ severity: 'error', summary: 'Не удалось изменить статус', detail: scenarioApiErrorMessage(cause, 'Попробуйте ещё раз'), life: 4500 })
  } finally {
    pendingIds.value.delete(scenario.id)
  }
}

function requestDelete(scenario: Scenario) {
  confirm.require({
    header: 'Удалить сценарий?',
    message: `«${scenario.name}» будет удалён без возможности восстановления.`,
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Отмена',
    acceptLabel: 'Удалить',
    acceptProps: { severity: 'danger' },
    accept: () => deleteScenario(scenario),
  })
}

async function deleteScenario(scenario: Scenario) {
  const projectId = auth.project?.id
  if (!projectId) return
  pendingIds.value.add(scenario.id)
  try {
    await repository.deleteScenario(projectId, scenario.id)
    scenarios.value = scenarios.value.filter((item) => item.id !== scenario.id)
    toast.add({ severity: 'success', summary: 'Сценарий удалён', detail: scenario.name, life: 2800 })
  } catch (cause) {
    toast.add({ severity: 'error', summary: 'Не удалось удалить', detail: errorMessage(cause), life: 4500 })
  } finally {
    pendingIds.value.delete(scenario.id)
  }
}

function toPayload(scenario: Scenario, status = scenario.status): ScenarioPayload {
  return {
    id: scenario.id,
    name: scenario.name,
    code: scenario.code,
    description: scenario.description,
    eventDefinitionId: scenario.eventDefinitionId,
    status,
    conversationPolicy: scenario.conversationPolicy,
    priority: scenario.priority,
    conditions: scenario.conditions,
    cooldownSeconds: scenario.cooldownSeconds,
    maxRunsPerUser: scenario.maxRunsPerUser,
    activeFrom: scenario.activeFrom,
    activeTo: scenario.activeTo,
    actions: scenario.actions,
  }
}

function replaceScenario(saved: Scenario) {
  const index = scenarios.value.findIndex((scenario) => scenario.id === saved.id)
  if (index >= 0) scenarios.value.splice(index, 1, saved)
}

function eventName(scenario: Scenario) {
  return scenario.eventDefinition?.name ?? events.value.find((event) => event.id === scenario.eventDefinitionId)?.name ?? 'Событие не найдено'
}

function eventCode(scenario: Scenario) {
  return scenario.eventDefinition?.code ?? events.value.find((event) => event.id === scenario.eventDefinitionId)?.code ?? '—'
}

function statusLabel(status: ScenarioStatus) {
  return { DRAFT: 'Черновик', ACTIVE: 'Активен', PAUSED: 'На паузе', ARCHIVED: 'Архив' }[status]
}

function statusSeverity(status: ScenarioStatus): 'success' | 'secondary' | 'warn' | 'contrast' {
  return { DRAFT: 'secondary', ACTIVE: 'success', PAUSED: 'warn', ARCHIVED: 'contrast' }[status] as 'success' | 'secondary' | 'warn' | 'contrast'
}

function actionSummary(actions: ScenarioAction[]) {
  return actions.slice(0, 3).map((action) => findActionDefinition(actionDefinitions.value, action.type)?.name ?? action.type).join(' · ')
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : 'Попробуйте ещё раз'
}
</script>

<template>
  <div class="page scenarios-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">Automation studio</div>
        <h1>Сценарии</h1>
        <p class="subtitle">Собирайте реакции Lola как наглядный граф: вопросы, условия, ветки и безопасные действия.</p>
      </div>
      <Button label="Создать сценарий" icon="pi pi-plus" @click="openCreate" />
    </header>

    <DocumentationCallout title="Как работают сценарии Lola" text="Trigger, Audience, Eligibility, действия, Goal, доставка, публикация и откат — в одном практическом руководстве." icon="pi pi-sitemap" />

    <section class="metric-strip card">
      <div><span class="metric-icon active"><i class="pi pi-play" /></span><div><strong>{{ activeCount }}</strong><small>активных</small></div></div>
      <div><span class="metric-icon draft"><i class="pi pi-pencil" /></span><div><strong>{{ draftCount }}</strong><small>черновиков</small></div></div>
      <div><span class="metric-icon actions"><i class="pi pi-bolt" /></span><div><strong>{{ totalActions }}</strong><small>действий настроено</small></div></div>
      <p><i class="pi pi-info-circle" /> Граф начинается с события; переходы идут вперёд, а вопросы и условия выбирают ветку во время выполнения.</p>
    </section>

    <Message v-if="loadError" severity="error" class="load-error">
      {{ loadError }}
      <Button label="Повторить" size="small" text @click="load" />
    </Message>

    <section class="card table-card">
      <div class="table-toolbar">
        <div class="search-box"><i class="pi pi-search" /><InputText v-model="search" placeholder="Название, код или событие" /></div>
        <Select v-model="statusFilter" :options="statusOptions" option-label="label" option-value="value" class="status-filter" />
        <span class="result-count">{{ filteredScenarios.length }} из {{ scenarios.length }}</span>
      </div>

      <DataTable
        :value="filteredScenarios"
        :loading="loading"
        data-key="id"
        row-hover
        paginator
        :rows="8"
        :rows-per-page-options="[8, 16, 32]"
        class="scenario-table"
        @row-click="openEdit($event.data)"
      >
        <template #empty>
          <div class="empty">
            <i class="pi pi-sitemap" />
            <strong>{{ scenarios.length ? 'Ничего не найдено' : 'Создайте первый сценарий' }}</strong>
            <p>{{ scenarios.length ? 'Измените поиск или фильтр статуса.' : 'Выберите событие и добавьте действия Lola.' }}</p>
            <Button v-if="!scenarios.length" label="Создать сценарий" icon="pi pi-plus" size="small" @click="openCreate" />
          </div>
        </template>

        <Column header="Сценарий" style="min-width: 260px">
          <template #body="{ data }">
            <div class="scenario-name">
              <span class="scenario-mark"><i class="pi pi-sitemap" /></span>
              <div><strong>{{ data.name }}</strong><small class="mono">{{ data.code }}</small></div>
            </div>
          </template>
        </Column>
        <Column header="Триггер" style="min-width: 220px">
          <template #body="{ data }">
            <div class="trigger-cell"><span><i class="pi pi-bolt" /></span><div><strong>{{ eventName(data) }}</strong><small class="mono">{{ eventCode(data) }}</small></div></div>
          </template>
        </Column>
        <Column header="Поток" style="min-width: 220px">
          <template #body="{ data }">
            <div class="flow-cell"><strong>{{ data.actions.length }} {{ data.actions.length === 1 ? 'шаг' : 'шагов' }}</strong><small>{{ actionSummary(data.actions) || 'Без действий' }}</small></div>
          </template>
        </Column>
        <Column header="Приоритет" style="width: 100px">
          <template #body="{ data }"><span class="priority">{{ data.priority }}</span></template>
        </Column>
        <Column header="Статус" style="width: 130px">
          <template #body="{ data }"><Tag :value="statusLabel(data.status)" :severity="statusSeverity(data.status)" /></template>
        </Column>
        <Column header="Обновлён" style="min-width: 150px">
          <template #body="{ data }"><span class="updated-at">{{ formatDate(data.updatedAt ?? data.createdAt) }}</span></template>
        </Column>
        <Column style="width: 128px">
          <template #body="{ data }">
            <div class="row-actions" @click.stop>
              <Button :icon="data.status === 'ACTIVE' ? 'pi pi-pause' : 'pi pi-send'" text rounded size="small" :severity="data.status === 'ACTIVE' ? 'warn' : 'success'" :loading="pendingIds.has(data.id)" :aria-label="data.status === 'ACTIVE' ? 'Поставить на паузу' : 'Настроить и опубликовать'" @click="toggleScenario(data)" />
              <Button icon="pi pi-pencil" text rounded size="small" aria-label="Редактировать" @click="openEdit(data)" />
              <Button icon="pi pi-trash" text rounded size="small" severity="danger" aria-label="Удалить" :disabled="pendingIds.has(data.id)" @click="requestDelete(data)" />
            </div>
          </template>
        </Column>
      </DataTable>
    </section>

  </div>
</template>

<style scoped>
.scenarios-page{display:flex;flex-direction:column;gap:20px}.page-header{margin-bottom:0}.metric-strip{display:flex;align-items:center;padding:15px 18px;gap:26px}.metric-strip>div{display:flex;align-items:center;gap:10px;padding-right:26px;border-right:1px solid var(--line)}.metric-strip strong,.metric-strip small{display:block}.metric-strip strong{font:700 1.15rem Manrope;line-height:1}.metric-strip small{font-size:.7rem;color:var(--muted);margin-top:4px}.metric-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;font-size:.75rem}.metric-icon.active{background:var(--status-success-soft);color:var(--status-success-text)}.metric-icon.draft{background:var(--status-violet-soft);color:var(--status-violet-text)}.metric-icon.actions{background:var(--status-danger-soft);color:var(--status-danger-text)}.metric-strip p{margin:0 0 0 auto;color:var(--muted);font-size:.76rem}.metric-strip p i{color:var(--violet);margin-right:5px}.load-error{margin:0}.table-card{overflow:hidden}.table-toolbar{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line)}.search-box{position:relative;width:min(390px,100%)}.search-box>i{position:absolute;z-index:2;left:13px;top:50%;transform:translateY(-50%);color:var(--text-secondary);font-size:.8rem}.search-box .p-inputtext{padding-left:36px}.status-filter{width:170px}.result-count{margin-left:auto;color:var(--muted);font-size:.75rem}.scenario-table{cursor:default}.scenario-name,.trigger-cell{display:flex;align-items:center;gap:10px}.scenario-name strong,.scenario-name small,.trigger-cell strong,.trigger-cell small,.flow-cell strong,.flow-cell small{display:block}.scenario-name strong,.trigger-cell strong{font-size:.84rem}.scenario-name small,.trigger-cell small{color:var(--muted);font-size:.67rem;margin-top:4px}.scenario-mark{display:grid;place-items:center;flex:0 0 36px;height:36px;border-radius:11px;background:var(--surface-emphasis);color:var(--accent);font-size:.82rem}.trigger-cell>span{display:grid;place-items:center;width:29px;height:29px;border-radius:9px;background:var(--status-violet-soft);color:var(--status-violet-text);font-size:.68rem}.flow-cell strong{font-size:.78rem}.flow-cell small{margin-top:4px;color:var(--muted);font-size:.69rem;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis}.priority{display:inline-grid;place-items:center;min-width:32px;height:27px;padding:0 8px;border-radius:8px;background:var(--surface-subtle);font:700 .72rem Manrope}.updated-at{color:var(--muted);font-size:.75rem}.row-actions{display:flex;justify-content:flex-end}.empty strong{display:block;color:var(--ink);font-size:.95rem}.empty p{margin:6px 0 16px;font-size:.8rem}
:deep(.scenario-table .p-datatable-tbody > tr){cursor:pointer}:deep(.scenario-table .p-datatable-tbody > tr > td){padding-top:14px;padding-bottom:14px}:deep(.p-paginator){border-top:1px solid var(--line)}
@media(max-width:900px){.metric-strip{align-items:stretch;display:grid;grid-template-columns:repeat(3,1fr)}.metric-strip>div{border:0;padding:0}.metric-strip p{grid-column:1/-1;margin:0}.table-toolbar{flex-wrap:wrap}.search-box{width:100%}.status-filter{flex:1}.result-count{margin-left:0}}
@media(max-width:560px){.metric-strip{grid-template-columns:1fr}.metric-strip p{grid-column:auto}.status-filter{width:100%}.result-count{width:100%}.page-header .p-button{width:100%}}
</style>
