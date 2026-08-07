<script setup lang="ts">
import { computed } from "vue";
import Message from "primevue/message";
import ConversationComposer from "@/features/conversation-surface/ui/ConversationComposer.vue";
import type {
  ConversationSurfaceComposer,
  ConversationSurfaceComposerAction,
} from "@/features/conversation-surface/model/conversation-surface-contract";
import type { AdminMessageResult } from "@/shared/types/domain";

const props = defineProps<{
  composer: Extract<ConversationSurfaceComposer, { mode: "PUBLIC_REPLY" }>;
  draft: string;
  workingLocaleLabel: string;
  error: string;
  deliveryStatus?: AdminMessageResult["deliveryStatus"];
}>();

const emit = defineEmits<{
  "update:draft": [value: string];
  "send-source": [];
  "request-reply-translation": [];
  "reconcile-reply-translation": [];
  "retry-reply-translation": [];
  "save-reply-translation": [text: string];
  "send-reply-translation": [text?: string];
  action: [action: ConversationSurfaceComposerAction];
}>();

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
</script>

<template>
  <section
    v-if="composer.visibility !== 'HIDDEN'"
    class="support-reply-composer"
  >
    <ConversationComposer
      :composer="composer"
      :draft="draft"
      :working-locale-label="workingLocaleLabel"
      @update:draft="emit('update:draft', $event)"
      @send-source="emit('send-source')"
      @request-reply-translation="emit('request-reply-translation')"
      @reconcile-reply-translation="emit('reconcile-reply-translation')"
      @retry-reply-translation="emit('retry-reply-translation')"
      @save-reply-translation="emit('save-reply-translation', $event)"
      @send-reply-translation="emit('send-reply-translation', $event)"
      @action="emit('action', $event)"
    />
    <div
      v-if="deliveryMessage || error"
      class="support-reply-composer__feedback"
    >
      <Message
        v-if="deliveryMessage"
        severity="success"
        :closable="false"
        role="status"
      >
        {{ deliveryMessage }}
      </Message>
      <Message v-if="error" severity="error" :closable="false" role="alert">
        {{ error }}
      </Message>
    </div>
  </section>
  <p v-else class="support-reply-unavailable">
    Ответ в этом диалоге сейчас недоступен.
  </p>
</template>

<style scoped>
.support-reply-composer {
  container-name: support-reply-composer;
  container-type: inline-size;
  padding-top: 10px;
  border-top: 1px solid var(--line);
  background: var(--surface-card);
}
.support-reply-composer__feedback {
  display: grid;
  gap: 6px;
  margin: -4px 20px 12px;
}
.support-reply-composer__feedback :deep(.p-message) {
  margin: 0;
}
.support-reply-unavailable {
  margin: 0;
  padding: 14px 22px 18px;
  border-top: 1px solid var(--line);
  background: var(--surface-card);
  color: var(--text-muted);
  font-size: 0.78rem;
}
@container support-reply-composer (max-width: 720px) {
  .support-reply-composer :deep(.conversation-composer.is-translated) {
    grid-template-columns: 1fr;
  }
  .support-reply-composer
    :deep(.conversation-composer.is-translated .reply-preview) {
    order: 2;
    padding-top: 10px;
    border-top: 1px solid var(--border-subtle);
  }
  .support-reply-composer
    :deep(.conversation-composer.is-translated .conversation-composer__source) {
    order: 1;
    padding: 0;
    border-right: 0;
  }
  .support-reply-composer
    :deep(.conversation-composer.is-translated .conversation-composer__footer) {
    position: static;
    order: 3;
    width: auto;
  }
  .support-reply-composer :deep(.conversation-composer__footer) {
    align-items: flex-end;
  }
  .support-reply-composer :deep(.conversation-composer__footer > span) {
    display: none;
  }
  .support-reply-composer :deep(.conversation-composer__footer > div) {
    width: 100%;
    flex-wrap: wrap;
  }
  .support-reply-composer :deep(.conversation-composer__actions),
  .support-reply-composer :deep(.conversation-composer__footer .p-button) {
    flex: 1 1 auto;
  }
  .support-reply-composer :deep(.conversation-composer__actions > .p-button) {
    width: 100%;
  }
}
@media (max-width: 720px) {
  .support-reply-composer {
    min-height: 0;
    max-height: 50dvh;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .support-reply-composer__feedback {
    margin: 8px 12px 12px;
  }
  .support-reply-unavailable {
    padding: 14px 16px 16px;
  }
}
</style>
