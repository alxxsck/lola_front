<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import type {
  ReleaseSupportCaseAssignmentDtoReasonCode,
  TransferSupportCaseAssignmentDtoReasonCode,
} from "@/shared/api/generated/models";
import type { createSupportAssignmentController } from "@/features/support-case-assignment/model/use-support-assignment";

const props = defineProps<{
  controller: ReturnType<typeof createSupportAssignmentController>;
  assignment: {
    id: string;
    operatorName: string;
    teamName: string;
    version: number;
    actionEtag: string;
  } | null;
  claimantLabel: string;
  viewersLabel: string;
  availabilityLabel: string;
}>();

const snapshot = computed(() => props.controller.caseSnapshot.value);
const canClaim = computed(() => props.controller.canClaim.value);
const canRelease = computed(() => props.controller.canRelease.value);
const canTransfer = computed(() => props.controller.canTransfer.value);

const assignmentStateLabel = computed(() => {
  if (snapshot.value?.assignmentState === "RESERVED")
    return "Зарезервировано системой маршрутизации";
  if (snapshot.value?.assignmentState === "UNASSIGNED") return "Не назначено";
  const current = snapshot.value?.currentAssignment;
  if (
    snapshot.value?.assignmentState === "ASSIGNED" &&
    current &&
    props.assignment &&
    props.assignment.id === current.id &&
    props.assignment.version === current.version &&
    props.assignment.actionEtag === current.actionEtag
  )
    return `${props.assignment.operatorName} · ${props.assignment.teamName}`;
  if (snapshot.value?.assignmentState === "ASSIGNED")
    return "Обновляем данные владельца…";
  return props.assignment ? "Обновляем назначение…" : "Не назначено";
});

const releaseVisible = ref(false);
const releaseReason = ref<ReleaseSupportCaseAssignmentDtoReasonCode>(
  "WORK_RETURNED",
);
const releaseNote = ref("");
const releaseReasons = [
  { label: "Работа возвращена в очередь", value: "WORK_RETURNED" },
  { label: "Завершение смены", value: "SHIFT_END" },
  { label: "Балансировка лидом", value: "LEAD_REBALANCE" },
  { label: "Другая причина", value: "OTHER" },
] satisfies Array<{
  label: string;
  value: ReleaseSupportCaseAssignmentDtoReasonCode;
}>;

function requestRelease(): void {
  releaseReason.value = "WORK_RETURNED";
  releaseNote.value = "";
  releaseVisible.value = true;
}

async function confirmRelease(): Promise<void> {
  props.controller.setDraft({
    kind: "RELEASE",
    reasonCode: releaseReason.value,
    ...(releaseNote.value.trim()
      ? { reasonNote: releaseNote.value.trim() }
      : {}),
  });
  await props.controller.submit();
  if (!props.controller.draft.value) releaseVisible.value = false;
}

const claimVisible = ref(false);
const claimTeamId = ref("");
const claimTeams = computed(
  () => snapshot.value?.teams.filter((team) => team.actions.claim) ?? [],
);

function requestClaim(): void {
  claimTeamId.value = claimTeams.value[0]?.id ?? "";
  claimVisible.value = true;
}

async function confirmClaim(): Promise<void> {
  if (!claimTeamId.value) return;
  props.controller.setDraft({ kind: "CLAIM", teamId: claimTeamId.value });
  await props.controller.submit();
  if (!props.controller.draft.value) claimVisible.value = false;
}

const transferVisible = ref(false);
const transferTeamId = ref("");
const transferOperatorId = ref("");
const transferReason = ref<TransferSupportCaseAssignmentDtoReasonCode>(
  "SKILL_HANDOFF",
);
const transferNote = ref("");
const transferReasons = [
  { label: "Передача по навыку", value: "SKILL_HANDOFF" },
  { label: "Балансировка нагрузки", value: "LOAD_BALANCE" },
  { label: "Решение лида", value: "LEAD_INTERVENTION" },
  { label: "Другая причина", value: "OTHER" },
] satisfies Array<{
  label: string;
  value: TransferSupportCaseAssignmentDtoReasonCode;
}>;
const transferTeams = computed(
  () =>
    snapshot.value?.teams.filter(
      (team) =>
        team.actions.transfer &&
        team.operators.some((operator) => operator.actions.transfer),
    ) ?? [],
);
const transferOperators = computed(
  () =>
    transferTeams.value
      .find((team) => team.id === transferTeamId.value)
      ?.operators.filter((operator) => operator.actions.transfer) ?? [],
);

watch(transferTeamId, () => {
  if (
    !transferOperators.value.some(
      (operator) => operator.id === transferOperatorId.value,
    )
  )
    transferOperatorId.value = transferOperators.value[0]?.id ?? "";
});

watch(
  [
    () => snapshot.value?.caseId ?? null,
    canClaim,
    canRelease,
    canTransfer,
    () => props.controller.draft.value?.kind ?? null,
  ],
  ([caseId, claimAllowed, releaseAllowed, transferAllowed, draftKind], previous) => {
    if (previous?.[0] && caseId && caseId !== previous[0]) {
      claimVisible.value = false;
      releaseVisible.value = false;
      transferVisible.value = false;
      return;
    }
    if (!claimAllowed && draftKind !== "CLAIM") claimVisible.value = false;
    if (!releaseAllowed && draftKind !== "RELEASE") releaseVisible.value = false;
    if (!transferAllowed && draftKind !== "TRANSFER") transferVisible.value = false;
  },
);

function requestTransfer(): void {
  transferTeamId.value = transferTeams.value[0]?.id ?? "";
  transferOperatorId.value = transferOperators.value[0]?.id ?? "";
  transferReason.value = "SKILL_HANDOFF";
  transferNote.value = "";
  transferVisible.value = true;
}

async function confirmTransfer(): Promise<void> {
  if (!transferTeamId.value || !transferOperatorId.value) return;
  props.controller.setDraft({
    kind: "TRANSFER",
    teamId: transferTeamId.value,
    operatorId: transferOperatorId.value,
    reasonCode: transferReason.value,
    ...(transferNote.value.trim()
      ? { reasonNote: transferNote.value.trim() }
      : {}),
  });
  await props.controller.submit();
  if (!props.controller.draft.value) transferVisible.value = false;
}
</script>

<template>
  <section class="assignment-desk" aria-labelledby="assignment-desk-heading">
    <header class="assignment-desk__header">
      <div>
        <span class="section-kicker">Ответственность</span>
        <h3 id="assignment-desk-heading">Кто ведёт обращение</h3>
      </div>
      <Button
        label="Обновить"
        icon="pi pi-refresh"
        severity="secondary"
        text
        size="small"
        :loading="controller.caseLoading.value"
        @click="controller.loadCase"
      />
    </header>

    <dl class="assignment-rail">
      <div data-assignment-state class="assignment-rail__row assignment-rail__row--primary">
        <dt><i class="pi pi-briefcase" aria-hidden="true" />Назначение</dt>
        <dd>{{ assignmentStateLabel }}</dd>
      </div>
      <div data-claimant-state class="assignment-rail__row">
        <dt><i class="pi pi-flag" aria-hidden="true" />Взял в работу</dt>
        <dd>{{ claimantLabel }}</dd>
      </div>
      <div data-viewers-state class="assignment-rail__row">
        <dt><i class="pi pi-eye" aria-hidden="true" />Наблюдатели</dt>
        <dd>{{ viewersLabel }}</dd>
      </div>
      <div data-availability-state class="assignment-rail__row">
        <dt><i class="pi pi-circle-fill" aria-hidden="true" />Доступность</dt>
        <dd>{{ availabilityLabel }}</dd>
      </div>
    </dl>

    <div v-if="canClaim || canRelease || canTransfer" class="assignment-actions">
      <Button
        v-if="canClaim"
        label="Взять в работу"
        icon="pi pi-user-plus"
        aria-label="Взять в работу"
        :disabled="controller.mutating.value || controller.unknownOutcome.value"
        @click="requestClaim"
      />
      <Button
        v-if="canTransfer"
        label="Передать"
        icon="pi pi-arrow-right-arrow-left"
        severity="secondary"
        outlined
        aria-label="Передать назначение"
        :disabled="controller.mutating.value || controller.unknownOutcome.value"
        @click="requestTransfer"
      />
      <Button
        v-if="canRelease"
        label="Снять"
        icon="pi pi-user-minus"
        severity="danger"
        outlined
        aria-label="Снять назначение"
        :disabled="controller.mutating.value || controller.unknownOutcome.value"
        @click="requestRelease"
      />
    </div>

    <Message
      v-if="
        controller.error.value &&
        !claimVisible &&
        !releaseVisible &&
        !transferVisible
      "
      severity="error"
      :closable="false"
    >
      {{ controller.error.value }}
    </Message>
    <Button
      v-if="controller.unknownOutcome.value"
      label="Повторить тот же запрос"
      aria-label="Повторить тот же запрос"
      icon="pi pi-replay"
      severity="secondary"
      outlined
      :disabled="!controller.canRetry.value"
      @click="controller.retryUnknownOutcome"
    />

    <Dialog
      v-model:visible="claimVisible"
      modal
      header="Взять обращение в работу"
      :style="{ width: 'min(430px, calc(100vw - 32px))' }"
    >
      <p class="assignment-dialog__lead">
        Обращение будет назначено на вас в выбранной доступной команде.
      </p>
      <label class="assignment-dialog__field">
        <span>Команда</span>
        <Select
          v-model="claimTeamId"
          :options="claimTeams"
          option-label="name"
          option-value="id"
          aria-label="Команда для назначения"
          fluid
        />
      </label>
      <Message v-if="controller.error.value" severity="error" :closable="false">
        {{ controller.error.value }}
      </Message>
      <template #footer>
        <Button
          label="Отмена"
          severity="secondary"
          text
          @click="claimVisible = false"
        />
        <Button
          label="Взять в работу"
          aria-label="Подтвердить назначение на себя"
          :loading="controller.mutating.value"
          :disabled="controller.unknownOutcome.value || !canClaim || !claimTeamId"
          @click="confirmClaim"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="releaseVisible"
      modal
      header="Снять назначение"
      :style="{ width: 'min(460px, calc(100vw - 32px))' }"
    >
      <p class="assignment-dialog__lead">
        Обращение вернётся в очередь. Причина попадёт в журнал действий.
      </p>
      <label class="assignment-dialog__field">
        <span>Причина</span>
        <Select
          v-model="releaseReason"
          :options="releaseReasons"
          option-label="label"
          option-value="value"
          aria-label="Причина снятия назначения"
          fluid
        />
      </label>
      <label class="assignment-dialog__field">
        <span>Комментарий <small>необязательно</small></span>
        <Textarea
          v-model="releaseNote"
          rows="3"
          maxlength="500"
          aria-label="Комментарий к снятию назначения"
          placeholder="Коротко опишите операционную причину"
          fluid
        />
        <small>{{ releaseNote.length }}/500</small>
      </label>
      <Message v-if="controller.error.value" severity="error" :closable="false">
        {{ controller.error.value }}
      </Message>
      <template #footer>
        <Button
          label="Отмена"
          severity="secondary"
          text
          @click="releaseVisible = false"
        />
        <Button
          label="Подтвердить"
          severity="danger"
          aria-label="Подтвердить снятие назначения"
          :loading="controller.mutating.value"
          :disabled="controller.unknownOutcome.value || !canRelease"
          @click="confirmRelease"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="transferVisible"
      modal
      header="Передать назначение"
      :style="{ width: 'min(520px, calc(100vw - 32px))' }"
    >
      <p class="assignment-dialog__lead">
        Доступны только команды и операторы из актуального серверного списка для этого обращения.
      </p>
      <div class="assignment-dialog__grid">
        <label class="assignment-dialog__field">
          <span>Команда</span>
          <Select
            v-model="transferTeamId"
            :options="transferTeams"
            option-label="name"
            option-value="id"
            aria-label="Команда для передачи"
            fluid
          />
        </label>
        <label class="assignment-dialog__field">
          <span>Оператор</span>
          <Select
            v-model="transferOperatorId"
            :options="transferOperators"
            option-label="displayName"
            option-value="id"
            aria-label="Оператор для передачи"
            fluid
          />
          <small v-if="transferOperators.length">
            Доступная ёмкость:
            {{ transferOperators.find((item) => item.id === transferOperatorId)?.availableCapacityUnits ?? 0 }}
          </small>
        </label>
      </div>
      <label class="assignment-dialog__field">
        <span>Причина</span>
        <Select
          v-model="transferReason"
          :options="transferReasons"
          option-label="label"
          option-value="value"
          aria-label="Причина передачи назначения"
          fluid
        />
      </label>
      <label class="assignment-dialog__field">
        <span>Комментарий <small>необязательно</small></span>
        <Textarea
          v-model="transferNote"
          rows="3"
          maxlength="500"
          aria-label="Комментарий к передаче назначения"
          placeholder="Что важно знать следующему оператору"
          fluid
        />
        <small>{{ transferNote.length }}/500</small>
      </label>
      <Message v-if="controller.error.value" severity="error" :closable="false">
        {{ controller.error.value }}
      </Message>
      <template #footer>
        <Button
          label="Отмена"
          severity="secondary"
          text
          @click="transferVisible = false"
        />
        <Button
          label="Передать"
          aria-label="Подтвердить передачу назначения"
          :loading="controller.mutating.value"
          :disabled="
            controller.unknownOutcome.value ||
            !canTransfer ||
            !transferTeamId ||
            !transferOperatorId
          "
          @click="confirmTransfer"
        />
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.assignment-desk {
  display: grid;
  gap: 16px;
}
.assignment-desk__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.assignment-desk__header h3 {
  margin: 2px 0 0;
  color: var(--text-primary);
  font-size: 0.94rem;
  font-weight: 750;
  letter-spacing: -0.01em;
}
.assignment-rail {
  display: grid;
  margin: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--line) 82%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-card) 70%, var(--surface-ground));
}
.assignment-rail__row {
  display: grid;
  grid-template-columns: minmax(108px, 0.8fr) minmax(0, 1.2fr);
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 9px 12px;
}
.assignment-rail__row + .assignment-rail__row {
  border-top: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
}
.assignment-rail__row--primary {
  background: color-mix(in srgb, var(--brand-soft) 38%, transparent);
}
.assignment-rail dt,
.assignment-rail dd {
  margin: 0;
}
.assignment-rail dt {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 0.72rem;
  font-weight: 700;
}
.assignment-rail dt i {
  width: 14px;
  color: var(--text-subtle, var(--text-muted));
  font-size: 0.72rem;
  text-align: center;
}
.assignment-rail__row--primary dt i {
  color: var(--brand);
}
.assignment-rail dd {
  min-width: 0;
  color: var(--text-primary);
  font-size: 0.8rem;
  font-weight: 650;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.assignment-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.assignment-actions :deep(.p-button) {
  min-height: 44px;
}
.assignment-dialog__lead {
  margin: 0 0 16px;
  color: var(--text-muted);
  font-size: 0.86rem;
  line-height: 1.5;
}
.assignment-dialog__field {
  display: grid;
  gap: 7px;
  margin-top: 14px;
  color: var(--text-primary);
  font-size: 0.84rem;
  font-weight: 700;
}
.assignment-dialog__field small {
  color: var(--text-muted);
  font-size: 0.74rem;
  font-weight: 500;
}
.assignment-dialog__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.assignment-dialog__grid .assignment-dialog__field {
  margin-top: 0;
}
@media (max-width: 560px) {
  .assignment-rail__row {
    grid-template-columns: 1fr;
    gap: 3px;
  }
  .assignment-actions,
  .assignment-actions :deep(.p-button) {
    width: 100%;
  }
  .assignment-dialog__grid {
    grid-template-columns: 1fr;
  }
  .assignment-offers__item {
    align-items: stretch;
    flex-direction: column;
  }
  .assignment-offers__item > div,
  .assignment-offers__item :deep(.p-button) {
    width: 100%;
  }
}
</style>
