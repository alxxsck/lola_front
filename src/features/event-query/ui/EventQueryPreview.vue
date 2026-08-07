<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import EventPicker, {
  type EventPickerOption,
  type EventPickerPage,
  type EventPickerRequest,
} from "@/features/events/EventPicker.vue";
import type {
  EventQueryPolicyItemDto,
  EventQueryRequestDto,
  EventQueryResultResponseDto,
} from "@/shared/api/generated/models";
import {
  endUserProfileRepository,
  type ResolvedEndUserIdentity,
} from "@/features/end-user-profile/api/end-user-profile-repository";
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
const eventNames = ref<Record<string, string>>({});
const audience = ref<"INTERNAL_AI" | "END_USER_CONVERSATION">("INTERNAL_AI");
const loadingCatalog = ref(false);
const catalogError = ref("");
const endUserId = ref("");
const resolvedIdentity = ref<ResolvedEndUserIdentity | null>(null);
const eventCode = ref("");
const mode = ref<"SUMMARY" | "AGGREGATE" | "LATEST">("SUMMARY");
const timeRange = ref<EventQueryRange>("LAST_24_HOURS");
const result = ref<EventQueryResultResponseDto | null>(null);
const loading = ref(false);
const error = ref("");
let catalogScope = 0;
let catalogRequestGeneration = 0;

const selected = computed(() =>
  items.value.find((item) => item.stableCode === eventCode.value),
);
const selectedEventOption = computed<EventPickerOption | undefined>(() =>
  selected.value ? toEventOption(selected.value) : undefined,
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
watch(endUserId, () => {
  resolvedIdentity.value = null;
  result.value = null;
  error.value = "";
});

async function loadCatalog(
  request: EventPickerRequest = { query: "", limit: 25 },
): Promise<EventPickerPage> {
  const scope = catalogScope;
  const requestGeneration = ++catalogRequestGeneration;
  const projectId = props.projectId;
  const requestedAudience = audience.value;
  loadingCatalog.value = true;
  catalogError.value = "";
  try {
    const response = await eventQueryRepository.listItems(projectId, {
      audience: requestedAudience,
      effective: true,
      query: request.query.trim() || undefined,
      limit: request.limit,
      cursor: request.cursor,
    });
    const parsed = response.items.flatMap((candidate) => {
      const item = eventQueryPolicyItemFromConfiguration(
        candidate.eventCode,
        candidate.configuration,
      );
      return item ? [item] : [];
    });
    if (
      requestGeneration !== catalogRequestGeneration ||
      scope !== catalogScope ||
      projectId !== props.projectId ||
      requestedAudience !== audience.value
    ) return { items: [], nextCursor: null };
    for (const candidate of response.items) {
      eventNames.value[candidate.eventCode] = candidate.eventName;
    }
    items.value = [...items.value, ...parsed].filter(
      (item, index, all) =>
        all.findIndex(
          (candidate) => candidate.stableCode === item.stableCode,
        ) === index,
    );
    return {
      items: parsed.map(toEventOption),
      nextCursor: response.pageInfo.nextCursor ?? null,
    };
  } catch (cause) {
    if (
      requestGeneration !== catalogRequestGeneration ||
      scope !== catalogScope ||
      projectId !== props.projectId ||
      requestedAudience !== audience.value
    ) return { items: [], nextCursor: null };
    catalogError.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось загрузить каталог доступных событий";
    throw cause;
  } finally {
    if (
      requestGeneration === catalogRequestGeneration &&
      scope === catalogScope &&
      projectId === props.projectId &&
      requestedAudience === audience.value
    ) loadingCatalog.value = false;
  }
}

async function initializeCatalog(): Promise<void> {
  const page = await loadCatalog();
  if (!eventCode.value) eventCode.value = page.items[0]?.value ?? "";
}

function toEventOption(item: EventQueryPolicyItemDto): EventPickerOption {
  return {
    value: item.stableCode,
    name: eventNames.value[item.stableCode] ?? item.stableCode,
    code: item.stableCode,
    description: item.descriptionForAI,
    tags: [`История до ${item.maxInteractiveLookbackHours} ч`],
  };
}

function selectEvent(value: string | string[]) {
  if (!Array.isArray(value)) eventCode.value = value;
}

watch(audience, () => {
  catalogScope += 1;
  catalogRequestGeneration += 1;
  items.value = [];
  eventNames.value = {};
  eventCode.value = "";
  result.value = null;
  error.value = "";
  void initializeCatalog().catch(() => undefined);
});
watch(
  () => props.projectId,
  () => {
    catalogScope += 1;
    catalogRequestGeneration += 1;
    items.value = [];
    eventNames.value = {};
    eventCode.value = "";
    result.value = null;
    void initializeCatalog().catch(() => undefined);
  },
);
onMounted(() => void initializeCatalog().catch(() => undefined));

async function preview() {
  if (!endUserId.value.trim() || !eventCode.value) return;
  loading.value = true;
  error.value = "";
  result.value = null;
  try {
    const identity = await endUserProfileRepository.resolveIdentity(
      props.projectId,
      endUserId.value,
    );
    if (!identity) {
      error.value =
        "Пользователь не найден. Укажите UUID Retenive или точный ID пользователя в продукте.";
      return;
    }
    resolvedIdentity.value = identity;
    result.value = await eventQueryRepository.preview(props.projectId, {
      audience: audience.value,
      endUserId: identity.endUserId,
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
    </div>
    <Message v-if="catalogError" severity="error" :closable="false">
      {{ catalogError }}
    </Message>
    <Message v-if="error" severity="error" :closable="false">{{
      error
    }}</Message>
    <div class="preview-form">
      <label>
        <span>Пользователь</span>
        <input
          data-test="preview-end-user"
          v-model="endUserId"
          autocomplete="off"
          placeholder="UUID или ID пользователя в продукте"
          :disabled="disabled || loading"
        />
        <small v-if="resolvedIdentity" class="resolved-user">
          Запрос будет выполнен для UUID
          <code>{{ resolvedIdentity.endUserId }}</code>
        </small>
      </label>
      <EventPicker
        :model-value="eventCode"
        :selected-option="selectedEventOption"
        :load="loadCatalog"
        :scope-key="`${projectId}:${audience}`"
        label="Тип события"
        placeholder="Выберите событие"
        :disabled="disabled || loading"
        @update:model-value="selectEvent"
      />
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
.resolved-user {
  color: var(--status-success-text);
  font-size: 0.68rem;
}
.resolved-user code {
  overflow-wrap: anywhere;
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
