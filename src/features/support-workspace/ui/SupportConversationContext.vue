<script setup lang="ts">
import { computed } from "vue";
import Message from "primevue/message";
import { relativeTime } from "@/shared/lib/format";
import type {
  SupportWorkspaceConversation,
  SupportWorkspaceSelection,
} from "@/features/support-workspace/api/support-workspace-source";

const props = defineProps<{
  conversation: SupportWorkspaceConversation;
  selection: SupportWorkspaceSelection;
}>();

const userLabel = computed(() =>
  props.selection.endUser.isGuest ? "Гостевой пользователь" : "Пользователь",
);
</script>

<template>
  <div class="support-conversation-context">
    <div class="pane-heading">
      <div>
        <span class="eyebrow">Контекст</span>
        <h2>Диалог</h2>
      </div>
    </div>
    <dl class="context-list">
      <div>
        <dt>Пользователь</dt>
        <dd>{{ userLabel }}</dd>
      </div>
      <div>
        <dt>Статус</dt>
        <dd>{{ conversation.status === "OPEN" ? "Активный" : "Архивный" }}</dd>
      </div>
      <div>
        <dt>Сообщений</dt>
        <dd>{{ conversation.messageCount }}</dd>
      </div>
      <div>
        <dt>Сессий сейчас</dt>
        <dd>{{ conversation.currentInteractionSessionCount }}</dd>
      </div>
      <div>
        <dt>Язык</dt>
        <dd>{{ selection.endUser.locale ?? "Не указан" }}</dd>
      </div>
      <div>
        <dt>Обновлён</dt>
        <dd>{{ relativeTime(conversation.updatedAt) }}</dd>
      </div>
    </dl>
    <Message severity="secondary" :closable="false">
      Полный профиль, события и sensitive поля не запрашиваются этим экраном.
      Доступные действия определяет серверная capability-модель.
    </Message>
  </div>
</template>

<style scoped>
.pane-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.pane-heading h2 {
  margin: 0;
  font-size: 1.05rem;
}
.context-list {
  display: grid;
  gap: 14px;
  margin: 0 0 18px;
}
.context-list div {
  display: grid;
  gap: 3px;
}
.context-list dt {
  color: var(--text-muted);
  font-size: 0.78rem;
}
.context-list dd {
  margin: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}
@media (max-width: 1180px) {
  .context-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 720px) {
  .context-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
