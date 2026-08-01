<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import MultiSelect from "primevue/multiselect";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import { useAuthStore } from "@/features/auth/auth.store";
import { endUserCasesRepository } from "../api/end-user-cases-repository";
import type {
  EndUserCasePriority,
  EndUserCaseStatus,
} from "../model/end-user-case";
import {
  endUserCaseActionLabel,
  endUserCasePriorityLabel,
} from "../model/end-user-case-presentation";
import { endUserCaseRouteQuery } from "../model/end-user-case-route";
import { useEndUserCasesStore } from "../model/end-user-cases.store";

const auth = useAuthStore();
const router = useRouter();
const store = useEndUserCasesStore();
const transitionVisible = ref(false);
const transitionStatus = ref<EndUserCaseStatus>("IN_PROGRESS");
const transitionReason = ref("");
const assignmentVisible = ref(false);
const assignmentTarget = ref("");
const assignmentReason = ref("");
const assigneeOptions = ref<Array<{ id: string; displayName: string }>>([]);
const assigneesLoading = ref(false);
const assigneesError = ref("");
const classificationVisible = ref(false);
const classificationGroup = ref("");
const classificationPriority = ref<EndUserCasePriority | undefined>();
const classificationReason = ref("");
const unlinkMessageId = ref<string | null>(null);
const unlinkReason = ref("");
const mergeVisible = ref(false);
const mergeCandidates = ref<
  Array<{ id: string; version: number; label: string }>
>([]);
const mergeSourceIds = ref<string[]>([]);
const mergeReason = ref("");
const splitVisible = ref(false);
const splitMessageIds = ref<string[]>([]);
const splitEvidenceIds = ref<string[]>([]);
const splitTitle = ref("");
const splitGroup = ref("");
const splitReason = ref("");
const priorityOptions: EndUserCasePriority[] = [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
  "CRITICAL",
];

function requestTransition(status: EndUserCaseStatus): void {
  transitionStatus.value = status;
  transitionReason.value = "";
  transitionVisible.value = true;
}

async function submitTransition(): Promise<void> {
  if (!transitionReason.value.trim()) return;
  if (await store.transition(transitionStatus.value, transitionReason.value))
    transitionVisible.value = false;
}

async function requestAssignment(): Promise<void> {
  const projectId = auth.project?.id;
  if (!projectId) return;
  assignmentReason.value = "";
  assigneesError.value = "";
  assignmentVisible.value = true;
  assigneesLoading.value = true;
  try {
    const response = await endUserCasesRepository.assignees(projectId);
    assigneeOptions.value = [
      { id: "", displayName: "Снять назначение" },
      ...response.items,
    ];
    const preferredId =
      store.selected?.case.assignee?.id ?? auth.user?.id ?? "";
    assignmentTarget.value = assigneeOptions.value.some(
      ({ id }) => id === preferredId,
    )
      ? preferredId
      : "";
  } catch {
    assigneesError.value = "Не удалось загрузить доступных исполнителей.";
  } finally {
    assigneesLoading.value = false;
  }
}

async function submitAssignment(): Promise<void> {
  if (!assignmentReason.value.trim()) return;
  if (
    await store.assign(assignmentTarget.value || null, assignmentReason.value)
  )
    assignmentVisible.value = false;
}

function requestClassification(): void {
  classificationGroup.value = store.selected?.case.groupCode ?? "";
  classificationPriority.value = store.selected?.case.priority;
  classificationReason.value = "";
  classificationVisible.value = true;
}

async function submitClassification(): Promise<void> {
  if (!classificationReason.value.trim()) return;
  if (
    await store.classify({
      groupCode: classificationGroup.value.trim() || undefined,
      priority: classificationPriority.value,
      reason: classificationReason.value.trim(),
    })
  )
    classificationVisible.value = false;
}

function requestUnlink(messageId: string): void {
  unlinkMessageId.value = messageId;
  unlinkReason.value = "";
}

async function submitUnlink(): Promise<void> {
  if (!unlinkMessageId.value || !unlinkReason.value.trim()) return;
  if (await store.unlinkMessage(unlinkMessageId.value, unlinkReason.value)) {
    unlinkMessageId.value = null;
    unlinkReason.value = "";
  }
}

async function requestMerge(): Promise<void> {
  const projectId = auth.project?.id;
  const value = store.selected?.case;
  if (!projectId || !value) return;
  mergeReason.value = "";
  mergeSourceIds.value = [];
  const page = await endUserCasesRepository.list(projectId, {
    preset: "ALL",
    sort: "LAST_ACTIVITY",
    endUserId: value.endUser.id,
  });
  mergeCandidates.value = page.items
    .filter((item) => item.id !== value.id && !item.mergedIntoCaseId)
    .map((item) => ({
      id: item.id,
      version: item.version,
      label: `№ ${item.projectSequence} · ${item.title}`,
    }));
  mergeVisible.value = true;
}

async function submitMerge(): Promise<void> {
  const selected = mergeCandidates.value.filter((item) =>
    mergeSourceIds.value.includes(item.id),
  );
  if (!selected.length || !mergeReason.value.trim()) return;
  if (await store.merge(selected, mergeReason.value))
    mergeVisible.value = false;
}

function requestSplit(): void {
  const value = store.selected?.case;
  if (!value) return;
  splitMessageIds.value = [];
  splitEvidenceIds.value = [];
  splitTitle.value = "";
  splitGroup.value = value.groupCode;
  splitReason.value = "";
  splitVisible.value = true;
}

async function submitSplit(): Promise<void> {
  const id = await store.split(
    splitMessageIds.value,
    splitTitle.value,
    splitReason.value,
    splitGroup.value,
    splitEvidenceIds.value,
  );
  if (!id) return;
  splitVisible.value = false;
  await router.replace({
    name: "end-user-case-detail",
    params: { caseId: id },
    query: endUserCaseRouteQuery(store.filters),
  });
}

defineExpose({
  requestTransition,
  requestAssignment,
  requestClassification,
  requestUnlink,
  requestMerge,
  requestSplit,
});
</script>

<template>
  <Dialog
    v-model:visible="transitionVisible"
    modal
    :header="endUserCaseActionLabel(transitionStatus)"
    :style="{ width: 'min(520px, calc(100vw - 24px))' }"
  >
    <Message
      v-if="transitionStatus === 'RESOLVED'"
      severity="warn"
      :closable="false"
    >
      Молчание пользователя не подтверждает решение. Укажите явный ответ
      пользователя, проверенный лог или собственную проверку администратора.
    </Message>
    <label class="dialog-field">
      <span>Основание</span>
      <Textarea v-model="transitionReason" rows="4" maxlength="2000" />
    </label>
    <template #footer>
      <Button label="Отмена" text @click="transitionVisible = false" />
      <Button
        label="Подтвердить"
        :disabled="!transitionReason.trim()"
        :loading="store.mutating"
        @click="submitTransition"
      />
    </template>
  </Dialog>

  <Dialog
    v-model:visible="assignmentVisible"
    modal
    header="Назначение обращения"
    :style="{ width: 'min(460px, calc(100vw - 24px))' }"
  >
    <Message v-if="assigneesError" severity="error" :closable="false">
      {{ assigneesError }}
    </Message>
    <label class="dialog-field">
      <span>Исполнитель</span>
      <Select
        v-model="assignmentTarget"
        :options="assigneeOptions"
        option-label="displayName"
        option-value="id"
        :loading="assigneesLoading"
        :disabled="assigneesLoading || Boolean(assigneesError)"
      />
    </label>
    <label class="dialog-field">
      <span>Причина</span>
      <Textarea v-model="assignmentReason" rows="3" maxlength="2000" />
    </label>
    <template #footer>
      <Button label="Отмена" text @click="assignmentVisible = false" />
      <Button
        label="Сохранить"
        :disabled="
          !assignmentReason.trim() ||
          assigneesLoading ||
          Boolean(assigneesError)
        "
        :loading="store.mutating"
        @click="submitAssignment"
      />
    </template>
  </Dialog>

  <Dialog
    v-model:visible="classificationVisible"
    modal
    header="Исправить классификацию"
    :style="{ width: 'min(520px, calc(100vw - 24px))' }"
  >
    <label class="dialog-field">
      <span>Код категории</span>
      <InputText v-model="classificationGroup" maxlength="64" />
    </label>
    <label class="dialog-field">
      <span>Приоритет</span>
      <Select
        v-model="classificationPriority"
        :options="
          priorityOptions.map((value) => ({
            value,
            label: endUserCasePriorityLabel(value),
          }))
        "
        option-label="label"
        option-value="value"
      />
    </label>
    <label class="dialog-field">
      <span>Причина исправления</span>
      <Textarea v-model="classificationReason" rows="3" maxlength="2000" />
    </label>
    <template #footer>
      <Button label="Отмена" text @click="classificationVisible = false" />
      <Button
        label="Сохранить"
        :disabled="!classificationReason.trim()"
        :loading="store.mutating"
        @click="submitClassification"
      />
    </template>
  </Dialog>

  <Dialog
    :visible="Boolean(unlinkMessageId)"
    modal
    header="Исключить сообщение из обращения?"
    :style="{ width: 'min(480px, calc(100vw - 24px))' }"
    @update:visible="!$event && (unlinkMessageId = null)"
  >
    <label class="dialog-field">
      <span>Причина</span>
      <Textarea v-model="unlinkReason" rows="3" maxlength="2000" />
    </label>
    <template #footer>
      <Button label="Отмена" text @click="unlinkMessageId = null" />
      <Button
        label="Исключить"
        severity="danger"
        :disabled="!unlinkReason.trim()"
        :loading="store.mutating"
        @click="submitUnlink"
      />
    </template>
  </Dialog>

  <Dialog
    v-model:visible="mergeVisible"
    modal
    header="Объединить обращения"
    :style="{ width: 'min(560px, calc(100vw - 24px))' }"
  >
    <Message severity="warn" :closable="false">
      Сообщения, подтверждающие данные и история будут перенесены в текущее
      обращение. Исходные обращения останутся в истории как объединённые.
    </Message>
    <label class="dialog-field">
      <span>Дубликаты того же пользователя</span>
      <MultiSelect
        v-model="mergeSourceIds"
        :options="mergeCandidates"
        option-label="label"
        option-value="id"
        placeholder="Выберите обращения"
        display="chip"
      />
    </label>
    <label class="dialog-field">
      <span>Причина объединения</span>
      <Textarea v-model="mergeReason" rows="3" maxlength="2000" />
    </label>
    <template #footer>
      <Button label="Отмена" text @click="mergeVisible = false" />
      <Button
        label="Объединить"
        severity="warn"
        :disabled="!mergeSourceIds.length || !mergeReason.trim()"
        :loading="store.mutating"
        @click="submitMerge"
      />
    </template>
  </Dialog>

  <Dialog
    v-model:visible="splitVisible"
    modal
    header="Разделить обращение"
    :style="{ width: 'min(600px, calc(100vw - 24px))' }"
  >
    <Message severity="info" :closable="false">
      Выбранные сообщения станут новым обращением. В исходном должно остаться
      хотя бы одно сообщение.
    </Message>
    <label class="dialog-field">
      <span>Сообщения для нового обращения</span>
      <MultiSelect
        v-model="splitMessageIds"
        :options="
          store.selected?.messages.items.map((link) => ({
            id: link.message.id,
            label: `${link.message.role}: ${link.message.text.slice(0, 90)}`,
          })) ?? []
        "
        option-label="label"
        option-value="id"
        placeholder="Выберите сообщения"
        display="chip"
      />
    </label>
    <label
      v-if="store.selected?.case.splitEvidence?.length"
      class="dialog-field"
    >
      <span>Связанные действия и проверки</span>
      <MultiSelect
        v-model="splitEvidenceIds"
        :options="
          store.selected.case.splitEvidence.map((evidence) => ({
            id: evidence.id,
            label: `${evidence.kind}: ${evidence.contribution}`,
          }))
        "
        option-label="label"
        option-value="id"
        placeholder="При необходимости перенесите данные"
        display="chip"
      />
    </label>
    <label class="dialog-field">
      <span>Название нового обращения</span>
      <InputText v-model="splitTitle" maxlength="200" />
    </label>
    <label class="dialog-field">
      <span>Код категории</span>
      <InputText v-model="splitGroup" maxlength="64" />
    </label>
    <label class="dialog-field">
      <span>Причина разделения</span>
      <Textarea v-model="splitReason" rows="3" maxlength="2000" />
    </label>
    <template #footer>
      <Button label="Отмена" text @click="splitVisible = false" />
      <Button
        label="Создать обращение"
        :disabled="
          !splitMessageIds.length ||
          splitMessageIds.length >=
            (store.selected?.messages.items.length ?? 0) ||
          !splitTitle.trim() ||
          !splitReason.trim()
        "
        :loading="store.mutating"
        @click="submitSplit"
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
  font-size: 0.75rem;
  font-weight: 700;
}
</style>
