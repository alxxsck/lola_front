<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import { useAuthStore } from "@/features/auth/auth.store";
import { canReadSupportControl } from "@/features/support-workspace/model/support-workspace-access";
import { supportLeadSource } from "@/features/support-control/api/support-lead-source";
import { createSupportLeadSummaryController } from "@/features/support-control/model/use-support-lead-summary";
import { supportWorkspaceShellEnabled } from "@/shared/config/features";
import { relativeTime } from "@/shared/lib/format";
import { useRouter } from "vue-router";

const auth = useAuthStore();
const router = useRouter();
const accessDenied = ref(false);
const canRead = computed(
  () =>
    !accessDenied.value &&
    supportWorkspaceShellEnabled &&
    canReadSupportControl(auth.project?.effectivePermissionCodes ?? []),
);
const overview = createSupportLeadSummaryController(
  {
    projectId: () => auth.project?.id,
    canRead: () => canRead.value,
    async onForbidden() {
      accessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // The stale summary has already been purged; route recovery follows below.
      }
    },
  },
  supportLeadSource,
);

const freshness = computed(() => {
  const state = overview.summary.value?.freshnessState;
  if (state === "READY") return { label: "Актуальный снимок", severity: "success" as const };
  if (state === "STALE") return { label: "Снимок устарел", severity: "warning" as const };
  if (state === "DEGRADED") return { label: "Снимок ограничен", severity: "danger" as const };
  return { label: "Снимок строится", severity: "secondary" as const };
});

function duration(value: number | null): string {
  if (value === null) return "Нет данных";
  const minutes = Math.floor(value / 60_000);
  if (minutes < 1) return "меньше минуты";
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  return `${hours} ч ${minutes % 60} мин`;
}

function reload(): void {
  void overview.load();
}

onMounted(reload);

watch(
  () => auth.project?.id,
  () => {
    accessDenied.value = false;
    overview.reset();
    reload();
  },
);

watch(canRead, (allowed) => {
  if (allowed) return;
  overview.reset();
  void router.replace({ name: "overview" });
});

onBeforeUnmount(overview.reset);
</script>

<template>
  <section class="page support-control-page">
    <header class="page-header support-control-header">
      <div>
        <div class="eyebrow"><i class="pi pi-chart-line" /> Поддержка</div>
        <h1>Операционный обзор</h1>
        <p class="subtitle">
          Authoritative snapshot очереди, SLA и capacity. Браузер не вычисляет
          показатели из загруженных диалогов.
        </p>
      </div>
      <div class="header-actions">
        <Tag :value="freshness.label" :severity="freshness.severity" />
        <Button
          label="Обновить"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          :loading="overview.loading.value"
          @click="reload"
        />
      </div>
    </header>

    <Message severity="info" :closable="false" class="control-notice">
      Показатели предназначены для распределения работы и устранения рисков, а
      не для оценки сотрудника по online presence.
    </Message>

    <Message v-if="overview.error.value" severity="error" :closable="false">
      {{ overview.error.value }}
    </Message>
    <div v-if="overview.loading.value && !overview.summary.value" class="metric-grid">
      <Skeleton v-for="index in 5" :key="index" height="164px" border-radius="16px" />
    </div>
    <template v-else-if="overview.summary.value">
      <p class="computed-at">
        Серверный снимок: {{ relativeTime(overview.summary.value.computedAt) }}
        <template v-if="overview.summary.value.slaRolloutState === 'SHADOW'">
          · SLA в shadow-режиме
        </template>
      </p>
      <div class="metric-grid">
        <article class="metric-card">
          <span class="eyebrow">Очередь</span>
          <strong>{{ overview.summary.value.actionableBacklog.unassignedCount }}</strong>
          <h2>Без назначения</h2>
          <p>
            Старейший: {{ duration(overview.summary.value.actionableBacklog.oldestUnassignedAgeMs) }}
          </p>
        </article>
        <article
          class="metric-card"
          :class="{
            risk:
              overview.summary.value.slaRolloutState !== 'DISABLED' &&
              overview.summary.value.sla.breachedCount > 0,
          }"
        >
          <span class="eyebrow">SLA</span>
          <template v-if="overview.summary.value.slaRolloutState === 'DISABLED'">
            <strong>—</strong>
            <h2>SLA не включён</h2>
            <p>Риски и нарушения пока не рассчитываются.</p>
          </template>
          <template v-else>
            <strong>{{ overview.summary.value.sla.atRiskCount }}</strong>
            <h2>Под риском</h2>
            <p>
              Нарушено: {{ overview.summary.value.sla.breachedCount }} · старейший срок:
              {{ duration(overview.summary.value.sla.oldestDueAgeMs) }}
            </p>
          </template>
        </article>
        <article class="metric-card">
          <span class="eyebrow">Нагрузка</span>
          <strong>
            {{ overview.summary.value.workforce.currentWorkloadUnits }} /
            {{ overview.summary.value.workforce.maximumCapacityUnits }}
          </strong>
          <h2>Единицы capacity</h2>
          <p>Дефицит: {{ overview.summary.value.workforce.capacityGapUnits }}</p>
        </article>
        <article class="metric-card">
          <span class="eyebrow">Доставка</span>
          <strong>{{ overview.summary.value.delivery.pendingCount }}</strong>
          <h2>Ожидают доставки</h2>
          <p>Неизвестный outcome: {{ overview.summary.value.delivery.outcomeUnknownCount }}</p>
        </article>
        <article class="metric-card">
          <span class="eyebrow">Проекция</span>
          <strong>{{ overview.summary.value.projectionHealth.retryCount }}</strong>
          <h2>Повторных обработок</h2>
          <p>Dead letter: {{ overview.summary.value.projectionHealth.deadLetterCount }}</p>
        </article>
      </div>

      <section class="availability-card card" aria-labelledby="availability-heading">
        <div>
          <span class="eyebrow">Workforce</span>
          <h2 id="availability-heading">Доступность операторов</h2>
        </div>
        <dl>
          <div>
            <dt>Доступны</dt>
            <dd>{{ overview.summary.value.workforce.availability.AVAILABLE }}</dd>
          </div>
          <div>
            <dt>Заняты</dt>
            <dd>{{ overview.summary.value.workforce.availability.BUSY }}</dd>
          </div>
          <div>
            <dt>Отошли</dt>
            <dd>{{ overview.summary.value.workforce.availability.AWAY }}</dd>
          </div>
          <div>
            <dt>Завершают</dt>
            <dd>{{ overview.summary.value.workforce.availability.DRAINING }}</dd>
          </div>
          <div>
            <dt>Офлайн</dt>
            <dd>{{ overview.summary.value.workforce.availability.OFFLINE }}</dd>
          </div>
        </dl>
      </section>
    </template>
  </section>
</template>

<style scoped>
.support-control-header,
.header-actions,
.availability-card,
.availability-card dl {
  display: flex;
  align-items: center;
}
.support-control-header,
.availability-card {
  justify-content: space-between;
}
.header-actions {
  gap: 10px;
  flex-wrap: wrap;
}
.control-notice,
.computed-at {
  margin-bottom: 16px;
}
.computed-at {
  color: var(--text-muted);
  font-size: 0.82rem;
}
.metric-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
}
.metric-card {
  min-width: 0;
  min-height: 164px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface-card);
}
.metric-card.risk {
  border-color: var(--red-300);
  background: color-mix(in srgb, var(--red-50) 55%, var(--surface-card));
}
.metric-card strong {
  display: block;
  margin-top: 12px;
  font-size: 1.6rem;
  line-height: 1.1;
}
.metric-card h2 {
  margin: 5px 0 8px;
  font-size: 0.95rem;
}
.metric-card p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.78rem;
  line-height: 1.45;
}
.availability-card {
  gap: 20px;
  margin-top: 14px;
  padding: 18px;
}
.availability-card h2 {
  margin: 4px 0 0;
  font-size: 1rem;
}
.availability-card dl {
  gap: 20px;
  margin: 0;
}
.availability-card dl > div {
  display: grid;
  gap: 3px;
}
.availability-card dt {
  color: var(--text-muted);
  font-size: 0.76rem;
}
.availability-card dd {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
}
@media (max-width: 1180px) {
  .metric-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .availability-card {
    align-items: flex-start;
    flex-direction: column;
  }
  .availability-card dl {
    flex-wrap: wrap;
  }
}
@media (max-width: 720px) {
  .support-control-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
  }
  .metric-grid {
    grid-template-columns: 1fr;
  }
  .metric-card {
    min-height: 0;
  }
  .availability-card dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }
}
</style>
