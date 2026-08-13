<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import type {
  ClassifyEndUserCaseDto,
  EndUserCaseDetailResponseDto,
  EndUserCaseClassificationEvidenceResponseDtoKind,
} from '@/shared/api/generated/models';
import {
  createSupportCaseDeskController,
  type SupportCaseClassificationInput,
  type SupportCasePriority,
  type SupportCaseStatus,
} from '../model/use-support-case-desk';
import SupportCaseBrief from './SupportCaseBrief.vue';

type Controller = ReturnType<typeof createSupportCaseDeskController>;
type CaseDetail = EndUserCaseDetailResponseDto;

const props = defineProps<{
  controller: Controller;
  classificationOptions: Array<{ code: string; label: string }>;
}>();

const classificationVisible = ref(false);
const workflowVisible = ref(false);
const escalationVisible = ref(false);
const selectedStatus = ref<SupportCaseStatus | null>(null);
const workflowReason = ref('');
const escalationReasonCode = ref('');
const escalationSummary = ref('');
const groupCode = ref('');
const type = ref<ClassifyEndUserCaseDto['type']>();
const impact = ref<ClassifyEndUserCaseDto['impact']>();
const urgency = ref<ClassifyEndUserCaseDto['urgency']>();
const priority = ref<ClassifyEndUserCaseDto['priority']>();
const classificationReason = ref('');
const classificationBaseline = ref<{
  groupCode: CaseDetail['groupCode'];
  type: CaseDetail['type'];
  impact: CaseDetail['impact'];
  urgency: CaseDetail['urgency'];
  priority: CaseDetail['priority'];
} | null>(null);

const value = computed(() => props.controller.exactCase.value);
const allowedActions = computed(() => new Set(value.value?.allowedActions ?? []));

const statusLabels: Record<string, string> = {
  OPEN: 'Открыт',
  IN_PROGRESS: 'В работе',
  WAITING_END_USER: 'Ожидает пользователя',
  WAITING_SYSTEM: 'Ожидает системы',
  WAITING_ADMIN: 'Ожидает оператора',
  RESOLVED: 'Решён',
  UNRESOLVED: 'Не решён',
  CANCELLED: 'Отменён',
};
const priorityLabels: Record<string, string> = {
  LOW: 'Низкий',
  NORMAL: 'Обычный',
  HIGH: 'Высокий',
  URGENT: 'Срочный',
  CRITICAL: 'Критический',
};
const evidenceKindLabels = {
  MESSAGE: 'сообщение',
  CASE_EVIDENCE: 'данные обращения',
  CMS_ACTION: 'действие оператора',
} satisfies Record<EndUserCaseClassificationEvidenceResponseDtoKind, string>;
const typeOptions = [
  { value: 'INFORMATION_REQUEST', label: 'Информационный запрос' },
  { value: 'PROBLEM_RESOLUTION', label: 'Решение проблемы' },
  { value: 'DECISION_SUPPORT', label: 'Помощь с решением' },
  { value: 'ACTION_REQUEST', label: 'Запрос действия' },
  { value: 'FEEDBACK', label: 'Обратная связь' },
  { value: 'OTHER', label: 'Другое' },
];
const impactOptions = [
  { value: 'LOW', label: 'Низкое' },
  { value: 'MEDIUM', label: 'Среднее' },
  { value: 'HIGH', label: 'Высокое' },
  { value: 'CRITICAL', label: 'Критическое' },
];
const urgencyOptions = [
  { value: 'LOW', label: 'Низкая' },
  { value: 'MEDIUM', label: 'Средняя' },
  { value: 'HIGH', label: 'Высокая' },
  { value: 'IMMEDIATE', label: 'Немедленная' },
];
const priorityWeight: Record<SupportCasePriority, number> = {
  LOW: 0,
  NORMAL: 1,
  HIGH: 2,
  URGENT: 3,
  CRITICAL: 4,
};
const statusAction: Partial<Record<SupportCaseStatus, string>> = {
  OPEN: 'SET_STATUS_OPEN',
  IN_PROGRESS: 'SET_STATUS_IN_PROGRESS',
  WAITING_END_USER: 'SET_STATUS_WAITING_END_USER',
  WAITING_SYSTEM: 'SET_STATUS_WAITING_SYSTEM',
  RESOLVED: 'SET_STATUS_RESOLVED',
  UNRESOLVED: 'SET_STATUS_UNRESOLVED',
  CANCELLED: 'SET_STATUS_CANCELLED',
};

const categoryOptions = computed(() => {
  const result = [...props.classificationOptions];
  const current = value.value?.groupCode;
  if (current && !result.some((item) => item.code === current))
    result.unshift({ code: current, label: current });
  return result;
});
const statusOptions = computed(() =>
  (value.value?.availableStatuses ?? [])
    .filter((status) => {
      const action = statusAction[status];
      return action ? allowedActions.value.has(action as never) : false;
    })
    .map((status) => ({
      value: status,
      label: statusLabels[status] ?? 'Состояние не распознано',
    })),
);
const priorityOptions = computed(() => {
  const current = value.value;
  if (!current) return [];
  const currentWeight = priorityWeight[current.priority];
  const floorWeight = priorityWeight[current.priorityPolicy.effectiveFloor];
  const canRaise = allowedActions.value.has('RAISE_PRIORITY');
  const canLower = allowedActions.value.has('LOWER_PRIORITY_TO_FLOOR');
  const canOverride = allowedActions.value.has('OVERRIDE_PRIORITY_FLOOR');
  return (Object.keys(priorityWeight) as SupportCasePriority[])
    .filter((item) => {
      const target = priorityWeight[item];
      if (item === current.priority) return true;
      if (target > currentWeight) return canRaise;
      if (!canLower && !canOverride) return false;
      return target >= floorWeight || canOverride;
    })
    .map((item) => ({ value: item, label: priorityLabels[item] }));
});
const canChangeClassification = computed(() => allowedActions.value.has('CHANGE_CLASSIFICATION'));
const canChangePriority = computed(
  () =>
    allowedActions.value.has('RAISE_PRIORITY') ||
    allowedActions.value.has('LOWER_PRIORITY_TO_FLOOR') ||
    allowedActions.value.has('OVERRIDE_PRIORITY_FLOOR'),
);
const canClassify = computed(() => canChangeClassification.value || canChangePriority.value);
const classificationActionLabel = computed(() => {
  return canChangeClassification.value ? 'Изменить классификацию' : 'Изменить приоритет';
});
const classificationDialogTitle = computed(() =>
  canChangeClassification.value && canChangePriority.value
    ? 'Классификация и приоритет'
    : classificationActionLabel.value,
);
const canEscalate = computed(() => allowedActions.value.has('REQUEST_ESCALATION'));
const confidence = computed(() => {
  const raw = value.value?.classification.confidence;
  return raw === null || raw === undefined ? 'Не определена' : `${Math.round(raw * 100)}%`;
});
const classificationSource = computed(() =>
  value.value?.classification.source === 'AI' ? 'AI-классификация' : 'Уточнено оператором',
);
const optionLabel = (options: Array<{ value: string; label: string }>, current: string): string =>
  options.find((item) => item.value === current)?.label ?? 'Значение не распознано';
const categoryLabel = computed(
  () =>
    categoryOptions.value.find((item) => item.code === value.value?.groupCode)?.label ??
    value.value?.groupCode ??
    '—',
);
const hasConflict = computed(() => Boolean(props.controller.conflict.value));
const classificationDraftChanged = computed(() => {
  const current = classificationBaseline.value;
  if (!current) return false;
  return (
    (canChangeClassification.value &&
      (groupCode.value !== current.groupCode ||
        type.value !== current.type ||
        impact.value !== current.impact ||
        urgency.value !== current.urgency)) ||
    (canChangePriority.value && priority.value !== current.priority)
  );
});

function resetClassificationDraft(current: CaseDetail): void {
  classificationBaseline.value = {
    groupCode: current.groupCode,
    type: current.type,
    impact: current.impact,
    urgency: current.urgency,
    priority: current.priority,
  };
  groupCode.value = current.groupCode;
  type.value = current.type;
  impact.value = current.impact;
  urgency.value = current.urgency;
  priority.value = current.priority;
  classificationReason.value = '';
}

function requestClassification(): void {
  const current = value.value;
  if (!current || !canClassify.value) return;
  resetClassificationDraft(current);
  classificationVisible.value = true;
}

function requestWorkflow(): void {
  selectedStatus.value = statusOptions.value[0]?.value ?? null;
  workflowReason.value = '';
  workflowVisible.value = true;
}

function requestEscalation(): void {
  escalationReasonCode.value = '';
  escalationSummary.value = '';
  escalationVisible.value = true;
}

async function submitClassification(): Promise<void> {
  const current = classificationBaseline.value;
  if (!current) return;
  const command: SupportCaseClassificationInput = {
    reason: classificationReason.value,
    ...(canChangeClassification.value && groupCode.value !== current.groupCode
      ? { groupCode: groupCode.value }
      : {}),
    ...(canChangeClassification.value && type.value !== current.type ? { type: type.value } : {}),
    ...(canChangeClassification.value && impact.value !== current.impact
      ? { impact: impact.value }
      : {}),
    ...(canChangeClassification.value && urgency.value !== current.urgency
      ? { urgency: urgency.value }
      : {}),
    ...(canChangePriority.value && priority.value !== current.priority
      ? { priority: priority.value }
      : {}),
  };
  try {
    await props.controller.classify(command);
    classificationVisible.value = false;
  } catch {
    // Controller exposes the actionable error and refreshed server authority.
  }
}

async function submitWorkflow(): Promise<void> {
  if (!selectedStatus.value) return;
  try {
    await props.controller.transition(selectedStatus.value, workflowReason.value);
    workflowVisible.value = false;
  } catch {
    // Keep the draft open so the operator can reconcile a conflict.
  }
}

async function submitEscalation(): Promise<void> {
  try {
    await props.controller.escalate(escalationReasonCode.value, escalationSummary.value);
    escalationVisible.value = false;
  } catch {
    // Keep the draft open so the operator can correct it.
  }
}

watch(
  () => value.value?.id,
  () => {
    classificationVisible.value = false;
    workflowVisible.value = false;
    escalationVisible.value = false;
  },
);

defineExpose({ requestClassification });
</script>

<template>
  <div class="support-case-desk" :aria-busy="controller.loading.value">
    <Message
      v-if="controller.error.value"
      severity="error"
      :closable="false"
      class="case-desk-error"
    >
      {{ controller.error.value }}
    </Message>
    <Message v-if="hasConflict" severity="warn" :closable="false">
      Обращение уже изменилось. Показано актуальное состояние сервера; ваш черновик сохранён в
      открытом окне.
    </Message>
    <Message
      v-if="controller.reconciling.value"
      severity="warn"
      :closable="false"
      class="case-desk-reconcile"
    >
      <div>
        <strong v-if="controller.reconciliationReason.value === 'ACCEPTED'">
          Команда принята, но актуальное состояние ещё не получено.
        </strong>
        <strong v-else-if="controller.reconciliationReason.value === 'CONFLICT'">
          Состояние обращения изменилось параллельно.
        </strong>
        <strong v-else>Результат команды пока неизвестен.</strong>
        <span>Новые действия временно недоступны, чтобы не повторить операцию.</span>
      </div>
      <Button
        label="Обновить состояние"
        icon="pi pi-refresh"
        severity="secondary"
        outlined
        :loading="controller.mutating.value"
        @click="controller.retryReconcile"
      />
    </Message>

    <div v-if="controller.loading.value && !value" class="case-desk-loading">
      Загружаем актуальное состояние обращения…
    </div>
    <template v-else-if="value">
      <header class="case-desk-header">
        <span class="case-desk-kicker">Обращение #{{ value.projectSequence }}</span>
        <h3>{{ value.title }}</h3>
        <div class="case-desk-state-line">
          <span>{{ statusLabels[value.status] ?? 'Состояние не распознано' }}</span>
          <i aria-hidden="true" />
          <strong>{{ priorityLabels[value.priority] ?? 'Приоритет не распознан' }}</strong>
          <small>v{{ value.version }}</small>
        </div>
      </header>

      <SupportCaseBrief
        :case-title="value.title"
        :project-sequence="value.projectSequence"
        :summary="value.summary"
        :goal="value.goal"
        :blockers="value.workSummary?.blockers"
        :limitations="value.workSummary?.limitations"
      />

      <section class="case-desk-classification" aria-labelledby="case-classification-title">
        <div class="case-desk-section-heading">
          <div>
            <span class="case-desk-kicker">Классификация</span>
            <h4 id="case-classification-title">{{ categoryLabel }}</h4>
          </div>
          <span class="confidence-indicator">{{ confidence }}</span>
        </div>
        <dl class="case-desk-grid">
          <div>
            <dt>Тип</dt>
            <dd>{{ optionLabel(typeOptions, value.type) }}</dd>
          </div>
          <div>
            <dt>Влияние</dt>
            <dd>{{ optionLabel(impactOptions, value.impact) }}</dd>
          </div>
          <div>
            <dt>Срочность</dt>
            <dd>{{ optionLabel(urgencyOptions, value.urgency) }}</dd>
          </div>
          <div>
            <dt>Источник</dt>
            <dd>{{ classificationSource }}</dd>
          </div>
        </dl>
        <div class="case-desk-evidence">
          <span>Основания</span>
          <ul v-if="value.classification.evidence.length">
            <li v-for="item in value.classification.evidence" :key="`${item.kind}:${item.id}`">
              {{ evidenceKindLabels[item.kind] }} · {{ item.id }}
            </li>
          </ul>
          <p v-else>Ссылки на основания не переданы</p>
        </div>
      </section>

      <section class="case-desk-policy" aria-labelledby="case-policy-title">
        <i class="pi pi-shield" aria-hidden="true" />
        <div>
          <span class="case-desk-kicker">Порог приоритета</span>
          <h4 id="case-policy-title">
            Не ниже {{ priorityLabels[value.priorityPolicy.effectiveFloor] }}
            <small>правила · версия {{ value.priorityPolicy.policyVersion }}</small>
          </h4>
          <p>
            {{ value.priorityPolicy.reasons.join(' · ') || 'Ограничений нет' }}
          </p>
        </div>
      </section>

      <div class="case-desk-actions" aria-label="Действия с обращением">
        <Button
          v-if="canClassify"
          :label="classificationActionLabel"
          icon="pi pi-tags"
          :disabled="controller.mutating.value"
          @click="requestClassification"
        />
        <Button
          v-if="statusOptions.length"
          label="Изменить статус"
          icon="pi pi-arrow-right-arrow-left"
          severity="secondary"
          outlined
          :disabled="controller.mutating.value"
          @click="requestWorkflow"
        />
        <Button
          v-if="canEscalate"
          label="Эскалировать"
          icon="pi pi-arrow-up-right"
          severity="secondary"
          text
          :disabled="controller.mutating.value"
          @click="requestEscalation"
        />
      </div>
    </template>

    <Dialog
      v-model:visible="classificationVisible"
      modal
      :header="classificationDialogTitle"
      :style="{ width: 'min(620px, calc(100vw - 24px))' }"
      :draggable="false"
    >
      <Message v-if="hasConflict" severity="warn" :closable="false">
        Состояние сервера обновлено. Проверьте поля и повторите изменение.
      </Message>
      <div class="case-desk-form classification-form">
        <label>
          <span>Категория</span>
          <Select
            v-model="groupCode"
            :options="categoryOptions"
            option-label="label"
            option-value="code"
            :disabled="!canChangeClassification"
            fluid
          />
        </label>
        <label>
          <span>Тип обращения</span>
          <Select
            v-model="type"
            :options="typeOptions"
            option-label="label"
            option-value="value"
            :disabled="!canChangeClassification"
            fluid
          />
        </label>
        <label>
          <span>Влияние</span>
          <Select
            v-model="impact"
            :options="impactOptions"
            option-label="label"
            option-value="value"
            :disabled="!canChangeClassification"
            fluid
          />
        </label>
        <label>
          <span>Срочность</span>
          <Select
            v-model="urgency"
            :options="urgencyOptions"
            option-label="label"
            option-value="value"
            :disabled="!canChangeClassification"
            fluid
          />
        </label>
        <label class="form-wide">
          <span>Приоритет</span>
          <Select
            v-model="priority"
            :options="priorityOptions"
            option-label="label"
            option-value="value"
            :disabled="!canChangePriority"
            fluid
          />
          <small
            >Серверный порог:
            {{ priorityLabels[value?.priorityPolicy.effectiveFloor ?? ''] }}</small
          >
        </label>
        <label class="form-wide">
          <span>Причина изменения</span>
          <Textarea v-model="classificationReason" rows="3" maxlength="2000" fluid />
          <small>Попадёт в журнал действий и будет видна следующему оператору.</small>
        </label>
      </div>
      <template #footer>
        <Button label="Отмена" severity="secondary" text @click="classificationVisible = false" />
        <Button
          class="classification-submit"
          label="Сохранить изменение"
          icon="pi pi-check"
          :loading="controller.mutating.value"
          :disabled="!classificationReason.trim() || !classificationDraftChanged"
          @click="submitClassification"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="workflowVisible"
      modal
      header="Изменить статус обращения"
      :style="{ width: 'min(520px, calc(100vw - 24px))' }"
      :draggable="false"
    >
      <Message v-if="hasConflict" severity="warn" :closable="false">
        Статус изменился на сервере. Проверьте актуальное состояние.
      </Message>
      <div class="case-desk-form">
        <label>
          <span>Новый статус</span>
          <Select
            v-model="selectedStatus"
            :options="statusOptions"
            option-label="label"
            option-value="value"
            fluid
          />
        </label>
        <label>
          <span>Причина изменения</span>
          <Textarea v-model="workflowReason" rows="3" maxlength="2000" fluid />
        </label>
      </div>
      <template #footer>
        <Button label="Отмена" severity="secondary" text @click="workflowVisible = false" />
        <Button
          label="Изменить статус"
          :loading="controller.mutating.value"
          :disabled="controller.reconciling.value || !selectedStatus || !workflowReason.trim()"
          @click="submitWorkflow"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="escalationVisible"
      modal
      header="Передать обращение специалисту"
      :style="{ width: 'min(520px, calc(100vw - 24px))' }"
      :draggable="false"
    >
      <div class="case-desk-form">
        <label>
          <span>Код причины</span>
          <InputText
            v-model="escalationReasonCode"
            maxlength="100"
            placeholder="PAYMENT_REVIEW"
            fluid
          />
          <small>Латинские заглавные буквы, цифры и подчёркивание.</small>
        </label>
        <label>
          <span>Что должен проверить специалист</span>
          <Textarea v-model="escalationSummary" rows="4" maxlength="1000" fluid />
        </label>
      </div>
      <template #footer>
        <Button label="Отмена" severity="secondary" text @click="escalationVisible = false" />
        <Button
          label="Передать специалисту"
          icon="pi pi-arrow-up-right"
          :loading="controller.mutating.value"
          :disabled="
            controller.reconciling.value ||
            !escalationReasonCode.trim() ||
            !escalationSummary.trim()
          "
          @click="submitEscalation"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.support-case-desk {
  display: grid;
  gap: 14px;
  color: var(--text-primary);
}
.case-desk-loading {
  padding: 28px 16px;
  color: var(--text-muted);
  font-size: 0.8rem;
  text-align: center;
}
.case-desk-header {
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
}
.case-desk-header h3 {
  margin: 5px 0 10px;
  font-size: 1rem;
  line-height: 1.35;
}
.case-desk-kicker {
  color: var(--text-muted);
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.case-desk-state-line {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 0.76rem;
}
.case-desk-state-line i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--line);
}
.case-desk-state-line strong {
  color: var(--status-warning-text);
}
.case-desk-state-line small {
  margin-left: auto;
  color: var(--text-muted);
}
.case-desk-classification {
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-muted);
}
.case-desk-section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.case-desk-section-heading h4,
.case-desk-policy h4 {
  margin: 4px 0 0;
  font-size: 0.84rem;
}
.confidence-indicator {
  flex: 0 0 auto;
  padding: 4px 7px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface);
  color: var(--text-muted);
  font-size: 0.68rem;
  font-weight: 700;
}
.case-desk-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
  margin: 14px 0 0;
}
.case-desk-grid dt {
  color: var(--text-muted);
  font-size: 0.65rem;
}
.case-desk-grid dd {
  margin: 3px 0 0;
  font-size: 0.72rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.case-desk-evidence {
  margin-top: 13px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.case-desk-evidence > span {
  color: var(--text-muted);
  font-size: 0.65rem;
}
.case-desk-evidence ul {
  display: grid;
  gap: 4px;
  margin: 7px 0 0;
  padding: 0;
  list-style: none;
}
.case-desk-evidence li,
.case-desk-evidence p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.68rem;
  overflow-wrap: anywhere;
}
.case-desk-policy {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--status-warning-text);
  border-radius: 12px;
  background: var(--status-warning-soft);
}
.case-desk-policy > i {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  color: var(--status-warning-text);
}
.case-desk-policy h4 small {
  margin-left: 4px;
  color: var(--text-muted);
  font-weight: 600;
}
.case-desk-policy p {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 0.68rem;
  line-height: 1.4;
}
.case-desk-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.case-desk-actions :deep(.p-button) {
  min-height: 44px;
  justify-content: flex-start;
  padding-inline: 10px;
  font-size: 0.72rem;
}
.case-desk-actions :deep(.p-button:last-child) {
  grid-column: 1 / -1;
}
.case-desk-reconcile :deep(.p-message-content) {
  align-items: flex-start;
}
.case-desk-reconcile :deep(.p-message-text) {
  display: grid;
  gap: 10px;
  width: 100%;
}
.case-desk-reconcile :deep(.p-message-text > div) {
  display: grid;
  gap: 3px;
}
.case-desk-reconcile :deep(.p-message-text span) {
  font-size: 0.7rem;
  font-weight: 400;
  line-height: 1.4;
}
.case-desk-reconcile :deep(.p-button) {
  min-height: 44px;
  justify-content: center;
}
.case-desk-form {
  display: grid;
  gap: 14px;
  padding-top: 4px;
}
.classification-form {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.case-desk-form label {
  display: grid;
  gap: 6px;
  min-width: 0;
  color: var(--text-primary);
  font-size: 0.76rem;
  font-weight: 700;
}
.case-desk-form label > small {
  color: var(--text-muted);
  font-size: 0.66rem;
  font-weight: 400;
  line-height: 1.4;
}
.form-wide {
  grid-column: 1 / -1;
}
@media (max-width: 520px) {
  .classification-form {
    grid-template-columns: 1fr;
  }
  .form-wide {
    grid-column: auto;
  }
  .case-desk-actions {
    grid-template-columns: 1fr;
  }
  .case-desk-actions :deep(.p-button:last-child) {
    grid-column: auto;
  }
}
</style>
