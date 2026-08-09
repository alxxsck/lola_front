<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Select from "primevue/select";
import Tag from "primevue/tag";
import Textarea from "primevue/textarea";
import type { createSupportLeadAssignmentController } from "@/features/support-lead-assignment/model/use-support-lead-assignment";
import type { SupportLeadSafeFactDtoReasonCode } from "@/shared/api/generated/models";
import { relativeTime } from "@/shared/lib/format";

const props = withDefaults(
  defineProps<{
    controller: ReturnType<typeof createSupportLeadAssignmentController>;
    caseId: string;
    caseLabel: string;
    compact?: boolean;
  }>(),
  { compact: false },
);

const visible = ref(false);
const mode = ref<"TARGET" | "RELEASE">("TARGET");
const teamId = ref("");
const operatorId = ref("");
const reasonCode = ref("LEAD_INTERVENTION");
const reasonNote = ref("");

const snapshot = computed(() => props.controller.snapshot.value);
const isTransfer = computed(
  () =>
    snapshot.value?.assignmentState === "ASSIGNED" ||
    snapshot.value?.assignmentState === "RESERVED",
);

function targetCanBeUsed(
  operator: NonNullable<
    typeof snapshot.value
  >["teams"][number]["operators"][number],
): boolean {
  const ordinary = isTransfer.value
    ? operator.actions.transfer
    : operator.actions.assign;
  const forced = isTransfer.value
    ? operator.actions.transferWithOverride
    : operator.actions.assignWithOverride;
  return ordinary || (forced && props.controller.hasForceAuthority.value);
}

const teams = computed(
  () =>
    snapshot.value?.teams.filter((team) =>
      team.operators.some(targetCanBeUsed),
    ) ?? [],
);
const operators = computed(() => {
  const team = teams.value.find((item) => item.id === teamId.value);
  return (
    team?.operators.filter(targetCanBeUsed).map((operator) => ({
      ...operator,
      optionLabel: `${operator.displayName} · ${availabilityLabel(operator.effectiveAvailability)} · ${operator.availableCapacityUnits} ед.`,
    })) ?? []
  );
});
const selectedOperator = computed(() =>
  operators.value.find((item) => item.id === operatorId.value),
);
const selectedCatalogOperator = computed(() =>
  snapshot.value?.teams
    .find((team) => team.id === teamId.value)
    ?.operators.find((operator) => operator.id === operatorId.value),
);
const selectedIntentRequiresForce = computed(() => {
  const operator = selectedCatalogOperator.value;
  if (!operator) return false;
  const ordinary = isTransfer.value
    ? operator.actions.transfer
    : operator.actions.assign;
  const forced = isTransfer.value
    ? operator.actions.transferWithOverride
    : operator.actions.assignWithOverride;
  return !ordinary && forced;
});
const requiredOverrides = computed(
  () => selectedOperator.value?.requiredOverrides ?? [],
);
const isForce = computed(() => requiredOverrides.value.length > 0);
const canSubmitTarget = computed(
  () =>
    Boolean(teamId.value && operatorId.value) &&
    (!isForce.value || reasonNote.value.trim().length > 0) &&
    !props.controller.mutating.value &&
    !props.controller.unknownOutcome.value,
);
const canRelease = computed(
  () =>
    snapshot.value?.assignmentState === "ASSIGNED" &&
    snapshot.value.actions.release &&
    Boolean(snapshot.value.currentAssignment),
);

const ordinaryReasons = computed(() =>
  isTransfer.value
    ? [
        { label: "Передача по навыку", value: "SKILL_HANDOFF" },
        { label: "Балансировка нагрузки", value: "LOAD_BALANCE" },
        { label: "Решение лида", value: "LEAD_INTERVENTION" },
        { label: "Другая причина", value: "OTHER" },
      ]
    : [
        { label: "Подбор по навыку", value: "SKILL_MATCH" },
        { label: "Балансировка нагрузки", value: "LOAD_BALANCE" },
        { label: "Решение лида", value: "LEAD_INTERVENTION" },
        { label: "Другая причина", value: "OTHER" },
      ],
);
const forceReasons = [
  { label: "Реакция на инцидент", value: "INCIDENT_RESPONSE" },
  { label: "Экстренное покрытие", value: "EMERGENCY_COVERAGE" },
  {
    label: "Предотвращение вреда пользователю",
    value: "CUSTOMER_HARM_PREVENTION",
  },
  { label: "Другая причина", value: "OTHER" },
];
const releaseReasons = [
  { label: "Балансировка лидом", value: "LEAD_REBALANCE" },
  { label: "Работа возвращена в очередь", value: "WORK_RETURNED" },
  { label: "Завершение смены", value: "SHIFT_END" },
  { label: "Другая причина", value: "OTHER" },
];
const auditReasonLabels = {
  SELF_CLAIM: "Оператор взял обращение сам",
  SKILL_MATCH: "Подбор по навыкам",
  LOAD_BALANCE: "Балансировка нагрузки",
  LEAD_INTERVENTION: "Вмешательство руководителя",
  OTHER: "Другая причина",
  WORK_RETURNED: "Работа возвращена",
  SHIFT_END: "Окончание смены",
  LEAD_REBALANCE: "Перераспределение руководителем",
  SKILL_HANDOFF: "Передача по навыкам",
  CASE_RESOLVED: "Обращение решено",
  CASE_UNRESOLVED: "Обращение возвращено в работу",
  CASE_CANCELLED: "Обращение отменено",
  ROUTING_AUTO_ASSIGN: "Автоматическое назначение",
  ROUTING_OFFER_ACCEPTED: "Предложение работы принято",
  OPERATOR_DECLINED: "Оператор отказался",
  RESERVATION_EXPIRED: "Резерв истёк",
  CASE_WORKFLOW_CANCELLED: "Работа по обращению отменена",
  ROUTING_FALLBACK: "Использован резервный маршрут",
  INCIDENT_RESPONSE: "Работа с инцидентом",
  EMERGENCY_COVERAGE: "Экстренное замещение",
  CUSTOMER_HARM_PREVENTION: "Предотвращение вреда пользователю",
  SHIFT_START: "Начало смены",
  RETURNED: "Оператор вернулся",
  FOCUS: "Сосредоточенная работа",
  BREAK: "Перерыв",
  MEETING: "Встреча",
  TRAINING: "Обучение",
  WRAP_UP: "Завершение текущей работы",
  LEASE_EXPIRED: "Срок резерва истёк",
  END_USER_CASE_CREATED: "Обращение создано",
  END_USER_CASE_MESSAGE_LINKED: "Сообщение связано с обращением",
  END_USER_CASE_REOPENED: "Обращение открыто повторно",
  END_USER_CASE_UPDATED: "Обращение обновлено",
  END_USER_CASE_STATUS_CHANGED: "Статус обращения изменён",
  END_USER_CASE_ASSIGNED: "Обращение назначено",
  END_USER_CASE_CORRECTED: "Обращение исправлено",
  END_USER_CASE_MERGED: "Обращения объединены",
  END_USER_CASE_SPLIT: "Обращение разделено",
  END_USER_CASE_ADMIN_ATTENTION_REQUESTED: "Запрошено внимание оператора",
  END_USER_CASE_ADMIN_ATTENTION_CLAIMED: "Оператор принял запрос внимания",
  END_USER_CASE_ADMIN_ATTENTION_RELEASED: "Запрос внимания освобождён",
  END_USER_CASE_ADMIN_ATTENTION_TRANSFERRED: "Запрос внимания передан",
  END_USER_CASE_ADMIN_ATTENTION_CLOSED: "Запрос внимания закрыт",
  END_USER_CASE_ADMIN_ATTENTION_CANCELLED: "Запрос внимания отменён",
} satisfies Record<NonNullable<SupportLeadSafeFactDtoReasonCode>, string>;

function auditReasonLabel(value: string): string {
  return (
    auditReasonLabels[value as keyof typeof auditReasonLabels] ??
    "Системная причина"
  );
}

function commandOutcomeLabel(value: string): string {
  return (
    {
      APPLIED: "применено",
      PENDING: "обрабатывается",
      REJECTED: "отклонено",
      UNKNOWN: "результат неизвестен",
    }[value] ?? "результат не указан"
  );
}

function availabilityLabel(value: string): string {
  return (
    {
      AVAILABLE: "доступен",
      BUSY: "занят",
      AWAY: "отошёл",
      DRAINING: "завершает работу",
      OFFLINE: "офлайн",
    }[value] ?? "состояние не распознано"
  );
}

function overrideLabel(value: string): string {
  return (
    {
      AVAILABILITY: "недоступность оператора",
      CAPACITY: "лимит нагрузки",
      RESERVATION: "активный резерв маршрутизации",
    }[value] ?? "причина не распознана"
  );
}

function auditEventLabel(value: string): string {
  return (
    {
      SUPPORT_CASE_ASSIGNMENT_ASSIGNED: "Назначение создано",
      SUPPORT_CASE_ASSIGNMENT_TRANSFERRED: "Назначение передано",
      SUPPORT_CASE_ASSIGNMENT_RELEASED: "Назначение снято",
      SUPPORT_CASE_ASSIGNMENT_CLAIMED: "Оператор взял обращение",
      SUPPORT_CASE_ASSIGNMENT_COMPLETED: "Назначение завершено",
    }[value] ?? "Назначение изменено"
  );
}

function auditActorLabel(
  fact: (typeof props.controller.auditFacts.value)[number],
): string {
  if (fact.actor.type === "CMS_USER") return "Сотрудник CMS";
  return fact.actor.systemCode ?? "Система";
}

function auditTeamLabel(teamId: string | null): string {
  if (!teamId) return "Команда не указана";
  return (
    snapshot.value?.teams.find((team) => team.id === teamId)?.name ??
    "Команда недоступна"
  );
}

function auditOperatorLabel(operatorId: string | null): string {
  if (!operatorId) return "Оператор не указан";
  return (
    snapshot.value?.teams
      .flatMap((team) => team.operators)
      .find((operator) => operator.id === operatorId)?.displayName ??
    "Оператор недоступен"
  );
}

function initializeTarget(): void {
  teamId.value = teams.value[0]?.id ?? "";
  operatorId.value = operators.value[0]?.id ?? "";
  reasonCode.value = isForce.value
    ? "INCIDENT_RESPONSE"
    : isTransfer.value
      ? "SKILL_HANDOFF"
      : "SKILL_MATCH";
  reasonNote.value = "";
  mode.value = "TARGET";
}

watch(teamId, () => {
  if (!operators.value.some((item) => item.id === operatorId.value))
    operatorId.value = operators.value[0]?.id ?? "";
});

watch(isForce, (forced) => {
  reasonCode.value = forced
    ? "INCIDENT_RESPONSE"
    : isTransfer.value
      ? "SKILL_HANDOFF"
      : "SKILL_MATCH";
});

watch(
  () => props.caseId,
  (value, previous) => {
    if (value === previous || !visible.value) return;
    visible.value = false;
    props.controller.reset();
  },
);

watch(
  () => props.controller.hasAuthority.value,
  (allowed) => {
    if (allowed || !visible.value) return;
    visible.value = false;
    props.controller.reset();
  },
);

watch(
  () => props.controller.hasForceAuthority.value,
  (allowed) => {
    if (allowed || !visible.value || !selectedIntentRequiresForce.value) return;
    visible.value = false;
    props.controller.reset();
  },
  { flush: "sync" },
);

async function openDesk(): Promise<void> {
  visible.value = true;
  await props.controller.open(props.caseId);
  initializeTarget();
}

function closeDesk(): void {
  if (props.controller.unknownOutcome.value) return;
  visible.value = false;
  props.controller.reset();
}

async function submitTarget(): Promise<void> {
  if (!canSubmitTarget.value) return;
  const kind = isForce.value
    ? isTransfer.value
      ? "FORCE_TRANSFER"
      : "FORCE_ASSIGN"
    : isTransfer.value
      ? "TRANSFER"
      : "ASSIGN";
  props.controller.setDraft({
    kind,
    teamId: teamId.value,
    operatorId: operatorId.value,
    reasonCode: reasonCode.value,
    ...(reasonNote.value.trim() ? { reasonNote: reasonNote.value.trim() } : {}),
  } as never);
  await props.controller.submit();
  if (!props.controller.draft.value && !props.controller.unknownOutcome.value)
    closeDesk();
}

function requestRelease(): void {
  mode.value = "RELEASE";
  reasonCode.value = "LEAD_REBALANCE";
  reasonNote.value = "";
}

async function submitRelease(): Promise<void> {
  props.controller.setDraft({
    kind: "RELEASE",
    reasonCode: reasonCode.value,
    ...(reasonNote.value.trim() ? { reasonNote: reasonNote.value.trim() } : {}),
  } as never);
  await props.controller.submit();
  if (!props.controller.draft.value && !props.controller.unknownOutcome.value)
    closeDesk();
}
</script>

<template>
  <Button
    v-if="controller.hasAuthority.value"
    :class="[
      'lead-assignment-trigger',
      { 'lead-assignment-trigger--compact': compact },
    ]"
    :label="compact ? 'Назначить' : 'Управлять назначением'"
    icon="pi pi-users"
    severity="secondary"
    outlined
    aria-label="Управлять назначением лида"
    @click="openDesk"
  />

  <Dialog
    :visible="visible"
    modal
    :closable="!controller.unknownOutcome.value"
    :dismissable-mask="!controller.unknownOutcome.value"
    class="lead-assignment-dialog"
    header="Управление назначением"
    :style="{ width: 'min(680px, calc(100vw - 24px))' }"
    @update:visible="(value) => !value && closeDesk()"
  >
    <header class="lead-assignment-dialog__case">
      <div>
        <span class="section-kicker">Обращение</span>
        <strong>{{ caseLabel }}</strong>
      </div>
      <Tag
        v-if="snapshot"
        :value="isTransfer ? 'Есть владелец' : 'Без назначения'"
        :severity="isTransfer ? 'info' : 'warn'"
      />
    </header>

    <div v-if="controller.loading.value" class="lead-assignment-loading">
      <i class="pi pi-spin pi-spinner" aria-hidden="true" />
      <span>Проверяем доступных операторов…</span>
    </div>

    <Message v-if="controller.error.value" severity="error" :closable="false">
      {{ controller.error.value }}
    </Message>
    <Message
      v-if="controller.success.value"
      severity="success"
      :closable="false"
    >
      {{ controller.success.value }}
    </Message>

    <template v-if="snapshot && !controller.loading.value">
      <div
        class="lead-assignment-mode"
        role="group"
        aria-label="Действие с назначением"
      >
        <Button
          :label="isTransfer ? 'Переназначить' : 'Назначить'"
          :severity="mode === 'TARGET' ? 'primary' : 'secondary'"
          :outlined="mode !== 'TARGET'"
          size="small"
          @click="mode = 'TARGET'"
        />
        <Button
          v-if="canRelease"
          label="Снять назначение"
          :severity="mode === 'RELEASE' ? 'danger' : 'secondary'"
          :outlined="mode !== 'RELEASE'"
          size="small"
          @click="requestRelease"
        />
      </div>

      <form
        v-if="mode === 'TARGET'"
        class="lead-assignment-form"
        @submit.prevent="submitTarget"
      >
        <label>
          <span>Команда</span>
          <Select
            v-model="teamId"
            :options="teams"
            option-label="name"
            option-value="id"
            aria-label="Команда назначения"
            fluid
          />
        </label>
        <label>
          <span>Оператор в команде</span>
          <Select
            v-model="operatorId"
            :options="operators"
            option-label="optionLabel"
            option-value="id"
            aria-label="Оператор назначения"
            fluid
          />
        </label>

        <Message
          v-if="isForce"
          data-force-warning
          severity="warn"
          :closable="false"
          class="force-warning"
        >
          Обычное назначение недоступно. Назначение с исключением обойдёт
          {{ requiredOverrides.map(overrideLabel).join(" и ") }}. Действие
          попадёт в журнал.
        </Message>

        <label>
          <span>{{
            isForce ? "Причина исключения" : "Причина назначения"
          }}</span>
          <Select
            v-model="reasonCode"
            :options="isForce ? forceReasons : ordinaryReasons"
            option-label="label"
            option-value="value"
            aria-label="Причина назначения"
            fluid
          />
        </label>
        <label>
          <span>
            {{
              isForce
                ? "Обоснование исключения · обязательно"
                : "Комментарий · необязательно"
            }}
          </span>
          <Textarea
            v-model="reasonNote"
            :aria-label="
              isForce ? 'Обоснование исключения' : 'Комментарий к назначению'
            "
            rows="3"
            maxlength="500"
            auto-resize
            fluid
          />
          <small>{{ reasonNote.length }} / 500</small>
        </label>
      </form>

      <form v-else class="lead-assignment-form" @submit.prevent="submitRelease">
        <Message severity="warn" :closable="false">
          Обращение вернётся в очередь без владельца. Текущий контекст разговора
          сохранится.
        </Message>
        <label>
          <span>Причина снятия</span>
          <Select
            v-model="reasonCode"
            :options="releaseReasons"
            option-label="label"
            option-value="value"
            aria-label="Причина снятия назначения"
            fluid
          />
        </label>
        <label>
          <span>Комментарий · необязательно</span>
          <Textarea
            v-model="reasonNote"
            aria-label="Комментарий к снятию лидом"
            rows="3"
            maxlength="500"
            auto-resize
            fluid
          />
        </label>
      </form>

      <section
        v-if="
          controller.auditLoading.value ||
          controller.auditFacts.value.length ||
          controller.auditError.value
        "
        class="assignment-audit"
        aria-labelledby="assignment-audit-heading"
      >
        <header>
          <div>
            <span class="section-kicker">Журнал</span>
            <h3 id="assignment-audit-heading">История ответственности</h3>
          </div>
          <Button
            icon="pi pi-refresh"
            label="Обновить"
            severity="secondary"
            text
            size="small"
            :loading="controller.auditLoading.value"
            @click="controller.loadAudit()"
          />
        </header>
        <Message
          v-if="controller.auditError.value"
          severity="warn"
          :closable="false"
        >
          {{ controller.auditError.value }}
        </Message>
        <ol v-else>
          <li
            v-for="fact in controller.auditFacts.value.slice(0, 6)"
            :key="fact.activityId"
          >
            <span class="audit-marker" aria-hidden="true" />
            <div>
              <strong>{{ auditEventLabel(fact.eventCode) }}</strong>
              <small
                >{{ auditActorLabel(fact) }} ·
                {{ relativeTime(fact.occurredAt) }}</small
              >
              <small v-if="fact.targetTeamId || fact.operatorCmsUserId">
                {{ auditTeamLabel(fact.targetTeamId) }} ·
                {{ auditOperatorLabel(fact.operatorCmsUserId) }}
              </small>
              <small v-if="fact.eligibilityOverride">
                Исключение: доступность
                {{
                  fact.eligibilityOverride.bypassAvailability ? "да" : "нет"
                }}, лимит нагрузки
                {{ fact.eligibilityOverride.bypassCapacity ? "да" : "нет" }}
              </small>
              <small v-if="fact.reasonCode || fact.commandOutcome">
                Причина:
                {{
                  fact.reasonCode
                    ? auditReasonLabel(fact.reasonCode)
                    : "не указана"
                }}
                ·
                {{
                  fact.commandOutcome
                    ? commandOutcomeLabel(fact.commandOutcome)
                    : "результат не указан"
                }}
              </small>
            </div>
          </li>
        </ol>
      </section>
    </template>

    <template #footer>
      <div class="lead-assignment-footer">
        <span v-if="snapshot" class="authority-caption">
          Данные назначения сверены с сервером
        </span>
        <div>
          <Button
            v-if="controller.unknownOutcome.value"
            label="Проверить результат"
            icon="pi pi-refresh"
            severity="secondary"
            :loading="controller.reconciling.value"
            @click="controller.reconcileUnknownOutcome()"
          />
          <Button
            v-else-if="mode === 'TARGET'"
            :label="
              isForce
                ? 'Назначить с исключением'
                : isTransfer
                  ? 'Переназначить'
                  : 'Назначить'
            "
            :severity="isForce ? 'warn' : 'primary'"
            icon="pi pi-check"
            aria-label="Подтвердить назначение лидом"
            :loading="controller.mutating.value"
            :disabled="!canSubmitTarget"
            @click="submitTarget"
          />
          <Button
            v-else
            label="Снять назначение"
            severity="danger"
            icon="pi pi-user-minus"
            :loading="controller.mutating.value"
            :disabled="controller.mutating.value"
            @click="submitRelease"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.lead-assignment-trigger:not(.lead-assignment-trigger--compact) {
  width: 100%;
  min-height: 44px;
}

.lead-assignment-dialog__case {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: -4px 0 16px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-soft);
}

.lead-assignment-dialog__case > div {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.lead-assignment-dialog__case strong {
  overflow: hidden;
  color: var(--text-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-kicker {
  color: var(--text-muted);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lead-assignment-loading {
  display: flex;
  min-height: 180px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-muted);
}

.lead-assignment-mode {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
}

.lead-assignment-form {
  display: grid;
  min-width: 0;
  gap: 14px;
}

.lead-assignment-form label {
  display: grid;
  min-width: 0;
  gap: 7px;
  color: var(--text-strong);
  font-size: 0.78rem;
  font-weight: 700;
}

.lead-assignment-form label small {
  justify-self: end;
  color: var(--text-muted);
  font-size: 0.7rem;
  font-weight: 500;
}

.force-warning {
  margin: 0;
}

.lead-assignment-form :deep(.p-select),
.lead-assignment-form :deep(.p-inputtextarea) {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

.lead-assignment-form :deep(.p-select-label) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.assignment-audit {
  display: grid;
  gap: 10px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}

.assignment-audit > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.assignment-audit h3 {
  margin: 3px 0 0;
  font-size: 0.9rem;
}

.assignment-audit ol {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.assignment-audit li {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr);
  gap: 8px;
}

.assignment-audit li > div {
  display: grid;
  gap: 3px;
}

.assignment-audit small {
  color: var(--text-muted);
  font-size: 0.7rem;
}

.audit-marker {
  width: 8px;
  height: 8px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--brand-primary);
}

.lead-assignment-footer {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 4px;
  border-top: 1px solid var(--line);
}

.authority-caption {
  color: var(--text-muted);
  font-size: 0.7rem;
}

@media (max-width: 640px) {
  .lead-assignment-dialog__case,
  .lead-assignment-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .lead-assignment-mode {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .lead-assignment-footer > div,
  .lead-assignment-footer :deep(.p-button) {
    width: 100%;
  }
}
</style>
