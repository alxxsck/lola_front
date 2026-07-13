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
      <div><strong>{{ data.label }}</strong><code>{{ data.nodeKey }}</code></div>
      <span v-if="data.issueCount" class="issue-count">{{ data.issueCount }}</span>
    </div>
    <p>{{ data.summary }}</p>
    <Handle type="source" :position="Position.Bottom" />
  </div>
</template>

<style scoped>
.flow-node{width:228px;padding:14px;border:1px solid #dfe1da;border-radius:16px;background:#fff;box-shadow:0 10px 30px rgba(35,39,31,.08);transition:.16s ease}.flow-node.selected{border-color:#8068ed;box-shadow:0 0 0 3px rgba(128,104,237,.13),0 12px 34px rgba(35,39,31,.1)}.flow-node.invalid{border-color:#e07a68}.node-head{display:flex;align-items:center;gap:10px}.node-head>div{min-width:0;flex:1}.node-head strong,.node-head code{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.node-head strong{font:700 .78rem Manrope}.node-head code{margin-top:3px;color:#888d83;font-size:.62rem}.node-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:#eff3e6;color:#526332}.kind-frontend .node-icon{background:#eeeaff;color:#6c55d3}.issue-count{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#e46050;color:white;font-size:.62rem;font-weight:700}.flow-node p{min-height:30px;margin:11px 0 0;color:#6f746b;font-size:.68rem;line-height:1.4}.flow-node :deep(.vue-flow__handle){width:9px;height:9px;border:2px solid white;background:#8e77f5;box-shadow:0 0 0 1px #8e77f5}
</style>
