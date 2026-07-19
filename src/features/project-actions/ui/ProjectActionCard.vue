<script setup lang="ts">
import { computed } from 'vue'
import type { ProjectAction } from '../model/project-action'

const props = defineProps<{ action: ProjectAction }>()
const emit = defineEmits<{ select: [action: ProjectAction] }>()

const name = computed(() => props.action.nameOverride || props.action.actionTypeRevision.name)
const description = computed(() => props.action.descriptionOverride || props.action.actionTypeRevision.description)
const origin = computed(() => props.action.actionType.origin === 'SYSTEM' ? 'Системное' : 'Интеграция')
const executor = computed(() => ({
  FRONTEND_COMMAND: 'Frontend command',
  SERVER_HANDLER: 'Backend handler',
  PROPOSAL: 'Proposal',
})[props.action.actionTypeRevision.executorAdapter])
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
        <span class="tag-row"><span class="origin-tag">{{ origin }}</span><span class="revision-tag">Ревизия {{ action.actionTypeRevision.version }}</span></span>
        <strong>{{ name }}</strong>
        <code>{{ action.code }}</code>
      </span>
      <i class="pi pi-arrow-up-right open-icon" />
    </span>

    <span class="description">{{ description }}</span>

    <span class="contract-meta">
      <span>Поддерживает: {{ action.actionTypeRevision.supportedSurfaces.join(' · ') }}</span>
      <span>Подтверждение: {{ action.actionTypeRevision.confirmationPolicy }}</span>
      <span>Config: {{ Object.keys(action.configuration).length }} полей</span>
    </span>

    <span class="surface-grid">
      <span class="surface-state">
        <span><i class="pi pi-sitemap" /> Сценарии</span>
        <strong :class="action.scenarioEnabled ? 'enabled' : 'disabled'">{{ action.scenarioEnabled ? 'Включено' : 'Выключено' }}</strong>
      </span>
      <span class="surface-state">
        <span><i class="pi pi-sparkles" /> AI</span>
        <strong :class="action.aiEnabled ? 'enabled' : 'disabled'">{{ action.aiEnabled ? 'Включено' : 'Выключено' }}</strong>
      </span>
    </span>

    <span class="card-footer">
      <span>{{ executor }}</span>
      <span>{{ action.lifecycle === 'ARCHIVED' ? 'Архив' : action.actionTypeRevision.risk }}</span>
    </span>
  </button>
</template>

<style scoped>
.project-action-card { display: grid; gap: 16px; padding: 20px; width: 100%; min-width: 0; color: inherit; text-align: left; background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 18px; cursor: pointer; transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
.project-action-card:hover { border-color: color-mix(in srgb, var(--primary-color) 45%, var(--surface-border)); box-shadow: 0 14px 34px color-mix(in srgb, var(--text-color) 8%, transparent); transform: translateY(-2px); }
.project-action-card:focus-visible { outline: 3px solid color-mix(in srgb, var(--primary-color) 35%, transparent); outline-offset: 2px; }
.project-action-card.archived { opacity: .7; }
.card-heading { display: grid; grid-template-columns: 44px minmax(0, 1fr) 18px; gap: 12px; align-items: start; }
.action-icon { display: grid; place-items: center; width: 44px; height: 44px; color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 12%, var(--surface-card)); border-radius: 13px; }
.identity { display: grid; gap: 5px; min-width: 0; }
.identity strong { font-size: 16px; line-height: 1.25; }
.identity code { overflow: hidden; color: var(--text-color-secondary); font-size: 11px; text-overflow: ellipsis; }
.tag-row { display: flex; flex-wrap: wrap; gap: 6px; }
.origin-tag, .revision-tag { padding: 3px 7px; color: var(--text-color-secondary); font-size: 10px; font-weight: 700; background: var(--surface-100); border-radius: 999px; }
.origin-tag { color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 10%, var(--surface-card)); }
.open-icon { color: var(--text-color-secondary); font-size: 12px; }
.description { min-height: 38px; color: var(--text-color-secondary); font-size: 13px; line-height: 1.45; }
.contract-meta { display: flex; flex-wrap: wrap; gap: 6px; }
.contract-meta span { padding: 4px 7px; color: var(--text-color-secondary); font-size: 9px; background: var(--surface-ground); border-radius: 999px; }
.surface-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.surface-state { display: grid; gap: 6px; padding: 10px 11px; background: var(--surface-ground); border: 1px solid var(--surface-border); border-radius: 11px; }
.surface-state > span { color: var(--text-color-secondary); font-size: 11px; }
.surface-state strong { font-size: 12px; }
.surface-state .enabled { color: var(--green-600); }
.surface-state .disabled { color: var(--text-color-secondary); }
.card-footer { display: flex; justify-content: space-between; gap: 12px; padding-top: 12px; color: var(--text-color-secondary); font-size: 11px; border-top: 1px solid var(--surface-border); }
@media (max-width: 520px) { .surface-grid { grid-template-columns: 1fr; } }
</style>
