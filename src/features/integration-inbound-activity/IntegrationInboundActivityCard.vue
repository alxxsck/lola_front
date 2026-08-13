<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type {
  IntegrationIngressActivityItemDto,
  IntegrationIngressHealthResponseDto,
} from '@/shared/api/generated/models';
import type { InboundIntegrationProvider } from '@/features/integration-inbound-connections/integration-inbound-connections.api';
import { integrationInboundActivityApi } from './integration-inbound-activity.api';
import TablePagination from '@/shared/ui/TablePagination.vue';

const props = defineProps<{
  projectId: string;
  provider: InboundIntegrationProvider;
  canReadActivity: boolean;
}>();
const health = ref<IntegrationIngressHealthResponseDto | null>(null);
const activity = ref<IntegrationIngressActivityItemDto[]>([]);
const loading = ref(false);
const error = ref('');
const activityPage = ref(1);
let epoch = 0;
const PAGE_SIZE = 10;
const visibleActivity = computed(() => {
  const start = (activityPage.value - 1) * PAGE_SIZE;
  return activity.value.slice(start, start + PAGE_SIZE);
});

watch(
  () => activity.value.length,
  (total) => {
    activityPage.value = Math.min(activityPage.value, Math.max(1, Math.ceil(total / PAGE_SIZE)));
  },
);

function healthLabel(value: string): string {
  return (
    {
      HEALTHY: 'Работает нормально',
      DEGRADED: 'Требует внимания',
      UNHEALTHY: 'Есть ошибки',
      UNKNOWN: 'Нет данных',
    }[value] ?? value
  );
}

function activityStatusLabel(value: string): string {
  return (
    {
      RECEIVED: 'Получено',
      PROCESSING: 'Обрабатывается',
      ACCEPTED: 'Принято',
      RETRY_WAIT: 'Ожидает повтора',
      QUARANTINED: 'Изолировано',
      FAILED_PERMANENT: 'Ошибка',
      DUPLICATE: 'Дубликат',
    }[value] ?? value
  );
}

function reasonLabel(value: string): string {
  return (
    {
      BACKLOG_SLO_BREACHED: 'Очередь обрабатывается дольше нормы',
      RECENT_PROCESSING_ERRORS: 'Недавние ошибки обработки',
      CREDENTIAL_COMPROMISED: 'Секрет подключения скомпрометирован',
      CREDENTIAL_UNAVAILABLE: 'Секрет подключения недоступен',
      CANONICAL_CONFLICTS: 'Конфликты одинаковых событий',
    }[value] ?? value
  );
}

async function load(): Promise<void> {
  const current = ++epoch;
  health.value = null;
  activity.value = [];
  activityPage.value = 1;
  if (!props.projectId || !props.canReadActivity) return;
  loading.value = true;
  error.value = '';
  try {
    const [activityResponse, healthResponse] = await Promise.all([
      integrationInboundActivityApi.list(props.projectId, props.provider),
      integrationInboundActivityApi.health(props.projectId, props.provider),
    ]);
    if (current !== epoch) return;
    activity.value = activityResponse.items;
    health.value = healthResponse;
  } catch {
    if (current === epoch) error.value = 'Не удалось загрузить безопасную входящую активность.';
  } finally {
    if (current === epoch) loading.value = false;
  }
}

watch(
  () => [props.projectId, props.provider, props.canReadActivity] as const,
  () => void load(),
);
onMounted(() => void load());
</script>

<template>
  <section v-if="canReadActivity" class="integration-card inbound-activity-card">
    <div class="card-heading">
      <div>
        <h2>
          Входящая активность
          {{ provider === 'AMPLITUDE' ? 'Amplitude' : 'Customer.io' }}
        </h2>
        <p>Статистика приёма без содержимого событий, подписей и секретов.</p>
      </div>
      <span v-if="health" class="status" :data-status="health.health">
        {{ healthLabel(health.health) }}
      </span>
    </div>
    <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
    <p v-if="loading" class="empty-state">Загружаем активность…</p>
    <template v-else>
      <dl v-if="health" class="integration-facts health-facts">
        <div>
          <dt>В очереди</dt>
          <dd>{{ health.backlog.count }}</dd>
        </div>
        <div>
          <dt>Ошибки обработки</dt>
          <dd>{{ health.processing.recentErrors }}</dd>
        </div>
        <div>
          <dt>Дубликаты</dt>
          <dd>{{ health.retainedEvidence.duplicates }}</dd>
        </div>
        <div>
          <dt>Причины</dt>
          <dd>{{ health.reasons.map(reasonLabel).join(', ') || 'Нет' }}</dd>
        </div>
      </dl>
      <section v-if="activity.length" class="integration-records">
        <div class="integration-records__header">
          <div>
            <h3>Последние принятые события</h3>
            <p>
              {{ activity.length === 100 ? 'Последние 100 записей' : `${activity.length} записей` }}
              · по 10 на странице
            </p>
          </div>
        </div>
        <div class="integration-table-wrap">
          <table class="integration-table">
            <thead>
              <tr>
                <th>Событие</th>
                <th>Статус</th>
                <th>Попытки</th>
                <th>Дубликаты</th>
                <th>Получено</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in visibleActivity" :key="item.id" data-activity-row>
                <td>
                  <code>{{ item.providerEventName }}</code>
                </td>
                <td>
                  {{ activityStatusLabel(item.status)
                  }}<small v-if="item.failureCode"> · {{ item.failureCode }}</small>
                </td>
                <td>{{ item.attemptCount }}</td>
                <td>{{ item.duplicateCount }}</td>
                <td>{{ new Date(item.receivedAt).toLocaleString('ru-RU') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <TablePagination
          v-model:page="activityPage"
          :total="activity.length"
          :page-size="PAGE_SIZE"
          previous-label="Предыдущая страница входящих событий"
          next-label="Следующая страница входящих событий"
        />
      </section>
      <p v-else class="empty-state">Входящих событий пока нет.</p>
    </template>
  </section>
</template>

<style scoped>
.inbound-activity-card {
  display: grid;
  gap: 14px;
}
.card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.health-facts {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
@media (max-width: 700px) {
  .card-heading {
    align-items: stretch;
    flex-direction: column;
  }
  .health-facts {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
