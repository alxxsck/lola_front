<script setup lang="ts">
import Dialog from "primevue/dialog";

defineProps<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
}>();

const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <Dialog
    :visible="open"
    modal
    :draggable="false"
    append-to="self"
    :header="title"
    :style="{ width: 'min(520px, calc(100vw - 28px))' }"
    @update:visible="!$event && emit('cancel')"
  >
    <p>{{ description }}</p>
    <slot />
    <template #footer>
      <div class="dialog-actions">
        <button type="button" class="secondary-button" @click="emit('cancel')">
          Назад
        </button>
        <button
          type="button"
          class="confirm-button"
          :class="{ destructive }"
          data-action="confirm"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
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
  cursor: pointer;
}
.confirm-button {
  border-color: var(--surface-emphasis);
  background: var(--surface-emphasis);
  color: var(--text-on-emphasis);
}
.confirm-button.destructive {
  border-color: var(--status-danger);
  background: var(--status-danger);
  color: var(--text-on-emphasis);
}
</style>
