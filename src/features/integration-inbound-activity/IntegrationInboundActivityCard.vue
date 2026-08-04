<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import type {
  IntegrationIngressActivityItemDto,
  IntegrationIngressHealthResponseDto,
} from "@/shared/api/generated/models";
import type { InboundIntegrationProvider } from "@/features/integration-inbound-connections/integration-inbound-connections.api";
import { integrationInboundActivityApi } from "./integration-inbound-activity.api";

const props = defineProps<{
  projectId: string;
  provider: InboundIntegrationProvider;
  canReadActivity: boolean;
}>();
const health = ref<IntegrationIngressHealthResponseDto | null>(null);
const activity = ref<IntegrationIngressActivityItemDto[]>([]);
const loading = ref(false);
const error = ref("");
let epoch = 0;

async function load(): Promise<void> {
  const current = ++epoch;
  health.value = null;
  activity.value = [];
  if (!props.projectId || !props.canReadActivity) return;
  loading.value = true;
  error.value = "";
  try {
    const [activityResponse, healthResponse] = await Promise.all([
      integrationInboundActivityApi.list(props.projectId, props.provider),
      integrationInboundActivityApi.health(props.projectId, props.provider),
    ]);
    if (current !== epoch) return;
    activity.value = activityResponse.items;
    health.value = healthResponse;
  } catch {
    if (current === epoch)
      error.value = "Не удалось загрузить безопасную входящую активность.";
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
  <section
    v-if="canReadActivity"
    class="integration-card inbound-activity-card"
  >
    <div class="card-heading">
      <div>
        <h2>
          Входящая активность
          {{ provider === "AMPLITUDE" ? "Amplitude" : "Customer.io" }}
        </h2>
        <p>
          Только безопасные метаданные: payload, подписи и delivery key не
          показываются.
        </p>
      </div>
      <span v-if="health" class="status" :data-status="health.health">{{
        health.health
      }}</span>
    </div>
    <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
    <p v-if="loading" class="empty-state">Загружаем активность…</p>
    <template v-else>
      <dl v-if="health" class="integration-facts health-facts">
        <div>
          <dt>Backlog</dt>
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
          <dd>{{ health.reasons.join(", ") || "Нет" }}</dd>
        </div>
      </dl>
      <div v-if="activity.length" class="activity-table-wrap">
        <table>
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
            <tr v-for="item in activity" :key="item.id">
              <td>
                <code>{{ item.providerEventName }}</code>
              </td>
              <td>
                {{ item.status
                }}<small v-if="item.failureCode">
                  · {{ item.failureCode }}</small
                >
              </td>
              <td>{{ item.attemptCount }}</td>
              <td>{{ item.duplicateCount }}</td>
              <td>{{ new Date(item.receivedAt).toLocaleString("ru-RU") }}</td>
            </tr>
          </tbody>
        </table>
      </div>
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
