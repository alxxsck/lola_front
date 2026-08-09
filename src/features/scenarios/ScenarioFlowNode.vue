<script setup lang="ts">
import { Handle, Position, type NodeProps } from '@vue-flow/core'

interface FlowNodeData extends Record<string, unknown> {
  label: string
  nodeKey: string
  icon: string
  executor: string
  summary: string
  issueCount: number
}

defineProps<NodeProps<FlowNodeData>>()
</script>

<template>
  <div class="flow-node" :class="[{ selected, invalid: data.issueCount }, `kind-${data.executor.toLowerCase()}`]">
    <Handle type="target" :position="Position.Top" />
    <div class="node-head">
      <span class="node-icon"><i :class="data.icon" /></span>
      <div><strong class="node-title" :title="data.label">{{ data.label }}</strong><code>{{ data.nodeKey }}</code></div>
      <span v-if="data.issueCount" class="issue-count">{{ data.issueCount }}</span>
    </div>
    <p class="node-summary">{{ data.summary }}</p>
    <Handle type="source" :position="Position.Bottom" />
  </div>
</template>

<style scoped>
.flow-node{width:100%;height:100%;overflow:hidden;padding:14px;border:1px solid var(--border-default);border-radius:16px;background:var(--surface-card);box-shadow:var(--shadow-raised);transition:.16s ease}.flow-node.selected{border-color:var(--status-accent-text);box-shadow:0 0 0 3px color-mix(in srgb,var(--status-accent) 13%,transparent),var(--shadow-raised)}.flow-node.invalid{border-color:var(--status-danger-text)}.node-head{display:flex;align-items:flex-start;gap:10px}.node-head>div{min-width:0;flex:1}.node-head strong,.node-head code{display:block}.node-head strong{display:-webkit-box;overflow:hidden;font:700 .78rem/1.35 var(--font-display);overflow-wrap:anywhere;-webkit-box-orient:vertical;-webkit-line-clamp:2}.node-head code{margin-top:3px;overflow:hidden;color:var(--text-secondary);font-size:.62rem;text-overflow:ellipsis;white-space:nowrap}.node-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:var(--status-success-soft);color:var(--status-success-text)}.kind-frontend .node-icon{background:var(--status-accent-soft);color:var(--status-accent-text)}.issue-count{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--status-danger-text);color:var(--on-status-danger);font-size:.62rem;font-weight:700}.flow-node p{display:-webkit-box;min-height:30px;margin:11px 0 0;overflow:hidden;color:var(--text-secondary);font-size:.68rem;line-height:1.4;-webkit-box-orient:vertical;-webkit-line-clamp:2}.flow-node :deep(.vue-flow__handle){width:9px;height:9px;border:2px solid var(--graph-node);background:var(--graph-selection);box-shadow:0 0 0 1px var(--graph-selection)}
</style>
