<script setup lang="ts">
import { computed } from 'vue'
import { RULE_LIMITS, type RuleCommand, type RuleDraftNode } from '../model'

defineOptions({ name: 'RuleNodeCard' })

interface GroupTarget { nodeId: string; label: string; childCount: number }
interface Ancestor { nodeId: string; parentNodeId?: string; index: number }

const props = defineProps<{
  node: RuleDraftNode
  summaryByNodeId: Readonly<Record<string, string>>
  groupTargets: GroupTarget[]
  parentNodeId?: string
  index?: number
  siblingCount?: number
  ancestors?: Ancestor[]
  root?: boolean
  lockedByNot?: boolean
  totalNodes: number
  totalLeaves: number
  depth?: number
}>()
const emit = defineEmits<{
  edit: [nodeId: string, opener: HTMLElement]
  addCondition: [parentNodeId: string, label: string, opener: HTMLElement]
  command: [command: RuleCommand]
}>()

const groupLabel = computed(() => props.node.kind === 'all' ? 'Все условия' : props.node.kind === 'any' ? 'Хотя бы одно условие' : '')
const summary = computed(() => props.summaryByNodeId[props.node.nodeId] || fallbackSummary(props.node))
const descendantIds = computed(() => collectIds(props.node))
const moveTargets = computed(() => props.groupTargets.filter((target) => !descendantIds.value.has(target.nodeId) && target.nodeId !== props.parentNodeId))
const parentAncestor = computed(() => props.ancestors?.at(-1))
const groupFull = computed(() => (props.node.kind === 'all' || props.node.kind === 'any') && props.node.children.length >= RULE_LIMITS.maxGroupChildren)
const conditionLimitReached = computed(() => groupFull.value || props.totalNodes >= RULE_LIMITS.maxNodes || props.totalLeaves >= RULE_LIMITS.maxLeaves || (props.depth ?? 0) >= RULE_LIMITS.maxDepth)
const groupLimitReached = computed(() => groupFull.value || props.totalNodes >= RULE_LIMITS.maxNodes || (props.depth ?? 0) >= RULE_LIMITS.maxDepth - 1)
const conditionLimitTitle = computed(() => groupFull.value
  ? `В одной группе допустимо не более ${RULE_LIMITS.maxGroupChildren} условий`
  : props.totalLeaves >= RULE_LIMITS.maxLeaves
    ? `В правиле допустимо не более ${RULE_LIMITS.maxLeaves} условий`
    : props.totalNodes >= RULE_LIMITS.maxNodes
      ? `В правиле допустимо не более ${RULE_LIMITS.maxNodes} узлов`
      : (props.depth ?? 0) >= RULE_LIMITS.maxDepth ? `Допустима вложенность не более ${RULE_LIMITS.maxDepth} уровней` : undefined)
const groupLimitTitle = computed(() => groupFull.value
  ? `В одной группе допустимо не более ${RULE_LIMITS.maxGroupChildren} условий`
  : props.totalNodes >= RULE_LIMITS.maxNodes
    ? `В правиле допустимо не более ${RULE_LIMITS.maxNodes} узлов`
    : (props.depth ?? 0) >= RULE_LIMITS.maxDepth - 1 ? `Новая группа не сможет содержать условия: допустима вложенность не более ${RULE_LIMITS.maxDepth} уровней` : undefined)

function fallbackSummary(node: RuleDraftNode) {
  if (node.kind === 'empty') return 'Условие ещё не настроено'
  if (node.kind === 'incomplete') return 'Заполните условие'
  if (node.kind === 'opaque') return `Неподдерживаемое условие${node.reportedKind ? ` ${node.reportedKind}` : ''}`
  if (node.kind === 'all') return 'Все вложенные условия'
  if (node.kind === 'any') return 'Хотя бы одно вложенное условие'
  if (node.kind === 'not') return `НЕ: ${props.summaryByNodeId[node.child.nodeId] || 'условие'}`
  return node.kind
}

function collectIds(node: RuleDraftNode, result = new Set<string>()) {
  result.add(node.nodeId)
  if (node.kind === 'all' || node.kind === 'any') node.children.forEach((child) => collectIds(child, result))
  if (node.kind === 'not') collectIds(node.child, result)
  return result
}

function element(event: Event) { return event.currentTarget as HTMLElement }
function moveToGroup(event: Event) {
  const targetId = (event.target as HTMLSelectElement).value
  if (!targetId) return
  const target = props.groupTargets.find((item) => item.nodeId === targetId)
  if (target) emit('command', { type: 'move', nodeId: props.node.nodeId, toParentNodeId: target.nodeId, toIndex: target.childCount })
  ;(event.target as HTMLSelectElement).value = ''
}
</script>

<template>
  <li class="rule-node" :data-rule-node="node.nodeId">
    <section v-if="node.kind === 'all' || node.kind === 'any'" class="group-card" role="group" :aria-label="groupLabel" tabindex="-1">
      <header class="group-header">
        <div class="logic-switch" role="group" :aria-label="`Логика группы ${groupLabel}`">
          <button type="button" aria-label="Все условия" :aria-pressed="node.kind === 'all'" @click="emit('command', { type: 'changeGroup', nodeId: node.nodeId, kind: 'all' })">Все</button>
          <button type="button" aria-label="Хотя бы одно условие" :aria-pressed="node.kind === 'any'" @click="emit('command', { type: 'changeGroup', nodeId: node.nodeId, kind: 'any' })">Хотя бы одно</button>
        </div>
        <span class="group-count">{{ node.children.length }} {{ node.children.length === 1 ? 'условие' : 'условий' }}</span>
        <div v-if="!root && parentNodeId && !lockedByNot" class="group-tools">
          <button type="button" :disabled="index === 0" :aria-label="`Переместить группу вверх: ${groupLabel}`" @click="emit('command', { type: 'move', nodeId: node.nodeId, toParentNodeId: parentNodeId, toIndex: Math.max(0, (index ?? 0) - 1) })"><i class="pi pi-arrow-up" /></button>
          <button type="button" :disabled="index === (siblingCount ?? 1) - 1" :aria-label="`Переместить группу вниз: ${groupLabel}`" @click="emit('command', { type: 'move', nodeId: node.nodeId, toParentNodeId: parentNodeId, toIndex: (index ?? 0) + 1 })"><i class="pi pi-arrow-down" /></button>
          <select v-if="moveTargets.length" :aria-label="`Переместить группу ${groupLabel} в группу`" @change="moveToGroup"><option value="">В группу…</option><option v-for="target in moveTargets" :key="target.nodeId" :value="target.nodeId">{{ target.label }}</option></select>
          <button v-if="parentAncestor?.parentNodeId" type="button" :aria-label="`Переместить группу из группы: ${groupLabel}`" @click="emit('command', { type: 'move', nodeId: node.nodeId, toParentNodeId: parentAncestor.parentNodeId!, toIndex: parentAncestor.index + 1 })">Из группы</button>
          <button type="button" :aria-label="`Группа НЕ выполняется: ${groupLabel}`" @click="emit('command', { type: 'wrap', nodeId: node.nodeId, wrapper: 'not' })"><i class="pi pi-ban" /></button>
          <button type="button" class="danger" :aria-label="`Удалить группу: ${groupLabel}`" @click="emit('command', { type: 'remove', nodeId: node.nodeId })"><i class="pi pi-trash" /></button>
        </div>
      </header>
      <p class="group-summary">{{ summary }}</p>
      <ol v-if="node.children.length" class="node-list">
        <RuleNodeCard v-for="(child, childIndex) in node.children" :key="child.nodeId" :node="child" :summary-by-node-id="summaryByNodeId" :group-targets="groupTargets" :parent-node-id="node.nodeId" :index="childIndex" :sibling-count="node.children.length" :ancestors="[...(ancestors ?? []), { nodeId: node.nodeId, parentNodeId, index: index ?? 0 }]" :total-nodes="totalNodes" :total-leaves="totalLeaves" :depth="(depth ?? 0) + 1" @edit="(nodeId, opener) => emit('edit', nodeId, opener)" @add-condition="(parentId, label, opener) => emit('addCondition', parentId, label, opener)" @command="emit('command', $event)" />
      </ol>
      <div v-else class="group-empty"><span>Добавьте первое условие</span><small>Можно проверить событие запуска, историю или активные дни.</small></div>
      <footer class="group-actions">
        <button type="button" :data-add-condition-for="node.nodeId" :aria-label="`Добавить условие в группу ${groupLabel}`" :disabled="conditionLimitReached" :title="conditionLimitTitle" @click="emit('addCondition', node.nodeId, groupLabel, element($event))"><i class="pi pi-plus" /> Условие</button>
        <button type="button" :aria-label="`Добавить группу в ${groupLabel}`" :disabled="groupLimitReached" :title="groupLimitTitle" @click="emit('command', { type: 'add', parentNodeId: node.nodeId, node: { kind: 'all' } })"><i class="pi pi-folder-plus" /> Группа</button>
      </footer>
    </section>

    <article v-else class="leaf-card" :class="{ negative: node.kind === 'not', broken: node.kind === 'empty' || node.kind === 'incomplete' || node.kind === 'opaque' }" tabindex="-1">
      <div class="leaf-icon"><i :class="node.kind === 'not' ? 'pi pi-ban' : node.kind === 'eventAggregate' ? 'pi pi-history' : node.kind === 'activityDayStreak' ? 'pi pi-calendar' : 'pi pi-bolt'" /></div>
      <div class="leaf-copy"><span v-if="node.kind === 'not'" class="negative-label">НЕ</span><strong>{{ summary }}</strong><small v-if="node.kind === 'opaque'">Данные сохранены, но публикация недоступна.</small></div>
      <div class="leaf-actions">
        <button v-if="!['not', 'empty', 'opaque'].includes(node.kind)" type="button" class="icon-button" :aria-label="`Изменить условие: ${summary}`" @click="emit('edit', node.nodeId, element($event))"><i class="pi pi-pencil" /></button>
        <button v-if="node.kind !== 'not'" type="button" class="icon-button" :aria-label="`Условие НЕ выполняется: ${summary}`" @click="emit('command', { type: 'wrap', nodeId: node.nodeId, wrapper: 'not' })"><i class="pi pi-ban" /></button>
        <button v-else type="button" class="icon-button" :aria-label="`Убрать отрицание: ${summary}`" @click="emit('command', { type: 'unwrap', nodeId: node.nodeId })"><i class="pi pi-undo" /></button>
        <button v-if="parentNodeId && !lockedByNot" type="button" class="icon-button danger" :aria-label="`Удалить условие: ${summary}`" @click="emit('command', { type: 'remove', nodeId: node.nodeId })"><i class="pi pi-trash" /></button>
      </div>
      <div v-if="parentNodeId && !lockedByNot" class="move-actions" aria-label="Перемещение условия">
        <button type="button" :disabled="index === 0" :aria-label="`Переместить вверх: ${summary}`" @click="emit('command', { type: 'move', nodeId: node.nodeId, toParentNodeId: parentNodeId, toIndex: Math.max(0, (index ?? 0) - 1) })"><i class="pi pi-arrow-up" /></button>
        <button type="button" :disabled="index === (siblingCount ?? 1) - 1" :aria-label="`Переместить вниз: ${summary}`" @click="emit('command', { type: 'move', nodeId: node.nodeId, toParentNodeId: parentNodeId, toIndex: (index ?? 0) + 1 })"><i class="pi pi-arrow-down" /></button>
        <select v-if="moveTargets.length" :aria-label="`Переместить условие ${summary} в группу`" @change="moveToGroup"><option value="">В группу…</option><option v-for="target in moveTargets" :key="target.nodeId" :value="target.nodeId">{{ target.label }}</option></select>
        <button v-if="parentAncestor?.parentNodeId" type="button" :aria-label="`Переместить из группы: ${summary}`" @click="emit('command', { type: 'move', nodeId: node.nodeId, toParentNodeId: parentAncestor.parentNodeId!, toIndex: parentAncestor.index + 1 })">Из группы</button>
      </div>
      <ol v-if="node.kind === 'not'" class="node-list not-child"><RuleNodeCard :node="node.child" :summary-by-node-id="summaryByNodeId" :group-targets="groupTargets" :parent-node-id="node.nodeId" :index="0" :sibling-count="1" :ancestors="[...(ancestors ?? []), { nodeId: node.nodeId, parentNodeId, index: index ?? 0 }]" :total-nodes="totalNodes" :total-leaves="totalLeaves" :depth="(depth ?? 0) + 1" locked-by-not @edit="(nodeId, opener) => emit('edit', nodeId, opener)" @add-condition="(parentId, label, opener) => emit('addCondition', parentId, label, opener)" @command="emit('command', $event)" /></ol>
    </article>
  </li>
</template>

<style scoped>
.rule-node{min-width:0;list-style:none}.group-card{padding:16px;border:1px solid #dfe1da;border-radius:17px;background:#fff}.group-header{display:flex;align-items:center;justify-content:space-between;gap:12px}.logic-switch{display:flex;padding:3px;border-radius:11px;background:#eef0ea}.logic-switch button{border:0;border-radius:8px;padding:7px 10px;background:transparent;color:#74796f;font-size:.69rem;font-weight:700;cursor:pointer}.logic-switch button[aria-pressed=true]{background:#fff;color:#5f4cc0;box-shadow:0 2px 7px rgba(35,39,31,.08)}.group-count{margin-left:auto;color:var(--muted);font-size:.65rem}.group-tools{display:flex;align-items:center;gap:3px}.group-tools button{display:grid;place-items:center;min-width:28px;height:28px;border:0;border-radius:8px;background:#f1f2ed;color:#70756c;font-size:.62rem;cursor:pointer}.group-tools button:disabled{opacity:.35}.group-tools button.danger{color:#bd5647}.group-tools select{max-width:130px;border:1px solid var(--line);border-radius:8px;padding:5px;background:#fff;font-size:.61rem}.group-summary{margin:10px 0 0;color:#666b62;font-size:.7rem}.node-list{display:flex;flex-direction:column;gap:9px;margin:13px 0 0;padding:0 0 0 14px;border-left:2px solid #e8e5f4}.group-empty{display:flex;flex-direction:column;align-items:center;margin-top:13px;padding:18px;border:1px dashed #d9dbd4;border-radius:12px;color:#747970;text-align:center}.group-empty span{font-size:.74rem;font-weight:700}.group-empty small{margin-top:4px;font-size:.64rem}.group-actions{display:flex;gap:7px;margin-top:12px}.group-actions button,.move-actions button{border:0;border-radius:9px;background:#f0edf9;color:#6551c3;padding:7px 9px;font-size:.67rem;font-weight:700;cursor:pointer}.group-actions button:last-child{background:#f1f2ed;color:#656a61}.group-actions button:disabled{opacity:.45;cursor:not-allowed}.leaf-card{display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:start;gap:10px;padding:12px;border:1px solid #e1e3dc;border-radius:14px;background:#fafaf8}.leaf-card.negative{border-color:#cfc7ef;background:#f9f7ff}.leaf-card.broken{border-color:#e7b9b0;background:#fff8f6}.leaf-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:#eeeaff;color:#6750cf}.leaf-copy{min-width:0}.leaf-copy strong,.leaf-copy small{display:block}.leaf-copy strong{font-size:.74rem;line-height:1.45}.leaf-copy small{margin-top:4px;color:var(--muted);font-size:.63rem}.negative-label{display:inline-block;margin-bottom:4px;padding:2px 5px;border-radius:5px;background:#6d57d3;color:#fff;font-size:.57rem;font-weight:800}.leaf-actions{display:flex;gap:2px}.icon-button{display:grid;place-items:center;width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:#777c72;cursor:pointer}.icon-button:hover{background:#eceee8}.icon-button.danger{color:#c25848}.move-actions{grid-column:2/4;display:flex;align-items:center;gap:5px;margin-top:3px}.move-actions button{padding:5px 7px;background:#eff0eb;color:#70756b}.move-actions button:disabled{opacity:.35;cursor:not-allowed}.move-actions select{min-width:0;max-width:170px;border:1px solid var(--line);border-radius:8px;background:#fff;padding:5px;color:#656a61;font-size:.63rem}.not-child{grid-column:1/4;margin-top:5px}@container rule-builder (max-width:768px){.group-header{flex-wrap:wrap}.group-tools{order:3;width:100%;flex-wrap:wrap}}@container rule-builder (max-width:390px){.group-card{padding:12px}.node-list{padding-left:8px}.leaf-card{grid-template-columns:30px minmax(0,1fr)}.leaf-icon{width:30px;height:30px}.leaf-actions{grid-column:2}.move-actions{grid-column:1/3;flex-wrap:wrap}.group-actions{display:grid;grid-template-columns:1fr 1fr}.group-actions button{min-height:38px}.group-tools select{max-width:110px}}@container rule-builder (max-width:320px){.logic-switch{width:100%}.logic-switch button{flex:1;padding-inline:6px}.group-count{margin-left:0}}
</style>
