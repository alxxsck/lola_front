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
  canForceSupportAssignments,
  canManageOwnSupportAvailability,
  canOverrideSupportAssignments,
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
import { createSupportLeadControlController } from "@/features/support-control/model/use-support-lead-control";
import { createSupportOperationalAlertsController } from "@/features/support-control/model/use-support-operational-alerts";
import { supportLeadAssignmentSource } from "@/features/support-lead-assignment/api/support-lead-assignment-source";
import { createSupportLeadAssignmentController } from "@/features/support-lead-assignment/model/use-support-lead-assignment";
import { createSupportLeadAssignmentBatchController } from "@/features/support-lead-assignment/model/use-support-lead-assignment-batch";
import SupportLeadAssignmentDesk from "@/features/support-lead-assignment/ui/SupportLeadAssignmentDesk.vue";
import SupportLeadAssignmentBatchDesk from "@/features/support-lead-assignment/ui/SupportLeadAssignmentBatchDesk.vue";
import { supportWorkspaceShellEnabled } from "@/shared/config/features";
import { relativeTime } from "@/shared/lib/format";
import { useRouter } from "vue-router";

const auth = useAuthStore();
const router = useRouter();
const accessDenied = ref(false);
const fallbackCaseId = ref("");
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
const assignmentAccessDenied = ref(false);
const activityAccessDenied = ref(false);
const canReadActivity = computed(
  () =>
    canRead.value &&
    !activityAccessDenied.value &&
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      "project.support.activity.read",
    ),
);
const canOverrideAssignments = computed(
  () =>
    canRead.value &&
    !assignmentAccessDenied.value &&
    canOverrideSupportAssignments(auth.project?.effectivePermissionCodes ?? []),
);
const canForceAssignments = computed(
  () =>
    canOverrideAssignments.value &&
    canForceSupportAssignments(auth.project?.effectivePermissionCodes ?? []),
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
const leadControl = createSupportLeadControlController(
  {
    projectId: () => auth.project?.id,
    canRead: () => canRead.value,
    canReadActivity: () => canReadActivity.value,
    async onForbidden() {
      accessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // Protected Lead projections are already purged.
      }
    },
    async onActivityForbidden() {
      activityAccessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // Protected Activity is already purged.
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
const leadAssignment = createSupportLeadAssignmentController(
  supportLeadAssignmentSource,
  {
    projectId: () => auth.project?.id,
    canOverride: () => canOverrideAssignments.value,
    canForce: () => canForceAssignments.value,
    canReadAudit: () => canRead.value,
    async onForbidden() {
      assignmentAccessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // Lead assignment authority has already been purged.
      }
    },
    async onChanged() {
      await Promise.all([overview.load(), risks.load(), leadControl.load()]);
    },
  },
);
const selectedRiskCaseIds = ref<string[]>([]);
const selectedRiskCaseLabels = computed(() =>
  Object.fromEntries(
    (risks.page.value?.items ?? [])
      .filter((item) => selectedRiskCaseIds.value.includes(item.caseId))
      .map((item, index) => [
        item.caseId,
        `${labelRiskType(item.riskType)} · Case ${index + 1}`,
      ]),
  ),
);
const leadAssignmentBatch = createSupportLeadAssignmentBatchController(
  supportLeadAssignmentSource,
  {
    projectId: () => auth.project?.id,
    canOverride: () => canOverrideAssignments.value,
    canForce: () => canForceAssignments.value,
    async onForbidden() {
      assignmentAccessDenied.value = true;
      selectedRiskCaseIds.value = [];
      try {
        await auth.refreshContext();
      } catch {
        // Batch targets and protected receipts have already been purged.
      }
    },
    async onChanged() {
      await Promise.all([overview.load(), risks.load(), leadControl.load()]);
    },
  },
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
const alertOwnerId = ref("");
const alertOwnerReason = ref<
  "LEAD_ASSIGNMENT" | "LOAD_BALANCE" | "SHIFT_HANDOFF" | "SKILL_MATCH" | "OWNER_UNAVAILABLE"
>("LEAD_ASSIGNMENT");
const currentAlertOwnerMissing = computed(() => {
  const currentOwner = alerts.detail.value?.alert.ownerCmsUserId;
  return Boolean(
    currentOwner && !alerts.ownerTargets.value.some((target) => target.id === currentOwner),
  );
});
const canChangeAlertOwner = computed(
  () =>
    Boolean(alerts.detail.value) &&
    alertOwnerId.value !== (alerts.detail.value?.alert.ownerCmsUserId ?? "") &&
    (alertOwnerId.value ? alertOwnerReason.value !== "OWNER_UNAVAILABLE" : alertOwnerReason.value === "OWNER_UNAVAILABLE"),
);

const freshness = computed(() => {
  const admission = leadControl.admission.value;
  if (!admission)
    return { label: "Проверка готовности", severity: "secondary" as const };
  if (admission.rolloutState === "DISABLED" || admission.readinessState === "NOT_PROVISIONED")
    return { label: "Не включено", severity: "secondary" as const };
  if (admission.readinessState === "DEGRADED")
    return { label: "Ограниченный режим", severity: "danger" as const };
  if (admission.readinessState === "STALE")
    return { label: "Снимок устарел", severity: "warning" as const };
  const state = overview.summary.value?.freshnessState;
  if (state === "READY") return { label: "Актуальный снимок", severity: "success" as const };
  if (state === "STALE") return { label: "Снимок устарел", severity: "warning" as const };
  if (state === "DEGRADED") return { label: "Снимок ограничен", severity: "danger" as const };
  return { label: "Снимок строится", severity: "secondary" as const };
});

const admissionState = computed(() => {
  const value = leadControl.admission.value;
  if (!value) return null;
  if (value.rolloutState === "DISABLED" || value.readinessState === "NOT_PROVISIONED")
    return {
      severity: "secondary" as const,
      title: "Lead Control ещё не включён",
      detail: "Проекция не подготовлена. Нулевые показатели не показываются как достоверные.",
    };
  if (value.readinessState === "BUILDING")
    return {
      severity: "info" as const,
      title: "Операционный снимок строится",
      detail: "Дождитесь готовности server-owned проекции или обновите экран позже.",
    };
  if (value.readinessState === "DEGRADED")
    return {
      severity: "warn" as const,
      title: "Lead Control работает в ограниченном режиме",
      detail: "Часть агрегатов скрыта; для Case доступно только разрешённое owner-fallback расследование.",
    };
  if (value.readinessState === "STALE")
    return {
      severity: "warn" as const,
      title: "Операционный снимок отстаёт",
      detail: "Показатели помечены как устаревшие и не должны использоваться без проверки Case.",
    };
  return null;
});

function duration(value: number | null): string {
  if (value === null) return "Нет данных";
  const minutes = Math.floor(value / 60_000);
  if (minutes < 1) return "меньше минуты";
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  return `${hours} ч ${minutes % 60} мин`;
}

async function reload(): Promise<void> {
  await leadControl.load();
  const admission = leadControl.admission.value;
  if (
    admission?.rolloutState === "ENABLED" &&
    (admission.readinessState === "READY" || admission.readinessState === "STALE") &&
    admission.capabilities.summary === "AVAILABLE"
  )
    await overview.load();
  else overview.reset();
  if (
    admission?.rolloutState === "ENABLED" &&
    (admission.readinessState === "READY" || admission.readinessState === "STALE") &&
    admission.capabilities.caseRisks === "AVAILABLE"
  )
    await risks.load();
  else risks.reset();
  if (canReadAlerts.value) void alerts.load();
}

function openInvestigation(caseId: string): void {
  void leadControl.selectCase(caseId);
}

function closeInvestigation(): void {
  leadControl.resetSelection();
}

function openFallbackInvestigation(): void {
  const caseId = fallbackCaseId.value.trim();
  if (!caseId) return;
  void leadControl.selectCase(caseId);
}

function riskSearchQuery(type: SupportLeadRiskType): Record<string, string> {
  const base = { mode: "cases", scope: "cases", sort: "ACTIVITY_AT", direction: "DESC" };
  if (type === "UNASSIGNED_AGED") return { ...base, assignment: "UNASSIGNED" };
  if (type === "SLA_AT_RISK") return { ...base, sla: "AT_RISK" };
  if (type === "SLA_BREACHED") return { ...base, sla: "BREACHED" };
  return { ...base, delivery: "PROBLEM" };
}

function toggleRiskSelection(caseId: string, selected: boolean): void {
  selectedRiskCaseIds.value = selected
    ? [...new Set([...selectedRiskCaseIds.value, caseId])].slice(0, 50)
    : selectedRiskCaseIds.value.filter((item) => item !== caseId);
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

function labelExclusion(value: string): string {
  return (
    {
      CAPACITY_EXHAUSTED: "Исчерпана ёмкость",
      AVAILABILITY_NOT_ROUTABLE: "Нет доступных операторов",
      SKILL_REQUIRED: "Не хватает навыка",
      LANGUAGE_REQUIRED: "Не хватает языка",
      TEAM_NOT_ELIGIBLE: "Команда не подходит",
      CASE_COOLDOWN: "Case на паузе",
      RECEIVE_PERMISSION_MISSING: "Нет права принять",
      ASSIGNMENT_CONFLICT: "Конфликт назначения",
    }[value] ?? value
  );
}

function labelFact(value: string): string {
  return (
    {
      CASE_CHANGED: "Case изменён",
      ADMIN_REPLY_ACCEPTED: "Ответ оператора принят",
      SUPPORT_CASE_ASSIGNMENT_CLAIMED: "Case взят в работу",
      SUPPORT_CASE_ASSIGNMENT_ASSIGNED: "Оператор назначен",
      SUPPORT_CASE_ASSIGNMENT_RELEASED: "Назначение снято",
      SUPPORT_CASE_ASSIGNMENT_TRANSFERRED: "Case передан",
      SUPPORT_ASSIGNMENT_RESERVED: "Ёмкость зарезервирована",
      SUPPORT_ASSIGNMENT_OFFERED: "Работа предложена оператору",
      SUPPORT_ASSIGNMENT_OFFER_ACCEPTED: "Предложение принято",
      SUPPORT_ASSIGNMENT_RESERVATION_EXPIRED: "Резерв истёк",
      SUPPORT_ASSIGNMENT_ROUTING_FALLBACK_SCHEDULED: "Запущен резервный маршрут",
      SLA_CLOCK_CHANGED: "SLA обновлён",
      SLA_CLOCK_CORRECTED: "SLA скорректирован",
      CONVERSATION_DELIVERY_CHANGED: "Доставка сообщения обновлена",
    }[value] ?? value.replaceAll("_", " ")
  );
}

function factActor(fact: { actorType: string; actorCmsUserId: string | null; actorSystemCode: string | null }): string {
  if (fact.actorType === "CMS_USER")
    return fact.actorCmsUserId ? `CMS operator · ${fact.actorCmsUserId.slice(0, 8)}` : "CMS operator";
  if (fact.actorType === "SYSTEM") return fact.actorSystemCode ?? "Система";
  return fact.actorType;
}

function factOutcome(fact: { commandOutcome: string | null; deliveryState: string | null }): string {
  if (fact.commandOutcome === "APPLIED") return "Команда применена";
  if (fact.deliveryState) return `Доставка: ${fact.deliveryState.toLowerCase()}`;
  return "";
}

function labelRoutingReason(value: string): string {
  return (
    {
      ROUTING_OFFER_ACTIVE: "Оператору отправлено предложение",
      ROUTING_OFFER_ACCEPTED: "Предложение принято",
      ROUTING_AUTO_ASSIGNED: "Назначено автоматически",
      ROUTING_EVALUATION_PENDING: "Маршрут рассчитывается",
      ROUTING_FALLBACK_PENDING: "Готовится резервный маршрут",
      ROUTING_FALLBACK_EXHAUSTED: "Резервные маршруты исчерпаны",
      ROUTING_WORKER_DEGRADED: "Routing worker ограничен",
      NO_ELIGIBLE_OPERATOR: "Нет подходящего оператора",
      CAPACITY_GAP: "Не хватает свободной ёмкости",
      CONFIGURATION_REQUIRED: "Нужна настройка маршрутизации",
      STALE_INPUT: "Входные данные устарели",
      DEGRADED: "Маршрутизация ограничена",
    }[value] ?? value
  );
}

function incompleteTimelineSources(sources: Record<string, string>): string[] {
  const labels: Record<string, string> = {
    assignmentHistory: "назначения",
    caseHistory: "Case",
    deliveryHistory: "доставка",
    interventionHistory: "вмешательства",
    replyHistory: "ответы",
    slaHistory: "SLA",
  };
  return Object.entries(sources)
    .filter(([, state]) => state !== "AVAILABLE")
    .map(([source]) => labels[source] ?? source);
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
  alertOwnerId.value = alerts.detail.value?.alert.ownerCmsUserId ?? "";
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

function changeAlertOwner(): void {
  if (!canChangeAlertOwner.value) return;
  void alerts.changeOwner(alertOwnerId.value || null, alertOwnerReason.value);
}

watch(alertOwnerId, (ownerId) => {
  if (!ownerId) alertOwnerReason.value = "OWNER_UNAVAILABLE";
  else if (alertOwnerReason.value === "OWNER_UNAVAILABLE")
    alertOwnerReason.value = "LEAD_ASSIGNMENT";
});

onMounted(async () => {
  await reload();
  const routedCaseId = typeof router.currentRoute.value.query.caseId === "string"
    ? router.currentRoute.value.query.caseId.trim()
    : "";
  if (
    routedCaseId &&
    leadControl.admission.value?.capabilities.investigation !== "UNAVAILABLE"
  ) {
    fallbackCaseId.value = routedCaseId;
    await leadControl.selectCase(routedCaseId);
  }
  startAvailabilityHeartbeat();
});

watch(
  () => auth.project?.id,
  () => {
    accessDenied.value = false;
    alertsAccessDenied.value = false;
    availabilityAccessDenied.value = false;
    assignmentAccessDenied.value = false;
    activityAccessDenied.value = false;
    overview.reset();
    risks.reset();
    leadControl.reset();
    alerts.reset();
    availability.reset();
    leadAssignment.reset();
    leadAssignmentBatch.reset();
    selectedRiskCaseIds.value = [];
    reload();
    startAvailabilityHeartbeat();
  },
);

watch(canRead, (allowed) => {
  if (allowed) return;
  overview.reset();
  risks.reset();
  leadControl.reset();
  alerts.reset();
  availability.reset();
  void router.replace({ name: "overview" });
});

watch(canReadActivity, (allowed) => {
  if (allowed) return;
  leadControl.resetActivity();
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

watch(canManageAlerts, (allowed) => {
  if (allowed) return;
  alerts.resetManagement();
  alertOwnerId.value = "";
});

watch(canOverrideAssignments, (allowed) => {
  if (allowed) return;
  leadAssignment.reset();
  leadAssignmentBatch.reset();
  selectedRiskCaseIds.value = [];
});

watch(risks.riskType, () => {
  selectedRiskCaseIds.value = [];
  leadAssignmentBatch.reset();
});

onBeforeUnmount(() => {
  overview.reset();
  risks.reset();
  leadControl.reset();
  alerts.reset();
  availability.reset();
  leadAssignment.reset();
  leadAssignmentBatch.reset();
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
          :loading="leadControl.loadingAdmission.value || overview.loading.value"
          @click="reload"
        />
      </div>
    </header>

    <div class="control-notice" role="note">
      <i class="pi pi-shield" aria-hidden="true" />
      <span>
        Показатели предназначены для распределения работы и устранения рисков, а
        не для оценки сотрудника по online presence.
      </span>
    </div>

    <Message v-if="leadControl.error.value" severity="error" :closable="false">
      {{ leadControl.error.value }}
    </Message>
    <Message
      v-if="admissionState"
      :severity="admissionState.severity"
      :closable="false"
      class="admission-state"
    >
      <strong>{{ admissionState.title }}</strong>
      <span>{{ admissionState.detail }}</span>
    </Message>
    <form
      v-if="leadControl.admission.value?.capabilities.investigation === 'OWNER_FALLBACK'"
      class="fallback-case-form"
      @submit.prevent="openFallbackInvestigation"
    >
      <div>
        <strong>Проверить конкретный Case</strong>
        <span>В ограниченном режиме доступна только точечная owner-fallback проверка.</span>
      </div>
      <label>
        <span class="sr-only">ID Case</span>
        <input v-model="fallbackCaseId" autocomplete="off" placeholder="ID Case" />
      </label>
      <Button type="submit" label="Проверить" icon="pi pi-search" :disabled="!fallbackCaseId.trim()" />
    </form>
    <div
      v-if="leadControl.loadingAdmission.value && !leadControl.admission.value"
      class="admission-skeleton"
      aria-label="Проверяем готовность Lead Control"
    >
      <Skeleton height="72px" border-radius="14px" />
    </div>

    <Message v-if="overview.error.value" severity="error" :closable="false">
      {{ overview.error.value }}
    </Message>
    <div v-if="overview.loading.value && !overview.summary.value" class="metric-grid">
      <Skeleton v-for="index in 5" :key="index" height="164px" border-radius="16px" />
    </div>
    <template v-if="overview.summary.value">
      <p class="computed-at">
        Серверный снимок: {{ relativeTime(overview.summary.value.computedAt) }}
        <template v-if="leadControl.admission.value?.projectionGeneration">
          · поколение {{ leadControl.admission.value.projectionGeneration }}
        </template>
        <template v-if="overview.summary.value.slaRolloutState === 'SHADOW'">
          · SLA в shadow-режиме
        </template>
      </p>
      <details class="metric-definitions">
        <summary><i class="pi pi-info-circle" aria-hidden="true" /> Как считаются показатели</summary>
        <div>
          <p><strong>Без назначения</strong> — открытые Cases без действующего владельца.</p>
          <p><strong>SLA под риском</strong> — server-owned shadow-прогноз, а не договорный срок.</p>
          <p><strong>Ёмкость</strong> — доступная рабочая нагрузка операторов, не оценка эффективности.</p>
          <p><strong>Доставка</strong> — подтверждённые сервером pending/unknown outcomes.</p>
        </div>
      </details>
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

      <section
        v-if="leadControl.admission.value?.capabilities.capacityRisks === 'AVAILABLE'"
        class="control-section capacity-section"
        aria-labelledby="capacity-heading"
      >
        <header class="control-section__header">
          <div>
            <span class="eyebrow">Routing capacity</span>
            <h2 id="capacity-heading">Где не хватает свободной ёмкости</h2>
            <p class="section-description">
              Очереди, где доступных операторов недостаточно для входящей работы.
            </p>
          </div>
        </header>
        <p v-if="leadControl.capacity.value" class="section-freshness">
          Серверный снимок: {{ relativeTime(leadControl.capacity.value.computedAt) }} ·
          {{ labelRiskFreshness(leadControl.capacity.value.freshnessState) }}
        </p>
        <Message
          v-if="
            leadControl.capacity.value?.items.length &&
            leadControl.capacity.value.freshnessState !== 'READY'
          "
          severity="warn"
          :closable="false"
        >
          Риски показаны как ограниченные evidence: перед действием перепроверьте текущую очередь.
        </Message>
        <div v-if="leadControl.loadingCapacity.value" class="capacity-grid">
          <Skeleton v-for="index in 2" :key="index" height="132px" border-radius="14px" />
        </div>
        <Message
          v-else-if="leadControl.capacity.value?.state === 'UNAVAILABLE'"
          severity="warn"
          :closable="false"
        >
          Capacity projection пока недоступна. Дефицит не считается равным нулю.
        </Message>
        <p
          v-else-if="
            leadControl.capacity.value &&
            !leadControl.capacity.value.items.length &&
            leadControl.capacity.value.freshnessState === 'READY'
          "
          class="empty-section"
        >
          На момент снимка дефицита свободной ёмкости нет.
        </p>
        <Message
          v-else-if="leadControl.capacity.value && !leadControl.capacity.value.items.length"
          severity="warn"
          :closable="false"
        >
          Снимок capacity {{ labelRiskFreshness(leadControl.capacity.value.freshnessState) }}:
          отсутствие дефицита не подтверждено.
        </Message>
        <div v-else class="capacity-grid">
          <article
            v-for="item in leadControl.capacity.value?.items ?? []"
            :key="item.riskId"
            class="capacity-row"
          >
            <div class="capacity-row__heading">
              <span class="capacity-row__icon" aria-hidden="true"><i class="pi pi-users" /></span>
              <div>
                <span class="eyebrow">{{ item.queue?.code ?? 'Команда' }}</span>
                <h3>{{ item.queue?.name ?? 'Командная очередь' }}</h3>
              </div>
              <strong>−{{ item.requiredCapacityUnits }}</strong>
            </div>
            <p>Требуется ещё {{ item.requiredCapacityUnits }} ед. ёмкости</p>
            <ul class="capacity-causes" aria-label="Причины исключения операторов">
              <li
                v-for="([reason, count]) in Object.entries(item.exclusionCounts).filter(([, value]) => value > 0)"
                :key="reason"
              >
                {{ labelExclusion(reason) }} · {{ count }}
              </li>
            </ul>
            <RouterLink
              v-if="item.queue"
              class="row-link"
              :to="{
                name: 'support-inbox',
                query: {
                  mode: 'cases',
                  scope: 'cases',
                  queue: item.queue.id,
                  sort: 'ACTIVITY_AT',
                  direction: 'DESC',
                },
              }"
            >
              Открыть очередь <i class="pi pi-arrow-right" aria-hidden="true" />
            </RouterLink>
          </article>
        </div>
        <Button
          v-if="leadControl.capacity.value?.nextCursor"
          label="Показать ещё очереди"
          severity="secondary"
          text
          :loading="leadControl.loadingCapacity.value"
          @click="leadControl.loadMoreCapacity"
        />
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

      <section
        v-if="
          leadControl.admission.value?.rolloutState === 'ENABLED' &&
          ['READY', 'STALE'].includes(leadControl.admission.value.readinessState) &&
          leadControl.admission.value.capabilities.caseRisks === 'AVAILABLE'
        "
        class="control-section risk-section"
        aria-labelledby="risk-heading"
      >
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
        <div
          v-if="canOverrideAssignments && risks.page.value?.items.length"
          class="risk-batch-toolbar"
        >
          <span>
            Выбрано {{ selectedRiskCaseIds.length }} из {{ risks.page.value.items.length }}
          </span>
          <SupportLeadAssignmentBatchDesk
            :controller="leadAssignmentBatch"
            :case-ids="selectedRiskCaseIds"
            :case-labels="selectedRiskCaseLabels"
          />
        </div>
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
            <label v-if="canOverrideAssignments" class="risk-row__select">
              <input
                type="checkbox"
                :checked="selectedRiskCaseIds.includes(risk.caseId)"
                :aria-label="`Выбрать ${labelRiskType(risk.riskType)} для пакетного назначения`"
                @change="toggleRiskSelection(risk.caseId, ($event.target as HTMLInputElement).checked)"
              />
              <span class="sr-only">Выбрать Case</span>
            </label>
            <div>
              <span class="eyebrow">{{ labelRiskType(risk.riskType) }}</span>
              <h3>Case требует внимания</h3>
              <p>
                Выявлено {{ relativeTime(risk.detectedAt) }}
                <template v-if="risk.dueAt"> · срок {{ relativeTime(risk.dueAt) }}</template>
              </p>
            </div>
            <div class="risk-row__actions">
              <SupportLeadAssignmentDesk
                v-if="canOverrideAssignments"
                :controller="leadAssignment"
                :case-id="risk.caseId"
                :case-label="labelRiskType(risk.riskType)"
                compact
              />
              <Button
                label="Почему"
                icon="pi pi-sitemap"
                severity="secondary"
                outlined
                @click="openInvestigation(risk.caseId)"
              />
              <RouterLink
                v-if="canOpenCase"
                class="row-link"
                :to="{
                  name: 'support-inbox-case',
                  params: { caseId: risk.caseId },
                  query: riskSearchQuery(risk.riskType),
                }"
              >
                Открыть Case
              </RouterLink>
              <span v-else class="row-unavailable">Нет доступа к Case</span>
            </div>
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
      :visible="Boolean(leadControl.selectedCaseId.value)"
      modal
      header="Причинная история Case"
      :style="{ width: 'min(720px, calc(100vw - 24px))' }"
      class="lead-investigation-dialog"
      @update:visible="(visible) => !visible && closeInvestigation()"
    >
      <div v-if="leadControl.loadingInvestigation.value" class="investigation-loading">
        <Skeleton height="92px" border-radius="14px" />
        <Skeleton height="220px" border-radius="14px" />
      </div>
      <Message
        v-else-if="leadControl.investigationError.value"
        severity="error"
        :closable="false"
      >
        {{ leadControl.investigationError.value }}
      </Message>
      <template v-else-if="leadControl.investigation.value">
        <div class="investigation-summary">
          <div>
            <span class="eyebrow">Authoritative Case</span>
            <strong>Причины собраны сервером</strong>
            <small>
              {{ relativeTime(leadControl.investigation.value.computedAt) }} ·
              {{ labelRiskFreshness(leadControl.investigation.value.freshnessState) }}
            </small>
          </div>
          <RouterLink
            v-if="canOpenCase"
            class="row-link"
            :to="{
              name: 'support-inbox-case',
              params: { caseId: leadControl.investigation.value.caseId },
              query: { mode: 'cases' },
            }"
          >
            Открыть рабочее место <i class="pi pi-arrow-up-right" aria-hidden="true" />
          </RouterLink>
        </div>
        <Message
          v-if="leadControl.investigation.value.evidenceSource === 'OWNER_FALLBACK'"
          severity="warn"
          :closable="false"
          class="investigation-warning"
        >
          Показан ограниченный owner-fallback: aggregate projection недоступна, факты перепроверены
          непосредственно у владельцев данных.
        </Message>
        <Message
          v-if="incompleteTimelineSources(leadControl.investigation.value.timelineSources).length"
          severity="secondary"
          :closable="false"
          class="investigation-warning"
        >
          История частичная. Ограничены источники:
          {{ incompleteTimelineSources(leadControl.investigation.value.timelineSources).join(', ') }}.
        </Message>
        <section class="routing-card" aria-labelledby="routing-heading">
          <span class="eyebrow">Маршрутизация</span>
          <h3 id="routing-heading">
            {{
              leadControl.investigation.value.routing
                ? labelRoutingReason(leadControl.investigation.value.routing.reasonCode)
                : 'Маршрут ещё не рассчитывался'
            }}
          </h3>
          <p v-if="leadControl.investigation.value.routing?.reservation">
            Зарезервировано
            {{ leadControl.investigation.value.routing.reservation.capacityWeightUnits }} ед. до
            {{ relativeTime(leadControl.investigation.value.routing.reservation.expiresAt) }}.
          </p>
          <p v-else>
            {{
              leadControl.investigation.value.routingFactsState === 'AVAILABLE'
                ? 'Активного резерва сейчас нет.'
                : 'Routing facts пока не вычислены; это не означает отсутствие проблемы.'
            }}
          </p>
        </section>
        <section class="causal-section" aria-labelledby="causal-heading">
          <div class="causal-section__heading">
            <div>
              <span class="eyebrow">Causal timeline</span>
              <h3 id="causal-heading">Что привело к текущему состоянию</h3>
            </div>
            <span>{{ leadControl.investigation.value.facts.length }} событий</span>
          </div>
          <ol v-if="leadControl.investigation.value.facts.length" class="causal-timeline">
            <li v-for="fact in leadControl.investigation.value.facts" :key="fact.id">
              <span class="causal-dot" aria-hidden="true" />
              <div>
                <strong>{{ labelFact(fact.eventCode) }}</strong>
                <p>
                  {{ fact.kind }} · {{ factActor(fact) }}
                  <template v-if="factOutcome(fact)"> · {{ factOutcome(fact) }}</template>
                </p>
                <small>
                  {{ relativeTime(fact.occurredAt) }}
                  <template v-if="fact.reasonCode"> · {{ labelReasonCode(fact.reasonCode) }}</template>
                </small>
              </div>
            </li>
          </ol>
          <p v-else class="empty-section">
            {{
              leadControl.investigation.value.evidenceSource === 'OWNER_FALLBACK' ||
              incompleteTimelineSources(leadControl.investigation.value.timelineSources).length
                ? 'В доступной части истории причинных событий нет; полнота не подтверждена.'
                : 'В разрешённом окне нет причинных событий.'
            }}
          </p>
          <Button
            v-if="leadControl.investigation.value.nextCursor"
            label="Показать более ранние события"
            severity="secondary"
            text
            :loading="leadControl.loadingInvestigation.value"
            @click="leadControl.loadMoreInvestigation"
          />
        </section>
        <section
          v-if="canReadActivity && leadControl.admission.value?.capabilities.activity === 'AVAILABLE'"
          class="activity-section"
          aria-labelledby="activity-heading"
        >
          <span class="eyebrow">Protected activity</span>
          <h3 id="activity-heading">Технические действия</h3>
          <p class="section-description">
            Без текста сообщений и персональных данных; доступ требует отдельного permission.
          </p>
          <Message
            v-if="leadControl.activityError.value"
            severity="warn"
            :closable="false"
          >
            {{ leadControl.activityError.value }}
          </Message>
          <ul v-if="leadControl.activity.value?.facts.length" class="activity-facts">
            <li v-for="fact in leadControl.activity.value.facts" :key="fact.id">
              <div>
                <strong>{{ labelFact(fact.eventCode) }}</strong>
                <small>
                  {{ factActor(fact) }}
                  <template v-if="fact.reasonCode"> · {{ labelReasonCode(fact.reasonCode) }}</template>
                  <template v-if="factOutcome(fact)"> · {{ factOutcome(fact) }}</template>
                </small>
              </div>
              <span>#{{ fact.sequence }} · rev {{ fact.schemaVersion }} · {{ relativeTime(fact.occurredAt) }}</span>
            </li>
          </ul>
          <p
            v-else-if="!leadControl.activityError.value && !leadControl.loadingActivity.value"
            class="empty-section"
          >
            В разрешённом семидневном окне технических действий нет.
          </p>
          <Button
            v-if="leadControl.activity.value?.nextCursor"
            label="Показать ещё технические действия"
            severity="secondary"
            text
            :loading="leadControl.loadingActivity.value"
            @click="leadControl.loadMoreActivity"
          />
        </section>
        <Message
          v-else-if="canReadActivity"
          severity="secondary"
          :closable="false"
          class="investigation-warning"
        >
          Protected Activity недоступна в текущем режиме Lead Control.
        </Message>
      </template>
    </Dialog>

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
        <Message
          v-if="alerts.mutationNotice.value"
          severity="info"
          :closable="false"
          class="detail-warning"
        >
          {{ alerts.mutationNotice.value }}
        </Message>
        <section
          v-if="canManageAlerts && alerts.detail.value.alert.state !== 'RESOLVED'"
          class="alert-commands"
          aria-label="Команды alert"
        >
          <p>Команды применяются к версии {{ alerts.detail.value.alert.version }}.</p>
          <div class="alert-owner-command">
            <label>
              <span>Ответственный</span>
              <select
                v-model="alertOwnerId"
                :disabled="Boolean(alerts.mutating.value) || alerts.ownerTargetsLoading.value || alerts.appliedReceiptVersion.value !== null"
              >
                <option value="">Без владельца</option>
                <option
                  v-if="currentAlertOwnerMissing && alerts.detail.value?.alert.ownerCmsUserId"
                  :value="alerts.detail.value.alert.ownerCmsUserId"
                >
                  Текущий владелец недоступен в каталоге
                </option>
                <option
                  v-for="target in alerts.ownerTargets.value"
                  :key="target.id"
                  :value="target.id"
                >
                  {{ target.displayName }}
                </option>
              </select>
            </label>
            <label>
              <span>Причина</span>
              <select v-model="alertOwnerReason" :disabled="Boolean(alerts.mutating.value) || alerts.appliedReceiptVersion.value !== null">
                <template v-if="alertOwnerId">
                  <option value="LEAD_ASSIGNMENT">Назначение лидом</option>
                  <option value="LOAD_BALANCE">Балансировка нагрузки</option>
                  <option value="SHIFT_HANDOFF">Передача смены</option>
                  <option value="SKILL_MATCH">Подбор по навыку</option>
                </template>
                <option v-else value="OWNER_UNAVAILABLE">Владелец недоступен</option>
              </select>
            </label>
            <Button
              type="button"
              label="Сменить владельца"
              severity="secondary"
              :loading="alerts.mutating.value === 'OWNER'"
              :disabled="Boolean(alerts.mutating.value) || alerts.appliedReceiptVersion.value !== null || !canChangeAlertOwner"
              @click="changeAlertOwner"
            />
          </div>
          <label v-if="alerts.detail.value.alert.state === 'NEW'">
            <span>Подтвердить alert как</span>
            <select
              v-model="alertAcknowledgeReason"
              :disabled="Boolean(alerts.mutating.value) || alerts.appliedReceiptVersion.value !== null"
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
              :disabled="Boolean(alerts.mutating.value) || alerts.appliedReceiptVersion.value !== null"
              @click="acknowledgeAlert"
            />
          </label>
          <label>
            <span>Закрыть alert как</span>
            <select
              v-model="alertResolveReason"
              :disabled="Boolean(alerts.mutating.value) || alerts.appliedReceiptVersion.value !== null"
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
              :disabled="Boolean(alerts.mutating.value) || alerts.appliedReceiptVersion.value !== null"
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
  display: flex;
  align-items: flex-start;
  gap: 10px;
  height: auto;
  overflow: visible;
  margin-bottom: 16px;
  padding: 11px 13px;
  border: 1px solid color-mix(in srgb, var(--status-info) 24%, var(--line));
  border-radius: 12px;
  background: color-mix(in srgb, var(--status-info-soft) 58%, var(--surface-card));
  color: var(--status-info-text);
  font-size: 0.76rem;
  line-height: 1.45;
}
.control-notice i {
  flex: 0 0 auto;
  margin-top: 2px;
  font-size: 0.78rem;
}
.admission-state :deep(.p-message-text) {
  display: grid;
  gap: 3px;
}
.admission-state span,
.section-description {
  color: var(--text-muted);
  font-size: 0.8rem;
  line-height: 1.45;
}
.admission-skeleton {
  margin-bottom: 16px;
}
.fallback-case-form {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(180px, 320px) auto;
  align-items: center;
  gap: 12px;
  margin: 0 0 16px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-card);
}
.fallback-case-form > div {
  display: grid;
  gap: 3px;
}
.fallback-case-form > div span {
  color: var(--text-muted);
  font-size: 0.75rem;
}
.fallback-case-form input {
  width: 100%;
  min-height: 40px;
  padding: 8px 11px;
  border: 1px solid var(--line-strong, var(--line));
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: inherit;
}
.fallback-case-form input:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
.computed-at {
  margin-bottom: 16px;
}
.computed-at {
  color: var(--text-muted);
  font-size: 0.82rem;
}
.metric-definitions {
  margin: -6px 0 14px;
  color: var(--text-muted);
  font-size: 0.78rem;
}
.metric-definitions summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  cursor: pointer;
  color: var(--text-link);
  font-weight: 700;
}
.metric-definitions summary::-webkit-details-marker {
  display: none;
}
.metric-definitions > div {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 18px;
  max-width: 920px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-soft);
}
.metric-definitions p {
  margin: 0;
  line-height: 1.45;
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
.alert-list,
.capacity-grid {
  display: grid;
  gap: 10px;
}
.capacity-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.capacity-row {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-card);
}
.capacity-row__heading {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}
.capacity-row__icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 11px;
  background: var(--surface-soft);
  color: var(--text-muted);
}
.capacity-row h3,
.routing-card h3,
.causal-section h3,
.activity-section h3 {
  margin: 3px 0 0;
  font-size: 0.94rem;
}
.capacity-row__heading > strong {
  color: var(--danger-text, var(--red-600));
  font-size: 1.25rem;
}
.capacity-row > p {
  margin: 12px 0 8px;
  color: var(--text-muted);
  font-size: 0.8rem;
}
.capacity-causes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 12px;
  padding: 0;
  list-style: none;
}
.capacity-causes li {
  padding: 4px 7px;
  border-radius: 999px;
  background: var(--surface-soft);
  color: var(--text-muted);
  font-size: 0.7rem;
  font-weight: 650;
}
.investigation-loading {
  display: grid;
  gap: 12px;
}
.investigation-summary,
.causal-section__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.investigation-summary > div {
  display: grid;
  gap: 3px;
}
.investigation-summary small,
.causal-section__heading > span {
  color: var(--text-muted);
  font-size: 0.75rem;
}
.routing-card,
.causal-section,
.activity-section {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-card);
}
.routing-card {
  background: color-mix(in srgb, var(--brand-soft) 48%, var(--surface-card));
}
.routing-card p {
  margin: 8px 0 0;
  color: var(--text-muted);
  font-size: 0.8rem;
}
.causal-timeline,
.activity-facts {
  display: grid;
  gap: 0;
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
}
.causal-timeline li {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr);
  gap: 10px;
  padding: 0 0 16px;
}
.causal-dot {
  width: 9px;
  height: 9px;
  margin-top: 5px;
  border: 2px solid var(--surface-card);
  border-radius: 50%;
  background: var(--brand-primary);
  box-shadow: 0 0 0 1px var(--brand-primary);
}
.causal-timeline p,
.causal-timeline small {
  margin: 3px 0 0;
  color: var(--text-muted);
  font-size: 0.75rem;
}
.activity-facts li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 0;
  border-top: 1px solid var(--line);
  font-size: 0.76rem;
}
.activity-facts span {
  color: var(--text-muted);
}
.activity-facts div {
  display: grid;
  gap: 3px;
}
.activity-facts small {
  color: var(--text-muted);
  font-size: 0.7rem;
}
.investigation-warning {
  margin-top: 12px;
}
.risk-batch-toolbar {
  display: flex;
  min-height: 56px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  padding: 8px 10px 8px 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-soft);
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 700;
}
.risk-row,
.alert-row {
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-card);
}
.risk-row > div:not(.risk-row__actions) {
  flex: 1 1 auto;
  min-width: 0;
}
.risk-row__select {
  display: grid;
  flex: 0 0 28px;
  place-items: center;
  align-self: stretch;
}
.risk-row__select input {
  width: 18px;
  height: 18px;
  accent-color: var(--brand-primary);
  cursor: pointer;
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
.risk-row__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
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
.alert-owner-command {
  display: grid;
  grid-template-columns: minmax(180px, 1.4fr) minmax(160px, 1fr) auto;
  align-items: end;
  gap: 10px;
}
.alert-owner-command label {
  display: grid;
  grid-template-columns: 1fr;
  align-items: stretch;
  gap: 5px;
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
  .capacity-grid {
    grid-template-columns: 1fr;
  }
  .fallback-case-form {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
  .metric-definitions > div {
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
  .risk-row__actions,
  .risk-row__actions :deep(.p-button) {
    width: 100%;
  }
  .risk-row__actions {
    align-items: stretch;
    flex-direction: column;
  }
  .risk-row__select {
    align-self: flex-start;
  }
  .risk-batch-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .risk-batch-toolbar :deep(.p-button) {
    width: 100%;
  }
  .alert-detail-metadata {
    grid-template-columns: 1fr;
  }
  .alert-commands label {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
  .alert-owner-command {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
  .investigation-summary,
  .causal-section__heading,
  .activity-facts li {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
