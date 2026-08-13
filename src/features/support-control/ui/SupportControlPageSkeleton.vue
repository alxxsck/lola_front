<script setup lang="ts">
import Skeleton from 'primevue/skeleton';
</script>

<template>
  <div
    class="control-page-skeleton"
    data-testid="support-control-page-skeleton"
    role="status"
    aria-label="Загружаем операционный обзор"
  >
    <div class="context-skeleton" aria-hidden="true">
      <Skeleton width="156px" height="12px" />
      <Skeleton width="190px" height="10px" />
    </div>

    <div class="dashboard-skeleton" aria-hidden="true">
      <section class="skeleton-panel attention-skeleton" data-skeleton-block>
        <div class="skeleton-heading">
          <div>
            <Skeleton width="88px" height="9px" />
            <Skeleton width="180px" height="18px" />
          </div>
          <Skeleton width="96px" height="22px" border-radius="999px" />
        </div>
        <div class="attention-skeleton__body">
          <Skeleton height="106px" border-radius="12px" />
          <div class="signal-skeletons">
            <Skeleton v-for="index in 3" :key="index" height="106px" />
          </div>
        </div>
      </section>

      <section class="skeleton-panel workforce-skeleton" data-skeleton-block>
        <div class="skeleton-heading">
          <div>
            <Skeleton width="112px" height="9px" />
            <Skeleton width="168px" height="18px" />
          </div>
          <Skeleton width="38px" height="38px" border-radius="10px" />
        </div>
        <Skeleton width="62%" height="24px" />
        <Skeleton height="7px" border-radius="999px" />
        <Skeleton width="74%" height="11px" />
        <div class="status-skeletons">
          <Skeleton v-for="index in 4" :key="index" height="22px" />
        </div>
      </section>
    </div>

    <section class="skeleton-panel section-skeleton" data-skeleton-block aria-hidden="true">
      <div class="skeleton-heading">
        <div>
          <Skeleton width="92px" height="9px" />
          <Skeleton width="196px" height="18px" />
          <Skeleton width="280px" height="11px" />
        </div>
      </div>
      <div class="capacity-skeletons">
        <Skeleton v-for="index in 2" :key="index" height="197px" border-radius="12px" />
      </div>
    </section>

    <div class="operations-skeleton" aria-hidden="true">
      <section class="skeleton-panel section-skeleton risk-skeleton" data-skeleton-block>
        <div class="skeleton-heading skeleton-heading--wrap">
          <div>
            <Skeleton width="108px" height="9px" />
            <Skeleton width="184px" height="18px" />
            <Skeleton width="330px" height="11px" />
          </div>
          <div class="tab-skeletons">
            <Skeleton
              v-for="index in 4"
              :key="index"
              width="94px"
              height="34px"
              border-radius="9px"
            />
          </div>
        </div>
        <div class="list-skeletons">
          <Skeleton v-for="index in 2" :key="index" height="134.5px" />
        </div>
      </section>

      <section class="skeleton-panel section-skeleton alerts-skeleton" data-skeleton-block>
        <div class="skeleton-heading">
          <div>
            <Skeleton width="136px" height="9px" />
            <Skeleton width="188px" height="18px" />
            <Skeleton width="236px" height="11px" />
          </div>
          <Skeleton width="40px" height="34px" border-radius="9px" />
        </div>
        <div class="list-skeletons">
          <Skeleton v-for="index in 2" :key="index" height="129px" />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.control-page-skeleton {
  display: grid;
  gap: 12px;
}
.context-skeleton,
.skeleton-panel {
  border: 1px solid var(--line);
  background: var(--surface-card);
}
.context-skeleton {
  min-height: 46px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-radius: 12px;
}
.dashboard-skeleton {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(300px, 0.75fr);
  gap: 12px;
}
.skeleton-panel {
  min-width: 0;
  padding: 18px;
  border-radius: 16px;
}
.skeleton-heading,
.skeleton-heading > div {
  display: flex;
}
.skeleton-heading {
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.skeleton-heading > div {
  min-width: 0;
  flex-direction: column;
  gap: 7px;
}
.attention-skeleton__body {
  display: grid;
  grid-template-columns: minmax(190px, 0.9fr) minmax(0, 1.4fr);
  gap: 12px;
  margin-top: 16px;
}
.signal-skeletons {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
}
.signal-skeletons :deep(.p-skeleton) {
  border-radius: 0;
  border-left: 1px solid var(--line);
}
.signal-skeletons :deep(.p-skeleton:first-child) {
  border-left: 0;
}
.workforce-skeleton {
  display: grid;
  align-content: start;
  gap: 12px;
}
.status-skeletons {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px 14px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}
.section-skeleton {
  padding: 16px;
}
.capacity-skeletons {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 16px;
}
.operations-skeleton {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
  grid-template-areas: 'risks alerts';
  align-items: start;
  gap: 12px;
}
.risk-skeleton {
  grid-area: risks;
}
.alerts-skeleton {
  grid-area: alerts;
}
.skeleton-heading--wrap {
  flex-wrap: wrap;
}
.tab-skeletons {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px !important;
}
.list-skeletons {
  display: grid;
  gap: 1px;
  margin-top: 16px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--line);
}
.list-skeletons :deep(.p-skeleton) {
  border-radius: 0;
}
@media (max-width: 1180px) {
  .dashboard-skeleton,
  .operations-skeleton {
    grid-template-columns: 1fr;
  }
  .operations-skeleton {
    grid-template-areas:
      'risks'
      'alerts';
  }
}
@media (max-width: 720px) {
  .context-skeleton,
  .skeleton-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .skeleton-panel {
    padding: 14px;
  }
  .attention-skeleton__body,
  .capacity-skeletons {
    grid-template-columns: 1fr;
  }
  .signal-skeletons {
    grid-template-columns: 1fr;
  }
  .signal-skeletons :deep(.p-skeleton) {
    border-top: 1px solid var(--line);
    border-left: 0;
  }
  .signal-skeletons :deep(.p-skeleton:first-child) {
    border-top: 0;
  }
  .tab-skeletons {
    justify-content: flex-start;
  }
}
</style>
