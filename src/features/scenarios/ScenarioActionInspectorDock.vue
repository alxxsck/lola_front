<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import {
  SCENARIO_ACTION_INSPECTOR_MAX_WIDTH,
  SCENARIO_ACTION_INSPECTOR_MIN_WIDTH,
  clampScenarioActionInspectorWidth,
} from './model/scenario-action-workspace'

const props = withDefaults(defineProps<{
  width: number
  minWidth?: number
  maxWidth?: number
}>(), {
  minWidth: SCENARIO_ACTION_INSPECTOR_MIN_WIDTH,
  maxWidth: SCENARIO_ACTION_INSPECTOR_MAX_WIDTH,
})

const emit = defineEmits<{
  resize: [width: number]
}>()

let pointerStartX = 0
let pointerStartWidth = 0

function clampWidth(width: number) {
  return clampScenarioActionInspectorWidth(width, props.minWidth, props.maxWidth)
}

function resizeFromKeyboard(event: KeyboardEvent) {
  let width: number | undefined
  if (event.key === 'ArrowLeft') width = props.width + 24
  else if (event.key === 'ArrowRight') width = props.width - 24
  else if (event.key === 'Home') width = props.minWidth
  else if (event.key === 'End') width = props.maxWidth
  if (width === undefined) return
  event.preventDefault()
  emit('resize', clampWidth(width))
}

function resizeFromPointer(event: PointerEvent) {
  emit('resize', clampWidth(pointerStartWidth + pointerStartX - event.clientX))
}

function stopPointerResize() {
  window.removeEventListener('pointermove', resizeFromPointer)
  window.removeEventListener('pointerup', stopPointerResize)
  window.removeEventListener('pointercancel', stopPointerResize)
}

function startPointerResize(event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  pointerStartX = event.clientX
  pointerStartWidth = props.width
  window.addEventListener('pointermove', resizeFromPointer)
  window.addEventListener('pointerup', stopPointerResize, { once: true })
  window.addEventListener('pointercancel', stopPointerResize, { once: true })
}

onBeforeUnmount(stopPointerResize)
</script>

<template>
  <section class="scenario-action-inspector-dock">
    <button
      type="button"
      class="scenario-action-inspector-resizer"
      role="separator"
      aria-label="Изменить ширину инспектора"
      aria-orientation="vertical"
      :aria-valuemin="minWidth"
      :aria-valuemax="maxWidth"
      :aria-valuenow="width"
      @keydown="resizeFromKeyboard"
      @pointerdown="startPointerResize"
    ><span aria-hidden="true" /></button>
    <div class="scenario-action-inspector-content"><slot /></div>
  </section>
</template>

<style scoped>
.scenario-action-inspector-dock {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-left: 1px solid var(--line);
  background: var(--surface-card);
  animation: inspector-dock-enter 180ms cubic-bezier(0.23, 1, 0.32, 1);
}
.scenario-action-inspector-content {
  width: 100%;
  height: 100%;
  min-height: 0;
}
.scenario-action-inspector-content :deep(> *) {
  width: 100%;
  height: 100%;
}
.scenario-action-inspector-resizer {
  position: absolute;
  z-index: 8;
  top: 0;
  bottom: 0;
  left: -7px;
  width: 14px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: col-resize;
  touch-action: none;
}
.scenario-action-inspector-resizer::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 6px;
  width: 2px;
  background: transparent;
  transition: background-color 140ms cubic-bezier(0.23, 1, 0.32, 1);
}
.scenario-action-inspector-resizer:hover::after,
.scenario-action-inspector-resizer:focus-visible::after {
  background: var(--status-accent);
}
.scenario-action-inspector-resizer span {
  position: absolute;
  top: 50%;
  left: 3px;
  width: 8px;
  height: 32px;
  border: 1px solid var(--border-default);
  border-radius: 999px;
  background: var(--surface-raised);
  transform: translateY(-50%);
}
@keyframes inspector-dock-enter {
  from { opacity: 0; transform: translateX(8px); }
  to { opacity: 1; transform: translateX(0); }
}
@container scenario-studio (max-width: 860px) {
  .scenario-action-inspector-dock {
    overflow: visible;
    border-left: 0;
  }
  .scenario-action-inspector-resizer {
    display: none;
  }
}
@media (pointer: coarse) {
  .scenario-action-inspector-resizer {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .scenario-action-inspector-dock { animation: none; }
  .scenario-action-inspector-resizer::after { transition: none; }
}
</style>
