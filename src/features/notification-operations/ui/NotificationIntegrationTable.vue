<script setup lang="ts">
import {
  canQuarantineNotificationIntegration,
  type NotificationOperationsIntegration,
  type NotificationOperationsPermissions,
} from "../model/notification-operations";

defineProps<{
  items: NotificationOperationsIntegration[];
  permissions: NotificationOperationsPermissions;
  nextCursor: string | null;
  loading: boolean;
}>();

defineEmits<{
  quarantine: [integrationId: string];
  loadMore: [];
}>();

const kindLabels = {
  SLACK_DESTINATION: "Slack destination",
  TELEGRAM_OPERATIONAL_DESTINATION: "Telegram operational destination",
  TELEGRAM_PRODUCT_INSTALLATION: "Telegram product installation",
} as const;
</script>

<template>
  <section
    class="table-panel"
    aria-labelledby="notification-integrations-title"
  >
    <div>
      <h2 id="notification-integrations-title">Интеграции для quarantine</h2>
      <p>
        Только server-issued masked identity. Credential и destination address
        не раскрываются.
      </p>
    </div>
    <p v-if="loading && !items.length" role="status" aria-live="polite">
      Загружаем интеграции…
    </p>
    <div
      v-else
      class="table-scroll"
      tabindex="0"
      aria-label="Таблица интеграций для quarantine"
    >
      <table>
        <thead>
          <tr>
            <th scope="col">Тип</th>
            <th scope="col">Project UUID</th>
            <th scope="col">Masked identity</th>
            <th scope="col">Статус</th>
            <th scope="col">Действие</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="integration in items"
            :key="`${integration.kind}:${integration.integrationId}`"
          >
            <td>{{ kindLabels[integration.kind] }}</td>
            <td>
              <code>{{ integration.projectId }}</code>
            </td>
            <td>
              <code>{{ integration.maskedIdentity }}</code>
            </td>
            <td>{{ integration.status }}</td>
            <td>
              <button
                v-if="
                  canQuarantineNotificationIntegration(integration, permissions)
                "
                type="button"
                class="danger-button"
                :aria-label="`Поместить в карантин ${integration.maskedIdentity}`"
                @click="$emit('quarantine', integration.integrationId)"
              >
                Карантин
              </button>
              <span v-else>Недоступно</span>
            </td>
          </tr>
          <tr v-if="!items.length">
            <td colspan="5">Интеграции не найдены.</td>
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
      Показать ещё интеграции
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
  min-width: 840px;
  border-collapse: collapse;
}
th,
td {
  padding: 11px 10px;
  border-bottom: 1px solid var(--border-subtle);
  text-align: left;
}
th {
  color: var(--text-small-muted);
  font-size: 0.72rem;
}
code {
  overflow-wrap: anywhere;
}
.danger-button,
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
.danger-button {
  border-color: var(--status-danger);
  color: var(--status-danger-text);
}
.secondary-button {
  justify-self: start;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
