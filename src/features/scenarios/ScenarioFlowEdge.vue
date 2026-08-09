<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
} from '@vue-flow/core'
import { buildScenarioEdgeRoute } from './model/scenario-edge-route'
import type { ScenarioGraphEdgeData } from './model/scenario-graph-view-model'

const props = defineProps<EdgeProps<ScenarioGraphEdgeData>>()

const route = computed(() => buildScenarioEdgeRoute({
  sourceX: props.sourceX,
  sourceY: props.sourceY,
  targetX: props.targetX,
  targetY: props.targetY,
  routeIndex: props.data.routeIndex,
  routeCount: props.data.routeCount,
  laneGap: props.data.laneGap,
}))

const semanticStyle = computed<CSSProperties>(() => ({
  ...props.style,
  strokeDasharray: ['timeout', 'goal-timeout'].includes(props.data.kind)
    ? '7 5'
    : props.data.kind === 'fallback'
      ? '2 5'
      : undefined,
}))

const icon = computed(() => {
  if (['timeout', 'goal-timeout'].includes(props.data.kind)) return 'pi pi-clock'
  if (props.data.kind === 'fallback') return 'pi pi-ellipsis-h'
  if (props.data.kind === 'goal') return 'pi pi-check'
  return ''
})
</script>

<template>
  <BaseEdge
    :id="id"
    :path="route.path"
    :marker-start="markerStart"
    :marker-end="markerEnd"
    :interaction-width="interactionWidth"
    :style="semanticStyle"
  />
  <EdgeLabelRenderer v-if="data.label">
    <div
      class="scenario-edge-label"
      :class="`scenario-edge-label-${data.kind}`"
      :data-branch-id="data.branchId"
      :data-branch-kind="data.kind"
      :style="{
        transform: `translate(-50%, -50%) translate(${route.labelX}px, ${route.labelY}px)`,
        padding: `${data.labelMetrics.paddingY}px ${data.labelMetrics.paddingX}px`,
        fontSize: `${data.labelMetrics.fontSize}px`,
      }"
      aria-hidden="true"
    >
      <i v-if="icon" :class="icon" />
      <span>{{ data.label }}</span>
    </div>
  </EdgeLabelRenderer>
</template>

<style scoped>
.scenario-edge-label {
  position: absolute;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 22px;
  border: 1px solid var(--border-default);
  border-radius: 7px;
  background: var(--surface-card);
  box-shadow: var(--shadow-sm);
  color: var(--text-secondary);
  font-family: var(--font-display);
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
  white-space: nowrap;
}
.scenario-edge-label-timeout,
.scenario-edge-label-goal-timeout {
  border-style: dashed;
}
.scenario-edge-label-fallback {
  border-style: dotted;
}
</style>
