<script setup lang="ts">
import { ref, watch } from "vue";
import Dialog from "primevue/dialog";
import type { NotificationOperationsDelivery } from "../model/notification-operations";

const props = defineProps<{
  target: NotificationOperationsDelivery | null;
  submitting: boolean;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const confirmed = ref(false);

watch(
  () => props.target,
  () => {
    confirmed.value = false;
  },
);
</script>

<template>
  <Dialog
    :visible="Boolean(target)"
    modal
    :draggable="false"
    append-to="self"
    header="Вернуть delivery в очередь?"
    :style="{ width: 'min(560px, calc(100vw - 28px))' }"
    @update:visible="!$event && emit('cancel')"
  >
    <div v-if="target" class="dialog-stack">
      <p>
        Lola повторно проверит eligibility под lock. Business delivery, payload
        hash и журнал попыток останутся прежними.
      </p>
      <dl>
        <div>
          <dt>Delivery</dt>
          <dd>{{ target.id }}</dd>
        </div>
        <div>
          <dt>Project UUID</dt>
          <dd>{{ target.projectId }}</dd>
        </div>
        <div>
          <dt>Канал</dt>
          <dd>{{ target.channel }}</dd>
        </div>
      </dl>
      <label class="confirmation">
        <input v-model="confirmed" type="checkbox" />
        <span>
          Я проверил immutable delivery и понимаю, что новая provider attempt
          будет выполнена только для доказанно не принятой доставки.
        </span>
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
        class="confirm-button"
        :disabled="!confirmed || submitting"
        @click="emit('confirm')"
      >
        Вернуть в очередь
      </button>
    </template>
  </Dialog>
</template>

<style scoped>
.dialog-stack {
  display: grid;
  gap: 16px;
}
.dialog-stack p {
  margin: 0;
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
dt {
  color: var(--text-small-muted);
  font-size: 0.72rem;
}
dd {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
  font-weight: 700;
}
.confirmation {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}
.secondary-button,
.confirm-button {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: inherit;
  font-weight: 700;
}
.confirm-button {
  border-color: var(--status-warning);
}
button:disabled {
  opacity: 0.55;
}
</style>
