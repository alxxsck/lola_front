<script setup lang="ts">
import { computed } from 'vue';
import type { SupportSlaConfigurationSnapshot } from '@/features/support-sla/api/support-sla-configuration-source';

const props = defineProps<{
  snapshot: SupportSlaConfigurationSnapshot;
  dirty: boolean;
  canManage: boolean;
}>();

const publicationNumber = computed(
  () => props.snapshot.publishedConfiguration?.policyRevision.revisionNumber,
);
const draftLabel = computed(() => {
  const draft = props.snapshot.draft;
  if (!draft) return 'Нет сохранённого черновика';
  return `Черновик ${draft.version}`;
});
</script>

<template>
  <section class="sla-lifecycle" aria-label="Состояние SLA-конфигурации">
    <article class="sla-lifecycle__step">
      <span class="sla-lifecycle__marker sla-lifecycle__marker--published">
        <i class="pi pi-check" />
      </span>
      <div>
        <small>Опубликовано</small>
        <strong v-if="publicationNumber">Публикация №{{ publicationNumber }}</strong>
        <strong v-else>Пока не опубликовано</strong>
      </div>
    </article>
    <article class="sla-lifecycle__step">
      <span class="sla-lifecycle__marker"><i class="pi pi-file-edit" /></span>
      <div>
        <small>Черновик на сервере</small>
        <strong>{{ canManage ? draftLabel : 'Скрыт для роли просмотра' }}</strong>
      </div>
    </article>
    <article class="sla-lifecycle__step" :class="{ 'is-dirty': dirty }">
      <span class="sla-lifecycle__marker"><i class="pi pi-pencil" /></span>
      <div>
        <small>Локальная форма</small>
        <strong>{{ dirty ? 'Есть несохранённые изменения' : 'Синхронизирована' }}</strong>
      </div>
    </article>
  </section>
</template>

<style scoped>
.sla-lifecycle {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-card);
}

.sla-lifecycle__step {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-height: 76px;
  padding: 12px;
  border-right: 1px solid var(--line);
}

.sla-lifecycle__step:last-child {
  border-right: 0;
}
.sla-lifecycle__step.is-dirty {
  background: var(--status-warning-soft);
}
.sla-lifecycle__marker {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  color: var(--text-secondary);
  background: var(--surface-subtle);
  border-radius: 10px;
}
.sla-lifecycle__marker--published {
  color: var(--status-success-text);
  background: var(--status-success-soft);
}
.sla-lifecycle__step small,
.sla-lifecycle__step strong {
  display: block;
}
.sla-lifecycle__step small {
  margin-bottom: 4px;
  color: var(--text-tertiary);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.sla-lifecycle__step strong {
  color: var(--text-primary);
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.35;
}

@media (max-width: 980px) {
  .sla-lifecycle {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .sla-lifecycle__step:nth-child(2) {
    border-right: 0;
  }
  .sla-lifecycle__step:nth-child(-n + 2) {
    border-bottom: 1px solid var(--line);
  }
}

@media (max-width: 560px) {
  .sla-lifecycle {
    grid-template-columns: 1fr;
  }
  .sla-lifecycle__step,
  .sla-lifecycle__step:nth-child(2) {
    min-height: 64px;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .sla-lifecycle__step:last-child {
    border-bottom: 0;
  }
}
</style>
