<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import Message from 'primevue/message'
import {
  applyRuleCommand,
  applyRuleQuickStartRecipe,
  createRuleQuickStartRecipes,
  RULE_LIMITS,
  serializeRuleDraft,
  summarizeRule,
  type PartialRuleLeaf,
  type RuleCommand,
  type RuleDomainContext,
  type RuleDraft,
  type RuleDraftNode,
  type RuleLeafInput,
  type RuleQuickStartRecipe,
} from '../model'
import RuleLeafEditor from './RuleLeafEditor.vue'
import RuleNodeCard from './RuleNodeCard.vue'
import RuleSourcePicker from './RuleSourcePicker.vue'

interface SourceSession {
  parentNodeId: string
  groupLabel: string
  opener: HTMLElement
}

interface EditorSession {
  kind: PartialRuleLeaf['kind']
  opener: HTMLElement
  parentNodeId?: string
  nodeId?: string
}

const props = defineProps<{
  modelValue: RuleDraft
  context: RuleDomainContext
}>()
const emit = defineEmits<{
  'update:modelValue': [draft: RuleDraft]
  'editing-dirty': [dirty: boolean]
}>()

const sourceSession = ref<SourceSession | null>(null)
const editorSession = ref<EditorSession | null>(null)
const commandError = ref('')
const activeIssue = ref<{ fieldPath?: string; message: string } | null>(null)
const summary = computed(() => summarizeRule(props.modelValue, props.context))
const serialization = computed(() => serializeRuleDraft(props.modelValue, props.context))
const groupTargets = computed(() => collectGroups(props.modelValue.root))
const editedNode = computed(() => editorSession.value?.nodeId ? findNode(props.modelValue.root, editorSession.value.nodeId) : undefined)
const recipeLimitReached = computed(() => summary.value.nodes >= RULE_LIMITS.maxNodes
  || summary.value.leaves >= RULE_LIMITS.maxLeaves
  || summary.value.aggregateLeaves >= RULE_LIMITS.maxAggregateLeaves
  || ((props.modelValue.root.kind === 'all' || props.modelValue.root.kind === 'any') && props.modelValue.root.children.length >= RULE_LIMITS.maxGroupChildren))
const recipes = computed(() => createRuleQuickStartRecipes(props.context))

function collectGroups(node: RuleDraftNode, result: Array<{ nodeId: string; label: string; childCount: number }> = []) {
  if (node.kind === 'all' || node.kind === 'any') {
    result.push({ nodeId: node.nodeId, label: `${node.kind === 'all' ? 'Должны выполняться все условия' : 'Достаточно одного условия'} · ${summary.value.byNodeId[node.nodeId] ?? ''}`, childCount: node.children.length })
    node.children.forEach((child) => collectGroups(child, result))
  }
  if (node.kind === 'not') collectGroups(node.child, result)
  return result
}

function findNode(node: RuleDraftNode, nodeId: string): RuleDraftNode | undefined {
  if (node.nodeId === nodeId) return node
  if (node.kind === 'all' || node.kind === 'any') {
    for (const child of node.children) {
      const match = findNode(child, nodeId)
      if (match) return match
    }
  }
  return node.kind === 'not' ? findNode(node.child, nodeId) : undefined
}

function findParent(node: RuleDraftNode, nodeId: string): RuleDraftNode | undefined {
  if ((node.kind === 'all' || node.kind === 'any') && node.children.some((child) => child.nodeId === nodeId)) return node
  if (node.kind === 'not' && node.child.nodeId === nodeId) return node
  if (node.kind === 'all' || node.kind === 'any') {
    for (const child of node.children) {
      const parent = findParent(child, nodeId)
      if (parent) return parent
    }
  }
  return node.kind === 'not' ? findParent(node.child, nodeId) : undefined
}

function runCommand(command: RuleCommand) {
  const previousParent = command.type === 'remove' ? findParent(props.modelValue.root, command.nodeId) : undefined
  const result = applyRuleCommand(props.modelValue, command, props.context)
  if (!result.ok) {
    commandError.value = result.error.message
    focusNode(result.error.nodeId)
    return false
  }
  commandError.value = ''
  emit('update:modelValue', result.draft)
  void nextTick(() => {
    const focusId = command.type === 'remove' ? previousParent?.nodeId ?? result.focusNodeId : result.focusNodeId
    if (command.type === 'remove' && focusId) {
      document.querySelector<HTMLElement>(`[data-add-condition-for="${focusId}"]`)?.focus()
      return
    }
    focusNode(focusId)
  })
  return true
}

function focusNode(nodeId?: string) {
  if (!nodeId) return
  document.querySelector<HTMLElement>(`[data-rule-node="${nodeId}"] > section, [data-rule-node="${nodeId}"] > article`)?.focus()
}

function openSources(parentNodeId: string, groupLabel: string, opener: HTMLElement) {
  sourceSession.value = { parentNodeId, groupLabel, opener }
  void nextTick(() => document.querySelector<HTMLElement>('.source-picker [data-source]')?.focus())
}

function chooseSource(kind: PartialRuleLeaf['kind']) {
  const source = sourceSession.value
  if (!source) return
  editorSession.value = { kind, parentNodeId: source.parentNodeId, opener: source.opener }
  activeIssue.value = null
  sourceSession.value = null
}

function editLeaf(nodeId: string, opener: HTMLElement) {
  const node = findNode(props.modelValue.root, nodeId)
  if (!node) return
  const kind = node.kind === 'incomplete' ? node.leaf.kind : node.kind
  if (!['eventField', 'eventAggregate', 'activityDayStreak'].includes(kind)) return
  activeIssue.value = null
  editorSession.value = { kind: kind as PartialRuleLeaf['kind'], nodeId, opener }
}

function applyLeaf(leaf: RuleLeafInput) {
  const session = editorSession.value
  if (!session) return
  const command: RuleCommand = session.nodeId
    ? { type: 'replaceLeaf', nodeId: session.nodeId, leaf }
    : { type: 'add', parentNodeId: session.parentNodeId!, node: leaf }
  if (!runCommand(command)) return
  const opener = session.opener
  emit('editing-dirty', false)
  activeIssue.value = null
  editorSession.value = null
  void nextTick(() => opener.focus())
}

function closeEditor() {
  const opener = editorSession.value?.opener
  emit('editing-dirty', false)
  activeIssue.value = null
  editorSession.value = null
  void nextTick(() => opener?.focus())
}

function closeSources() {
  const opener = sourceSession.value?.opener
  sourceSession.value = null
  void nextTick(() => opener?.focus())
}

function addRecipe(recipe: RuleQuickStartRecipe) {
  const root = props.modelValue.root
  if (root.kind !== 'all' && root.kind !== 'any') {
    commandError.value = 'Готовый пример можно добавить только в корневую группу.'
    return
  }
  const result = applyRuleQuickStartRecipe(props.modelValue, root.nodeId, recipe, props.context)
  if (!result.ok) {
    commandError.value = result.error.message
    focusNode(result.error.nodeId)
    return
  }
  commandError.value = ''
  emit('update:modelValue', result.draft)
  void nextTick(() => focusNode(result.focusNodeId))
}

function issueControlSelector(fieldPath?: string) {
  if (!fieldPath) return '.rule-leaf-drawer select, .rule-leaf-drawer input'
  if (fieldPath === 'eventCode') return '#history-event'
  if (fieldPath === 'fieldKey') return '#trigger-field, #measure-field'
  if (fieldPath === 'operator') return '#trigger-operator'
  if (fieldPath === 'value') return '[aria-label^="Значение поля"]'
  if (fieldPath === 'measure') return '#aggregate-measure'
  if (fieldPath.startsWith('window')) return '#history-period'
  if (fieldPath === 'compare.operator') return '#compare-operator, #streak-operator'
  if (fieldPath === 'compare.value') return '#compare-value, #streak-value'
  const filter = /^filters\.(\d+)\.(fieldKey|operator|value)$/.exec(fieldPath)
  if (!filter) return '.rule-leaf-drawer select, .rule-leaf-drawer input'
  const index = Number(filter[1]) + 1
  const label = filter[2] === 'fieldKey' ? 'Поле' : filter[2] === 'operator' ? 'Оператор' : 'Значение'
  return `[aria-label="${label} фильтра ${index}"]`
}

function focusIssue(target: { nodeId?: string; fieldPath?: string; message?: string }) {
  if (!target.nodeId) return
  const node = findNode(props.modelValue.root, target.nodeId)
  const opener = document.querySelector<HTMLElement>(`[data-rule-node="${target.nodeId}"] > section, [data-rule-node="${target.nodeId}"] > article`)
  if (!node || !opener) return
  const kind = node.kind === 'incomplete' ? node.leaf.kind : node.kind
  if (!['eventField', 'eventAggregate', 'activityDayStreak'].includes(kind)) {
    opener.focus()
    return
  }
  activeIssue.value = target.message ? { fieldPath: target.fieldPath, message: target.message } : null
  editorSession.value = { kind: kind as PartialRuleLeaf['kind'], nodeId: node.nodeId, opener }
  void nextTick(() => document.querySelector<HTMLElement>(issueControlSelector(target.fieldPath))?.focus())
}

defineExpose({ focusIssue })
</script>

<template>
  <section class="rule-builder" aria-labelledby="rule-builder-title">
    <Message v-if="commandError" severity="error" :closable="false" role="alert">{{ commandError }}</Message>
    <p class="sr-live" aria-live="polite">{{ commandError || (serialization.ok ? 'Условия заполнены' : 'Черновик условий изменён') }}</p>

    <details class="recipe-panel">
      <summary>
        <span class="recipe-heading">
          <strong>Быстрый старт</strong>
          <small>Пример появится в дереве как обычное условие — его можно сразу изменить.</small>
        </span>
        <i class="pi pi-chevron-down recipe-chevron" aria-hidden="true" />
      </summary>
      <div class="recipe-actions">
        <button
          v-for="recipe in recipes"
          :key="recipe.id"
          type="button"
          :data-recipe="recipe.id"
          :disabled="recipeLimitReached || !recipe.nodes"
          :title="!recipe.nodes ? recipe.description : undefined"
          @click="addRecipe(recipe)"
        >
          <i :class="recipe.icon" aria-hidden="true" />
          <span><strong>{{ recipe.label }}</strong><small>{{ recipe.description }}</small></span>
          <i class="pi pi-plus" aria-hidden="true" />
        </button>
      </div>
    </details>

    <details class="glossary"><summary>Как работают группы условий?</summary><dl><div><dt>Должны выполняться все условия</dt><dd>Пользователь подходит, только если выполнено каждое условие группы.</dd></div><div><dt>Достаточно одного условия</dt><dd>Пользователь подходит, если выполнено хотя бы одно условие группы.</dd></div><div><dt>Исключение</dt><dd>Пользователь подходит, если выбранное условие не выполнено.</dd></div></dl></details>

    <ol class="rule-tree" aria-label="Дерево условий запуска">
      <RuleNodeCard :node="modelValue.root" :summary-by-node-id="summary.byNodeId" :group-targets="groupTargets" :total-nodes="summary.nodes" :total-leaves="summary.leaves" root @edit="editLeaf" @add-condition="openSources" @command="runCommand" />
    </ol>

    <RuleSourcePicker v-if="sourceSession" :group-label="sourceSession.groupLabel" :aggregate-limit-reached="summary.aggregateLeaves >= RULE_LIMITS.maxAggregateLeaves" @select="chooseSource" @close="closeSources" />

    <aside class="builder-summary" aria-label="Итог условий">
      <div><span>Результат</span><strong>{{ summary.text }}</strong></div>
      <dl><div><dt>Условия</dt><dd>{{ summary.leaves }}</dd></div><div><dt>История</dt><dd>{{ summary.aggregateLeaves }}</dd></div><div><dt>Макс. период</dt><dd>{{ summary.maxWindowMs ? `${Math.ceil(summary.maxWindowMs / 86_400_000)} дн.` : '—' }}</dd></div></dl>
      <details><summary>Технические детали и лимиты</summary><p>Версия каталога <code>{{ context.contract.revision }}</code>. Неизменяемые коды создаются автоматически.</p><p>{{ summary.nodes }}/{{ RULE_LIMITS.maxNodes }} узлов · {{ summary.leaves }}/{{ RULE_LIMITS.maxLeaves }} условий · {{ summary.aggregateLeaves }}/{{ RULE_LIMITS.maxAggregateLeaves }} условий истории и активности · {{ Math.ceil(summary.totalWindowMs / 86_400_000) }}/{{ RULE_LIMITS.maxTotalWindowMs / 86_400_000 }} дней суммарной истории.</p></details>
    </aside>

    <RuleLeafEditor v-if="editorSession" visible :kind="editorSession.kind" :node="editedNode" :context="context" :active-issue="activeIssue ?? undefined" @apply="applyLeaf" @close="closeEditor" @dirty-change="emit('editing-dirty', $event)" />
  </section>
</template>

<style scoped>
.rule-builder{container:rule-builder / inline-size;display:flex;flex-direction:column;gap:14px;min-width:0;padding:20px;background:var(--surface-subtle);color:var(--ink)}.recipe-panel{border:1px solid var(--status-violet);border-radius:14px;background:var(--status-violet-soft);overflow:hidden}.recipe-panel>summary{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px;cursor:pointer;list-style:none}.recipe-panel>summary::-webkit-details-marker{display:none}.recipe-heading{min-width:0}.recipe-heading strong,.recipe-heading small{display:block}.recipe-heading strong{color:var(--text-secondary);font-size:.72rem;letter-spacing:.08em;text-transform:uppercase}.recipe-heading small{margin-top:4px;color:var(--text-small-muted);font-size:.64rem;line-height:1.4}.recipe-chevron{flex:0 0 auto;color:var(--status-violet-text);transition:transform .2s ease}.recipe-panel[open] .recipe-chevron{transform:rotate(180deg)}.recipe-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:0 14px 14px}.recipe-actions button{display:grid;grid-template-columns:26px minmax(0,1fr) 14px;align-items:center;gap:8px;min-width:0;padding:10px;border:1px solid var(--status-violet);border-radius:11px;background:var(--surface-card);color:var(--status-violet-text);text-align:left;cursor:pointer}.recipe-actions button>i:first-child{display:grid;place-items:center;width:26px;height:26px;border-radius:8px;background:var(--status-violet-soft)}.recipe-actions button>span{min-width:0}.recipe-actions button strong,.recipe-actions button small{display:block}.recipe-actions button strong{font-size:.65rem;line-height:1.3}.recipe-actions button small{margin-top:3px;color:var(--text-small-muted);font-size:.58rem;line-height:1.35}.recipe-actions button>.pi-plus{font-size:.62rem}.recipe-actions button:disabled{opacity:.45;cursor:not-allowed}.glossary{padding:0 3px;color:var(--text-secondary);font-size:.67rem}.glossary summary{cursor:pointer;font-weight:700}.glossary dl{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:9px 0 0}.glossary dl div{padding:9px;border-radius:10px;background:var(--surface-card)}.glossary dt{font-weight:800}.glossary dd{margin:3px 0 0;line-height:1.4}.rule-tree{margin:0;padding:0}.builder-summary{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;padding:14px;border:1px solid var(--border-default);border-radius:15px;background:var(--surface-emphasis);color:var(--text-on-emphasis)}.builder-summary>div>span{display:block;color:var(--text-on-emphasis-muted);font-size:.61rem;text-transform:uppercase;letter-spacing:.08em}.builder-summary>div>strong{display:block;margin-top:5px;font-size:.72rem;line-height:1.45}.builder-summary dl{display:flex;gap:14px;margin:0}.builder-summary dl div{text-align:right}.builder-summary dt{color:var(--text-on-emphasis-muted);font-size:.58rem}.builder-summary dd{margin:3px 0 0;font-size:.7rem;font-weight:700}.builder-summary details{grid-column:1/3;color:var(--text-on-emphasis-muted);font-size:.63rem}.builder-summary details summary{cursor:pointer}.builder-summary details p{margin:7px 0 0}.builder-summary code{color:var(--brand)}.sr-live{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@container rule-builder (max-width:1024px){.rule-builder{padding:18px}.recipe-actions{grid-template-columns:repeat(2,minmax(0,1fr))}.builder-summary{grid-template-columns:1fr}.builder-summary dl{justify-content:space-between}.builder-summary details{grid-column:1}}
@container rule-builder (max-width:768px){.rule-builder{padding:16px}.recipe-actions{grid-template-columns:1fr}.glossary dl{grid-template-columns:1fr}}
@container rule-builder (max-width:390px){.rule-builder{padding:12px;gap:11px}.recipe-panel>summary{padding:12px}.recipe-actions{padding:0 12px 12px}.builder-summary dl{display:grid;grid-template-columns:repeat(3,1fr)}.builder-summary dl div{text-align:left}}
@container rule-builder (max-width:320px){.rule-builder{padding:10px}.builder-summary{padding:12px}.builder-summary dl{gap:7px}}
</style>
