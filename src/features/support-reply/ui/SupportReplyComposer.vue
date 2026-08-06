<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Textarea from "primevue/textarea";
import type { AdminMessageResult } from "@/shared/types/domain";

const props = withDefaults(defineProps<{
  draft: string;
  canReply: boolean;
  canSend?: boolean;
  blockedReason?: string;
  sending: boolean;
  error: string;
  deliveryStatus?: AdminMessageResult["deliveryStatus"];
}>(), {
  canSend: true,
  blockedReason: "",
});

const emit = defineEmits<{
  "update:draft": [value: string];
  send: [];
}>();

const canSend = computed(
  () =>
    props.canReply &&
    props.canSend &&
    !props.sending &&
    props.draft.trim().length > 0,
);

const deliveryMessage = computed(() => {
  switch (props.deliveryStatus) {
    case "PENDING":
      return "Сообщение принято и ожидает доставки.";
    case "DELIVERING":
      return "Сообщение передано в доставку.";
    case "DELIVERED":
      return "Сообщение доставлено пользователю.";
    case "READ":
      return "Пользователь прочитал сообщение.";
    case "FAILED":
      return "Доставка сообщения не удалась.";
    case "CANCELLED":
      return "Доставка сообщения отменена.";
    case "NOT_REDELIVERED":
      return "Сообщение не было отправлено повторно.";
    default:
      return "";
  }
});

function requestSend(): void {
  if (canSend.value) emit("send");
}

function handleKeydown(event: KeyboardEvent): void {
  if (
    event.key !== "Enter" ||
    event.isComposing ||
    (!event.ctrlKey && !event.metaKey)
  )
    return;
  event.preventDefault();
  requestSend();
}
</script>

<template>
  <section
    v-if="canReply"
    class="support-reply-composer"
    aria-labelledby="support-reply-heading"
  >
    <div class="support-reply-composer__header">
      <div>
        <span class="eyebrow">Публичное сообщение</span>
        <h3 id="support-reply-heading">Ответ пользователю</h3>
      </div>
      <span class="support-reply-composer__shortcut">Ctrl/⌘ + Enter</span>
    </div>
    <form :aria-busy="sending" @submit.prevent="requestSend">
      <label class="support-reply-composer__field">
        <span class="sr-only">Текст ответа пользователю</span>
        <Textarea
          :model-value="draft"
          rows="4"
          maxlength="10000"
          auto-resize
          placeholder="Напишите ответ пользователю…"
          :disabled="sending"
          @update:model-value="emit('update:draft', $event)"
          @keydown="handleKeydown"
        />
      </label>
      <slot name="assist" />
      <div class="support-reply-composer__footer">
        <p>Отправляется только в выбранный диалог.</p>
        <Button
          label="Отправить пользователю"
          icon="pi pi-send"
          type="submit"
          :loading="sending"
          :disabled="!canSend"
        />
      </div>
    </form>
    <Message v-if="deliveryMessage" severity="success" :closable="false" role="status">
      {{ deliveryMessage }}
    </Message>
    <Message
      v-if="draft.trim() && blockedReason"
      severity="info"
      :closable="false"
      role="status"
    >
      {{ blockedReason }}
    </Message>
    <Message v-if="error" severity="error" :closable="false" role="alert">
      {{ error }}
    </Message>
  </section>
  <p v-else class="support-reply-unavailable">
    Ответ в этом диалоге сейчас недоступен.
  </p>
</template>

<style scoped>
.support-reply-composer {
  display: grid;
  gap: 12px;
  padding: 16px 22px 20px;
  border-top: 1px solid var(--line);
  background: var(--surface-card);
}
.support-reply-composer__header,
.support-reply-composer__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.support-reply-composer__header h3 {
  margin: 2px 0 0;
  font-size: 0.98rem;
}
.support-reply-composer__shortcut,
.support-reply-composer__footer p,
.support-reply-unavailable {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.78rem;
}
.support-reply-composer__shortcut {
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--surface-muted);
  white-space: nowrap;
}
.support-reply-composer__field,
.support-reply-composer :deep(.p-textarea) {
  display: block;
  width: 100%;
}
.support-reply-composer__footer p {
  line-height: 1.4;
}
.support-reply-unavailable {
  padding: 14px 22px 18px;
  border-top: 1px solid var(--line);
  background: var(--surface-card);
}
@media (max-width: 520px) {
  .support-reply-composer {
    padding: 14px 16px 16px;
  }
  .support-reply-composer__header,
  .support-reply-composer__footer {
    align-items: flex-start;
    flex-direction: column;
  }
  .support-reply-composer__footer :deep(.p-button) {
    width: 100%;
  }
  .support-reply-unavailable {
    padding: 14px 16px 16px;
  }
}
</style>
