<script setup lang="ts">
import type { NotificationOperationsHealth } from "../model/notification-operations";

defineProps<{
  health: NotificationOperationsHealth | null;
  loading: boolean;
}>();

const providerLabels = {
  SLACK_WEBHOOK: "Slack",
  TELEGRAM_OPERATIONAL: "Telegram operational",
  TELEGRAM_PRODUCT: "Telegram product",
} as const;

const providerStateLabels = {
  HEALTHY: "Работает",
  DEGRADED: "Деградация",
  STOPPED: "Остановлен",
} as const;

const queueLabels = {
  OPERATIONAL_NOTIFICATION: "Operational notification",
  TELEGRAM_PERSONAL: "Telegram personal",
  TELEGRAM_BROADCAST: "Telegram broadcast",
  OTHER: "Другая очередь",
} as const;

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds} сек.`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)} мин.`;
  return `${Math.floor(seconds / 3_600)} ч.`;
}

function formatDate(value: string | null): string {
  if (!value) return "Ещё не выполнялась";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("ru-RU")
    : "Недоступно";
}
</script>

<template>
  <section class="health-panel" aria-labelledby="notification-health-title">
    <div class="section-heading">
      <div>
        <h2 id="notification-health-title">Здоровье доставки</h2>
        <p>Без получателей, содержимого сообщений и provider credentials.</p>
      </div>
      <time v-if="health" :datetime="health.observedAt">
        Снимок {{ formatDate(health.observedAt) }}
      </time>
    </div>
    <p v-if="loading && !health" role="status" aria-live="polite">
      Загружаем безопасный снимок…
    </p>
    <template v-else-if="health">
      <div class="metric-grid" aria-label="Сводные показатели доставки">
        <article>
          <span>Постоянные ошибки</span
          ><strong>{{ health.permanentCount }}</strong>
        </article>
        <article>
          <span>Неоднозначный результат</span
          ><strong>{{ health.ambiguousCount }}</strong>
        </article>
        <article>
          <span>Подавлено</span><strong>{{ health.suppressedCount }}</strong>
        </article>
        <article>
          <span>Dead letter</span><strong>{{ health.deadLetterCount }}</strong>
        </article>
      </div>

      <div class="health-details">
        <section aria-labelledby="provider-health-title">
          <h3 id="provider-health-title">Provider circuits</h3>
          <ul>
            <li v-for="provider in health.providers" :key="provider.channel">
              <span>{{ providerLabels[provider.channel] }}</span>
              <strong :data-state="provider.state">{{
                providerStateLabels[provider.state]
              }}</strong>
            </li>
          </ul>
        </section>
        <section aria-labelledby="quota-health-title">
          <h3 id="quota-health-title">Telegram admission</h3>
          <ul>
            <li
              v-for="admission in health.telegramProductAdmission"
              :key="admission.scope"
            >
              <span>{{ admission.scope }}</span>
              <strong>
                {{ admission.exhaustedBucketCount }} exhausted · максимум
                {{ admission.maximumRetryDelaySeconds }} сек.
              </strong>
            </li>
            <li v-if="!health.telegramProductAdmission.length">
              <span>Лимиты</span><strong>Нет истощённых buckets</strong>
            </li>
          </ul>
        </section>
      </div>

      <div
        class="table-scroll"
        tabindex="0"
        aria-label="Таблица здоровья очередей доставки"
      >
        <table>
          <caption>
            Очереди и попытки за окно наблюдения
          </caption>
          <thead>
            <tr>
              <th scope="col">Очередь</th>
              <th scope="col">Канал</th>
              <th scope="col">Статус</th>
              <th scope="col">Количество</th>
              <th scope="col">Самая старая</th>
              <th scope="col">Попытки</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(queue, index) in health.queues"
              :key="`${queue.queueKind}:${queue.channel}:${queue.status}:${index}`"
            >
              <td>{{ queueLabels[queue.queueKind] }}</td>
              <td>{{ queue.channel }}</td>
              <td>{{ queue.status }}</td>
              <td>{{ queue.count }}</td>
              <td>{{ formatAge(queue.oldestAgeSeconds) }}</td>
              <td>{{ queue.attemptsInWindow }}</td>
            </tr>
            <tr v-if="!health.queues.length">
              <td colspan="6">Очереди пусты.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <section class="retention" aria-labelledby="retention-health-title">
        <div>
          <h3 id="retention-health-title">Retention · только просмотр</h3>
          <p>
            Сколько записей будет необратимо очищено следующими bounded batches.
          </p>
        </div>
        <dl>
          <div>
            <dt>Notification payload</dt>
            <dd>{{ health.retention.notificationPayloadBacklog }}</dd>
          </div>
          <div>
            <dt>Personal content</dt>
            <dd>{{ health.retention.personalContentBacklog }}</dd>
          </div>
          <div>
            <dt>Broadcast content</dt>
            <dd>{{ health.retention.broadcastContentBacklog }}</dd>
          </div>
          <div>
            <dt>Link secrets</dt>
            <dd>{{ health.retention.linkSecretBacklog }}</dd>
          </div>
          <div>
            <dt>Operational evidence</dt>
            <dd>{{ health.retention.operationalEvidenceBacklog }}</dd>
          </div>
        </dl>
        <p>
          Последний успешный batch:
          {{ formatDate(health.retention.lastSuccessfulBatchAt) }}
        </p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.health-panel,
.health-details section,
.retention {
  display: grid;
  gap: 16px;
}
.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.section-heading h2,
.health-details h3,
.retention h3 {
  margin: 0;
}
.section-heading p,
.retention p {
  margin: 5px 0 0;
  color: var(--text-small-muted);
}
.section-heading time {
  color: var(--text-small-muted);
  font-size: 0.78rem;
}
.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.metric-grid article,
.health-details section,
.retention {
  padding: 16px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--surface-card);
}
.metric-grid span {
  display: block;
  color: var(--text-small-muted);
  font-size: 0.76rem;
}
.metric-grid strong {
  display: block;
  margin-top: 7px;
  font-size: 1.45rem;
}
.health-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.health-details ul {
  display: grid;
  gap: 9px;
  padding: 0;
  margin: 0;
  list-style: none;
}
.health-details li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.health-details strong {
  text-align: right;
}
[data-state="DEGRADED"] {
  color: var(--status-warning-text);
}
[data-state="STOPPED"] {
  color: var(--status-danger-text);
}
.table-scroll {
  overflow-x: auto;
}
table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
}
caption {
  padding: 0 0 10px;
  color: var(--text-small-muted);
  text-align: left;
}
th,
td {
  padding: 11px 12px;
  border-bottom: 1px solid var(--border-subtle);
  text-align: left;
}
th {
  color: var(--text-small-muted);
  font-size: 0.75rem;
}
.retention dl {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}
.retention dl div {
  padding: 10px;
  border-radius: 10px;
  background: var(--surface-subtle);
}
.retention dt {
  color: var(--text-small-muted);
  font-size: 0.7rem;
}
.retention dd {
  margin: 5px 0 0;
  font-weight: 800;
}
@media (max-width: 800px) {
  .metric-grid,
  .health-details {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .retention dl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 520px) {
  .section-heading,
  .health-details li {
    flex-direction: column;
  }
  .metric-grid,
  .health-details,
  .retention dl {
    grid-template-columns: 1fr;
  }
  .health-details strong {
    text-align: left;
  }
}
</style>
