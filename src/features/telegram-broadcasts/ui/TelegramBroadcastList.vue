<script setup lang="ts">
import type {
  TelegramBroadcast,
  TelegramBroadcastLifecycle,
  TelegramBroadcastPermissions,
} from "../model/telegram-broadcast";

defineProps<{
  items: TelegramBroadcast[];
  total: number;
  loading: boolean;
  permissions: TelegramBroadcastPermissions;
  nextCursor: string | null;
  error?: string | null;
}>();

defineEmits<{
  create: [];
  open: [broadcastId: string];
  refresh: [];
  loadMore: [];
}>();

const lifecycleLabels: Record<TelegramBroadcastLifecycle, string> = {
  DRAFT: "Черновик",
  APPROVED: "Одобрена",
  SCHEDULED: "Запланирована",
  RUNNING: "Отправляется",
  PAUSED: "Приостановлена",
  COMPLETED: "Завершена",
  COMPLETED_WITH_FAILURES: "Завершена с ошибками",
  CANCELLED: "Отменена",
};

const lifecycleIcons: Record<TelegramBroadcastLifecycle, string> = {
  DRAFT: "pi pi-file-edit",
  APPROVED: "pi pi-check-circle",
  SCHEDULED: "pi pi-clock",
  RUNNING: "pi pi-send",
  PAUSED: "pi pi-pause-circle",
  COMPLETED: "pi pi-check",
  COMPLETED_WITH_FAILURES: "pi pi-exclamation-triangle",
  CANCELLED: "pi pi-times-circle",
};

const SNAPSHOT_LIFECYCLES: readonly TelegramBroadcastLifecycle[] = [
  "APPROVED",
  "SCHEDULED",
  "RUNNING",
  "PAUSED",
  "COMPLETED",
  "COMPLETED_WITH_FAILURES",
];

function audienceSummary(item: TelegramBroadcast): string {
  if (SNAPSHOT_LIFECYCLES.includes(item.status))
    return `Зафиксированная аудитория: ${item.recipientCount}`;
  if (item.status === "CANCELLED")
    return `Получателей: ${item.recipientCount}`;
  return "Снимок аудитории ещё не зафиксирован";
}
</script>

<template>
  <section class="broadcast-list" aria-labelledby="broadcast-list-title">
    <header class="list-header">
      <div>
        <div class="eyebrow">Telegram</div>
        <h1 id="broadcast-list-title">Рассылки</h1>
        <p>
          Сообщения получают только пользователи с явным согласием и активной
          привязкой Telegram.
        </p>
      </div>
      <div class="list-actions">
        <button
          type="button"
          class="secondary-button"
          :disabled="loading"
          @click="$emit('refresh')"
        >
          <i class="pi pi-refresh" aria-hidden="true" />
          Обновить
        </button>
        <button
          v-if="permissions.draft"
          type="button"
          class="primary-button"
          data-action="create"
          :disabled="loading"
          @click="$emit('create')"
        >
          <i class="pi pi-plus" aria-hidden="true" />
          Создать рассылку
        </button>
      </div>
    </header>

    <p v-if="error" class="state error" role="alert">{{ error }}</p>
    <p
      v-if="loading && !items.length"
      class="state"
      role="status"
      aria-live="polite"
    >
      Загружаем рассылки…
    </p>
    <p v-else-if="!items.length" class="state">
      Рассылок пока нет.
    </p>
    <template v-else>
      <p class="list-summary" aria-live="polite">
        Показано {{ items.length }} из {{ total }}
      </p>
      <ul class="broadcast-items" aria-label="Список Telegram-рассылок">
        <li v-for="item in items" :key="item.id">
          <button
            type="button"
            class="broadcast-item"
            :aria-label="`Открыть рассылку ${item.title}`"
            @click="$emit('open', item.id)"
          >
            <span class="item-heading">
              <strong>{{ item.title }}</strong>
              <span class="lifecycle">
                <i :class="lifecycleIcons[item.status]" aria-hidden="true" />
                {{ lifecycleLabels[item.status] }}
              </span>
            </span>
            <span class="item-meta">
              <span>Аудитория: только с явным согласием</span>
              <span>{{ audienceSummary(item) }}</span>
            </span>
          </button>
        </li>
      </ul>
      <button
        v-if="nextCursor"
        type="button"
        class="secondary-button load-more"
        :disabled="loading"
        @click="$emit('loadMore')"
      >
        Показать ещё
      </button>
    </template>
  </section>
</template>

<style scoped>
.broadcast-list {
  display: grid;
  gap: 20px;
}
.list-header,
.list-actions,
.item-heading,
.item-meta {
  display: flex;
}
.list-header {
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}
.list-header h1 {
  margin: 4px 0 8px;
}
.list-header p,
.list-summary {
  margin: 0;
  color: var(--text-small-muted);
}
.list-actions {
  gap: 8px;
}
.primary-button,
.secondary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.primary-button {
  border-color: var(--surface-emphasis);
  background: var(--surface-emphasis);
  color: var(--text-on-emphasis);
}
.secondary-button {
  background: var(--surface-card);
  color: var(--text-primary);
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.state {
  padding: 18px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--surface-card);
}
.state.error {
  border-color: var(--status-danger);
}
.broadcast-items {
  display: grid;
  gap: 10px;
  padding: 0;
  margin: 0;
  list-style: none;
}
.broadcast-item {
  display: grid;
  width: 100%;
  gap: 10px;
  padding: 18px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--surface-card);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}
.broadcast-item:hover,
.broadcast-item:focus-visible {
  border-color: var(--text-brand);
}
.item-heading {
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.lifecycle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-small-muted);
}
.item-meta {
  flex-wrap: wrap;
  gap: 8px 18px;
  color: var(--text-small-muted);
  font-size: 0.8rem;
}
.load-more {
  justify-self: center;
}
@media (max-width: 720px) {
  .list-header,
  .item-heading {
    align-items: stretch;
    flex-direction: column;
  }
  .list-actions {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
