<script setup lang="ts">
import { computed } from 'vue'
import type { AudienceCommand, AudienceDraftNode } from '../model'

defineOptions({ name: 'AudienceNodeCard' })
const props = defineProps<{
  node: AudienceDraftNode
  summaryByNodeId: Readonly<Record<string, string>>
  root?: boolean
  lockedByNot?: boolean
  depth?: number
}>()
const emit = defineEmits<{
  addCondition: [nodeId: string, label: string, opener: HTMLElement]
  command: [command: AudienceCommand]
  edit: [nodeId: string, opener: HTMLElement]
}>()
const summary = computed(() => props.summaryByNodeId[props.node.nodeId] ?? props.node.kind)
const groupLabel = computed(() => props.node.kind === 'all' ? 'Все условия' : 'Хотя бы одно условие')
</script>

<template>
  <li class="audience-node" :class="[`kind-${node.kind}`, { root }]" :data-audience-node="node.nodeId">
    <section v-if="node.kind === 'all' || node.kind === 'any'" tabindex="-1" class="group-card">
      <header><label><span>Логика группы</span><select :value="node.kind" :aria-label="`Логика группы: ${groupLabel}`" @change="emit('command', { type: 'changeGroup', nodeId: node.nodeId, kind: ($event.target as HTMLSelectElement).value as 'all' | 'any' })"><option value="all">Все условия</option><option value="any">Хотя бы одно</option></select></label><div class="group-actions"><button type="button" :aria-label="`Инвертировать группу аудитории: ${summary}`" @click="emit('command', { type: 'wrapNot', nodeId: node.nodeId })"><i class="pi pi-minus-circle" /></button><button v-if="!root" type="button" :aria-label="`Удалить условие аудитории: ${summary}`" @click="emit('command', { type: 'remove', nodeId: node.nodeId })"><i class="pi pi-trash" /></button></div></header>
      <ol v-if="node.children.length"><AudienceNodeCard v-for="child in node.children" :key="child.nodeId" :node="child" :summary-by-node-id="summaryByNodeId" :depth="(depth ?? 0) + 1" @add-condition="(...args) => emit('addCondition', ...args)" @command="(command) => emit('command', command)" @edit="(...args) => emit('edit', ...args)" /></ol><p v-else class="empty">Добавьте первое условие — аудитория пока не ограничена.</p>
      <footer><button type="button" :aria-label="`Добавить условие аудитории в ${groupLabel}`" @click="emit('addCondition', node.nodeId, groupLabel, $event.currentTarget as HTMLElement)"><i class="pi pi-plus" /> Условие</button><button type="button" :aria-label="`Добавить группу аудитории в ${groupLabel}`" :disabled="(depth ?? 0) >= 3" @click="emit('command', { type: 'addGroup', parentNodeId: node.nodeId })"><i class="pi pi-folder-plus" /> Группа</button></footer>
    </section>
    <article v-else-if="node.kind === 'not'" tabindex="-1" class="not-card"><header><span class="not-badge">НЕ</span><div><strong>Результат меняется на противоположный</strong><small>{{ summary }}</small></div><button type="button" :aria-label="`Убрать инверсию: ${summary}`" @click="emit('command', { type: 'unwrapNot', nodeId: node.nodeId })"><i class="pi pi-undo" /></button><button v-if="!root" type="button" :aria-label="`Удалить условие аудитории: ${summary}`" @click="emit('command', { type: 'remove', nodeId: node.nodeId })"><i class="pi pi-trash" /></button></header><ol><AudienceNodeCard :node="node.child" :summary-by-node-id="summaryByNodeId" locked-by-not :depth="(depth ?? 0) + 1" @add-condition="(...args) => emit('addCondition', ...args)" @command="(command) => emit('command', command)" @edit="(...args) => emit('edit', ...args)" /></ol></article>
    <article v-else tabindex="-1" class="leaf-card"><div class="leaf-icon"><i :class="node.kind === 'segmentMembership' ? 'pi pi-users' : node.kind === 'userAttribute' ? 'pi pi-id-card' : node.kind === 'country' ? 'pi pi-map-marker' : 'pi pi-language'" /></div><div><span>{{ node.kind === 'segmentMembership' ? 'Сегмент' : node.kind === 'userAttribute' ? 'Атрибут' : node.kind === 'country' ? 'Страна' : node.kind === 'language' ? 'Язык' : node.kind === 'opaque' ? 'Неподдерживаемое' : 'Locale' }}</span><strong>{{ summary }}</strong></div><div v-if="!lockedByNot" class="leaf-actions"><button v-if="node.kind !== 'opaque'" type="button" :aria-label="`Изменить условие аудитории: ${summary}`" @click="emit('edit', node.nodeId, $event.currentTarget as HTMLElement)"><i class="pi pi-pencil" /></button><button type="button" :aria-label="`Инвертировать условие аудитории: ${summary}`" @click="emit('command', { type: 'wrapNot', nodeId: node.nodeId })"><i class="pi pi-minus-circle" /></button><button type="button" :aria-label="`Удалить условие аудитории: ${summary}`" @click="emit('command', { type: 'remove', nodeId: node.nodeId })"><i class="pi pi-trash" /></button></div></article>
  </li>
</template>

<style scoped>
.audience-node{list-style:none;margin:0;padding:0}.group-card,.leaf-card,.not-card{border:1px solid #dce0d6;border-radius:14px;background:#fff}.group-card{padding:12px}.group-card>header{display:flex;align-items:flex-end;justify-content:space-between;gap:10px}.group-card label{display:flex;flex-direction:column;gap:5px}.group-card label span{color:var(--muted);font-size:.58rem;text-transform:uppercase}.group-card select{padding:7px 9px;border:1px solid #dce0d6;border-radius:8px;background:#fff;font-size:.7rem;font-weight:800}.group-card ol,.not-card ol{display:flex;flex-direction:column;gap:8px;margin:10px 0 0;padding:0 0 0 14px;border-left:2px solid #ebe8fa}.group-card footer{display:flex;gap:7px;margin-top:10px}.group-card button,.leaf-card button,.not-card button{border:1px solid #dce0d6;border-radius:8px;background:#fff;color:#4d534a;cursor:pointer}.group-card>header>button,.leaf-card button,.not-card header button{width:32px;height:32px}.group-card footer button{padding:7px 10px;font-size:.64rem;font-weight:800}.group-card button:disabled{opacity:.4}.empty{margin:10px 0 0;padding:12px;border-radius:10px;background:#f6f7f3;color:var(--muted);font-size:.65rem}.leaf-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:11px}.leaf-icon{display:grid;width:34px;height:34px;border-radius:10px;background:#f0edff;color:#6f58cb;place-items:center}.leaf-card span,.leaf-card strong{display:block}.leaf-card span{color:var(--muted);font-size:.57rem;text-transform:uppercase}.leaf-card strong{margin-top:3px;font-size:.68rem;line-height:1.4}.leaf-actions{display:flex;gap:5px}.not-card{padding:10px;border-color:#e5cfcb;background:#fffafa}.not-card>header{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:7px}.not-card strong,.not-card small{display:block}.not-card strong{font-size:.66rem}.not-card small{margin-top:2px;color:var(--muted);font-size:.58rem}.not-badge{padding:5px 7px;border-radius:7px;background:#c75746;color:#fff;font-size:.61rem;font-weight:900}@media(max-width:520px){.leaf-card{grid-template-columns:auto 1fr}.leaf-actions{grid-column:1/3;justify-content:flex-end}.group-card ol,.not-card ol{padding-left:8px}}
.group-actions{display:flex;gap:5px}
</style>
