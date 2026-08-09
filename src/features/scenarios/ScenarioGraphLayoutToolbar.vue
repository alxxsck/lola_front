<script setup lang="ts">
import type {
  ScenarioGraphLayoutMode,
  ScenarioGraphNudgeDirection,
} from './model/scenario-graph-layout'

const props = defineProps<{
  mode: ScenarioGraphLayoutMode
  canArrange: boolean
  layouting?: boolean
  layoutFailed?: boolean
  selectedNodeLabel?: string
}>()

const emit = defineEmits<{
  modeChange: [mode: ScenarioGraphLayoutMode]
  autoLayout: []
  nudge: [direction: ScenarioGraphNudgeDirection]
}>()

function selectMode(mode: ScenarioGraphLayoutMode) {
  if (mode === 'manual' && !props.canArrange) return
  emit('modeChange', mode)
}
</script>

<template>
  <div class="scenario-layout-toolbar" aria-label="Управление раскладкой схемы">
    <div class="layout-primary-row">
      <div class="layout-mode-switch" role="group" aria-label="Режим раскладки схемы">
        <button
          type="button"
          data-layout-mode="auto"
          aria-label="Автоматическая раскладка"
          :aria-pressed="mode === 'auto'"
          @click="selectMode('auto')"
        ><i class="pi pi-sparkles" /><span>Авто</span></button>
        <button
          type="button"
          data-layout-mode="manual"
          aria-label="Ручная раскладка"
          :aria-pressed="mode === 'manual'"
          :disabled="!canArrange"
          :title="!canArrange ? 'Ручное перемещение недоступно в режиме просмотра' : undefined"
          @click="selectMode('manual')"
        ><i class="pi pi-arrows-alt" /><span>Ручная</span></button>
      </div>
      <button
        type="button"
        class="layout-auto-command"
        :class="{ failed: layoutFailed }"
        :aria-label="layouting ? 'Выполняется автоматическая раскладка' : 'Выровнять схему автоматически'"
        :title="layoutFailed ? 'Последняя автораскладка не выполнена — показана резервная схема' : undefined"
        :disabled="layouting"
        @click="emit('autoLayout')"
      ><i :class="layouting ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'" /><span>Выровнять</span></button>
      <span v-if="mode === 'manual'" class="personal-layout-note">
        <i class="pi pi-user" />Только для вас
      </span>
    </div>

    <div
      v-if="mode === 'manual' && selectedNodeLabel && canArrange"
      class="layout-nudge-row"
      role="group"
      :aria-label="`Точное положение узла «${selectedNodeLabel}»`"
    >
      <span>Сдвинуть выбранный</span>
      <button
        v-for="item in [
          { direction: 'left', icon: 'pi-arrow-left', label: 'влево' },
          { direction: 'up', icon: 'pi-arrow-up', label: 'вверх' },
          { direction: 'down', icon: 'pi-arrow-down', label: 'вниз' },
          { direction: 'right', icon: 'pi-arrow-right', label: 'вправо' },
        ] as const"
        :key="item.direction"
        type="button"
        :aria-label="`Сдвинуть узел «${selectedNodeLabel}» ${item.label}`"
        @click="emit('nudge', item.direction as ScenarioGraphNudgeDirection)"
      ><i class="pi" :class="item.icon" /></button>
    </div>
  </div>
</template>

<style scoped>
.scenario-layout-toolbar {
  display: grid;
  gap: 6px;
  width: max-content;
  max-width: 100%;
  color: var(--text-primary);
}
.layout-primary-row,
.layout-nudge-row,
.layout-mode-switch {
  display: flex;
  align-items: center;
}
.layout-primary-row {
  flex-wrap: wrap;
  gap: 6px;
}
.layout-mode-switch,
.layout-auto-command,
.personal-layout-note,
.layout-nudge-row {
  border: 1px solid var(--border-default);
  background: color-mix(in srgb, var(--surface-card) 94%, transparent);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(12px);
}
.layout-mode-switch,
.layout-auto-command,
.personal-layout-note {
  min-height: 38px;
  border-radius: 12px;
}
.layout-mode-switch {
  padding: 3px;
}
button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0;
  color: var(--text-secondary);
  font: 700 .7rem/1 var(--font-display);
  cursor: pointer;
}
button:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--status-accent-text) 32%, transparent);
  outline-offset: 2px;
}
button:disabled {
  cursor: not-allowed;
  opacity: .48;
}
.layout-mode-switch button {
  min-height: 40px;
  padding: 0 10px;
  border-radius: 8px;
  background: transparent;
  transition: background-color .16s ease, color .16s ease, box-shadow .16s ease;
}
.layout-mode-switch button[aria-pressed="true"] {
  background: var(--status-accent-soft);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--status-accent-text) 18%, transparent);
  color: var(--status-accent-text);
}
.layout-auto-command {
  padding: 0 12px;
}
.layout-auto-command.failed {
  color: var(--status-warning-text);
}
.personal-layout-note {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  color: var(--text-secondary);
  font: 700 .66rem/1 var(--font-display);
}
.layout-nudge-row {
  width: max-content;
  max-width: 100%;
  gap: 3px;
  padding: 4px;
  border-radius: 12px;
  animation: layout-tools-in .16s ease-out;
}
.layout-nudge-row > span {
  padding: 0 7px;
  overflow: hidden;
  color: var(--text-secondary);
  font: 700 .66rem/1 var(--font-display);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.layout-nudge-row button {
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  border-radius: 8px;
  background: var(--surface-subtle);
}
.layout-nudge-row button:hover,
.layout-auto-command:hover:not(:disabled) {
  color: var(--status-accent-text);
}
@keyframes layout-tools-in {
  from { opacity: 0; transform: translateY(-4px); }
}
@media (max-width: 1024px) {
  .scenario-layout-toolbar { width: 100%; }
  .layout-mode-switch,
  .layout-auto-command,
  .personal-layout-note { min-height: 52px; }
  .layout-mode-switch button { min-height: 44px; padding-inline: 9px; }
  .layout-auto-command { padding-inline: 11px; }
  .layout-nudge-row { width: 100%; }
  .layout-nudge-row > span { margin-right: auto; }
  .layout-nudge-row button { width: 44px; height: 44px; }
}
@media (prefers-reduced-motion: reduce) {
  .layout-mode-switch button { transition: none; }
  .layout-nudge-row { animation: none; }
}
</style>
