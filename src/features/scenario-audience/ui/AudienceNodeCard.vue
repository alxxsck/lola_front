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
const groupOptions = [
  { value: 'all', label: 'Должны выполняться все условия' },
  { value: 'any', label: 'Достаточно одного условия' },
] as const
const summary = computed(() => props.summaryByNodeId[props.node.nodeId] ?? props.node.kind)
const groupLabel = computed(() => groupOptions.find(({ value }) => value === props.node.kind)?.label ?? '')
const leafPresentation = computed(() => {
  if (props.node.kind === 'segmentMembership') return { icon: 'pi pi-users', label: 'Сегмент' }
  if (props.node.kind === 'userAttribute') return { icon: 'pi pi-id-card', label: 'Поле профиля' }
  if (props.node.kind === 'country') return { icon: 'pi pi-map-marker', label: 'Страна' }
  if (props.node.kind === 'language') return { icon: 'pi pi-language', label: 'Язык' }
  if (props.node.kind === 'opaque') return { icon: 'pi pi-exclamation-triangle', label: 'Недоступное условие' }
  return { icon: 'pi pi-language', label: 'Регион и язык' }
})
</script>

<template>
  <li class="audience-node" :class="[`kind-${node.kind}`, { root }]" :data-audience-node="node.nodeId">
    <section v-if="node.kind === 'all' || node.kind === 'any'" tabindex="-1" class="group-card">
      <header>
        <label>
          <span>Как учитывать условия</span>
          <select
            :value="node.kind"
            :aria-label="`Как учитывать условия: ${groupLabel}`"
            @change="emit('command', { type: 'changeGroup', nodeId: node.nodeId, kind: ($event.target as HTMLSelectElement).value as 'all' | 'any' })"
          >
            <option v-for="option in groupOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
        <div class="group-actions">
          <button
            type="button"
            :aria-label="`Исключить пользователей по условиям группы: ${summary}`"
            title="Исключить пользователей, которые подходят под условия группы"
            @click="emit('command', { type: 'wrapNot', nodeId: node.nodeId })"
          >
            <i class="pi pi-ban" />
          </button>
          <button
            v-if="!root"
            type="button"
            :aria-label="`Удалить группу условий: ${summary}`"
            title="Удалить группу условий"
            @click="emit('command', { type: 'remove', nodeId: node.nodeId })"
          >
            <i class="pi pi-trash" />
          </button>
        </div>
      </header>
      <ol v-if="node.children.length">
        <AudienceNodeCard
          v-for="child in node.children"
          :key="child.nodeId"
          :node="child"
          :summary-by-node-id="summaryByNodeId"
          :depth="(depth ?? 0) + 1"
          @add-condition="(...args) => emit('addCondition', ...args)"
          @command="(command) => emit('command', command)"
          @edit="(...args) => emit('edit', ...args)"
        />
      </ol>
      <p v-else class="empty">Добавьте первое условие — аудитория пока не ограничена.</p>
      <footer>
        <button type="button" :aria-label="`Добавить условие аудитории в ${groupLabel}`" @click="emit('addCondition', node.nodeId, groupLabel, $event.currentTarget as HTMLElement)"><i class="pi pi-plus" /> Добавить условие</button>
        <button type="button" :aria-label="`Добавить группу аудитории в ${groupLabel}`" :disabled="(depth ?? 0) >= 3" @click="emit('command', { type: 'addGroup', parentNodeId: node.nodeId })"><i class="pi pi-folder-plus" /> Добавить группу</button>
      </footer>
    </section>
    <article v-else-if="node.kind === 'not'" tabindex="-1" class="not-card">
      <header>
        <span class="not-badge">Исключение</span>
        <div><strong>Подходящие пользователи будут исключены</strong><small>{{ summary }}</small></div>
        <button type="button" :aria-label="`Отменить исключение: ${summary}`" title="Отменить исключение" @click="emit('command', { type: 'unwrapNot', nodeId: node.nodeId })"><i class="pi pi-undo" /></button>
        <button v-if="!root" type="button" :aria-label="`Удалить условие аудитории: ${summary}`" title="Удалить условие" @click="emit('command', { type: 'remove', nodeId: node.nodeId })"><i class="pi pi-trash" /></button>
      </header>
      <ol><AudienceNodeCard :node="node.child" :summary-by-node-id="summaryByNodeId" locked-by-not :depth="(depth ?? 0) + 1" @add-condition="(...args) => emit('addCondition', ...args)" @command="(command) => emit('command', command)" @edit="(...args) => emit('edit', ...args)" /></ol>
    </article>
    <article v-else tabindex="-1" class="leaf-card">
      <div class="leaf-icon"><i :class="leafPresentation.icon" /></div>
      <div><span>{{ leafPresentation.label }}</span><strong>{{ summary }}</strong></div>
      <div v-if="!lockedByNot" class="leaf-actions">
        <button v-if="node.kind !== 'opaque'" type="button" :aria-label="`Изменить условие аудитории: ${summary}`" title="Изменить условие" @click="emit('edit', node.nodeId, $event.currentTarget as HTMLElement)"><i class="pi pi-pencil" /></button>
        <button type="button" :aria-label="`Исключить пользователей по условию: ${summary}`" title="Исключить пользователей, которые подходят под это условие" @click="emit('command', { type: 'wrapNot', nodeId: node.nodeId })"><i class="pi pi-ban" /></button>
        <button type="button" :aria-label="`Удалить условие аудитории: ${summary}`" title="Удалить условие" @click="emit('command', { type: 'remove', nodeId: node.nodeId })"><i class="pi pi-trash" /></button>
      </div>
    </article>
  </li>
</template>

<style scoped>
.audience-node {
  margin: 0;
  padding: 0;
  list-style: none;
}
.group-card,
.leaf-card,
.not-card {
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--surface-card);
}
.group-card {
  padding: 14px;
}
.group-card > header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}
.group-card label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.group-card label span,
.leaf-card span {
  color: var(--text-small-muted);
  font-size: var(--font-size-caption);
}
.group-card label span {
  text-transform: uppercase;
}
.group-card select {
  min-height: var(--control-height);
  padding: 8px 10px;
  border: 1px solid var(--border-default);
  border-radius: 9px;
  background: var(--surface-card);
  font-size: var(--font-size-control);
  font-weight: 700;
}
.group-card ol,
.not-card ol {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 12px 0 0;
  padding: 0 0 0 14px;
  border-left: 2px solid var(--status-violet-soft);
}
.group-card footer,
.group-actions,
.leaf-actions {
  display: flex;
  gap: 8px;
}
.group-card footer {
  margin-top: 12px;
}
.group-card button,
.leaf-card button,
.not-card button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--border-default);
  border-radius: 9px;
  background: var(--surface-card);
  color: var(--text-secondary);
  cursor: pointer;
}
.group-actions button,
.leaf-card button,
.not-card header button {
  width: 36px;
  height: 36px;
  padding: 0;
}
.group-card footer button {
  min-height: var(--control-height);
  padding: 8px 12px;
  font-size: var(--font-size-control);
  font-weight: 700;
}
.group-card button:disabled {
  opacity: 0.4;
}
.empty {
  margin: 12px 0 0;
  padding: 14px;
  border-radius: 10px;
  background: var(--surface-subtle);
  color: var(--text-small-muted);
  font-size: var(--font-size-body-small);
}
.leaf-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 12px;
}
.leaf-icon {
  display: grid;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
  place-items: center;
}
.leaf-card span,
.leaf-card strong {
  display: block;
}
.leaf-card strong {
  margin-top: 3px;
  font-size: var(--font-size-body);
  line-height: 1.4;
}
.not-card {
  padding: 12px;
  border-color: var(--status-danger);
  background: var(--status-danger-soft);
}
.not-card > header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
}
.not-card strong,
.not-card small {
  display: block;
}
.not-card strong {
  font-size: var(--font-size-body);
}
.not-card small {
  margin-top: 3px;
  color: var(--text-small-muted);
  font-size: var(--font-size-caption);
}
.not-badge {
  padding: 5px 8px;
  border-radius: 7px;
  background: var(--status-danger-text);
  color: var(--on-status-danger);
  font-size: var(--font-size-caption);
  font-weight: 800;
}
@media (max-width: 520px) {
  .leaf-card {
    grid-template-columns: auto 1fr;
  }
  .leaf-actions {
    grid-column: 1/3;
    justify-content: flex-end;
  }
  .group-card ol,
  .not-card ol {
    padding-left: 8px;
  }
}
</style>
