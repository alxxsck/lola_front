<script setup lang="ts">
import { computed } from "vue";
import type { ProjectAction } from "../model/project-action";
import {
  actionExecutorLabel,
  actionOriginLabel,
  actionRiskLabel,
  projectActionDescription,
  projectActionName,
} from "../model/project-action-presentation";

const props = defineProps<{ action: ProjectAction }>();
const emit = defineEmits<{ select: [action: ProjectAction] }>();

const name = computed(() => projectActionName(props.action));
const description = computed(() => projectActionDescription(props.action));
const origin = computed(() =>
  actionOriginLabel(props.action.actionType.origin),
);
const supportsScenario = computed(() =>
  props.action.actionTypeRevision.supportedSurfaces.includes("SCENARIO"),
);
const supportsAi = computed(() =>
  props.action.actionTypeRevision.supportedSurfaces.includes("AI"),
);
const executor = computed(() =>
  actionExecutorLabel(props.action.actionTypeRevision.executorAdapter),
);
const risk = computed(() =>
  actionRiskLabel(props.action.actionTypeRevision.risk),
);
</script>

<template>
  <button
    type="button"
    class="project-action-card"
    :class="{ archived: action.lifecycle === 'ARCHIVED' }"
    :aria-label="`Открыть действие ${name}`"
    @click="emit('select', action)"
  >
    <span class="card-heading">
      <span class="action-icon"><i class="pi pi-bolt" /></span>
      <span class="identity">
        <span class="tag-row"
          ><span class="origin-tag">{{ origin }}</span
          ><span class="revision-tag"
            >Версия {{ action.actionTypeRevision.version }}</span
          ></span
        >
        <strong>{{ name }}</strong>
      </span>
      <i class="pi pi-arrow-up-right open-icon" />
    </span>

    <span class="description">{{ description }}</span>

    <span class="surface-grid" aria-label="Состояние поверхностей">
      <span class="surface-state" :class="{ unsupported: !supportsScenario }">
        <span><i class="pi pi-sitemap" /> Сценарии</span>
        <strong :class="action.scenarioEnabled ? 'enabled' : 'disabled'">{{
          supportsScenario
            ? action.scenarioEnabled
              ? "Включено"
              : "Выключено"
            : "Недоступно"
        }}</strong>
      </span>
      <span class="surface-state" :class="{ unsupported: !supportsAi }">
        <span><i class="pi pi-sparkles" /> Для помощника</span>
        <strong :class="action.aiEnabled ? 'enabled' : 'disabled'">{{
          supportsAi
            ? action.aiEnabled
              ? "Включено"
              : "Выключено"
            : "Недоступно"
        }}</strong>
      </span>
    </span>

    <span class="card-footer">
      <span><i class="pi pi-cog" /> {{ executor }}</span>
      <span>{{ action.lifecycle === "ARCHIVED" ? "В архиве" : risk }}</span>
    </span>
  </button>
</template>

<style scoped>
.project-action-card {
  display: grid;
  gap: 12px;
  align-content: start;
  padding: 16px;
  width: 100%;
  min-width: 0;
  color: inherit;
  text-align: left;
  background: var(--surface-raised);
  border: 1px solid var(--border-default);
  border-radius: 15px;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}
.project-action-card:hover {
  border-color: var(--action-primary);
  box-shadow: 0 14px 34px
    color-mix(in srgb, var(--text-primary) 8%, transparent);
  transform: translateY(-2px);
}
.project-action-card:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--focus-ring) 35%, transparent);
  outline-offset: 2px;
}
.project-action-card.archived {
  opacity: 0.7;
}
.card-heading {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 16px;
  gap: 10px;
  align-items: start;
}
.action-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  color: var(--status-violet-text);
  background: var(--status-violet-soft);
  border-radius: 11px;
}
.action-icon i,
.open-icon,
.surface-state i,
.card-footer i {
  width: 1em;
  text-align: center;
}
.identity {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.identity strong {
  display: -webkit-box;
  overflow: hidden;
  font-size: 14px;
  line-height: 1.3;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.identity code {
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
}
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.origin-tag,
.revision-tag {
  padding: 2px 6px;
  color: var(--text-secondary);
  font-size: 9px;
  font-weight: 700;
  background: var(--surface-subtle);
  border-radius: 999px;
}
.origin-tag {
  color: var(--status-violet-text);
  background: var(--status-violet-soft);
}
.open-icon {
  color: var(--text-secondary);
  font-size: 12px;
}
.description {
  display: -webkit-box;
  overflow: hidden;
  min-height: 34px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.surface-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.surface-state {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  padding: 8px 9px;
  background: var(--surface-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
}
.surface-state > span {
  color: var(--text-secondary);
  font-size: 10px;
  white-space: nowrap;
}
.surface-state strong {
  font-size: 10px;
}
.surface-state .enabled {
  color: var(--status-success-text);
}
.surface-state .disabled {
  color: var(--text-secondary);
}
.surface-state.unsupported {
  opacity: 0.55;
}
.card-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-top: 10px;
  color: var(--text-secondary);
  font-size: 10px;
  border-top: 1px solid var(--border-default);
}
.card-footer span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 420px) {
  .surface-grid {
    grid-template-columns: 1fr;
  }
}
</style>
