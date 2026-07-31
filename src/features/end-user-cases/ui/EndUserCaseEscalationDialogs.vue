<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import { useAuthStore } from "@/features/auth/auth.store";
import { endUserCasesRepository } from "../api/end-user-cases-repository";
import {
  activeEndUserCaseEscalation,
  isSameEndUserCaseEscalationScope,
  type EndUserCaseEscalationAction,
  type EndUserCaseEscalationDialogScope,
} from "../model/end-user-case-escalation";
import { useEndUserCasesStore } from "../model/end-user-cases.store";

const props = defineProps<{
  canEscalate?: boolean;
  canAssign?: boolean;
  canManage?: boolean;
  currentCmsUserId?: string;
}>();
const auth = useAuthStore();
const store = useEndUserCasesStore();
const visible = ref(false);
const action = ref<EndUserCaseEscalationAction>("REQUEST");
const reason = ref("");
const reasonCode = ref("SUPPORT_REQUEST");
const summary = ref("");
const targetCmsUserId = ref("");
const nextCaseStatus = ref<
  "OPEN" | "WAITING_END_USER" | "WAITING_SYSTEM" | "RESOLVED" | "UNRESOLVED"
>("OPEN");
const assignees = ref<Array<{ id: string; displayName: string }>>([]);
const assigneesLoading = ref(false);
const assigneesError = ref("");
const actionError = ref("");
const scope = ref<EndUserCaseEscalationDialogScope | null>(null);
let assigneeRequestGeneration = 0;

const reasonOptions = [
  { value: "SUPPORT_REQUEST", label: "Нужна помощь специалиста" },
  { value: "DEPOSIT_HELP", label: "Вопрос по депозиту" },
  { value: "ACCOUNT_HELP", label: "Вопрос по аккаунту" },
  { value: "OTHER", label: "Другая причина" },
];
const closeStatusOptions = [
  { value: "OPEN", label: "Вернуть в работу" },
  { value: "WAITING_END_USER", label: "Ждать пользователя" },
  { value: "WAITING_SYSTEM", label: "Ждать систему" },
  { value: "RESOLVED", label: "Решено" },
  { value: "UNRESOLVED", label: "Не решено" },
];
const cancelStatusOptions = closeStatusOptions.slice(0, 3);
const currentScope = computed<EndUserCaseEscalationDialogScope | null>(() => {
  const projectId = auth.project?.id;
  const selected = store.selected;
  if (!projectId || !selected) return null;
  const escalation = activeEndUserCaseEscalation(selected.escalations.items);
  return {
    projectId,
    caseId: selected.case.id,
    caseVersion: selected.case.version,
    escalationId: escalation?.id ?? null,
    escalationVersion: escalation?.version ?? null,
  };
});
const scopeChanged = computed(
  () =>
    visible.value &&
    !isSameEndUserCaseEscalationScope(scope.value, currentScope.value),
);
const actionAllowed = computed(() => isActionAllowed(action.value));

const title = computed(
  () =>
    ({
      REQUEST: "Позвать специалиста",
      CLAIM: "Взять обращение в работу",
      RELEASE: "Вернуть обращение в очередь",
      TRANSFER: "Передать другому специалисту",
      CLOSE: "Завершить помощь специалиста",
      CANCEL: "Отменить запрос специалиста",
    })[action.value],
);

const submitLabel = computed(
  () =>
    ({
      REQUEST: "Отправить запрос",
      CLAIM: "Взять в работу",
      RELEASE: "Вернуть в очередь",
      TRANSFER: "Передать",
      CLOSE: "Завершить",
      CANCEL: "Отменить запрос",
    })[action.value],
);

const canSubmit = computed(() => {
  if (store.mutating || scopeChanged.value || !actionAllowed.value)
    return false;
  if (action.value === "REQUEST")
    return Boolean(summary.value.trim()) && summary.value.length <= 1000;
  if (!reason.value.trim()) return false;
  if (action.value === "TRANSFER") return Boolean(targetCmsUserId.value);
  return true;
});

async function requestEscalationAction(
  nextAction: EndUserCaseEscalationAction,
): Promise<void> {
  const nextScope = currentScope.value;
  const active = activeEndUserCaseEscalation(
    store.selected?.escalations.items ?? [],
  );
  if (
    !nextScope ||
    !isActionAllowed(nextAction) ||
    (nextAction === "REQUEST" ? active !== null : active === null)
  )
    return;
  action.value = nextAction;
  scope.value = nextScope;
  reason.value = "";
  reasonCode.value = "SUPPORT_REQUEST";
  summary.value = (store.selected?.case.summary ?? "").slice(0, 1000);
  targetCmsUserId.value = "";
  nextCaseStatus.value = "OPEN";
  assigneesError.value = "";
  actionError.value = "";
  assigneeRequestGeneration += 1;
  visible.value = true;
  if (nextAction === "TRANSFER") await loadAssignees();
}

function isActionAllowed(value: EndUserCaseEscalationAction): boolean {
  const active = activeEndUserCaseEscalation(
    store.selected?.escalations.items ?? [],
  );
  const isClaimant = active?.claimant?.id === props.currentCmsUserId;
  if (value === "REQUEST") return props.canEscalate === true;
  if (value === "CLAIM" || value === "TRANSFER")
    return props.canAssign === true;
  if (value === "RELEASE") return props.canAssign === true || isClaimant;
  if (value === "CLOSE") return props.canManage === true || isClaimant;
  return props.canManage === true;
}

function dismiss(): void {
  assigneeRequestGeneration += 1;
  visible.value = false;
  scope.value = null;
  actionError.value = "";
}

async function loadAssignees(): Promise<void> {
  const projectId = auth.project?.id;
  const requestScope = scope.value;
  if (!projectId || !requestScope) return;
  const generation = ++assigneeRequestGeneration;
  assigneesLoading.value = true;
  try {
    const response = await endUserCasesRepository.assignees(projectId);
    if (
      generation !== assigneeRequestGeneration ||
      !isSameEndUserCaseEscalationScope(requestScope, currentScope.value)
    )
      return;
    const currentClaimant = store.selected?.escalations.items.find(
      ({ status }) => status === "CLAIMED",
    )?.claimant?.id;
    assignees.value = response.items.filter(({ id }) => id !== currentClaimant);
    targetCmsUserId.value = assignees.value[0]?.id ?? "";
  } catch {
    if (
      generation === assigneeRequestGeneration &&
      isSameEndUserCaseEscalationScope(requestScope, currentScope.value)
    )
      assigneesError.value = "Не удалось загрузить доступных специалистов.";
  } finally {
    if (generation === assigneeRequestGeneration)
      assigneesLoading.value = false;
  }
}

async function submit(): Promise<void> {
  actionError.value = "";
  if (scopeChanged.value) {
    actionError.value =
      "Обращение изменилось. Закройте окно и повторите действие с актуальными данными.";
    return;
  }
  if (!canSubmit.value) return;
  const normalizedReason = reason.value.trim();
  const succeeded =
    action.value === "REQUEST"
      ? await store.requestEscalation(reasonCode.value, summary.value.trim())
      : action.value === "CLAIM"
        ? await store.claimEscalation(normalizedReason)
        : action.value === "RELEASE"
          ? await store.releaseEscalation(normalizedReason)
          : action.value === "TRANSFER"
            ? await store.transferEscalation(
                targetCmsUserId.value,
                normalizedReason,
              )
            : action.value === "CLOSE"
              ? await store.closeEscalation(
                  nextCaseStatus.value,
                  normalizedReason,
                )
              : await store.cancelEscalation(
                  nextCaseStatus.value as
                    "OPEN" | "WAITING_END_USER" | "WAITING_SYSTEM",
                  normalizedReason,
                );
  if (succeeded) dismiss();
  else
    actionError.value =
      store.detailError ?? "Не удалось выполнить действие. Повторите попытку.";
}

watch(actionAllowed, (allowed) => {
  if (visible.value && !allowed) dismiss();
});

defineExpose({ dismiss, requestEscalationAction });
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="title"
    :style="{ width: 'min(540px, calc(100vw - 24px))' }"
  >
    <Message v-if="action === 'REQUEST'" severity="info" :closable="false">
      Запрос появится в очереди обращений и отправит одно уведомление по
      настроенным каналам проекта.
    </Message>
    <Message
      v-if="action === 'CLOSE' && nextCaseStatus === 'RESOLVED'"
      severity="warn"
      :closable="false"
    >
      Выбирайте «Решено» только при явном подтверждении пользователя или
      проверенном результате.
    </Message>
    <Message v-if="assigneesError" severity="error" :closable="false">
      {{ assigneesError }}
    </Message>
    <Message v-if="scopeChanged" severity="warn" :closable="false">
      Обращение изменилось. Закройте окно и повторите действие с актуальными
      данными.
    </Message>
    <Message v-if="actionError" severity="error" :closable="false">
      {{ actionError }}
    </Message>

    <label
      v-if="action === 'REQUEST'"
      class="dialog-field"
      for="case-escalation-reason"
    >
      <span>Причина</span>
      <Select
        v-model="reasonCode"
        input-id="case-escalation-reason"
        :options="reasonOptions"
        option-label="label"
        option-value="value"
      />
    </label>
    <label
      v-if="action === 'REQUEST'"
      class="dialog-field"
      for="case-escalation-summary"
    >
      <span>Что должен увидеть специалист</span>
      <Textarea
        id="case-escalation-summary"
        v-model="summary"
        rows="4"
        maxlength="1000"
      />
    </label>
    <label
      v-if="action === 'TRANSFER'"
      class="dialog-field"
      for="case-escalation-assignee"
    >
      <span>Новый специалист</span>
      <Select
        v-model="targetCmsUserId"
        input-id="case-escalation-assignee"
        :options="assignees"
        option-label="displayName"
        option-value="id"
        :loading="assigneesLoading"
        :disabled="assigneesLoading || Boolean(assigneesError)"
      />
    </label>
    <label
      v-if="action === 'CLOSE' || action === 'CANCEL'"
      class="dialog-field"
      for="case-escalation-next-status"
    >
      <span>Следующий статус обращения</span>
      <Select
        v-model="nextCaseStatus"
        input-id="case-escalation-next-status"
        :options="action === 'CLOSE' ? closeStatusOptions : cancelStatusOptions"
        option-label="label"
        option-value="value"
      />
    </label>
    <label
      v-if="action !== 'REQUEST'"
      class="dialog-field"
      for="case-escalation-action-reason"
    >
      <span>Основание</span>
      <Textarea
        id="case-escalation-action-reason"
        v-model="reason"
        rows="3"
        maxlength="1000"
      />
    </label>

    <template #footer>
      <Button label="Отмена" text @click="dismiss" />
      <Button
        :label="submitLabel"
        :severity="action === 'CANCEL' ? 'danger' : undefined"
        :disabled="!canSubmit || assigneesLoading || Boolean(assigneesError)"
        :loading="store.mutating"
        @click="submit"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.dialog-field {
  display: grid;
  gap: 7px;
  margin-top: 14px;
}
.dialog-field > span {
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 700;
}
.dialog-field :deep(.p-select),
.dialog-field :deep(.p-textarea) {
  width: 100%;
}
</style>
