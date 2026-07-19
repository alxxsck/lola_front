<script setup lang="ts">
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import type { AiCapabilityPreview } from '../model/project-action'
import type { ProjectActionError } from '../model/project-action-error'

defineProps<{
  preview?: AiCapabilityPreview
  loading?: boolean
  error?: ProjectActionError | null
}>()
const emit = defineEmits<{ retry: [] }>()

function formatSchema(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2)
}

function schemaPropertyCount(value: Record<string, unknown>): number {
  const properties = value.properties
  return properties && typeof properties === 'object' && !Array.isArray(properties)
    ? Object.keys(properties).length
    : 0
}

function targetVariantCount(value: Record<string, unknown>): number {
  const properties = value.properties
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return 0
  return Object.values(properties).reduce((total, property) => {
    if (!property || typeof property !== 'object' || Array.isArray(property)) return total
    const variants = (property as Record<string, unknown>).enum
    return total + (Array.isArray(variants) ? variants.length : 0)
  }, 0)
}
</script>

<template>
  <section class="ai-preview" aria-labelledby="ai-preview-heading">
    <div class="preview-heading">
      <div><h3 id="ai-preview-heading">Что увидит Grok</h3><p>Точная capability компилируется backend из опубликованной конфигурации.</p></div>
      <span class="server-owned"><i class="pi pi-shield" /> Project, End User и Session подставляет backend</span>
    </div>
    <div v-if="loading" class="preview-loading"><Skeleton height="18px" width="42%" /><Skeleton height="90px" /></div>
    <Message v-else-if="error" severity="error" :closable="false">
      {{ error.message }}
      <Button label="Повторить" size="small" text @click="emit('retry')" />
    </Message>
    <template v-else-if="preview?.tool">
      <div class="tool-card">
        <div class="tool-name"><span>function</span><code>{{ preview.tool.name }}</code><strong>strict</strong></div>
        <div class="tool-metrics"><span>{{ schemaPropertyCount(preview.tool.parameters) }} model fields</span><span>{{ targetVariantCount(preview.tool.parameters) }} enum variants</span></div>
        <p>{{ preview.tool.description }}</p>
        <div><small>Model-visible arguments</small><pre>{{ formatSchema(preview.tool.parameters) }}</pre></div>
      </div>
    </template>
    <div v-else class="preview-empty">
      <i class="pi pi-eye-slash" />
      <div><strong>Capability сейчас недоступна</strong><span>Backend не публикует tool, пока политика, цели или AI surface не готовы.</span></div>
    </div>
    <Message v-for="issue in preview?.issues ?? []" :key="`${issue.code}:${issue.message}`" severity="warn" :closable="false">
      <code>{{ issue.code }}</code> — {{ issue.message }}
    </Message>
  </section>
</template>

<style scoped>
.ai-preview { display: grid; gap: 14px; }
.preview-heading { display: flex; justify-content: space-between; gap: 16px; align-items: start; }
.preview-heading h3 { margin: 0 0 4px; font-size: 15px; }
.preview-heading p { margin: 0; color: var(--text-color-secondary); font-size: 12px; }
.server-owned { display: inline-flex; gap: 6px; align-items: center; max-width: 250px; padding: 7px 9px; color: var(--green-700); font-size: 10px; font-weight: 700; background: color-mix(in srgb, var(--green-500) 10%, var(--surface-card)); border-radius: 9px; }
.preview-loading { display: grid; gap: 10px; }
.tool-card { display: grid; gap: 13px; padding: 14px; background: var(--surface-ground); border: 1px solid var(--surface-border); border-radius: 12px; }
.tool-name { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
.tool-name span, .tool-name strong { padding: 3px 7px; font-size: 10px; background: var(--surface-200); border-radius: 999px; }
.tool-name strong { color: var(--green-700); background: color-mix(in srgb, var(--green-500) 12%, var(--surface-card)); }
.tool-metrics { display: flex; flex-wrap: wrap; gap: 6px; color: var(--text-color-secondary); font-size: 10px; }
.tool-metrics span { padding: 4px 7px; background: var(--surface-card); border-radius: 999px; }
.tool-card p { margin: 0; color: var(--text-color-secondary); font-size: 12px; line-height: 1.5; white-space: pre-wrap; }
.tool-card small { display: block; margin-bottom: 6px; color: var(--text-color-secondary); font-weight: 700; text-transform: uppercase; }
pre { overflow: auto; margin: 0; padding: 12px; max-height: 260px; color: var(--text-color); font-size: 11px; line-height: 1.55; background: var(--surface-card); border-radius: 9px; }
.preview-empty { display: flex; gap: 12px; align-items: center; padding: 14px; color: var(--text-color-secondary); background: var(--surface-ground); border-radius: 11px; }
.preview-empty > i { font-size: 20px; }
.preview-empty div { display: grid; gap: 3px; }
.preview-empty strong { color: var(--text-color); font-size: 13px; }
.preview-empty span { font-size: 11px; line-height: 1.4; }
@media (max-width: 640px) { .preview-heading { display: grid; } .server-owned { max-width: none; } }
</style>
