<script setup lang="ts">
import { Handle, Position, type NodeProps } from '@vue-flow/core'
import type { ScenarioGraphNodeData } from './model/scenario-graph-view-model'

defineProps<NodeProps<ScenarioGraphNodeData>>()
</script>

<template>
  <div
    class="flow-node"
    :class="[
      { selected, invalid: data.issueCount },
      `kind-${data.kind}`,
      `executor-${data.executor.toLowerCase()}`,
    ]"
  >
    <Handle
      id="target"
      type="target"
      :position="Position.Top"
      :style="{ width: `${data.portSize.width}px`, height: `${data.portSize.height}px` }"
    />
    <div class="node-head">
      <span class="node-icon"><i :class="data.icon" /></span>
      <div>
        <strong class="node-title" :title="data.label">{{ data.label }}</strong>
        <div class="node-meta">
          <span class="node-kind">{{ data.kindLabel }}</span>
          <code class="node-key">{{ data.nodeKey }}</code>
        </div>
      </div>
      <span v-if="data.issueCount" class="issue-count">{{ data.issueCount }}</span>
    </div>
    <p class="node-summary">{{ data.summary }}</p>
    <Handle
      v-for="port in data.ports"
      :id="port.id"
      :key="port.id"
      type="source"
      :position="Position.Bottom"
      :style="{
        left: `${port.position}%`,
        width: `${data.portSize.width}px`,
        height: `${data.portSize.height}px`,
      }"
      :data-branch-id="port.id"
      role="img"
      :aria-label="port.label ? `Исход ${port.label}` : `Исход ${port.id}`"
    />
  </div>
</template>

<style scoped>
.flow-node{width:100%;height:100%;overflow:hidden;padding:14px;border:1px solid var(--border-default);border-radius:16px;background:var(--surface-card);box-shadow:inset 3px 0 0 var(--node-kind-color,var(--status-accent)),var(--shadow-raised);transition:border-color 160ms cubic-bezier(.23,1,.32,1),box-shadow 160ms cubic-bezier(.23,1,.32,1)}.flow-node.selected{border-color:var(--status-accent-text);box-shadow:inset 3px 0 0 var(--node-kind-color,var(--status-accent)),0 0 0 3px color-mix(in srgb,var(--status-accent) 13%,transparent),var(--shadow-raised)}.flow-node.invalid{border-color:var(--status-danger-text)}.kind-action{--node-kind-color:var(--status-accent);--node-kind-soft:var(--status-accent-soft);--node-kind-text:var(--status-accent-text)}.kind-decision{--node-kind-color:var(--status-warning);--node-kind-soft:var(--status-warning-soft);--node-kind-text:var(--status-warning-text)}.kind-wait{--node-kind-color:var(--status-info);--node-kind-soft:var(--status-info-soft);--node-kind-text:var(--status-info-text)}.kind-terminal{--node-kind-color:var(--status-success);--node-kind-soft:var(--status-success-soft);--node-kind-text:var(--status-success-text)}.node-head{display:flex;align-items:flex-start;gap:10px}.node-head>div{min-width:0;flex:1}.node-head strong,.node-head code{display:block}.node-head strong{display:-webkit-box;overflow:hidden;font:700 .78rem/1.35 var(--font-display);overflow-wrap:anywhere;-webkit-box-orient:vertical;-webkit-line-clamp:2}.node-meta{display:flex;align-items:center;gap:5px;min-width:0;margin-top:4px}.node-kind{flex:0 0 auto;padding:2px 5px;border-radius:5px;background:var(--node-kind-soft);color:var(--node-kind-text);font-size:.5rem;font-weight:800;letter-spacing:.035em;text-transform:uppercase}.node-head code{min-width:0;overflow:hidden;color:var(--text-small-muted);font-size:.58rem;text-overflow:ellipsis;white-space:nowrap}.node-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:var(--node-kind-soft);color:var(--node-kind-text)}.issue-count{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--status-danger-text);color:var(--on-status-danger);font-size:.62rem;font-weight:700}.flow-node p{display:-webkit-box;min-height:30px;margin:9px 0 0;overflow:hidden;color:var(--text-secondary);font-size:.68rem;line-height:1.4;-webkit-box-orient:vertical;-webkit-line-clamp:2}.flow-node :deep(.vue-flow__handle){border:2px solid var(--graph-node);background:var(--graph-selection);box-shadow:0 0 0 1px var(--graph-selection)}@media(prefers-reduced-motion:reduce){.flow-node{transition:none}}
</style>
