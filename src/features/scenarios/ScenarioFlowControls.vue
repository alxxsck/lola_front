<script setup lang="ts">
import { computed } from 'vue'
import { Panel, PanelPosition, useVueFlow } from '@vue-flow/core'
import { scenarioGraphViewportDuration } from './model/scenario-graph-navigation'

const props = withDefaults(defineProps<{
  selectedNodeId?: string | null
  branchNodeIds?: string[]
  largeGraph?: boolean
  minimapVisible?: boolean
}>(), {
  selectedNodeId: null,
  branchNodeIds: () => [],
  largeGraph: false,
  minimapVisible: false,
})

const emit = defineEmits<{
  'toggle-minimap': []
}>()

const {
  findNode,
  fitView,
  maxZoom,
  minZoom,
  setCenter,
  viewport,
  zoomIn,
  zoomOut,
  zoomTo,
} = useVueFlow()

const zoomInDisabled = computed(() => viewport.value.zoom >= maxZoom.value)
const zoomOutDisabled = computed(() => viewport.value.zoom <= minZoom.value)
const zoomPercentage = computed(() => Math.round(viewport.value.zoom * 100))
const selectionUnavailable = computed(() => !props.selectedNodeId)
const branchUnavailable = computed(() => !props.branchNodeIds.length)

function handleZoomIn() {
  void zoomIn({ duration: scenarioGraphViewportDuration() })
}

function handleZoomOut() {
  void zoomOut({ duration: scenarioGraphViewportDuration() })
}

function resetZoom() {
  void zoomTo(1, { duration: scenarioGraphViewportDuration() })
}

function fitGraph() {
  void fitView({ padding: 0.16, duration: scenarioGraphViewportDuration() })
}

function fitBranch() {
  if (branchUnavailable.value) return
  void fitView({
    nodes: props.branchNodeIds,
    padding: 0.22,
    duration: scenarioGraphViewportDuration(),
  })
}

function centerSelected() {
  if (!props.selectedNodeId) return
  const node = findNode(props.selectedNodeId)
  if (!node) return
  void setCenter(
    node.computedPosition.x + node.dimensions.width / 2,
    node.computedPosition.y + node.dimensions.height / 2,
    { zoom: viewport.value.zoom, duration: scenarioGraphViewportDuration() },
  )
}
</script>

<template>
  <Panel class="scenario-flow-controls" :position="PanelPosition.BottomRight">
    <div class="scenario-flow-controls__group" role="group" aria-label="Масштаб схемы">
      <button
        type="button"
        aria-label="Уменьшить схему"
        :disabled="zoomOutDisabled"
        @click="handleZoomOut"
      ><i class="pi pi-minus" aria-hidden="true" /></button>
      <button
        type="button"
        class="scenario-flow-controls__zoom"
        :aria-label="`Текущий масштаб ${zoomPercentage}%. Сбросить до 100%`"
        @click="resetZoom"
      >{{ zoomPercentage }}%</button>
      <button
        type="button"
        aria-label="Увеличить схему"
        :disabled="zoomInDisabled"
        @click="handleZoomIn"
      ><i class="pi pi-plus" aria-hidden="true" /></button>
    </div>
    <div class="scenario-flow-controls__group" role="group" aria-label="Навигация по схеме">
      <button type="button" aria-label="Показать всю схему" @click="fitGraph">
        <i class="pi pi-expand" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Показать выбранную ветку"
        :disabled="branchUnavailable"
        @click="fitBranch"
      ><i class="pi pi-share-alt" aria-hidden="true" /></button>
      <button
        type="button"
        aria-label="Центрировать выбранное действие"
        :disabled="selectionUnavailable"
        @click="centerSelected"
      ><i class="pi pi-crosshairs" aria-hidden="true" /></button>
      <button
        v-if="largeGraph"
        type="button"
        :aria-label="minimapVisible ? 'Скрыть мини-карту' : 'Показать мини-карту'"
        aria-controls="scenario-graph-minimap"
        :aria-expanded="minimapVisible"
        @click="emit('toggle-minimap')"
      ><i class="pi pi-map" aria-hidden="true" /></button>
    </div>
  </Panel>
</template>

<style scoped>
.scenario-flow-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 12px;
  padding: 4px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-raised) 94%, transparent);
  box-shadow: var(--shadow-raised);
}
.scenario-flow-controls__group {
  display: flex;
  align-items: center;
}
.scenario-flow-controls__group + .scenario-flow-controls__group {
  padding-left: 6px;
  border-left: 1px solid var(--border-default);
}
.scenario-flow-controls button {
  display: grid;
  place-items: center;
  min-width: 40px;
  min-height: 40px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.scenario-flow-controls button:hover:not(:disabled) {
  background: var(--surface-subtle);
  color: var(--text-primary);
}
.scenario-flow-controls button:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.scenario-flow-controls button:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}
.scenario-flow-controls__zoom {
  min-width: 52px !important;
  color: var(--text-primary) !important;
  font: 700 0.68rem var(--font-display);
  font-variant-numeric: tabular-nums;
}
@container scenario-graph (max-width: 600px) {
  .scenario-flow-controls {
    flex-direction: column;
    align-items: flex-end;
    right: 4px;
    bottom: 4px;
    gap: 2px;
    margin: 4px;
  }
  .scenario-flow-controls__group + .scenario-flow-controls__group {
    padding-left: 2px;
    border-left: 0;
  }
  .scenario-flow-controls button {
    min-width: 40px;
    padding-inline: 5px;
  }
  .scenario-flow-controls__zoom {
    min-width: 46px !important;
  }
}
@container scenario-graph (max-width: 400px) {
  .scenario-flow-controls.vue-flow__panel.bottom.right {
    top: 4px;
    bottom: auto;
  }
  .scenario-flow-controls__group {
    flex-direction: column;
  }
  .scenario-flow-controls__group + .scenario-flow-controls__group {
    padding-top: 2px;
    padding-left: 0;
    border-top: 1px solid var(--border-default);
  }
  .scenario-flow-controls__zoom {
    min-width: 44px !important;
    font-size: 0.58rem;
    white-space: nowrap;
  }
}
</style>
