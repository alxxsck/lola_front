<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import { Position, VueFlow, type Edge, type Node } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import ScenarioFlowNode from '@/features/scenarios/ScenarioFlowNode.vue'
import ScenarioNodeInspector from '@/features/scenarios/ScenarioNodeInspector.vue'
import ScenarioConditionRows from '@/features/scenarios/ScenarioConditionRows.vue'
import { createRuleDraft, summarizeRule, type RuleDomainContext, type RuleDraft } from '@/features/scenario-rules/model'
import { ScenarioRuleBuilder } from '@/features/scenario-rules/ui'
import RuleValidationPreview from '@/features/scenario-publishing/ui/RuleValidationPreview.vue'
import { scenarioApiErrorMessage } from '@/features/scenarios/scenario-api-error'
import { useActionDefinitionsStore } from '@/features/actions/action-definitions.store'
import { useAuthStore } from '@/features/auth/auth.store'
import { repository } from '@/shared/api/repository'
import type { SaveScenario } from '@/shared/api/repository/contracts'
import { scenarioAuthoringRepository, type ScenarioAuthoringContract } from '@/shared/api/repository/scenario-authoring'
import type { ConversationPolicy, EventDefinition, Scenario, ScenarioAction, ScenarioStatus, UiElement } from '@/shared/types/domain'
import { createActionConfig, findActionDefinition, validateScenarioActionConfig } from '@/shared/lib/action-definition'
import { slugify } from '@/shared/lib/format'
import { useUnsavedChangesGuard } from '@/shared/lib/use-unsaved-changes-guard'
import {
  choiceOptions,
  conditionBranches,
  createScenarioNode,
  graphTransitions,
  normalizePositions,
  normalizeScenarioActions,
  sortScenarioActions,
  toPlainScenarioAction,
  validateScenarioGraph,
} from '@/features/scenarios/model/scenario-graph'

interface ScenarioForm {
  id?: string
  code: string
  name: string
  description: string
  eventDefinitionId: string
  status: ScenarioStatus
  conversationPolicy: ConversationPolicy
  priority: number
  conditions: Scenario['conditions']
  cooldownSeconds?: number
  maxRunsPerUser?: number
  activeFrom?: string
  activeTo?: string
  actions: ScenarioAction[]
}

type StudioStage = 'trigger' | 'audience' | 'eligibility' | 'actions' | 'delivery'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const actionDefinitionsStore = useActionDefinitionsStore()
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const saveError = ref('')
const saveNotice = ref('')
const authoringError = ref('')
const actionsError = ref('')
const events = ref<EventDefinition[]>([])
const elements = ref<UiElement[]>([])
const authoringContract = ref<ScenarioAuthoringContract | null>(null)
const ruleDraft = ref<RuleDraft>(createRuleDraft())
const ruleDraftRevision = ref(0)
const ruleEditorDirty = ref(false)
const initialRuleSnapshot = ref('')
const studioStage = ref<StudioStage>('trigger')
const ruleBuilder = ref<{ focusIssue: (target: { nodeId?: string; fieldPath?: string; message?: string }) => void } | null>(null)
const selectedNodeKey = ref<string | null>(null)
const inspectorMode = ref<'node' | 'settings'>('settings')
const codeTouched = ref(false)
const invalidConfigKeys = ref(new Set<string>())
const initialSnapshot = ref('')

const form = reactive<ScenarioForm>({
  code: '', name: '', description: '', eventDefinitionId: '', status: 'DRAFT', priority: 0,
  conversationPolicy: 'create_new', conditions: [], cooldownSeconds: undefined, maxRunsPerUser: undefined, actions: [],
})

const actionDefinitions = computed(() => actionDefinitionsStore.forProject(auth.project?.id ?? ''))
const selectedAction = computed(() => form.actions.find((action) => action.nodeKey === selectedNodeKey.value) ?? null)
const graphIssues = computed(() => validateScenarioGraph(form.actions))
const selectedIssues = computed(() => graphIssues.value.filter((issue) => issue.nodeKey === selectedNodeKey.value).map((issue) => issue.message))
const formIsDirty = computed(() => Boolean(initialSnapshot.value) && JSON.stringify(form) !== initialSnapshot.value)
const ruleIsDirty = computed(() => Boolean(initialRuleSnapshot.value) && JSON.stringify(ruleDraft.value) !== initialRuleSnapshot.value)
const isDirty = computed(() => formIsDirty.value || ruleIsDirty.value || ruleEditorDirty.value)
const { confirmDiscard } = useUnsavedChangesGuard(isDirty, 'Есть несохранённые изменения сценария. Покинуть редактор?')
const selectedEvent = computed(() => events.value.find((event) => event.id === form.eventDefinitionId))
const selectedAuthoringEvent = computed(() => authoringContract.value?.events.find((event) => event.definitionId === form.eventDefinitionId))
const ruleContext = computed<RuleDomainContext | null>(() => authoringContract.value && selectedAuthoringEvent.value ? {
  triggerEventDefinitionId: selectedAuthoringEvent.value.definitionId,
  triggerEventCode: selectedAuthoringEvent.value.code,
  mode: 'initialEligibility',
  contract: authoringContract.value,
} : null)
const ruleSummary = computed(() => ruleContext.value ? summarizeRule(ruleDraft.value, ruleContext.value) : null)
const stages = computed<Array<{ key: StudioStage; label: string; detail: string; status: 'empty' | 'draft' | 'invalid' | 'valid' | 'unavailable' }>>(() => [
  { key: 'trigger', label: 'Запуск', detail: 'Событие запуска', status: selectedAuthoringEvent.value ? 'valid' : 'invalid' },
  { key: 'audience', label: 'Аудитория', detail: 'Пока недоступна', status: 'unavailable' },
  { key: 'eligibility', label: 'Условия', detail: ruleSummary.value?.text ?? 'Выберите событие', status: ruleSummary.value?.status === 'ready' ? 'valid' : ruleSummary.value?.status === 'empty' ? 'empty' : 'invalid' },
  { key: 'actions', label: 'Действия', detail: `${form.actions.length} узлов`, status: graphIssues.value.length ? 'invalid' : form.actions.length ? 'valid' : 'empty' },
  { key: 'delivery', label: 'Доставка', detail: 'Следующий этап', status: 'unavailable' },
])
const eventOptions = computed(() => events.value.filter((event) => event.enabled || event.id === form.eventDefinitionId).map((event) => ({ label: event.name, value: event.id, code: event.code })))
const conditionPaths = computed(() => {
  const eventFields = Object.keys(selectedEvent.value?.payloadSchema?.properties ?? {})
  const nodeKeys = form.actions.map((action) => action.nodeKey).filter(Boolean)
  return [
    ...eventFields.map((field) => `event.payload.${field}`),
    'user.segment', 'user.locale', 'user.isGuest', 'user.profile.country', 'project.id', 'scenario.code',
    ...nodeKeys.flatMap((key) => [`answers.${key}.optionId`, `results.${key}.result`]),
  ]
})
const triggerConditionPaths = computed(() => conditionPaths.value.filter((path) => !path.startsWith('answers.') && !path.startsWith('results.')))
const templateVariables = computed(() => conditionPaths.value.filter((path) => path.startsWith('event.') || path.startsWith('user.')).map((path) => `{{ ${path} }}`))
const statusOptions = [
  { label: 'Черновик', value: 'DRAFT' }, { label: 'Активен', value: 'ACTIVE' },
  { label: 'На паузе', value: 'PAUSED' }, { label: 'В архиве', value: 'ARCHIVED' },
]
const conversationPolicyOptions: { label: string; value: ConversationPolicy }[] = [
  { label: 'Создать новый чат', value: 'create_new' },
  { label: 'Продолжить текущий чат', value: 'reuse_active' },
]

const actionGroups = computed(() => {
  const enabled = actionDefinitions.value.filter((definition) => definition.enabled)
  return [
    { label: 'Логика', items: enabled.filter((item) => ['ASK_CHOICE', 'CONDITION'].includes(item.type)) },
    { label: 'Действия', items: enabled.filter((item) => !['ASK_CHOICE', 'CONDITION'].includes(item.type)) },
  ].filter((group) => group.items.length)
})

const flowNodes = computed<Node[]>(() => {
  const transitions = graphTransitions(form.actions)
  const depth = new Map<string, number>()
  form.actions.forEach((action, index) => depth.set(action.nodeKey ?? '', index ? 1 : 0))
  for (const action of form.actions) {
    const sourceDepth = depth.get(action.nodeKey ?? '') ?? 0
    for (const transition of transitions.filter((item) => item.source === action.nodeKey)) {
      depth.set(transition.target, Math.max(depth.get(transition.target) ?? 0, sourceDepth + 1))
    }
  }
  const levels = new Map<number, ScenarioAction[]>()
  for (const action of form.actions) {
    const level = depth.get(action.nodeKey ?? '') ?? action.position
    levels.set(level, [...(levels.get(level) ?? []), action])
  }
  const nodes: Node[] = [{
    id: 'trigger', type: 'input', position: { x: 332, y: 24 }, sourcePosition: Position.Bottom, selectable: false, draggable: false,
    data: { label: selectedEvent.value?.name ?? 'Выберите событие' },
  }]
  for (const [level, actions] of levels) {
    actions.forEach((action, column) => {
      const definition = findActionDefinition(actionDefinitions.value, action.type)
      const totalWidth = (actions.length - 1) * 280
      nodes.push({
        id: action.nodeKey ?? `step_${action.position}`, type: 'scenario',
        position: { x: 320 - totalWidth / 2 + column * 280, y: 180 + level * 190 },
        data: {
          label: definition?.name ?? action.type,
          nodeKey: action.nodeKey,
          icon: action.type === 'CONDITION' ? 'pi pi-code' : action.type === 'ASK_CHOICE' ? 'pi pi-question-circle' : definition?.executor === 'FRONTEND' ? 'pi pi-desktop' : 'pi pi-server',
          executor: definition?.executor ?? 'SERVER',
          summary: nodeSummary(action),
          issueCount: graphIssues.value.filter((issue) => issue.nodeKey === action.nodeKey).length + (invalidConfigKeys.value.has(action.nodeKey ?? '') ? 1 : 0),
        },
      })
    })
  }
  return nodes
})

const flowEdges = computed<Edge[]>(() => {
  const edges: Edge[] = form.actions[0]?.nodeKey ? [{ id: 'trigger-edge', source: 'trigger', target: form.actions[0].nodeKey, type: 'smoothstep', animated: true }] : []
  graphTransitions(form.actions).forEach((transition, index) => edges.push({
    id: `${transition.source}-${transition.target}-${transition.kind}-${index}`,
    source: transition.source, target: transition.target, label: transition.label, type: 'smoothstep',
    animated: transition.kind === 'default',
    style: { stroke: transition.kind === 'timeout' ? '#e07a68' : transition.kind === 'fallback' ? '#a0a49c' : '#8068ed', strokeWidth: 2 },
    labelStyle: { fill: '#5d6259', fontSize: 11, fontWeight: 600 },
    labelBgStyle: { fill: '#fff', fillOpacity: .92 },
  }))
  return edges
})

watch(() => form.name, (name) => { if (!codeTouched.value) form.code = slugify(name) })

onMounted(load)

async function load() {
  const projectId = auth.project?.id
  if (!projectId) return
  loading.value = true
  error.value = ''
  authoringError.value = ''
  actionsError.value = ''
  try {
    const [scenarios] = await Promise.all([
      repository.getScenarios(projectId),
      repository.getEvents(projectId).then((value) => { events.value = value }),
      repository.getElements(projectId).then((value) => { elements.value = value }),
      actionDefinitionsStore.ensureLoaded(projectId)
        .catch((cause: unknown) => { actionsError.value = scenarioApiErrorMessage(cause) }),
      scenarioAuthoringRepository.getContract(projectId)
        .then((value) => { authoringContract.value = value })
        .catch((cause: unknown) => { authoringError.value = scenarioApiErrorMessage(cause) }),
    ])
    const scenarioId = typeof route.params.scenarioId === 'string' ? route.params.scenarioId : ''
    const scenario = scenarioId && scenarioId !== 'new' ? scenarios.find((item) => item.id === scenarioId) : null
    if (scenarioId && scenarioId !== 'new' && !scenario) throw new Error('Сценарий не найден')
    if (scenario) {
      Object.assign(form, {
        id: scenario.id, code: scenario.code, name: scenario.name, description: scenario.description ?? '',
        eventDefinitionId: scenario.eventDefinitionId, status: scenario.status,
        conversationPolicy: scenario.conversationPolicy ?? 'create_new', priority: scenario.priority,
        conditions: structuredClone(scenario.conditions ?? []), cooldownSeconds: scenario.cooldownSeconds,
        maxRunsPerUser: scenario.maxRunsPerUser, activeFrom: scenario.activeFrom, activeTo: scenario.activeTo,
        actions: normalizeScenarioActions(scenario.actions),
      })
      codeTouched.value = true
    } else {
      const catalogDefinitionIds = new Set(authoringContract.value?.events.map((event) => event.definitionId) ?? [])
      form.eventDefinitionId = events.value.find((event) => event.enabled && catalogDefinitionIds.has(event.id))?.id
        ?? events.value.find((event) => event.enabled)?.id
        ?? ''
    }
    initialSnapshot.value = JSON.stringify(form)
    initialRuleSnapshot.value = JSON.stringify(ruleDraft.value)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось открыть редактор'
  } finally {
    loading.value = false
  }
}

function selectStage(stage: StudioStage) {
  if (stage !== studioStage.value && ruleEditorDirty.value) {
    if (!window.confirm('В условии есть несохранённые изменения. Закрыть его и перейти к другому этапу?')) return
    ruleEditorDirty.value = false
  }
  studioStage.value = stage
  if (stage === 'trigger') {
    inspectorMode.value = 'settings'
    selectedNodeKey.value = null
  }
}

function updateRuleDraft(next: RuleDraft) {
  ruleDraft.value = next
  ruleDraftRevision.value += 1
  saveNotice.value = ''
}

function focusRuleIssue(target: { nodeId?: string; fieldPath?: string; message?: string }) {
  studioStage.value = 'eligibility'
  void nextTick(() => {
    ruleBuilder.value?.focusIssue(target)
  })
}

function nodeSummary(action: ScenarioAction) {
  if (action.type === 'ASK_CHOICE') return String(action.config.message || 'Настройте вопрос и варианты ответа')
  if (action.type === 'CONDITION') return `${Array.isArray(action.config.branches) ? action.config.branches.length : 0} runtime-веток + fallback`
  const first = Object.values(action.config).find((value) => typeof value === 'string')
  return typeof first === 'string' && first ? first : 'Настройте параметры действия'
}

function appendNode(type: string, connectPrevious: boolean) {
  const definition = findActionDefinition(actionDefinitions.value, type)
  const node = createScenarioNode(type, form.actions.length, form.actions.map((action) => action.nodeKey ?? ''))
  node.config = { ...(definition ? createActionConfig(definition) : {}), ...node.config }
  const previous = form.actions.at(-1)
  if (connectPrevious && previous && !['ASK_CHOICE', 'CONDITION'].includes(previous.type) && !previous.nextNodeKey) previous.nextNodeKey = node.nodeKey
  form.actions.push(node)
  selectedNodeKey.value = node.nodeKey ?? null
  inspectorMode.value = 'node'
  studioStage.value = 'actions'
  return node
}

function addNode(type: string) {
  appendNode(type, true)
}

function createTarget(type: string, kind: 'next' | 'choice' | 'timeout' | 'condition' | 'fallback', index?: number) {
  const source = selectedAction.value
  if (!source) return
  const node = appendNode(type, false)
  const target = node.nodeKey ?? ''
  if (kind === 'next') source.nextNodeKey = target
  else if (kind === 'choice' && index !== undefined) source.config.options = choiceOptions(source).map((option, optionIndex) => optionIndex === index ? { ...option, nextNodeKey: target } : option)
  else if (kind === 'timeout') source.config.onTimeout = target
  else if (kind === 'condition' && index !== undefined) source.config.branches = conditionBranches(source).map((branch, branchIndex) => branchIndex === index ? { ...branch, nextNodeKey: target } : branch)
  else if (kind === 'fallback') source.config.fallbackNodeKey = target
}

function selectNode(event: { node: Node }) {
  if (event.node.id === 'trigger') { selectStage('trigger'); return }
  selectedNodeKey.value = event.node.id
  inspectorMode.value = 'node'
  studioStage.value = 'actions'
}

function changeType(type: string) {
  if (!selectedAction.value) return
  const definition = findActionDefinition(actionDefinitions.value, type)
  selectedAction.value.type = type
  selectedAction.value.config = { ...(definition ? createActionConfig(definition) : {}), ...createScenarioNode(type, selectedAction.value.position, form.actions.map((item) => item.nodeKey ?? '')).config }
  selectedAction.value.nextNodeKey = null
}

function updateSelected(action: ScenarioAction) {
  const index = form.actions.findIndex((item) => item.nodeKey === selectedNodeKey.value)
  if (index < 0) return
  form.actions.splice(index, 1, action)
  form.actions.splice(0, form.actions.length, ...sortScenarioActions(form.actions))
}

function renameNode(oldKey: string, newKey: string) {
  const action = form.actions.find((item) => item.nodeKey === oldKey)
  if (!action) return
  action.nodeKey = newKey
  for (const item of form.actions) {
    if (item.nextNodeKey === oldKey) item.nextNodeKey = newKey
    if (item.type === 'ASK_CHOICE') {
      item.config.options = choiceOptions(item).map((option) => option.nextNodeKey === oldKey ? { ...option, nextNodeKey: newKey } : option)
      if (item.config.onTimeout === oldKey) item.config.onTimeout = newKey
    }
    if (item.type === 'CONDITION') {
      item.config.branches = conditionBranches(item).map((branch) => branch.nextNodeKey === oldKey ? { ...branch, nextNodeKey: newKey } : branch)
      if (item.config.fallbackNodeKey === oldKey) item.config.fallbackNodeKey = newKey
    }
  }
  selectedNodeKey.value = newKey
}

function removeSelected() {
  const action = selectedAction.value
  if (!action) return
  const referenced = graphTransitions(form.actions).some((transition) => transition.target === action.nodeKey)
  if (referenced) { saveError.value = `Сначала удалите переходы в узел «${action.nodeKey}».`; return }
  if (!window.confirm(`Удалить узел «${action.nodeKey}»?`)) return
  form.actions.splice(action.position, 1)
  normalizePositions(form.actions)
  selectedNodeKey.value = null
  inspectorMode.value = 'settings'
}

function setConfigValidity(action: ScenarioAction, valid: boolean) {
  const next = new Set(invalidConfigKeys.value)
  if (valid) next.delete(action.nodeKey ?? '')
  else next.add(action.nodeKey ?? '')
  invalidConfigKeys.value = next
}

async function save() {
  saveError.value = ''
  saveNotice.value = ''
  if (!form.name.trim() || !form.code.trim() || !form.eventDefinitionId) { saveError.value = 'Заполните название, код и событие запуска.'; inspectorMode.value = 'settings'; return }
  const issues = graphIssues.value
  if (issues.length) { saveError.value = `Граф содержит ошибок: ${issues.length}. Исправьте отмеченные узлы.`; return }
  for (const action of form.actions) {
    const configError = validateScenarioActionConfig(action, findActionDefinition(actionDefinitions.value, action.type))
    if (configError) { saveError.value = `${action.nodeKey}: ${configError}`; selectedNodeKey.value = action.nodeKey ?? null; inspectorMode.value = 'node'; return }
  }
  const projectId = auth.project?.id
  if (!projectId) return
  saving.value = true
  try {
    const payload: SaveScenario = {
      ...form,
      name: form.name.trim(), code: form.code.trim(), description: form.description.trim() || undefined,
      cooldownSeconds: form.cooldownSeconds || undefined, maxRunsPerUser: form.maxRunsPerUser || undefined,
      actions: form.actions.map((action, position) => ({ ...toPlainScenarioAction(action), position })),
    }
    const saved = await repository.saveScenario(projectId, payload)
    form.id = saved.id
    initialSnapshot.value = JSON.stringify(form)
    if (ruleIsDirty.value) {
      studioStage.value = 'eligibility'
      saveNotice.value = 'Основные настройки и граф сохранены. Условия V2 остаются в этой вкладке до этапа публикации — не закрывайте редактор.'
    } else {
      await router.push('/scenarios')
    }
  } catch (cause) {
    saveError.value = scenarioApiErrorMessage(cause)
  } finally {
    saving.value = false
  }
}

function leave() {
  if (confirmDiscard()) router.push('/scenarios')
}
</script>

<template>
  <div class="scenario-studio">
    <header class="studio-header">
      <div class="header-left"><Button icon="pi pi-arrow-left" text rounded aria-label="Назад к сценариям" @click="leave" /><div><span>Scenario studio</span><strong>{{ form.name || 'Новый сценарий' }}</strong></div></div>
      <div class="header-center"><span>{{ stages.find((stage) => stage.key === studioStage)?.label }}</span><span :class="{ invalid: graphIssues.length || ruleSummary?.status === 'incomplete' }">{{ graphIssues.length ? `${graphIssues.length} ошибок графа` : ruleSummary?.status === 'ready' ? 'Условия готовы' : 'Черновик' }}</span></div>
      <div class="header-actions"><Button label="Отмена" severity="secondary" outlined @click="leave" /><Button label="Сохранить" icon="pi pi-check" :loading="saving" @click="save" /></div>
    </header>

    <Message v-if="error" severity="error" class="page-error">{{ error }}</Message>
    <div v-else-if="loading" class="studio-loading"><i class="pi pi-spin pi-spinner" /><span>Загружаем редактор…</span></div>
    <template v-else>
      <Message v-if="saveError" severity="error" class="save-error" closable @close="saveError = ''">{{ saveError }}</Message>
      <Message v-if="saveNotice" severity="info" class="save-error" closable @close="saveNotice = ''">{{ saveNotice }}</Message>
      <div class="studio-grid">
        <aside class="studio-sidebar">
          <nav class="studio-stages" aria-label="Этапы настройки сценария">
            <button v-for="(stage, index) in stages" :key="stage.key" type="button" :class="{ active: studioStage === stage.key }" :aria-current="studioStage === stage.key ? 'step' : undefined" @click="selectStage(stage.key)">
              <span class="stage-index" :class="`is-${stage.status}`"><i v-if="stage.status === 'valid'" class="pi pi-check" /><i v-else-if="stage.status === 'invalid'" class="pi pi-exclamation-circle" /><span v-else>{{ index + 1 }}</span></span>
              <span class="stage-copy"><strong>{{ stage.label }}</strong><small>{{ stage.detail }}</small></span>
            </button>
          </nav>
          <div v-if="studioStage === 'actions'" class="action-library">
            <div class="library-head"><span>Библиотека</span><strong>Добавить узел</strong></div>
            <div v-for="group in actionGroups" :key="group.label" class="library-group"><h3>{{ group.label }}</h3><button v-for="definition in group.items" :key="definition.type" type="button" @click="addNode(definition.type)"><span><i :class="definition.type === 'CONDITION' ? 'pi pi-code' : definition.type === 'ASK_CHOICE' ? 'pi pi-question-circle' : definition.executor === 'FRONTEND' ? 'pi pi-desktop' : 'pi pi-server'" /></span><div><strong>{{ definition.name }}</strong><small>{{ definition.executor === 'FRONTEND' ? 'Frontend' : 'Server' }}</small></div><i class="pi pi-plus" /></button></div>
          </div>
        </aside>

        <main v-if="studioStage === 'actions'" class="graph-canvas">
          <Message v-if="actionsError" severity="warn" :closable="false" class="actions-warning">Не удалось загрузить каталог действий. {{ actionsError }}</Message>
          <VueFlow :nodes="flowNodes" :edges="flowEdges" :node-types="{ scenario: ScenarioFlowNode }" fit-view-on-init :min-zoom=".25" :max-zoom="1.6" :nodes-draggable="false" :nodes-connectable="false" @node-click="selectNode">
            <Background pattern-color="#d6d9d0" :gap="22" />
            <Controls :show-interactive="false" />
          </VueFlow>
          <div v-if="!form.actions.length" class="canvas-empty"><i class="pi pi-sitemap" /><strong>Начните с первого узла</strong><span>Выберите действие или логику в библиотеке слева.</span></div>
        </main>

        <main v-else-if="studioStage === 'eligibility'" class="rule-canvas">
          <Message v-if="authoringError" severity="error" :closable="false">Не удалось загрузить каталог условий. {{ authoringError }}</Message>
          <ScenarioRuleBuilder v-if="ruleContext" ref="ruleBuilder" :model-value="ruleDraft" :context="ruleContext" @update:model-value="updateRuleDraft" @editing-dirty="ruleEditorDirty = $event" />
          <div v-else class="stage-empty"><i class="pi pi-link" /><h2>Сначала выберите доступное событие запуска</h2><p>Конструктор использует точную ревизию Event из каталога. Мы не связываем ревизии только по одинаковому коду.</p><Button label="Перейти к запуску" @click="selectStage('trigger')" /></div>
        </main>

        <main v-else class="stage-overview">
          <div v-if="studioStage === 'trigger'" class="overview-card"><span class="eyebrow">Этап 1</span><h1>Событие запуска</h1><p>Это событие становится поводом проверить сценарий. Поля текущего события затем доступны в конструкторе условий.</p><div v-if="selectedAuthoringEvent" class="selected-trigger"><i class="pi pi-bolt" /><div><strong>{{ selectedAuthoringEvent.name }}</strong><code>{{ selectedAuthoringEvent.code }}</code></div><span>Schema v{{ selectedAuthoringEvent.schemaVersion }}</span></div><Message v-else severity="warn" :closable="false">Выбранная ревизия события отсутствует в Scenario Authoring catalog. Выберите доступную ревизию.</Message></div>
          <div v-else-if="studioStage === 'audience'" class="overview-card unavailable"><span class="eyebrow">Этап 2</span><h1>Аудитория</h1><p>Язык, страна, профиль и сегменты требуют типизированного V2-контракта. Эти настройки не смешиваются с поведением и пока честно недоступны.</p><Message severity="secondary" :closable="false">Backend V2 ещё не предоставляет typed Audience leaves и segment catalog (BE-FE-05/06).</Message></div>
          <div v-else class="overview-card unavailable"><span class="eyebrow">Этап 5</span><h1>Доставка и публикация</h1><p>Delivery Policy, immutable publish и revision conflict flow реализуются следующими отдельными срезами. Проверка Rule уже доступна на этапе «Условия».</p></div>
        </main>

        <RuleValidationPreview v-if="studioStage === 'eligibility' && ruleContext" :project-id="auth.project?.id ?? ''" :draft="ruleDraft" :context="ruleContext" :draft-revision="ruleDraftRevision" @focus-node="focusRuleIssue" />
        <ScenarioNodeInspector v-else-if="studioStage === 'actions' && inspectorMode === 'node' && selectedAction" :action="selectedAction" :actions="form.actions" :action-definitions="actionDefinitions" :events="events" :elements="elements" :template-variables="templateVariables" :condition-paths="conditionPaths" :issues="selectedIssues" @change-type="changeType" @create-target="createTarget" @remove="removeSelected" @update="updateSelected" @rename="renameNode" @validity="setConfigValidity(selectedAction, $event)" />
        <aside v-else-if="studioStage === 'trigger' || studioStage === 'actions'" class="settings-panel">
          <div class="settings-head"><small>Сценарий</small><h2>Настройки запуска</h2><p>Событие и фильтры проверяются до старта графа.</p></div>
          <section><div class="field"><label>Название *</label><InputText v-model="form.name" placeholder="Предложение бонуса" /></div><div class="field"><label>Системный код *</label><InputText v-model="form.code" class="mono" placeholder="bonus_offer" @input="codeTouched = true" /></div><div class="field"><label>Описание</label><Textarea v-model="form.description" rows="3" auto-resize /></div></section>
          <section><div class="field"><label>Событие запуска *</label><Select v-model="form.eventDefinitionId" :options="eventOptions" option-label="label" option-value="value"><template #option="{ option }"><div class="event-option"><span>{{ option.label }}</span><code>{{ option.code }}</code></div></template></Select></div><div class="field"><label>Статус</label><Select v-model="form.status" :options="statusOptions" option-label="label" option-value="value" /></div><div class="field"><label>Чат для сообщений</label><Select v-model="form.conversationPolicy" :options="conversationPolicyOptions" option-label="label" option-value="value" /><small>Настройка применяется ко всем сообщениям в рамках запуска сценария.</small></div><div class="settings-row"><div class="field"><label>Приоритет</label><InputNumber v-model="form.priority" :min="-1000" :max="1000" /></div><div class="field"><label>Макс. запусков</label><InputNumber v-model="form.maxRunsPerUser" :min="1" placeholder="Без лимита" /></div></div><div class="field"><label>Cooldown, сек.</label><InputNumber v-model="form.cooldownSeconds" :min="0" placeholder="Без паузы" /></div></section>
          <section v-if="form.conditions.length"><div class="section-copy"><h3>Legacy conditions</h3><p>Эти raw-path условия сохранены только для старого runtime. Новые behavioral conditions создаются на отдельном этапе и не смешиваются с узлом «Условие».</p></div><ScenarioConditionRows v-model="form.conditions" :paths="triggerConditionPaths" /></section>
        </aside>
        <aside v-else class="stage-aside"><i class="pi pi-info-circle" /><strong>{{ studioStage === 'audience' ? 'Предметная граница сохранена' : 'Следующий slice' }}</strong><p>{{ studioStage === 'audience' ? 'Недоступная аудитория не считается ошибкой и не выглядит редактируемой.' : 'Текущий draft не выдаёт незавершённый publish flow за рабочую функцию.' }}</p></aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.scenario-studio{container:scenario-studio / inline-size;height:100vh;display:flex;flex-direction:column;background:#f3f4ef}.studio-header{height:72px;flex:0 0 72px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:20px;padding:0 20px;border-bottom:1px solid var(--line);background:#fff;z-index:5}.header-left,.header-actions{display:flex;align-items:center;gap:10px}.header-left>div span,.header-left>div strong{display:block}.header-left>div span{color:var(--muted);font-size:.62rem;text-transform:uppercase;letter-spacing:.1em}.header-left>div strong{margin-top:3px;font:700 .86rem Manrope}.header-center{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:.68rem}.header-center span{padding:7px 9px;border-radius:9px;background:#f2f3ee}.header-center .invalid{background:#fff0ed;color:#b85748}.header-actions{justify-content:flex-end}.studio-grid{min-height:0;flex:1;display:grid;grid-template-columns:188px minmax(0,1fr) 360px}.studio-sidebar{overflow:auto;padding:15px 10px;border-right:1px solid var(--line);background:#fbfbf8}.studio-stages{display:flex;flex-direction:column;gap:5px}.studio-stages button{display:flex;align-items:center;gap:9px;width:100%;min-width:0;padding:9px;border:0;border-radius:12px;background:transparent;color:var(--ink);text-align:left;cursor:pointer}.studio-stages button:hover,.studio-stages button.active{background:#f0edff}.stage-index{display:grid;place-items:center;flex:0 0 28px;height:28px;border-radius:9px;background:#eceee8;color:#777c72;font-size:.62rem;font-weight:800}.stage-index.valid{background:#e7f4dd;color:#4d8a51}.stage-index.invalid{background:#fff0ed;color:#b85748}.stage-copy{min-width:0}.stage-copy strong,.stage-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.stage-copy strong{font-size:.72rem}.stage-copy small{margin-top:2px;color:var(--muted);font-size:.58rem}.action-library{margin-top:17px;padding-top:15px;border-top:1px solid var(--line)}.library-head{padding:0 7px 14px}.library-head span,.library-head strong{display:block}.library-head span{color:var(--muted);font-size:.62rem;text-transform:uppercase;letter-spacing:.1em}.library-head strong{margin-top:3px;font:700 .85rem Manrope}.library-group{margin-bottom:19px}.library-group h3{margin:0 7px 7px;color:#92968e;font-size:.61rem;text-transform:uppercase;letter-spacing:.12em}.library-group button{width:100%;display:flex;align-items:center;gap:9px;margin-bottom:5px;padding:9px;border:1px solid transparent;border-radius:11px;background:transparent;color:var(--ink);text-align:left;cursor:pointer}.library-group button:hover{border-color:#dddfe7;background:#fff;box-shadow:0 5px 18px rgba(35,39,31,.05)}.library-group button>span{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:#efebff;color:#6f58d6}.library-group button>div{min-width:0;flex:1}.library-group button strong,.library-group button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.library-group button strong{font-size:.72rem}.library-group button small{margin-top:2px;color:var(--muted);font-size:.6rem}.library-group button>.pi-plus{color:#a0a49b;font-size:.65rem}.graph-canvas,.rule-canvas,.stage-overview{position:relative;min-width:0;min-height:0;overflow:auto;background:#f6f7f2}.scenario-studio :deep(.rule-validation-preview){height:100%;overflow:auto;padding:20px;border-left:1px solid var(--line);background:#fff}.graph-canvas :deep(.vue-flow){height:100%}.graph-canvas :deep(.vue-flow__node-input){min-width:205px;padding:13px;border:0;border-radius:14px;background:#242821;color:#fff;box-shadow:0 10px 30px rgba(35,39,31,.16);font:700 .75rem Manrope}.graph-canvas :deep(.vue-flow__controls),.graph-canvas :deep(.vue-flow__minimap){border:1px solid var(--line);border-radius:11px;box-shadow:none;overflow:hidden}.actions-warning{position:absolute;z-index:3;top:12px;left:12px;width:min(520px,calc(100% - 24px))}.canvas-empty{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;align-items:center;flex-direction:column;color:var(--muted);pointer-events:none}.canvas-empty i{font-size:2rem;color:#aeb3a7}.canvas-empty strong{margin-top:12px;color:var(--ink);font:700 .9rem Manrope}.canvas-empty span{margin-top:5px;font-size:.72rem}.stage-overview{display:grid;place-items:center;padding:28px}.overview-card{width:min(650px,100%);padding:28px;border:1px solid var(--line);border-radius:22px;background:#fff;box-shadow:var(--shadow)}.overview-card p{color:var(--muted)}.selected-trigger{display:flex;align-items:center;gap:12px;margin-top:20px;padding:15px;border-radius:15px;background:#242821;color:#fff}.selected-trigger>i{color:var(--accent)}.selected-trigger div{min-width:0;flex:1}.selected-trigger strong,.selected-trigger code{display:block}.selected-trigger code{margin-top:4px;color:#adb2a7;font-size:.68rem}.selected-trigger>span{font-size:.65rem}.selected-trigger>span{font-size:.65rem}.stage-empty{display:flex;align-items:center;flex-direction:column;justify-content:center;min-height:100%;padding:34px;color:var(--muted);text-align:center}.stage-empty>i{font-size:2rem}.stage-empty h2{margin-top:14px;color:var(--ink)}.stage-empty p{max-width:520px}.settings-panel{height:100%;overflow:auto;border-left:1px solid var(--line);background:#fff}.settings-head{padding:21px 20px 17px;border-bottom:1px solid var(--line)}.settings-head small{color:var(--muted);font-size:.65rem;text-transform:uppercase;letter-spacing:.1em}.settings-head h2{margin-top:4px;font-size:1.08rem}.settings-head p,.section-copy p{margin:5px 0 0;color:var(--muted);font-size:.7rem}.settings-panel section{padding:18px 20px;border-bottom:1px solid var(--line)}.settings-panel .field{margin-top:13px}.settings-panel .field:first-child{margin-top:0}.settings-panel .field>small{color:var(--muted);font-size:.67rem}.settings-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.section-copy h3{margin:0;font-size:.8rem}.event-option{display:flex;justify-content:space-between;gap:14px;width:100%}.event-option code{color:var(--muted);font-size:.65rem}.stage-aside{padding:24px;border-left:1px solid var(--line);background:#fff}.stage-aside>i{color:var(--violet)}.stage-aside strong{display:block;margin-top:12px;font-size:.8rem}.stage-aside p{color:var(--muted);font-size:.7rem}.studio-loading{flex:1;display:grid;place-items:center;align-content:center;gap:10px;color:var(--muted)}.page-error{margin:20px}.save-error{position:fixed;z-index:20;top:82px;left:50%;transform:translateX(-50%);width:min(520px,calc(100vw - 24px));box-shadow:var(--shadow)}
.stage-index.is-valid{background:#e7f4dd;color:#4d8a51}.stage-index.is-invalid{background:#fff0ed;color:#b85748}.studio-sidebar::-webkit-scrollbar{display:none}
@container scenario-studio (max-width:1024px){.scenario-studio{height:auto;min-height:100vh}.studio-header{grid-template-columns:1fr 1fr}.header-center{display:none}.studio-grid{flex:none;grid-template-columns:minmax(0,1fr)}.studio-sidebar{overflow-x:auto;padding:9px;border-right:0;border-bottom:1px solid var(--line);scrollbar-width:none}.studio-stages{flex-direction:row;min-width:max-content}.studio-stages button{width:142px}.action-library{display:none}.graph-canvas{min-height:65vh}.rule-canvas,.stage-overview{min-height:55vh}.settings-panel,.stage-aside,.inspector{height:auto;min-height:320px;border-top:1px solid var(--line);border-left:0}.scenario-studio :deep(.rule-validation-preview){height:auto;min-height:520px;overflow:visible;border-left:0;border-top:1px solid var(--line)}}
@container scenario-studio (max-width:767px){.scenario-studio{min-height:calc(100vh - 60px)}.studio-header{min-height:70px;height:auto;padding:10px 12px;gap:8px}.header-left>div span{display:none}.header-actions .p-button:first-child{display:none}.studio-stages button{width:116px}.stage-copy small{display:none}.rule-canvas{min-height:50vh}.stage-overview{padding:16px}.overview-card{padding:20px}.settings-row{grid-template-columns:1fr}.selected-trigger{align-items:flex-start;flex-wrap:wrap}.selected-trigger>span{width:100%;padding-left:28px}}
@container scenario-studio (max-width:390px){.studio-header{grid-template-columns:minmax(0,1fr) auto}.header-left{min-width:0}.header-left>div{min-width:0}.header-left strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.header-actions .p-button{padding-inline:10px}.header-actions .p-button :deep(.p-button-label){display:none}.studio-stages button{width:104px;padding:8px}.stage-index{flex-basis:25px;height:25px}.stage-overview{padding:10px}.overview-card{padding:16px}.save-error{top:70px}}
</style>
