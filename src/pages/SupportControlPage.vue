<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import { useAuthStore } from "@/features/auth/auth.store";
import { hasProjectPermission } from "@/features/auth/permission-access";
import { supportAvailabilitySource } from "@/features/support-availability/api/support-availability-source";
import { createSupportAvailabilityController } from "@/features/support-availability/model/use-support-availability";
import {
  canManageOwnSupportAvailability,
  canReadSupportAvailability,
  canReadSupportControl,
} from "@/features/support-workspace/model/support-workspace-access";
import {
  SUPPORT_LEAD_RISK_TYPES,
  supportLeadSource,
  type SupportLeadRiskType,
} from "@/features/support-control/api/support-lead-source";
import { createSupportLeadRisksController } from "@/features/support-control/model/use-support-lead-risks";
import { createSupportLeadSummaryController } from "@/features/support-control/model/use-support-lead-summary";
import { createSupportOperationalAlertsController } from "@/features/support-control/model/use-support-operational-alerts";
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
const availabilityAccessDenied = ref(false);
const canReadAvailability = computed(
  () =>
    canRead.value &&
    !availabilityAccessDenied.value &&
    canReadSupportAvailability(auth.project?.effectivePermissionCodes ?? []),
);
const canManageAvailability = computed(
  () =>
    canReadAvailability.value &&
    canManageOwnSupportAvailability(auth.project?.effectivePermissionCodes ?? []),
);
const availability = createSupportAvailabilityController(
  {
    projectId: () => auth.project?.id,
    operatorId: () => auth.user?.id,
    canRead: () => canReadAvailability.value,
    canManage: () => canManageAvailability.value,
    async onForbidden() {
      availabilityAccessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // Availability is already purged by the controller.
      }
    },
  },
  supportAvailabilitySource,
);
const alertsAccessDenied = ref(false);
const canReadAlerts = computed(
  () =>
    canRead.value &&
    !alertsAccessDenied.value &&
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      "project.support.alerts.read",
    ),
);
const canManageAlerts = computed(
  () =>
    canReadAlerts.value &&
    (auth.project?.effectivePermissionCodes as readonly string[] | undefined)?.includes(
      "project.support.alerts.manage",
    ) === true,
);
const canOpenCase = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    "project.cases.read",
  ),
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
const risks = createSupportLeadRisksController(
  {
    projectId: () => auth.project?.id,
    canRead: () => canRead.value,
    async onForbidden() {
      accessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // The protected collection is already purged before route recovery.
      }
    },
  },
  supportLeadSource,
);
const alerts = createSupportOperationalAlertsController(
  {
    projectId: () => auth.project?.id,
    canRead: () => canReadAlerts.value,
    canManage: () => canManageAlerts.value,
    async onForbidden() {
      alertsAccessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // Keep the alert pane purged when the context refresh is unavailable.
      }
    },
  },
  supportLeadSource,
);
const alertDialogVisible = ref(false);
const alertAcknowledgeReason = ref<
  "INVESTIGATING" | "OWNERSHIP_ACCEPTED" | "ESCALATED"
>("INVESTIGATING");
const alertResolveReason = ref<
  | "RISK_CLEARED"
  | "MITIGATED"
  | "FALSE_POSITIVE"
  | "DUPLICATE"
  | "EXTERNAL_INCIDENT_HANDOFF"
>("RISK_CLEARED");

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
  void risks.load();
  if (canReadAlerts.value) void alerts.load();
}

function startAvailabilityHeartbeat(): void {
  if (!canReadAvailability.value) return;
  void availability.load().then(() => availability.startHeartbeat());
}

function labelRiskType(value: SupportLeadRiskType): string {
  return (
    {
      UNASSIGNED_AGED: "Давно без назначения",
      SLA_AT_RISK: "SLA под риском",
      SLA_BREACHED: "SLA нарушен",
      DELIVERY_OUTCOME_UNKNOWN: "Неизвестный результат доставки",
    }[value] ?? "Системный риск"
  );
}

function labelAlertState(value: string): string {
  return (
    { NEW: "Новый", ACKNOWLEDGED: "Подтверждён", RESOLVED: "Решён" }[value] ??
    "Неизвестный статус"
  );
}

function labelAlertSource(value: string): string {
  return (
    {
      SLA_AT_RISK: "SLA под риском",
      SLA_BREACHED: "SLA нарушен",
      UNASSIGNED_AGED: "Давно без назначения",
      NO_ELIGIBLE_OPERATOR: "Нет подходящего оператора",
      CAPACITY_GAP: "Недостаток capacity",
      DELIVERY_OUTCOME_UNKNOWN: "Неизвестный результат доставки",
      LEAD_PROJECTION_DEGRADED: "Ограниченная lead-проекция",
      LEAD_WORKER_DEGRADED: "Lead worker ограничен",
      ROUTING_WORKER_DEGRADED: "Routing worker ограничен",
      ROUTING_EXHAUSTED: "Маршрутизация исчерпана",
    }[value] ?? "Системный сигнал"
  );
}

function labelSeverity(value: string): string {
  return (
    { LOW: "Низкий", MEDIUM: "Средний", HIGH: "Высокий", CRITICAL: "Критический" }[
      value
    ] ?? "Неизвестная серьёзность"
  );
}

function labelTimelineEvent(value: string): string {
  return (
    {
      SOURCE_OBSERVED: "Риск зафиксирован",
      OWNER_CHANGED: "Изменён владелец",
      ACKNOWLEDGED: "Подтверждён",
      RESOLVED: "Решён",
      REOPENED: "Открыт повторно",
    }[value] ?? "Системное событие"
  );
}

function labelReasonCode(value: string): string {
  return (
    {
      INVESTIGATING: "Идёт расследование",
      OWNERSHIP_ACCEPTED: "Владелец принял работу",
      ESCALATED: "Эскалировано",
      RISK_CLEARED: "Риск устранён",
      MITIGATED: "Применены меры",
      FALSE_POSITIVE: "Ложное срабатывание",
      DUPLICATE: "Дубликат",
      EXTERNAL_INCIDENT_HANDOFF: "Передано во внешний инцидент",
      LEAD_ASSIGNMENT: "Назначение лидом",
      LOAD_BALANCE: "Балансировка нагрузки",
      SHIFT_HANDOFF: "Передача смены",
      SKILL_MATCH: "Подбор по навыку",
      OWNER_UNAVAILABLE: "Владелец недоступен",
    }[value] ?? "Системная причина"
  );
}

function labelRiskFreshness(value: string): string {
  return (
    {
      BUILDING: "снимок строится",
      READY: "снимок готов",
      STALE: "снимок устарел",
      DEGRADED: "снимок ограничен",
    }[value] ?? "статус неизвестен"
  );
}

function severity(value: string): "secondary" | "info" | "warn" | "danger" {
  return (
    { LOW: "secondary", MEDIUM: "info", HIGH: "warn", CRITICAL: "danger" }[
      value
    ] ?? "secondary"
  ) as "secondary" | "info" | "warn" | "danger";
}

async function openAlertDetail(alertId: string): Promise<void> {
  alertDialogVisible.value = true;
  await alerts.openDetail(alertId);
}

function closeAlertDetail(): void {
  alertDialogVisible.value = false;
  alerts.closeDetail();
}

function acknowledgeAlert(): void {
  void alerts.acknowledge(alertAcknowledgeReason.value);
}

function resolveAlert(): void {
  void alerts.resolve(alertResolveReason.value);
}

onMounted(() => {
  reload();
  startAvailabilityHeartbeat();
});

watch(
  () => auth.project?.id,
  () => {
    accessDenied.value = false;
    alertsAccessDenied.value = false;
    availabilityAccessDenied.value = false;
    overview.reset();
    risks.reset();
    alerts.reset();
    availability.reset();
    reload();
    startAvailabilityHeartbeat();
  },
);

watch(canRead, (allowed) => {
  if (allowed) return;
  overview.reset();
  risks.reset();
  alerts.reset();
  availability.reset();
  void router.replace({ name: "overview" });
});

watch(canReadAvailability, (allowed) => {
  if (!allowed) {
    availability.reset();
    return;
  }
  startAvailabilityHeartbeat();
});

watch(canReadAlerts, (allowed) => {
  if (allowed) return;
  alerts.reset();
  closeAlertDetail();
});

onBeforeUnmount(() => {
  overview.reset();
  risks.reset();
  alerts.reset();
  availability.reset();
});
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
    <template v-if="overview.summary.value">
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

      <section
        v-if="canReadAlerts"
        class="control-section alerts-section"
        aria-labelledby="alerts-heading"
      >
        <header class="control-section__header">
          <div>
            <span class="eyebrow">Operational alerts</span>
            <h2 id="alerts-heading">Активные alerts</h2>
          </div>
          <Button
            label="Обновить alerts"
            icon="pi pi-refresh"
            severity="secondary"
            text
            :loading="alerts.loading.value"
            @click="() => void alerts.load()"
          />
        </header>
        <p v-if="alerts.page.value" class="section-freshness">
          Материализация: {{ relativeTime(alerts.page.value.computedAt) }} ·
          {{ alerts.page.value.materializationState === 'READY' ? 'готова' : 'ограничена' }}
        </p>
        <Message v-if="alerts.error.value" severity="error" :closable="false">
          {{ alerts.error.value }}
        </Message>
        <div v-else-if="alerts.loading.value && !alerts.page.value" class="alert-list">
          <Skeleton v-for="index in 2" :key="index" height="126px" border-radius="14px" />
        </div>
        <p
          v-else-if="
            alerts.page.value &&
            !alerts.page.value.items.length &&
            alerts.page.value.materializationState === 'READY'
          "
          class="empty-section"
        >
          Активных alerts нет.
        </p>
        <Message
          v-else-if="alerts.page.value && !alerts.page.value.items.length"
          severity="warn"
          :closable="false"
        >
          Материализация alerts ограничена: отсутствие active alerts не подтверждено.
        </Message>
        <div v-else-if="alerts.page.value" class="alert-list">
          <article v-for="alert in alerts.page.value.items" :key="alert.id" class="alert-row">
            <div>
              <div class="alert-row__tags">
                <Tag :value="labelSeverity(alert.severity)" :severity="severity(alert.severity)" />
                <Tag :value="labelAlertState(alert.state)" severity="secondary" />
              </div>
              <h3>{{ labelAlertSource(alert.sourceKind) }}</h3>
              <p>
                Последнее наблюдение {{ relativeTime(alert.lastObservedAt) }} ·
                срабатываний: {{ alert.occurrenceCount }} ·
                {{ alert.hasOwner ? 'владелец назначен' : 'без владельца' }}
              </p>
            </div>
            <Button
              label="История"
              severity="secondary"
              outlined
              @click="openAlertDetail(alert.id)"
            />
          </article>
        </div>
        <Button
          v-if="alerts.page.value?.nextCursor"
          label="Показать ещё alerts"
          severity="secondary"
          text
          :loading="alerts.loading.value"
          @click="alerts.loadMore"
        />
        <Message severity="secondary" :closable="false" class="alerts-contract-note">
          Команды скрываются без отдельного permission
          `project.support.alerts.manage`.
        </Message>
      </section>

      <section class="control-section risk-section" aria-labelledby="risk-heading">
        <header class="control-section__header">
          <div>
            <span class="eyebrow">Case risks</span>
            <h2 id="risk-heading">Очередь рисков</h2>
          </div>
          <div class="risk-tabs" role="group" aria-label="Тип риска">
            <Button
              v-for="type in SUPPORT_LEAD_RISK_TYPES"
              :key="type"
              :label="labelRiskType(type)"
              size="small"
              :severity="risks.riskType.value === type ? 'primary' : 'secondary'"
              :outlined="risks.riskType.value !== type"
              :aria-pressed="risks.riskType.value === type"
              :loading="risks.loading.value && risks.riskType.value === type"
              @click="risks.load(type)"
            />
          </div>
        </header>
        <p v-if="risks.page.value" class="section-freshness">
          Серверный снимок: {{ relativeTime(risks.page.value.computedAt) }}
          · {{ labelRiskFreshness(risks.page.value.freshnessState) }}
          <template v-if="risks.page.value.slaRolloutState === 'SHADOW'">
            · SLA в shadow-режиме
          </template>
        </p>
        <Message v-if="risks.error.value" severity="error" :closable="false">
          {{ risks.error.value }}
        </Message>
        <div v-else-if="risks.loading.value && !risks.page.value" class="risk-list">
          <Skeleton v-for="index in 3" :key="index" height="112px" border-radius="14px" />
        </div>
        <p
          v-else-if="
            risks.page.value &&
            !risks.page.value.items.length &&
            risks.page.value.freshnessState === 'READY'
          "
          class="empty-section"
        >
          Сервер не нашёл Cases с этим риском.
        </p>
        <Message
          v-else-if="risks.page.value && !risks.page.value.items.length"
          severity="warn"
          :closable="false"
        >
          Снимок рисков {{ labelRiskFreshness(risks.page.value.freshnessState) }}:
          отсутствие Cases не подтверждено.
        </Message>
        <div v-else-if="risks.page.value" class="risk-list">
          <article v-for="risk in risks.page.value.items" :key="risk.caseId" class="risk-row">
            <div>
              <span class="eyebrow">{{ labelRiskType(risk.riskType) }}</span>
              <h3>Case требует внимания</h3>
              <p>
                Выявлено {{ relativeTime(risk.detectedAt) }}
                <template v-if="risk.dueAt"> · срок {{ relativeTime(risk.dueAt) }}</template>
              </p>
            </div>
            <RouterLink
              v-if="canOpenCase"
              class="row-link"
              :to="{ name: 'end-user-case-detail', params: { caseId: risk.caseId } }"
            >
              Открыть Case
            </RouterLink>
            <span v-else class="row-unavailable">Нет доступа к Case</span>
          </article>
        </div>
        <Button
          v-if="risks.page.value?.nextCursor"
          label="Показать ещё риски"
          severity="secondary"
          text
          :loading="risks.loading.value"
          @click="risks.loadMore"
        />
      </section>

    <Dialog
      :visible="alertDialogVisible"
      modal
      header="Причинная история alert"
      :style="{ width: 'min(620px, calc(100vw - 32px))' }"
      @update:visible="(visible) => !visible && closeAlertDetail()"
    >
      <Skeleton v-if="alerts.detailLoading.value" height="160px" />
      <Message v-else-if="alerts.detailError.value" severity="error" :closable="false">
        {{ alerts.detailError.value }}
      </Message>
      <template v-else-if="alerts.detail.value">
        <p class="dialog-freshness">
          Снимок {{ relativeTime(alerts.detail.value.computedAt) }} ·
          {{ alerts.detail.value.materializationState === 'READY' ? 'готов' : 'ограничен' }}
        </p>
        <dl class="alert-detail-metadata">
          <div>
            <dt>Период</dt>
            <dd>
              {{ relativeTime(alerts.detail.value.effectiveWindow.from) }} —
              {{ relativeTime(alerts.detail.value.effectiveWindow.to) }}
            </dd>
          </div>
          <div>
            <dt>Поколение</dt>
            <dd>{{ alerts.detail.value.generation }}</dd>
          </div>
          <div>
            <dt>Ревизия политики</dt>
            <dd>{{ alerts.detail.value.policyRevisionId }}</dd>
          </div>
        </dl>
        <Message
          v-if="alerts.detail.value.materializationState === 'DEGRADED'"
          severity="warn"
          :closable="false"
          class="detail-warning"
        >
          История может быть неполной: материализация ограничена.
        </Message>
        <Message
          v-if="alerts.mutationError.value"
          severity="error"
          :closable="false"
          class="detail-warning"
        >
          {{ alerts.mutationError.value }}
        </Message>
        <section
          v-if="canManageAlerts && alerts.detail.value.alert.state !== 'RESOLVED'"
          class="alert-commands"
          aria-label="Команды alert"
        >
          <p>Команды применяются к версии {{ alerts.detail.value.alert.version }}.</p>
          <label v-if="alerts.detail.value.alert.state === 'NEW'">
            <span>Подтвердить alert как</span>
            <select
              v-model="alertAcknowledgeReason"
              :disabled="Boolean(alerts.mutating.value)"
            >
              <option value="INVESTIGATING">Идёт расследование</option>
              <option value="OWNERSHIP_ACCEPTED">Владелец принял работу</option>
              <option value="ESCALATED">Эскалировано</option>
            </select>
            <Button
              type="button"
              label="Подтвердить alert"
              severity="secondary"
              :loading="alerts.mutating.value === 'ACKNOWLEDGE'"
              :disabled="Boolean(alerts.mutating.value)"
              @click="acknowledgeAlert"
            />
          </label>
          <label>
            <span>Закрыть alert как</span>
            <select
              v-model="alertResolveReason"
              :disabled="Boolean(alerts.mutating.value)"
            >
              <option value="RISK_CLEARED">Риск устранён</option>
              <option value="MITIGATED">Применены меры</option>
              <option value="FALSE_POSITIVE">Ложное срабатывание</option>
              <option value="DUPLICATE">Дубликат</option>
              <option value="EXTERNAL_INCIDENT_HANDOFF">Передано во внешний инцидент</option>
            </select>
            <Button
              type="button"
              label="Закрыть alert"
              severity="danger"
              :loading="alerts.mutating.value === 'RESOLVE'"
              :disabled="Boolean(alerts.mutating.value)"
              @click="resolveAlert"
            />
          </label>
        </section>
        <ol v-if="alerts.detail.value.timeline.length" class="alert-timeline">
          <li v-for="event in alerts.detail.value.timeline" :key="event.id">
            <strong>{{ labelTimelineEvent(event.eventKind) }}</strong>
            <span>{{ relativeTime(event.occurredAt) }}</span>
            <small>
              Поколение {{ event.generation }} · версия
              {{ event.beforeVersion ?? "—" }} → {{ event.afterVersion }}
            </small>
            <small>Ревизия политики: {{ event.policyRevisionId }}</small>
            <small v-if="event.reasonCode">Причина: {{ labelReasonCode(event.reasonCode) }}</small>
          </li>
        </ol>
        <p
          v-else-if="alerts.detail.value.materializationState === 'READY'"
          class="empty-section"
        >
          В разрешённой истории пока нет событий.
        </p>
        <p v-else class="empty-section">
          Материализация ограничена: отсутствие событий не подтверждено.
        </p>
        <Button
          v-if="alerts.detail.value.nextCursor"
          label="Показать ещё историю"
          severity="secondary"
          text
          :loading="alerts.detailLoading.value"
          @click="() => void alerts.loadMoreDetail()"
        />
      </template>
    </Dialog>
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
.control-notice {
  height: auto;
  overflow: visible;
  margin-bottom: 16px;
}
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
.control-section {
  margin-top: 24px;
}
.control-section__header,
.risk-tabs,
.alert-row,
.alert-row__tags,
.risk-row {
  display: flex;
  align-items: center;
}
.control-section__header,
.risk-row,
.alert-row {
  justify-content: space-between;
  gap: 16px;
}
.control-section__header h2,
.risk-row h3,
.alert-row h3 {
  margin: 4px 0 0;
  font-size: 1rem;
}
.risk-tabs {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.section-freshness,
.empty-section,
.dialog-freshness {
  margin: 10px 0 14px;
  color: var(--text-muted);
  font-size: 0.8rem;
}
.risk-list,
.alert-list {
  display: grid;
  gap: 10px;
}
.risk-row,
.alert-row {
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-card);
}
.risk-row h3,
.alert-row h3 {
  font-weight: 700;
}
.risk-row p,
.alert-row p {
  margin: 7px 0 0;
  color: var(--text-muted);
  font-size: 0.8rem;
  line-height: 1.45;
}
.row-link,
.row-unavailable {
  flex: 0 0 auto;
  font-size: 0.82rem;
  font-weight: 700;
}
.row-link {
  color: var(--text-link);
  text-decoration: none;
}
.row-link:hover,
.row-link:focus-visible {
  text-decoration: underline;
}
.row-link:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
}
.row-unavailable {
  color: var(--text-muted);
}
.alert-row__tags {
  gap: 8px;
}
.alerts-contract-note {
  margin-top: 12px;
}
.alert-timeline {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.alert-detail-metadata {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 0 0 14px;
  padding: 12px;
  border-radius: 12px;
  background: var(--surface-ground);
}
.alert-detail-metadata div {
  min-width: 0;
}
.alert-detail-metadata dt,
.alert-detail-metadata dd {
  margin: 0;
}
.alert-detail-metadata dt {
  color: var(--text-muted);
  font-size: 0.72rem;
}
.alert-detail-metadata dd {
  margin-top: 4px;
  overflow-wrap: anywhere;
  font-size: 0.8rem;
  font-weight: 700;
}
.detail-warning {
  margin-bottom: 14px;
}
.alert-commands {
  display: grid;
  gap: 10px;
  margin-bottom: 14px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-ground);
}
.alert-commands > p,
.alert-commands label span {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.75rem;
}
.alert-commands label {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(160px, 220px) auto;
  align-items: center;
  gap: 10px;
}
.alert-commands select {
  min-height: 34px;
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: inherit;
  font-size: 0.75rem;
}
.alert-timeline li {
  display: grid;
  gap: 3px;
  padding: 0 0 12px 14px;
  border-bottom: 1px solid var(--line);
}
.alert-timeline span,
.alert-timeline small {
  color: var(--text-muted);
  font-size: 0.8rem;
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
  .control-section__header,
  .risk-row,
  .alert-row {
    align-items: flex-start;
    flex-direction: column;
  }
  .risk-tabs {
    justify-content: flex-start;
  }
  .risk-tabs :deep(.p-button) {
    min-height: 40px;
  }
  .alert-detail-metadata {
    grid-template-columns: 1fr;
  }
  .alert-commands label {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
}
</style>
