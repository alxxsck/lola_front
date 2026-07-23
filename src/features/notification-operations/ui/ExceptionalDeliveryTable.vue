<script setup lang="ts">
import {
  canReplayNotificationDelivery,
  type NotificationOperationsDelivery,
  type NotificationOperationsPermissions,
} from "../model/notification-operations";

defineProps<{
  items: NotificationOperationsDelivery[];
  permissions: NotificationOperationsPermissions;
  nextCursor: string | null;
  loading: boolean;
}>();

defineEmits<{
  replay: [deliveryId: string];
  loadMore: [];
}>();

const statusLabels: Record<string, string> = {
  REJECTED: "Отклонена",
  OUTCOME_UNKNOWN: "Результат неизвестен",
  DEAD_LETTER: "Dead letter",
  CANCELLED: "Отменена",
  SUPPRESSED: "Подавлена",
  OTHER: "Другое",
};

const eligibilityLabels = {
  ELIGIBLE_KNOWN_NOT_ACCEPTED: "Можно вернуть в очередь",
  INELIGIBLE_AMBIGUOUS: "Нельзя: результат неоднозначен",
  INELIGIBLE_ACCEPTED: "Нельзя: provider мог принять",
  INELIGIBLE_CHANNEL: "Нельзя: канал не поддерживает replay",
  INELIGIBLE_DESTINATION_CHANGED: "Нельзя: routing или secret изменён",
  INELIGIBLE_STATE: "Нельзя: состояние не соответствует policy",
} as const;

const channelLabels = {
  SLACK_WEBHOOK: "Slack",
  TELEGRAM_OPERATIONAL: "Telegram operational",
} as const;

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("ru-RU")
    : "Недоступно";
}
</script>

<template>
  <section class="table-panel" aria-labelledby="exceptional-deliveries-title">
    <div>
      <h2 id="exceptional-deliveries-title">Исключительные доставки</h2>
      <p>
        Replay доступен только когда Lola доказала, что provider не принял
        operational delivery.
      </p>
    </div>
    <p v-if="loading && !items.length" role="status" aria-live="polite">
      Загружаем доставки…
    </p>
    <div
      v-else
      class="table-scroll"
      tabindex="0"
      aria-label="Таблица исключительных доставок"
    >
      <table>
        <thead>
          <tr>
            <th scope="col">Delivery</th>
            <th scope="col">Project UUID</th>
            <th scope="col">Канал</th>
            <th scope="col">Статус</th>
            <th scope="col">Безопасная причина</th>
            <th scope="col">Попытки</th>
            <th scope="col">Replay policy</th>
            <th scope="col">Обновлено</th>
            <th scope="col">Действие</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="delivery in items" :key="delivery.id">
            <td>
              <code>{{ delivery.id }}</code>
            </td>
            <td>
              <code>{{ delivery.projectId }}</code>
            </td>
            <td>{{ channelLabels[delivery.channel] }}</td>
            <td>{{ statusLabels[delivery.status] ?? statusLabels.OTHER }}</td>
            <td>{{ delivery.errorCategory }}</td>
            <td>{{ delivery.attemptCount }}</td>
            <td>{{ eligibilityLabels[delivery.replayEligibility] }}</td>
            <td>{{ formatDate(delivery.updatedAt) }}</td>
            <td>
              <button
                v-if="canReplayNotificationDelivery(delivery, permissions)"
                type="button"
                class="action-button"
                :aria-label="`Повторить доставку ${delivery.id}`"
                @click="$emit('replay', delivery.id)"
              >
                Вернуть в очередь
              </button>
              <span v-else>Недоступно</span>
            </td>
          </tr>
          <tr v-if="!items.length">
            <td colspan="9">Исключительных доставок нет.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <button
      v-if="nextCursor"
      type="button"
      class="secondary-button"
      :disabled="loading"
      @click="$emit('loadMore')"
    >
      Показать ещё доставки
    </button>
  </section>
</template>

<style scoped>
.table-panel {
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--border-default);
  border-radius: 16px;
  background: var(--surface-card);
}
h2,
p {
  margin: 0;
}
p {
  margin-top: 5px;
  color: var(--text-small-muted);
}
.table-scroll {
  overflow-x: auto;
}
table {
  width: 100%;
  min-width: 1180px;
  border-collapse: collapse;
}
th,
td {
  padding: 11px 10px;
  border-bottom: 1px solid var(--border-subtle);
  text-align: left;
  vertical-align: top;
}
th {
  color: var(--text-small-muted);
  font-size: 0.72rem;
}
code {
  font-size: 0.72rem;
  overflow-wrap: anywhere;
}
.action-button,
.secondary-button {
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border-default);
  border-radius: 9px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.action-button {
  border-color: var(--status-warning);
}
.secondary-button {
  justify-self: start;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
