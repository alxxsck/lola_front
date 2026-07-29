<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import type {
  EventQueryPolicyItemDto,
  EventQueryRequestDto,
  EventQueryResultResponseDto,
} from "@/shared/api/generated/models";
import { eventQueryRepository } from "../api/event-query-repository";
import { eventQueryPolicyItemFromConfiguration } from "../model/event-query-policy";
import {
  eventQueryPeriodOptions,
  eventQueryTimeRange,
  type EventQueryRange,
} from "../model/event-query-range";

const props = defineProps<{
  projectId: string;
  disabled?: boolean;
}>();

const items = ref<EventQueryPolicyItemDto[]>([]);
const audience = ref<"INTERNAL_AI" | "END_USER_CONVERSATION">("INTERNAL_AI");
const search = ref("");
const nextCursor = ref<string | null>(null);
const loadingCatalog = ref(false);
const catalogError = ref("");
const endUserId = ref("");
const eventCode = ref("");
const mode = ref<"SUMMARY" | "AGGREGATE" | "LATEST">("SUMMARY");
const timeRange = ref<EventQueryRange>("LAST_24_HOURS");
const result = ref<EventQueryResultResponseDto | null>(null);
const loading = ref(false);
const error = ref("");

const selected = computed(() =>
  items.value.find((item) => item.stableCode === eventCode.value),
);
const periodOptions = computed(() => {
  const maxHours = selected.value?.maxInteractiveLookbackHours ?? 24;
  return eventQueryPeriodOptions({ maxHours });
});
const aggregateMetric = computed(() => {
  const field = selected.value?.safeFields.find((candidate) =>
    ["SUM", "AVG", "MIN", "MAX"].some((operation) =>
      candidate.operations.includes(operation as never),
    ),
  );
  if (!field) return { operation: "COUNT" as const };
  const operation = (["SUM", "AVG", "MIN", "MAX"] as const).find((value) =>
    field.operations.includes(value),
  )!;
  return {
    operation,
    field: field.path,
    ...(field.currencyPath ? { currencyField: field.currencyPath } : {}),
  };
});
const aggregateGroupBy = computed(() => {
  const currencyField =
    "currencyField" in aggregateMetric.value
      ? aggregateMetric.value.currencyField
      : undefined;
  return currencyField ? [currencyField] : undefined;
});
const normalizedTimeRange = computed(() => {
  return eventQueryTimeRange(
    timeRange.value,
    selected.value?.maxInteractiveLookbackHours ?? 1,
  );
});
const query = computed<EventQueryRequestDto>(() => ({
  eventCodes: eventCode.value ? [eventCode.value] : [],
  mode: mode.value,
  timeRange: normalizedTimeRange.value,
  ...(mode.value === "AGGREGATE"
    ? {
        metrics: [aggregateMetric.value],
        ...(aggregateGroupBy.value ? { groupBy: aggregateGroupBy.value } : {}),
      }
    : {}),
  ...(mode.value === "LATEST"
    ? {
        fields: selected.value?.safeFields
          .filter((field) => field.operations.includes("PROJECT"))
          .map((field) => field.path),
        limit: 10,
      }
    : {}),
}));

watch(eventCode, () => {
  const allowedModes = selected.value?.allowedModes ?? ["SUMMARY"];
  if (!allowedModes.includes(mode.value)) {
    mode.value = allowedModes[0] ?? "SUMMARY";
  }
  const allowedPeriods = periodOptions.value.map((item) => item.value);
  if (!allowedPeriods.includes(timeRange.value)) {
    timeRange.value = allowedPeriods[0] ?? "POLICY_MAX";
  }
  result.value = null;
  error.value = "";
});

async function loadCatalog(append = false) {
  loadingCatalog.value = true;
  catalogError.value = "";
  try {
    const response = await eventQueryRepository.listItems(props.projectId, {
      audience: audience.value,
      effective: true,
      query: search.value.trim() || undefined,
      limit: 50,
      cursor: append ? (nextCursor.value ?? undefined) : undefined,
    });
    const parsed = response.items.flatMap((candidate) => {
      const item = eventQueryPolicyItemFromConfiguration(
        candidate.eventCode,
        candidate.configuration,
      );
      return item ? [item] : [];
    });
    items.value = append ? [...items.value, ...parsed] : parsed;
    nextCursor.value =
      typeof response.pageInfo.nextCursor === "string"
        ? response.pageInfo.nextCursor
        : null;
    if (!items.value.some((item) => item.stableCode === eventCode.value)) {
      eventCode.value = items.value[0]?.stableCode ?? "";
    }
  } catch (cause) {
    catalogError.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось загрузить каталог доступных событий";
  } finally {
    loadingCatalog.value = false;
  }
}

watch(audience, () => {
  result.value = null;
  error.value = "";
  void loadCatalog();
});
watch(
  () => props.projectId,
  () => {
    items.value = [];
    eventCode.value = "";
    result.value = null;
    void loadCatalog();
  },
);
onMounted(() => void loadCatalog());

async function preview() {
  if (!endUserId.value.trim() || !eventCode.value) return;
  loading.value = true;
  error.value = "";
  result.value = null;
  try {
    result.value = await eventQueryRepository.preview(props.projectId, {
      audience: audience.value,
      endUserId: endUserId.value.trim(),
      query: query.value,
    });
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "Не удалось выполнить preview";
  } finally {
    loading.value = false;
  }
}

function formatBytes(value?: number) {
  if (value === undefined) return "—";
  return value < 1024 ? `${value} Б` : `${(value / 1024).toFixed(1)} КБ`;
}
</script>

<template>
  <section class="preview-panel" aria-labelledby="event-query-preview-title">
    <div class="preview-heading">
      <div>
        <h4 id="event-query-preview-title">Безопасный preview</h4>
        <p>
          Проверяет типизированный запрос для одного пользователя. Исходный
          payload событий не показывается.
        </p>
      </div>
      <span class="readonly-badge">read-only</span>
    </div>
    <div class="catalog-controls">
      <label>
        <span>Режим проверки</span>
        <select v-model="audience" :disabled="disabled || loadingCatalog">
          <option value="INTERNAL_AI">Как внутренний AI-анализ</option>
          <option value="END_USER_CONVERSATION">
            Как ответ пользователю в Chat/Voice
          </option>
        </select>
      </label>
      <label>
        <span>Поиск события</span>
        <input
          v-model="search"
          data-test="preview-event-search"
          placeholder="Название или код"
          :disabled="disabled || loadingCatalog"
          @keydown.enter.prevent="loadCatalog()"
        />
      </label>
      <Button
        label="Найти"
        severity="secondary"
        :loading="loadingCatalog"
        :disabled="disabled"
        @click="loadCatalog()"
      />
    </div>
    <Message v-if="catalogError" severity="error" :closable="false">
      {{ catalogError }}
    </Message>
    <Message v-if="error" severity="error" :closable="false">{{
      error
    }}</Message>
    <div class="preview-form">
      <label>
        <span>End User ID</span>
        <input
          data-test="preview-end-user"
          v-model="endUserId"
          autocomplete="off"
          placeholder="UUID пользователя"
          :disabled="disabled || loading"
        />
      </label>
      <label>
        <span>Тип события</span>
        <select
          data-test="preview-event"
          v-model="eventCode"
          :disabled="disabled || loading || !items.length"
        >
          <option value="">Выберите событие</option>
          <option
            v-for="item in items"
            :key="item.stableCode"
            :value="item.stableCode"
          >
            {{ item.stableCode }}
          </option>
        </select>
      </label>
      <label>
        <span>Режим</span>
        <select
          v-model="mode"
          data-test="preview-mode"
          :disabled="disabled || loading"
        >
          <option
            v-for="value in selected?.allowedModes ?? ['SUMMARY']"
            :key="value"
            :value="value"
          >
            {{ value }}
          </option>
        </select>
      </label>
      <label>
        <span>Период</span>
        <select
          v-model="timeRange"
          data-test="preview-period"
          :disabled="disabled || loading"
        >
          <option
            v-for="option in periodOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
    </div>
    <Button
      v-if="nextCursor"
      label="Показать ещё события"
      text
      severity="secondary"
      :loading="loadingCatalog"
      @click="loadCatalog(true)"
    />
    <Button
      label="Выполнить preview"
      icon="pi pi-search"
      severity="secondary"
      :loading="loading"
      :disabled="disabled || !endUserId.trim() || !eventCode"
      @click="preview"
    />

    <div v-if="result" class="preview-result">
      <div class="query-summary">
        <strong>Отправленный типизированный запрос</strong>
        <code>{{ JSON.stringify(query) }}</code>
      </div>
      <div class="metric-grid">
        <div>
          <span>Статус</span><strong>{{ result.status }}</strong>
        </div>
        <div>
          <span>Найдено</span><strong>{{ result.matchedCount ?? "—" }}</strong>
        </div>
        <div>
          <span>Безопасный результат</span
          ><strong>{{ formatBytes(result.serializedBytes) }}</strong>
        </div>
        <div>
          <span>Оценка вклада</span
          ><strong
            >{{
              result.estimatedAddedInputTokens?.toLocaleString("ru-RU") ?? "—"
            }}
            токенов</strong
          >
        </div>
      </div>
      <Message v-if="result.truncated" severity="warn" :closable="false">
        Результат усечён серверным лимитом.
      </Message>
      <ul v-if="result.limitations.length">
        <li v-for="limitation in result.limitations" :key="limitation">
          {{ limitation }}
        </li>
      </ul>
      <details
        v-if="
          result.rows?.length ||
          result.summaries?.length ||
          result.groups?.length
        "
      >
        <summary>Показать безопасный результат</summary>
        <pre>{{ result.rows ?? result.summaries ?? result.groups }}</pre>
      </details>
    </div>
  </section>
</template>

<style scoped>
.preview-panel {
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--border-default);
  border-radius: 16px;
  background: var(--surface-subtle);
}
.preview-heading {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.preview-heading h4,
.preview-heading p {
  margin: 0;
}
.preview-heading p {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 0.76rem;
}
.readonly-badge {
  align-self: start;
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--status-success-soft);
  color: var(--status-success-text);
  font-size: 0.68rem;
  font-weight: 700;
}
.preview-form,
.catalog-controls,
.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.catalog-controls {
  grid-template-columns: minmax(220px, 1fr) minmax(220px, 1fr) auto;
  align-items: end;
}
.preview-form label,
.catalog-controls label {
  display: grid;
  gap: 6px;
}
.preview-form label span,
.catalog-controls label span {
  color: var(--text-secondary);
  font-size: 0.68rem;
}
.preview-form input,
.preview-form select,
.catalog-controls input,
.catalog-controls select {
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-primary);
}
.preview-result,
.query-summary {
  display: grid;
  gap: 10px;
}
.query-summary code,
.preview-result pre {
  overflow: auto;
  padding: 10px;
  border-radius: 10px;
  background: var(--surface-card);
  white-space: pre-wrap;
  word-break: break-word;
}
.metric-grid > div {
  padding: 12px;
  border-radius: 12px;
  background: var(--surface-card);
}
.metric-grid span,
.metric-grid strong {
  display: block;
}
.metric-grid span {
  color: var(--text-tertiary);
  font-size: 0.68rem;
}
@media (max-width: 900px) {
  .preview-form,
  .catalog-controls,
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 560px) {
  .preview-form,
  .catalog-controls,
  .metric-grid {
    grid-template-columns: 1fr;
  }
}
</style>
