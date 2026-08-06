<script setup lang="ts">
import { computed } from "vue";
import type { ConversationMessage } from "@/shared/types/domain";

const props = defineProps<{
  status: NonNullable<ConversationMessage["delivery"]>["status"];
}>();

const presentations = {
  PENDING: { label: "Принято, ожидает доставки", tone: "pending" },
  DELIVERING: { label: "Передано в доставку", tone: "pending" },
  DELIVERED: { label: "Доставлено", tone: "success" },
  READ: { label: "Прочитано пользователем", tone: "success" },
  FAILED: { label: "Доставка не удалась", tone: "danger" },
  CANCELLED: { label: "Доставка отменена", tone: "danger" },
  NOT_REDELIVERED: { label: "Не отправлено повторно", tone: "danger" },
} as const satisfies Record<
  NonNullable<ConversationMessage["delivery"]>["status"],
  { label: string; tone: "pending" | "success" | "danger" }
>;

const presentation = computed(() => presentations[props.status]);
const severity = computed(() =>
  presentation.value.tone === "danger" ? "error" : "success",
);
</script>

<template>
  <span
    class="delivery-status"
    :class="`delivery-status--${presentation.tone}`"
    :aria-label="presentation.label"
    :role="severity === 'error' ? 'alert' : 'status'"
  >
    <i
      :class="
        presentation.tone === 'success'
          ? 'pi pi-check-circle'
          : presentation.tone === 'danger'
            ? 'pi pi-exclamation-circle'
            : 'pi pi-clock'
      "
      aria-hidden="true"
    />
    {{ presentation.label }}
  </span>
</template>

<style scoped>
.delivery-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 7px;
  font-size: 0.72rem;
  line-height: 1.3;
}
.delivery-status--pending {
  color: var(--text-muted);
}
.delivery-status--success {
  color: var(--status-success-text);
}
.delivery-status--danger {
  color: var(--status-danger-text);
}
</style>
