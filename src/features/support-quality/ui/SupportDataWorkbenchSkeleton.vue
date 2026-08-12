<script setup lang="ts">
import Skeleton from 'primevue/skeleton';

defineProps<{
  kind: 'analytics' | 'quality' | 'registry' | 'review' | 'artifact';
}>();
</script>

<template>
  <section class="workbench-skeleton" :data-kind="kind" aria-label="Загружаем рабочую область">
    <header class="workbench-skeleton__heading">
      <div>
        <Skeleton width="8rem" height="0.75rem" />
        <Skeleton width="min(22rem, 70vw)" height="2.4rem" />
        <Skeleton width="min(34rem, 82vw)" height="0.9rem" />
      </div>
      <Skeleton width="min(24rem, 75vw)" height="2.75rem" border-radius="10px" />
    </header>
    <div class="workbench-skeleton__spine">
      <Skeleton
        v-for="item in kind === 'analytics' ? 6 : kind === 'artifact' ? 3 : 4"
        :key="item"
        height="5.2rem"
      />
    </div>
    <div class="workbench-skeleton__layout">
      <article class="workbench-skeleton__surface">
        <Skeleton width="42%" height="1.1rem" />
        <Skeleton
          v-for="row in kind === 'analytics' ? 2 : kind === 'review' ? 5 : 3"
          :key="row"
          :height="kind === 'analytics' ? '8rem' : '5.4rem'"
        />
      </article>
      <aside v-if="kind !== 'analytics' && kind !== 'artifact'" class="workbench-skeleton__surface">
        <Skeleton width="58%" height="1.1rem" />
        <Skeleton height="7rem" />
        <Skeleton height="7rem" />
      </aside>
    </div>
  </section>
</template>

<style scoped>
.workbench-skeleton {
  box-sizing: border-box;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px;
  display: grid;
  gap: 20px;
}
.workbench-skeleton__heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}
.workbench-skeleton__heading > div,
.workbench-skeleton__surface {
  display: grid;
  gap: 12px;
}
.workbench-skeleton__spine {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  padding: 1px;
  border-radius: 14px;
  background: var(--p-content-border-color);
  overflow: hidden;
}
.workbench-skeleton__layout {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(280px, 0.8fr);
  gap: 16px;
  align-items: start;
}
.workbench-skeleton[data-kind='analytics'] .workbench-skeleton__layout,
.workbench-skeleton[data-kind='artifact'] .workbench-skeleton__layout {
  grid-template-columns: minmax(0, 1fr);
}
.workbench-skeleton[data-kind='review'] .workbench-skeleton__layout {
  grid-template-columns: minmax(0, 1.35fr) minmax(260px, 0.65fr);
}
.workbench-skeleton__surface {
  padding: 16px;
  border: 1px solid var(--p-content-border-color);
  border-radius: 14px;
  background: var(--p-content-background);
}
@media (max-width: 760px) {
  .workbench-skeleton {
    padding: 16px 12px;
    gap: 16px;
  }
  .workbench-skeleton__heading {
    align-items: stretch;
    flex-direction: column;
  }
  .workbench-skeleton__spine {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .workbench-skeleton__layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
