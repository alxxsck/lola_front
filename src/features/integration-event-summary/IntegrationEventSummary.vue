<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type {
  IntegrationEventRouteSummaryItemDto,
  IntegrationEventRouteSummaryResponseDto,
} from '@/shared/api/generated/models';
import { integrationEventSummaryApi } from './integration-event-summary.api';

const props = defineProps<{
  projectId: string;
  eventDefinitionKeyId: string;
  canRead: boolean;
}>();

const summary = ref<IntegrationEventRouteSummaryResponseDto | null>(null);
const loading = ref(false);
const error = ref('');
let requestId = 0;

function policyLabel(mode: string): string {
  return (
    {
      NONE: 'Не настроена',
      SINGLE_SOURCE: 'Единственный источник',
      CANONICAL_KEY: 'Несколько источников по canonical key',
    }[mode] ?? mode
  );
}

function directionLabel(direction: string): string {
  return direction === 'INBOUND' ? 'Приём' : 'Отправка';
}

function compatibilityLabel(compatibility: string): string {
  return (
    {
      CURRENT: 'Актуальная схема',
      REQUIRES_REPUBLISH: 'Требуется перепубликация',
      NOT_PUBLISHED: 'Не опубликован',
    }[compatibility] ?? compatibility
  );
}

function warningLabel(warning: string): string {
  return (
    {
      CONNECTION_NOT_ACTIVE: 'Подключение не активно',
      CONNECTION_UNHEALTHY: 'Подключение работает нестабильно',
      ROUTE_NOT_ACTIVE: 'Маршрут не активен',
      ROUTE_NOT_PUBLISHED: 'Маршрут не опубликован',
      ROUTE_DISABLED: 'Маршрут выключен',
      EVENT_SCHEMA_REVISION_STALE: 'Маршрут использует устаревшую схему события',
    }[warning] ?? warning
  );
}

function routeStatus(route: IntegrationEventRouteSummaryItemDto): string {
  if (route.routeLifecycle === 'ARCHIVED') return 'В архиве';
  if (route.enabled) return 'Включён';
  if (route.publishedRevision === null) return 'Черновик';
  return 'Остановлен';
}

async function load(): Promise<void> {
  const current = ++requestId;
  summary.value = null;
  error.value = '';
  if (!props.canRead || !props.projectId || !props.eventDefinitionKeyId) {
    loading.value = false;
    return;
  }
  const projectId = props.projectId;
  const eventDefinitionKeyId = props.eventDefinitionKeyId;
  loading.value = true;
  try {
    const response = await integrationEventSummaryApi.get(projectId, eventDefinitionKeyId);
    if (
      current !== requestId ||
      projectId !== props.projectId ||
      eventDefinitionKeyId !== props.eventDefinitionKeyId ||
      !props.canRead
    )
      return;
    if (response.eventDefinitionKeyId !== eventDefinitionKeyId) {
      throw new Error('Unexpected Event Definition integration summary');
    }
    summary.value = response;
  } catch {
    if (
      current === requestId &&
      projectId === props.projectId &&
      eventDefinitionKeyId === props.eventDefinitionKeyId &&
      props.canRead
    ) {
      error.value = 'Не удалось загрузить интеграции события.';
    }
  } finally {
    if (current === requestId) loading.value = false;
  }
}

watch(
  () => [props.projectId, props.eventDefinitionKeyId, props.canRead] as const,
  () => void load(),
);
onMounted(() => void load());
onBeforeUnmount(() => {
  requestId += 1;
});
</script>

<template>
  <section
    v-if="canRead"
    class="event-integration-summary card"
    data-test="event-integration-summary"
    aria-labelledby="event-integration-summary-title"
  >
    <header class="summary-heading">
      <div>
        <span>Маршруты и состояние</span>
        <h2 id="event-integration-summary-title">Интеграции события</h2>
        <p>Настройки доступны только в разделе интеграций проекта.</p>
      </div>
      <span v-if="summary" class="policy-badge">
        {{ policyLabel(summary.ingressPolicy.mode) }}
        <small v-if="summary.ingressPolicy.policyRevisionId">
          · policy {{ summary.ingressPolicy.policyRevisionId }}
        </small>
      </span>
    </header>

    <p v-if="loading" class="summary-state" aria-live="polite">Загружаем интеграции события…</p>
    <div v-else-if="error" class="summary-state error" role="alert">
      <span>{{ error }}</span>
      <button type="button" class="secondary-button" @click="load">Повторить</button>
    </div>
    <template v-else-if="summary">
      <p v-if="!summary.routes.length" class="summary-state">Маршруты интеграций не настроены.</p>
      <div v-else class="summary-routes">
        <article
          v-for="route in summary.routes"
          :key="route.routeId"
          class="summary-route"
          :data-direction="route.direction"
        >
          <div class="route-heading">
            <div>
              <span>{{ directionLabel(route.direction) }} · {{ route.provider }}</span>
              <h3>{{ route.connectionDisplayName }}</h3>
              <strong
                v-if="summary.ingressPolicy.authoritativeRouteId === route.routeId"
                class="authoritative-label"
              >
                Авторитетный источник
              </strong>
            </div>
            <span class="route-status">{{ routeStatus(route) }}</span>
          </div>
          <dl>
            <div>
              <dt>Подключение</dt>
              <dd>{{ route.connectionLifecycle }} · {{ route.connectionHealth }}</dd>
            </div>
            <div>
              <dt>Ревизия маршрута</dt>
              <dd>{{ route.publishedRevision ?? '—' }}</dd>
            </div>
            <div>
              <dt>Совместимость схемы</dt>
              <dd>{{ compatibilityLabel(route.schemaCompatibility) }}</dd>
            </div>
          </dl>
          <ul v-if="route.warnings.length" class="route-warnings">
            <li v-for="warning in route.warnings" :key="warning">
              {{ warningLabel(warning) }}
            </li>
          </ul>
        </article>
      </div>

      <router-link
        v-if="summary.manageTarget.workspace === 'PROJECT_INTEGRATIONS'"
        :to="{
          name: 'project-integrations',
          query: { eventDefinitionKeyId },
        }"
        class="manage-link"
      >
        Управлять в интеграциях проекта
        <i class="pi pi-arrow-right" aria-hidden="true" />
      </router-link>
    </template>
  </section>
</template>

<style scoped>
.event-integration-summary {
  grid-column: 1 / -1;
  display: grid;
  gap: 16px;
  padding: 22px;
}
.summary-heading,
.route-heading,
.manage-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.summary-heading span,
.route-heading span,
dt {
  color: var(--text-secondary);
  font-size: 0.72rem;
}
.authoritative-label {
  display: inline-block;
  margin-top: 6px;
  color: var(--accent-primary);
  font-size: 0.7rem;
}
.summary-heading h2,
.summary-heading p,
.route-heading h3 {
  margin: 4px 0 0;
}
.summary-routes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.summary-route {
  display: grid;
  gap: 12px;
  min-width: 0;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  padding: 16px;
}
.summary-route dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}
.summary-route dl > div {
  min-width: 0;
}
.summary-route dd {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
}
.route-warnings {
  display: grid;
  gap: 5px;
  margin: 0;
  padding-left: 20px;
  color: var(--status-warning-text, var(--text-secondary));
}
.policy-badge,
.route-status {
  border-radius: 999px;
  background: var(--surface-active);
  padding: 6px 10px;
  white-space: nowrap;
}
.summary-state {
  margin: 0;
  color: var(--text-secondary);
}
.summary-state.error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--status-danger);
}
.manage-link {
  justify-self: end;
  color: var(--accent-primary);
  font-weight: 700;
  text-decoration: none;
}
@media (max-width: 900px) {
  .summary-routes,
  .summary-route dl {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 620px) {
  .summary-heading,
  .route-heading,
  .summary-state.error {
    align-items: stretch;
    flex-direction: column;
  }
  .policy-badge,
  .route-status {
    align-self: start;
  }
  .manage-link {
    justify-self: stretch;
  }
}
</style>
