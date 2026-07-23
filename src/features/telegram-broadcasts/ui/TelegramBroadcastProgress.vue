<script setup lang="ts">
import type { TelegramBroadcastProgress as Progress } from "../model/telegram-broadcast";
import type {
  TelegramBroadcastDelivery,
  TelegramBroadcastDeliveryStatus,
} from "../model/use-telegram-broadcasts";

defineProps<{
  progress: Progress;
  deliveries: TelegramBroadcastDelivery[];
  deliveryTotal: number;
  nextDeliveryCursor: string | null;
  loading: boolean;
}>();

defineEmits<{ loadMore: [] }>();

const statusLabels: Record<TelegramBroadcastDeliveryStatus, string> = {
  PENDING: "В очереди",
  SENDING: "Отправляется",
  RETRY_WAIT: "Ожидает повтора",
  SENT: "Принято Telegram",
  FAILED_PERMANENT: "Не доставлено",
  OUTCOME_UNKNOWN: "Результат неизвестен",
  SUPPRESSED_LINK: "Исключено: привязка неактивна",
  SUPPRESSED_CONSENT: "Исключено: согласие отозвано",
  SUPPRESSED_INSTALLATION: "Исключено: канал недоступен",
  CANCELLED: "Отменено",
};
const failureLabels: Record<
  NonNullable<TelegramBroadcastDelivery["safeFailureCategory"]>,
  string
> = {
  AMBIGUOUS_PROVIDER_RESULT: "Результат отправки не подтверждён",
  RECIPIENT_UNAVAILABLE: "Получатель недоступен в Telegram",
  PAYLOAD_REJECTED: "Telegram отклонил содержимое",
  RATE_LIMIT_EXHAUSTED: "Лимит повторов исчерпан",
  LINK_NOT_ACTIVE: "Привязка Telegram больше не активна",
  CONSENT_REVOKED: "Явное согласие отозвано или устарело",
  INSTALLATION_UNAVAILABLE: "Telegram-канал проекта недоступен",
  INTERNAL_FAILURE: "Внутренняя ошибка доставки",
  CANCELLED: "Доставка отменена вместе с рассылкой",
};

const cards = (progress: Progress) => [
  ["Зафиксировано", progress.total],
  ["В очереди", progress.pending],
  ["Отправляется", progress.sending],
  ["Принято Telegram", progress.sent],
  ["Ожидает повтора", progress.retryWait],
  ["Результат неизвестен", progress.outcomeUnknown],
  ["Не доставлено", progress.failedPermanent],
  [
    "Исключено",
    progress.suppressedLink +
      progress.suppressedConsent +
      progress.suppressedInstallation,
  ],
  ["Отменено", progress.cancelled],
] as const;
</script>

<template>
  <section class="progress-panel" aria-labelledby="broadcast-progress-title">
    <h2 id="broadcast-progress-title">Ход отправки</h2>
    <div class="progress-grid" aria-label="Счётчики рассылки">
      <div v-for="[label, value] in cards(progress)" :key="label">
        <span>{{ label }}</span>
        <strong>{{ value }}</strong>
      </div>
    </div>
    <p class="delivery-summary">
      Показано {{ deliveries.length }} из {{ deliveryTotal }} результатов.
      Получатели не раскрываются в списке доставки.
    </p>
    <div class="delivery-table" role="table" aria-label="Результаты доставки">
      <div class="delivery-row heading" role="row">
        <span role="columnheader">Доставка</span>
        <span role="columnheader">Статус</span>
        <span role="columnheader">Причина</span>
        <span role="columnheader">Завершено</span>
        <span role="columnheader">Создано</span>
      </div>
      <div
        v-for="delivery in deliveries"
        :key="delivery.id"
        class="delivery-row"
        role="row"
      >
        <span role="cell">•••• {{ delivery.id.slice(-6) }}</span>
        <span role="cell">{{ statusLabels[delivery.status] }}</span>
        <span role="cell">
          {{
            delivery.safeFailureCategory
              ? failureLabels[delivery.safeFailureCategory]
              : "—"
          }}
        </span>
        <time v-if="delivery.finishedAt" role="cell" :datetime="delivery.finishedAt">
          {{ new Date(delivery.finishedAt).toLocaleString("ru-RU") }}
        </time>
        <span v-else role="cell">—</span>
        <time role="cell" :datetime="delivery.createdAt">
          {{ new Date(delivery.createdAt).toLocaleString("ru-RU") }}
        </time>
      </div>
    </div>
    <p v-if="loading" role="status" aria-live="polite">
      Обновляем результаты…
    </p>
    <button
      v-if="nextDeliveryCursor"
      type="button"
      class="secondary-button"
      :disabled="loading"
      @click="$emit('loadMore')"
    >
      Показать ещё
    </button>
  </section>
</template>

<style scoped>
.progress-panel {
  display: grid;
  gap: 16px;
}
.progress-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.progress-grid > div {
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--surface-subtle);
}
.progress-grid span {
  display: block;
  color: var(--text-small-muted);
  font-size: 0.75rem;
}
.progress-grid strong {
  display: block;
  margin-top: 7px;
  font-size: 1.4rem;
}
.delivery-summary {
  margin: 0;
  color: var(--text-small-muted);
}
.delivery-table {
  min-width: 680px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  overflow: hidden;
}
.delivery-row {
  display: grid;
  grid-template-columns: 1fr 1.3fr 1.8fr 1.2fr 1.2fr;
  gap: 12px;
  padding: 11px 12px;
  border-bottom: 1px solid var(--border-subtle);
}
.delivery-row:last-child {
  border-bottom: 0;
}
.delivery-row.heading {
  background: var(--surface-subtle);
  font-size: 0.75rem;
  font-weight: 700;
}
.secondary-button {
  justify-self: start;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: inherit;
  font-weight: 700;
}
@media (max-width: 880px) {
  .progress-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .progress-panel {
    overflow-x: auto;
  }
}
</style>
