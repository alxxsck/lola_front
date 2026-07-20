<script setup lang="ts">
import Button from "primevue/button";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import { RouterLink } from "vue-router";
import type { AiCapabilityPreview } from "../model/project-action";
import type { ProjectActionError } from "../model/project-action-error";

defineProps<{
  preview?: AiCapabilityPreview;
  loading?: boolean;
  error?: ProjectActionError | null;
}>();
const emit = defineEmits<{ retry: [] }>();

function formatSchema(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2);
}

function schemaPropertyCount(value: Record<string, unknown>): number {
  const properties = value.properties;
  return properties &&
    typeof properties === "object" &&
    !Array.isArray(properties)
    ? Object.keys(properties).length
    : 0;
}

function targetVariantCount(value: Record<string, unknown>): number {
  const properties = value.properties;
  if (
    !properties ||
    typeof properties !== "object" ||
    Array.isArray(properties)
  )
    return 0;
  return Object.values(properties).reduce((total, property) => {
    if (!property || typeof property !== "object" || Array.isArray(property))
      return total;
    const variants = (property as Record<string, unknown>).enum;
    return total + (Array.isArray(variants) ? variants.length : 0);
  }, 0);
}

function fieldCountLabel(count: number): string {
  if (count % 10 === 1 && count % 100 !== 11) return `${count} параметр`;
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100))
    return `${count} параметра`;
  return `${count} параметров`;
}

function variantCountLabel(count: number): string {
  if (count % 10 === 1 && count % 100 !== 11)
    return `${count} доступный вариант`;
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100))
    return `${count} доступных варианта`;
  return `${count} доступных вариантов`;
}

function issueMessage(code: string): string {
  return (
    {
      AI_ACTION_DISABLED:
        "Разрешите Lola использовать это действие и сохраните изменения.",
      AI_ACTION_TARGETS_UNAVAILABLE:
        "В разделе «Интерфейс» пока нет опубликованных элементов, которые Lola может использовать.",
    }[code] ??
    "Lola пока не может использовать это действие. Проверьте настройки и повторите попытку."
  );
}
</script>

<template>
  <section class="ai-preview" aria-labelledby="ai-preview-heading">
    <div class="preview-heading">
      <div>
        <h3 id="ai-preview-heading">Как Lola будет использовать действие</h3>
        <p>
          Здесь показано, когда действие доступно Lola и какие данные она может
          передать при выполнении.
        </p>
      </div>
      <span class="server-owned"
        ><i class="pi pi-shield" /> Данные проекта, пользователя и диалога
        добавляются автоматически</span
      >
    </div>
    <div v-if="loading" class="preview-loading">
      <Skeleton height="18px" width="42%" /><Skeleton height="90px" />
    </div>
    <Message v-else-if="error" severity="error" :closable="false">
      {{ error.message }}
      <Button label="Повторить" size="small" text @click="emit('retry')" />
    </Message>
    <template v-else-if="preview?.tool">
      <div class="tool-card">
        <div class="tool-status">
          <i class="pi pi-check-circle" />
          <strong>Действие доступно Lola</strong>
        </div>
        <div class="tool-metrics">
          <span>{{
            fieldCountLabel(schemaPropertyCount(preview.tool.parameters))
          }}</span
          ><span v-if="targetVariantCount(preview.tool.parameters)">{{
            variantCountLabel(targetVariantCount(preview.tool.parameters))
          }}</span>
        </div>
        <div class="usage-copy">
          <small>Когда Lola выберет действие</small>
          <p>{{ preview.tool.description }}</p>
        </div>
        <details class="technical-details">
          <summary>Технические сведения для разработчика</summary>
          <code>{{ preview.tool.name }}</code>
          <pre>{{ formatSchema(preview.tool.parameters) }}</pre>
        </details>
      </div>
    </template>
    <div v-else class="preview-empty">
      <i class="pi pi-eye-slash" />
      <div>
        <strong>Действие пока недоступно Lola</strong>
        <span>
          Проверьте, что доступ для Lola включён и сохранён. Если действие
          открывает страницу, окно или элемент, сначала опубликуйте его в
          разделе «Интерфейс».
        </span>
        <RouterLink to="/interface">Открыть раздел «Интерфейс»</RouterLink>
      </div>
    </div>
    <Message
      v-for="issue in preview?.issues ?? []"
      :key="`${issue.code}:${issue.message}`"
      severity="warn"
      :closable="false"
    >
      {{ issueMessage(issue.code) }}
    </Message>
  </section>
</template>

<style scoped>
.ai-preview {
  display: grid;
  gap: 14px;
}
.preview-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: start;
}
.preview-heading h3 {
  margin: 0 0 4px;
  font-size: 15px;
}
.preview-heading p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
}
.server-owned {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  max-width: 250px;
  padding: 7px 9px;
  color: var(--status-success-text);
  font-size: 10px;
  font-weight: 700;
  background: var(--status-success-soft);
  border-radius: 9px;
}
.preview-loading {
  display: grid;
  gap: 10px;
}
.tool-card {
  display: grid;
  gap: 13px;
  padding: 14px;
  background: var(--surface-subtle);
  border: 1px solid var(--border-default);
  border-radius: 12px;
}
.tool-status {
  display: flex;
  gap: 7px;
  align-items: center;
  color: var(--status-success-text);
}
.tool-status strong {
  font-size: 12px;
}
.tool-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 10px;
}
.tool-metrics span {
  padding: 4px 7px;
  background: var(--surface-card);
  border-radius: 999px;
}
.usage-copy p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
}
.usage-copy small {
  display: block;
  margin-bottom: 6px;
  color: var(--text-secondary);
  font-weight: 700;
}
.technical-details {
  color: var(--text-secondary);
  font-size: 10px;
}
.technical-details summary {
  margin-bottom: 8px;
  cursor: pointer;
  font-weight: 700;
}
.technical-details > code {
  display: block;
  margin-bottom: 8px;
}
pre {
  overflow: auto;
  margin: 0;
  padding: 12px;
  max-height: 260px;
  color: var(--text-primary);
  font-size: 11px;
  line-height: 1.55;
  background: var(--surface-card);
  border-radius: 9px;
}
.preview-empty {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 14px;
  color: var(--text-secondary);
  background: var(--surface-subtle);
  border-radius: 11px;
}
.preview-empty > i {
  font-size: 20px;
}
.preview-empty div {
  display: grid;
  gap: 3px;
}
.preview-empty a {
  color: var(--text-link);
  font-size: 11px;
  font-weight: 700;
}
.preview-empty strong {
  color: var(--text-primary);
  font-size: 13px;
}
.preview-empty span {
  font-size: 11px;
  line-height: 1.4;
}
@media (max-width: 640px) {
  .preview-heading {
    display: grid;
  }
  .server-owned {
    max-width: none;
  }
}
</style>
