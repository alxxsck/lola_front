<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Dialog from "primevue/dialog";
import {
  NOTIFICATION_OPERATIONS_QUARANTINE_REASONS,
  type NotificationOperationsIntegration,
  type NotificationOperationsQuarantineReason,
} from "../model/notification-operations";

const props = defineProps<{
  target: NotificationOperationsIntegration | null;
  submitting: boolean;
}>();

const emit = defineEmits<{
  confirm: [
    reason: NotificationOperationsQuarantineReason,
    confirmation: string,
  ];
  cancel: [];
}>();

const reason = ref<NotificationOperationsQuarantineReason | "">("");
const confirmation = ref("");
const valid = computed(
  () =>
    Boolean(reason.value) &&
    confirmation.value === props.target?.maskedIdentity,
);

watch(
  () => props.target,
  () => {
    reason.value = "";
    confirmation.value = "";
  },
);

function submit(): void {
  if (!valid.value || !reason.value) return;
  emit("confirm", reason.value, confirmation.value);
}
</script>

<template>
  <Dialog
    :visible="Boolean(target)"
    modal
    :draggable="false"
    append-to="self"
    header="Поместить интеграцию в карантин?"
    :style="{ width: 'min(620px, calc(100vw - 28px))' }"
    @update:visible="!$event && emit('cancel')"
  >
    <div v-if="target" class="dialog-stack">
      <p class="warning">
        Credential будет отозван, queued и claimed pre-dispatch work этого
        канала будет подавлен. Post-dispatch и ambiguous outcomes не изменятся.
        Повторное включение возможно только после rotation и provider test в
        Project settings.
      </p>
      <dl>
        <div>
          <dt>Тип</dt>
          <dd>{{ target.kind }}</dd>
        </div>
        <div>
          <dt>Project UUID</dt>
          <dd>{{ target.projectId }}</dd>
        </div>
        <div>
          <dt>Masked identity</dt>
          <dd>{{ target.maskedIdentity }}</dd>
        </div>
      </dl>
      <label>
        <span>Причина</span>
        <select v-model="reason" aria-label="Причина quarantine">
          <option value="" disabled>Выберите причину</option>
          <option
            v-for="option in NOTIFICATION_OPERATIONS_QUARANTINE_REASONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
      <label>
        <span>
          Для подтверждения введите masked identity:
          <strong>{{ target.maskedIdentity }}</strong>
        </span>
        <input
          v-model="confirmation"
          type="text"
          maxlength="160"
          autocomplete="off"
          aria-label="Подтверждение masked identity"
        />
      </label>
    </div>
    <template #footer>
      <button
        type="button"
        class="secondary-button"
        :disabled="submitting"
        @click="emit('cancel')"
      >
        Назад
      </button>
      <button
        type="button"
        class="danger-button"
        :disabled="!valid || submitting"
        @click="submit"
      >
        Поместить в карантин
      </button>
    </template>
  </Dialog>
</template>

<style scoped>
.dialog-stack {
  display: grid;
  gap: 16px;
}
.warning {
  padding: 12px;
  margin: 0;
  border: 1px solid var(--status-danger);
  border-radius: 12px;
  background: var(--status-danger-soft);
}
dl {
  display: grid;
  gap: 8px;
  margin: 0;
}
dl div {
  padding: 10px;
  border-radius: 10px;
  background: var(--surface-subtle);
}
dt,
label > span {
  color: var(--text-small-muted);
  font-size: 0.72rem;
}
dd {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
  font-weight: 700;
}
label {
  display: grid;
  gap: 6px;
}
select,
input {
  min-height: 42px;
  width: 100%;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-primary);
  padding: 0 10px;
  font: inherit;
}
.secondary-button,
.danger-button {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: inherit;
  font-weight: 700;
}
.danger-button {
  border-color: var(--status-danger);
  background: var(--status-danger);
  color: var(--text-on-emphasis);
}
button:disabled {
  opacity: 0.55;
}
</style>
