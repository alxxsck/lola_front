<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Skeleton from 'primevue/skeleton'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/features/auth/auth.store'
import type { ConfigureProjectActionInput, ProjectAction } from '@/features/project-actions/model/project-action'
import { useProjectActionsStore } from '@/features/project-actions/model/project-actions.store'
import ProjectActionCard from '@/features/project-actions/ui/ProjectActionCard.vue'
import ProjectActionEditor from '@/features/project-actions/ui/ProjectActionEditor.vue'
import AiCapabilityPreview from '@/features/project-actions/ui/AiCapabilityPreview.vue'

type ActionsView = 'PROJECT' | 'AI' | 'SYSTEM' | 'INTEGRATION'
type SurfaceFilter = 'ALL' | 'SCENARIO' | 'AI'
type StatusFilter = 'ALL' | 'SCENARIO_ENABLED' | 'AI_ENABLED' | 'DISABLED' | 'ARCHIVED' | 'ISSUES'
type ExecutorFilter = 'ALL' | 'FRONTEND_COMMAND' | 'SERVER_HANDLER' | 'PROPOSAL'
type OriginFilter = 'ALL' | 'SYSTEM' | 'INTEGRATION'

const auth = useAuthStore()
const store = useProjectActionsStore()
const toast = useToast()
const view = ref<ActionsView>('PROJECT')
const search = ref('')
const surface = ref<SurfaceFilter>('ALL')
const status = ref<StatusFilter>('ALL')
const executor = ref<ExecutorFilter>('ALL')
const origin = ref<OriginFilter>('ALL')
const selected = shallowRef<ProjectAction | null>(null)

const projectId = computed(() => auth.project?.id ?? '')
const role = computed(() => auth.user?.role ?? 'VIEWER')
const actions = computed(() => store.actionsForProject(projectId.value))
const catalog = computed(() => store.catalogForProject(projectId.value))
const loading = computed(() => Boolean(store.loadingByProject[projectId.value]))
const error = computed(() => store.errorsByProject[projectId.value] ?? null)
const activeActions = computed(() => actions.value.filter((action) => action.lifecycle !== 'ARCHIVED'))
const scenarioEnabledCount = computed(() => activeActions.value.filter((action) => action.scenarioEnabled).length)
const aiEnabledCount = computed(() => activeActions.value.filter((action) => action.aiEnabled).length)
const issueCount = computed(() => activeActions.value.filter(hasActionIssue).length)

const filteredActions = computed(() => {
  const query = search.value.trim().toLowerCase()
  return actions.value.filter((action) => {
    const revision = action.actionTypeRevision
    const matchesSearch = !query || [action.code, revision.name, revision.description, action.actionType.key]
      .some((value) => value.toLowerCase().includes(query))
    const matchesSurface = surface.value === 'ALL' || revision.supportedSurfaces.includes(surface.value)
    const matchesStatus = status.value === 'ALL' || status.value === 'ISSUES'
      || status.value === 'SCENARIO_ENABLED' && action.scenarioEnabled
      || status.value === 'AI_ENABLED' && action.aiEnabled
      || status.value === 'DISABLED' && !action.scenarioEnabled && !action.aiEnabled && action.lifecycle !== 'ARCHIVED'
      || status.value === 'ARCHIVED' && action.lifecycle === 'ARCHIVED'
    const matchesExecutor = executor.value === 'ALL' || revision.executorAdapter === executor.value
    const matchesOrigin = origin.value === 'ALL' || action.actionType.origin === origin.value
    const matchesIssues = status.value !== 'ISSUES' || hasActionIssue(action)
    return matchesSearch && matchesSurface && matchesStatus && matchesExecutor && matchesOrigin && matchesIssues
  })
})
const filteredAiActions = computed(() => filteredActions.value.filter((action) => action.aiEnabled))

const visibleCatalog = computed(() => catalog.value.filter((item) => {
  if (view.value === 'SYSTEM' && item.origin !== 'SYSTEM') return false
  if (view.value === 'INTEGRATION' && item.origin !== 'INTEGRATION') return false
  const revision = item.activeRevision
  if (!revision) return !search.value.trim()
  const query = search.value.trim().toLowerCase()
  return (!query || [item.key, revision.name, revision.description].some((value) => value.toLowerCase().includes(query)))
    && (surface.value === 'ALL' || revision.supportedSurfaces.includes(surface.value))
    && (executor.value === 'ALL' || revision.executorAdapter === executor.value)
}))

const surfaceOptions = [
  { label: 'Все поверхности', value: 'ALL' },
  { label: 'Scenario', value: 'SCENARIO' },
  { label: 'AI', value: 'AI' },
]
const statusOptions = [
  { label: 'Все состояния', value: 'ALL' },
  { label: 'Scenario включён', value: 'SCENARIO_ENABLED' },
  { label: 'AI включён', value: 'AI_ENABLED' },
  { label: 'Обе поверхности выключены', value: 'DISABLED' },
  { label: 'Архив', value: 'ARCHIVED' },
  { label: 'Требуют внимания', value: 'ISSUES' },
]
const executorOptions = [
  { label: 'Все executor', value: 'ALL' },
  { label: 'Frontend command', value: 'FRONTEND_COMMAND' },
  { label: 'Backend handler', value: 'SERVER_HANDLER' },
  { label: 'Proposal', value: 'PROPOSAL' },
]
const originOptions = [
  { label: 'Все origins', value: 'ALL' },
  { label: 'System', value: 'SYSTEM' },
  { label: 'Integration', value: 'INTEGRATION' },
]

onMounted(load)

async function load() {
  if (!projectId.value) return
  try {
    await store.ensureLoaded(projectId.value)
    await loadAiPreviews()
  } catch {
    // Typed load error is rendered from the store.
  }
}

async function refresh() {
  if (!projectId.value) return
  try {
    await store.refresh(projectId.value)
    await loadAiPreviews(true)
  } catch {
    // Typed load error is rendered from the store.
  }
}

async function openAction(action: ProjectAction) {
  selected.value = action
  if (!action.actionTypeRevision.supportedSurfaces.includes('AI')) return
  try {
    await store.loadPreview(projectId.value, action.id)
  } catch {
    // Typed preview error is rendered inside the editor.
  }
}

async function saveSelected(input: ConfigureProjectActionInput) {
  if (!selected.value) return
  const actionId = selected.value.id
  try {
    selected.value = await store.configure(projectId.value, actionId, input)
    if (selected.value.actionTypeRevision.supportedSurfaces.includes('AI')) {
      await store.loadPreview(projectId.value, actionId, true)
    }
    toast.add({ severity: 'success', summary: 'Действие опубликовано', detail: 'Backend вернул актуальную конфигурацию.', life: 3500 })
  } catch {
    // Typed mutation error remains visible in the editor.
  }
}

async function archiveSelected() {
  if (!selected.value) return
  try {
    selected.value = await store.archive(projectId.value, selected.value.id)
    toast.add({ severity: 'success', summary: 'Действие архивировано', life: 3000 })
  } catch {
    // Backend conflicts and references are rendered as typed errors.
  }
}

function setView(next: ActionsView) {
  view.value = next
  status.value = 'ALL'
  if (next === 'AI') {
    void loadAiPreviews()
  }
}

function aiEnabledActionsForPreview(): ProjectAction[] {
  return actions.value.filter((action) => action.lifecycle === 'ACTIVE' && action.aiEnabled)
}

async function loadAiPreviews(force = false): Promise<void> {
  await Promise.allSettled(aiEnabledActionsForPreview().map((action) =>
    store.loadPreview(projectId.value, action.id, force),
  ))
}

function hasActionIssue(action: ProjectAction): boolean {
  return action.aiEnabled && !action.actionTypeRevision.supportedSurfaces.includes('AI')
    || action.scenarioEnabled && !action.actionTypeRevision.supportedSurfaces.includes('SCENARIO')
    || Boolean(store.previewErrorsByAction[action.id])
    || Boolean(store.previewByAction[action.id]?.issues.length)
}
</script>

<template>
  <div class="page actions-page">
    <header class="page-header">
      <div><div class="eyebrow">AI Product Actions</div><h1>Действия</h1><p class="subtitle">Безопасные code-owned действия проекта для Scenario и AI. Исполняемый контракт остаётся read-only.</p></div>
      <Button label="Обновить" icon="pi pi-refresh" severity="secondary" outlined :loading="loading" @click="refresh" />
    </header>

    <section class="action-hero card">
      <div class="hero-copy"><span class="hero-icon"><i class="pi pi-shield" /></span><div><strong>Default-deny authority</strong><p>OWNER публикует каждую поверхность отдельно. Grok получает только strict schema, скомпилированную backend.</p></div></div>
      <div class="hero-metrics">
        <div><strong>{{ scenarioEnabledCount }}</strong><span>в Scenario</span></div>
        <div><strong>{{ aiEnabledCount }}</strong><span>для AI</span></div>
        <div :class="{ warning: issueCount }"><strong>{{ issueCount }}</strong><span>проблем</span></div>
      </div>
    </section>

    <nav class="view-tabs" aria-label="Разделы каталога действий">
      <button type="button" :class="{ active: view === 'PROJECT' }" @click="setView('PROJECT')"><i class="pi pi-sliders-h" /><span>Действия проекта<small>Surfaces и конфигурация</small></span></button>
      <button type="button" :class="{ active: view === 'AI' }" @click="setView('AI')"><i class="pi pi-sparkles" /><span>AI capabilities<small>Authoritative preview</small></span></button>
      <button type="button" :class="{ active: view === 'SYSTEM' }" @click="setView('SYSTEM')"><i class="pi pi-box" /><span>Системный каталог<small>Read-only contracts</small></span></button>
      <button type="button" :class="{ active: view === 'INTEGRATION' }" @click="setView('INTEGRATION')"><i class="pi pi-link" /><span>Интеграция<small>Trusted registrations</small></span></button>
    </nav>

    <Message v-if="error" severity="error" :closable="false">
      {{ error.message }}<small v-if="error.requestId">Request ID: {{ error.requestId }}</small>
      <Button label="Повторить" size="small" text @click="refresh" />
    </Message>

    <section class="catalog card">
      <div class="catalog-toolbar">
        <div class="search-box"><i class="pi pi-search" /><InputText v-model="search" placeholder="Название, code или описание" /></div>
        <Select v-model="surface" :options="surfaceOptions" option-label="label" option-value="value" class="filter" aria-label="Фильтр поверхности" />
        <Select v-if="view === 'PROJECT'" v-model="status" :options="statusOptions" option-label="label" option-value="value" class="filter status-filter" aria-label="Фильтр состояния" />
        <Select v-if="view === 'PROJECT' || view === 'AI'" v-model="origin" :options="originOptions" option-label="label" option-value="value" class="filter" aria-label="Фильтр origin" />
        <Select v-model="executor" :options="executorOptions" option-label="label" option-value="value" class="filter" aria-label="Фильтр executor" />
        <span class="result-count">{{ view === 'PROJECT' ? filteredActions.length : view === 'AI' ? filteredAiActions.length : visibleCatalog.length }}</span>
      </div>

      <div v-if="loading && !actions.length" class="action-grid loading-grid">
        <div v-for="index in 6" :key="index" class="skeleton-card"><Skeleton width="44px" height="44px" border-radius="13px" /><div><Skeleton width="65%" height="16px" /><Skeleton width="92%" height="11px" /><Skeleton width="80%" height="70px" /></div></div>
      </div>

      <template v-else-if="view === 'PROJECT'">
        <div v-if="filteredActions.length" class="action-grid">
          <ProjectActionCard v-for="action in filteredActions" :key="action.id" :action="action" @select="openAction" />
        </div>
        <div v-else class="empty"><i class="pi pi-filter-slash" /><strong>Действия не найдены</strong><p>Измените surface, lifecycle, executor или поисковый запрос.</p></div>
      </template>

      <template v-else-if="view === 'AI'">
        <div v-if="filteredAiActions.length" class="ai-capability-list">
          <article v-for="action in filteredAiActions" :key="action.id" class="ai-capability-card">
            <ProjectActionCard :action="action" @select="openAction" />
            <AiCapabilityPreview
              :preview="store.previewByAction[action.id]"
              :loading="store.previewLoadingByAction[action.id]"
              :error="store.previewErrorsByAction[action.id]"
              @retry="store.loadPreview(projectId, action.id, true)"
            />
          </article>
        </div>
        <div v-else class="empty"><i class="pi pi-sparkles" /><strong>AI capabilities пока не опубликованы</strong><p>Включите AI у Project Action с обязательным описанием и OWNER confirmation.</p></div>
      </template>

      <template v-else>
        <div v-if="visibleCatalog.length" class="catalog-list">
          <article v-for="item in visibleCatalog" :key="item.id" class="type-card">
            <div class="type-heading"><span class="type-icon"><i :class="item.origin === 'SYSTEM' ? 'pi pi-box' : 'pi pi-link'" /></span><div><span class="type-tags"><b>{{ item.origin === 'SYSTEM' ? 'System' : 'Integration' }}</b><em v-if="item.activeRevision">revision {{ item.activeRevision.version }}</em></span><h3>{{ item.activeRevision?.name ?? item.key }}</h3><code>{{ item.key }}</code></div><span v-if="!item.activeRevision" class="inactive">Нет активной ревизии</span></div>
            <template v-if="item.activeRevision">
              <p>{{ item.activeRevision.description }}</p>
              <dl>
                <div><dt>Surfaces</dt><dd>{{ item.activeRevision.supportedSurfaces.join(' · ') }}</dd></div>
                <div><dt>Executor</dt><dd>{{ item.activeRevision.executorAdapter }}</dd></div>
                <div><dt>Risk ceiling</dt><dd>{{ item.activeRevision.risk }}</dd></div>
                <div><dt>Variants</dt><dd>{{ item.activeRevision.multipleInstances ? 'Поддерживаются типом' : 'Singleton' }}</dd></div>
              </dl>
              <div class="schema-summary"><span><i class="pi pi-lock" /> Core contract read-only</span><span>Input fields: {{ Object.keys((item.activeRevision.inputSchema.properties as Record<string, unknown> | undefined) ?? {}).length }}</span></div>
              <details class="contract-schemas">
                <summary>Публичные JSON Schemas</summary>
                <div><strong>Input</strong><pre>{{ JSON.stringify(item.activeRevision.inputSchema, null, 2) }}</pre></div>
                <div><strong>Project config</strong><pre>{{ JSON.stringify(item.activeRevision.projectConfigSchema, null, 2) }}</pre></div>
                <div><strong>Result</strong><pre>{{ JSON.stringify(item.activeRevision.resultSchema, null, 2) }}</pre></div>
              </details>
            </template>
          </article>
        </div>
        <div v-else class="empty"><i :class="view === 'INTEGRATION' ? 'pi pi-link' : 'pi pi-search'" /><strong>{{ view === 'INTEGRATION' ? 'Интеграционные типы не зарегистрированы' : 'Типы действий не найдены' }}</strong><p>{{ view === 'INTEGRATION' ? 'CMS не создаёт исполняемый код. Тип появится после trusted server-to-server регистрации.' : 'Измените фильтры каталога.' }}</p></div>
      </template>
    </section>

    <Dialog :visible="Boolean(selected)" modal :header="selected ? `${selected.actionTypeRevision.name} · ${selected.code}` : 'Действие'" class="project-action-dialog" :style="{ width: 'min(920px, 96vw)' }" @update:visible="!$event && (selected = null)">
      <ProjectActionEditor
        v-if="selected"
        :action="selected"
        :role="role"
        :preview="store.previewByAction[selected.id]"
        :preview-loading="store.previewLoadingByAction[selected.id]"
        :preview-error="store.previewErrorsByAction[selected.id]"
        :saving="store.mutatingByAction[selected.id]"
        :mutation-error="store.mutationErrorsByAction[selected.id]"
        @save="saveSelected"
        @archive="archiveSelected"
        @retry-preview="store.loadPreview(projectId, selected.id, true)"
      />
    </Dialog>
  </div>
</template>

<style scoped>
.actions-page { display: grid; gap: 18px; }
.action-hero { display: flex; justify-content: space-between; gap: 24px; align-items: center; padding: 20px 24px; overflow: hidden; background: linear-gradient(125deg, color-mix(in srgb, var(--primary-color) 7%, var(--surface-card)), var(--surface-card) 58%); }
.hero-copy { display: flex; gap: 14px; align-items: center; }
.hero-copy p { margin: 5px 0 0; max-width: 650px; color: var(--text-color-secondary); font-size: 12px; line-height: 1.5; }
.hero-icon { display: grid; flex: 0 0 auto; place-items: center; width: 46px; height: 46px; color: var(--green-700); background: color-mix(in srgb, var(--green-500) 13%, var(--surface-card)); border-radius: 14px; }
.hero-metrics { display: flex; gap: 7px; }
.hero-metrics div { display: grid; min-width: 82px; padding: 9px 12px; text-align: center; background: var(--surface-ground); border: 1px solid var(--surface-border); border-radius: 11px; }
.hero-metrics strong { font-size: 17px; }
.hero-metrics span { color: var(--text-color-secondary); font-size: 9px; text-transform: uppercase; }
.hero-metrics .warning strong { color: var(--orange-600); }
.view-tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; padding: 6px; background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 16px; }
.view-tabs button { display: flex; gap: 10px; align-items: center; padding: 11px 13px; color: var(--text-color-secondary); text-align: left; background: transparent; border: 0; border-radius: 11px; cursor: pointer; }
.view-tabs button:hover { background: var(--surface-ground); }
.view-tabs button.active { color: var(--text-color); background: color-mix(in srgb, var(--primary-color) 9%, var(--surface-card)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary-color) 18%, transparent); }
.view-tabs button > i { color: var(--primary-color); }
.view-tabs button span { display: grid; gap: 2px; font-size: 12px; font-weight: 700; }
.view-tabs small { color: var(--text-color-secondary); font-size: 9px; font-weight: 500; }
.catalog { padding: 0; overflow: hidden; }
.catalog-toolbar { display: grid; grid-template-columns: minmax(220px, 1fr) repeat(4, minmax(140px, auto)) auto; gap: 10px; align-items: center; padding: 14px; border-bottom: 1px solid var(--surface-border); }
.search-box { position: relative; }
.search-box i { position: absolute; z-index: 1; top: 50%; left: 12px; color: var(--text-color-secondary); font-size: 12px; transform: translateY(-50%); }
.search-box :deep(input) { width: 100%; padding-left: 34px; }
.filter { min-width: 145px; }
.status-filter { min-width: 190px; }
.result-count { display: grid; place-items: center; min-width: 32px; height: 32px; color: var(--text-color-secondary); font-size: 11px; background: var(--surface-ground); border-radius: 9px; }
.action-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 13px; padding: 16px; }
.ai-capability-list { display: grid; gap: 14px; padding: 16px; }
.ai-capability-card { display: grid; grid-template-columns: minmax(260px, .72fr) minmax(0, 1.28fr); gap: 14px; padding: 14px; border: 1px solid var(--surface-border); border-radius: 18px; }
.ai-capability-card :deep(.project-action-card) { height: 100%; }
.ai-capability-card :deep(.ai-preview) { min-width: 0; padding: 14px; background: var(--surface-ground); border-radius: 14px; }
.skeleton-card { display: grid; grid-template-columns: 44px 1fr; gap: 12px; min-height: 230px; padding: 20px; border: 1px solid var(--surface-border); border-radius: 18px; }
.skeleton-card > div { display: grid; align-content: start; gap: 14px; }
.catalog-list { display: grid; gap: 12px; padding: 16px; }
.type-card { display: grid; gap: 14px; padding: 18px; border: 1px solid var(--surface-border); border-radius: 15px; }
.type-heading { display: grid; grid-template-columns: 42px minmax(0, 1fr) auto; gap: 12px; align-items: start; }
.type-icon { display: grid; place-items: center; width: 42px; height: 42px; color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 10%, var(--surface-card)); border-radius: 12px; }
.type-heading h3 { margin: 4px 0; font-size: 15px; }
.type-heading code { color: var(--text-color-secondary); font-size: 10px; }
.type-tags { display: flex; gap: 6px; align-items: center; }
.type-tags b, .type-tags em, .inactive { padding: 3px 7px; color: var(--text-color-secondary); font-size: 9px; font-style: normal; background: var(--surface-ground); border-radius: 999px; }
.type-tags b { color: var(--primary-color); }
.type-card > p { margin: 0; color: var(--text-color-secondary); font-size: 12px; line-height: 1.5; }
.type-card dl { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 0; }
.type-card dl div { display: grid; gap: 4px; padding: 9px; background: var(--surface-ground); border-radius: 9px; }
.type-card dt { color: var(--text-color-secondary); font-size: 9px; font-weight: 700; text-transform: uppercase; }
.type-card dd { margin: 0; font-size: 11px; overflow-wrap: anywhere; }
.schema-summary { display: flex; justify-content: space-between; gap: 10px; padding-top: 11px; color: var(--text-color-secondary); font-size: 10px; border-top: 1px solid var(--surface-border); }
.schema-summary span:first-child { color: var(--green-700); font-weight: 700; }
.contract-schemas { color: var(--text-color-secondary); font-size: 11px; }
.contract-schemas summary { cursor: pointer; font-weight: 700; }
.contract-schemas > div { display: grid; gap: 6px; margin-top: 10px; }
.contract-schemas pre { overflow: auto; margin: 0; padding: 12px; max-height: 240px; color: var(--text-color); font-size: 10px; background: var(--surface-ground); border-radius: 9px; }
.empty { display: grid; justify-items: center; gap: 7px; padding: 66px 20px; color: var(--text-color-secondary); text-align: center; }
.empty > i { margin-bottom: 5px; font-size: 27px; }
.empty strong { color: var(--text-color); }
.empty p { margin: 0; max-width: 500px; font-size: 12px; line-height: 1.5; }
.p-message small { display: block; margin-top: 5px; }
:deep(.project-action-dialog .p-dialog-content) { padding-top: 4px; background: var(--surface-ground); }
@media (max-width: 1180px) { .action-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .ai-capability-card { grid-template-columns: 1fr; } .catalog-toolbar { grid-template-columns: minmax(220px, 1fr) repeat(2, minmax(145px, auto)) auto; } .status-filter { grid-row: 2; grid-column: 1 / -1; width: 100%; } }
@media (max-width: 780px) { .action-hero { display: grid; } .hero-metrics { width: 100%; } .hero-metrics div { flex: 1; min-width: 0; } .view-tabs { grid-template-columns: 1fr; } .catalog-toolbar { grid-template-columns: 1fr 1fr; } .search-box { grid-column: 1 / -1; } .status-filter { grid-row: auto; grid-column: 1 / -1; } .result-count { position: absolute; visibility: hidden; } .action-grid { grid-template-columns: 1fr; } .type-card dl { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 480px) { .catalog-toolbar { grid-template-columns: 1fr; } .status-filter, .search-box { grid-column: auto; } .filter { width: 100%; } .hero-metrics { display: grid; grid-template-columns: repeat(3, 1fr); } .type-card dl { grid-template-columns: 1fr; } .schema-summary { display: grid; } }
</style>
