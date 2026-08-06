<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import type { ReleaseSupportCaseAssignmentDtoReasonCode } from "@/shared/api/generated/models";
import type { SupportAssignmentReleaseInput } from "@/features/support-case-assignment/model/use-support-assignment-release";

const props = defineProps<{
  releasing: boolean;
  error: string;
  unknownOutcome: boolean;
  completed: boolean;
  canRetry: boolean;
}>();

const emit = defineEmits<{
  release: [input: SupportAssignmentReleaseInput];
  retry: [];
}>();

const visible = ref(false);
const reasonCode = ref<ReleaseSupportCaseAssignmentDtoReasonCode>("WORK_RETURNED");
const reasonNote = ref("");
const reasonOptions: {
  value: ReleaseSupportCaseAssignmentDtoReasonCode;
  label: string;
}[] = [
  { value: "WORK_RETURNED", label: "Работа возвращена в очередь" },
  { value: "SHIFT_END", label: "Окончание смены" },
  { value: "LEAD_REBALANCE", label: "Перераспределение лидом" },
  { value: "OTHER", label: "Другая причина" },
];

const dialogVisible = computed({
  get: () => visible.value,
  set: (value: boolean) => {
    visible.value = value;
  },
});

watch(visible, (isVisible) => {
  if (!isVisible) return;
  reasonCode.value = "WORK_RETURNED";
  reasonNote.value = "";
});

function confirmRelease(): void {
  if (props.releasing || props.unknownOutcome) return;
  visible.value = false;
  emit("release", {
    reasonCode: reasonCode.value,
    ...(reasonNote.value.trim() ? { reasonNote: reasonNote.value.trim() } : {}),
  });
}
</script>

<template>
  <section class="assignment-release" aria-label="Управление назначением">
    <Button
      label="Снять назначение"
      icon="pi pi-user-minus"
      severity="danger"
      outlined
      :disabled="releasing || unknownOutcome || completed"
      :loading="releasing"
      @click="visible = true"
    />
    <Message v-if="completed" severity="success" :closable="false">
      Назначение снято. Контекст Case синхронизируется с сервером.
    </Message>
    <Message v-if="error" severity="error" :closable="false">
      {{ error }}
    </Message>
    <Button
      v-if="unknownOutcome"
      label="Повторить тот же запрос"
      severity="secondary"
      outlined
      :disabled="!canRetry || releasing"
      @click="emit('retry')"
    />

    <Dialog
      v-model:visible="dialogVisible"
      modal
      header="Снять назначение с Case?"
      :style="{ width: 'min(460px, calc(100vw - 32px))' }"
    >
      <p>
        Case вернётся в серверный workflow. После подтверждения это назначение
        нельзя восстановить из этого окна.
      </p>
      <label class="assignment-release__field">
        <span>Причина</span>
        <Select
          v-model="reasonCode"
          :options="reasonOptions"
          option-label="label"
          option-value="value"
          aria-label="Причина снятия назначения"
          fluid
        />
      </label>
      <label class="assignment-release__field">
        <span>Комментарий <small>необязательно</small></span>
        <Textarea
          v-model="reasonNote"
          rows="3"
          maxlength="500"
          aria-label="Комментарий к снятию назначения"
          placeholder="Не указывайте персональные данные, пароли или токены"
        />
        <small>{{ reasonNote.length }}/500</small>
      </label>
      <template #footer>
        <Button label="Отмена" severity="secondary" text @click="visible = false" />
        <Button
          label="Подтвердить снятие"
          severity="danger"
          :loading="releasing"
          :disabled="unknownOutcome"
          @click="confirmRelease"
        />
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.assignment-release {
  display: grid;
  gap: 10px;
  margin-top: 16px;
}
.assignment-release :deep(.p-button) {
  justify-self: start;
}
.assignment-release__field {
  display: grid;
  gap: 7px;
  margin-top: 14px;
  color: var(--text-primary);
  font-size: 0.88rem;
  font-weight: 700;
}
.assignment-release__field small {
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 500;
}
.assignment-release__field :deep(.p-textarea) {
  width: 100%;
  resize: vertical;
}
</style>
