<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import type {
  CaseVerificationEstimateResponseDto,
  CaseVerificationRunResponseDto,
  EstimateCaseVerificationDto,
  EventQueryPolicyItemDto,
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
  caseId: string;
  caseCreatedAt?: string;
  caseStatus: string;
  canVerify: boolean;
  canPreview: boolean;
  runId?: string | null;
  initialRun?: CaseVerificationRunResponseDto | null;
}>();
const emit = defineEmits<{
  completed: [run: CaseVerificationRunResponseDto];
}>();

type VerificationState =
  | "NOT_CONFIGURED"
  | "READY"
  | "RUNNING"
  | "VERIFIED_RESOLVED"
  | "VERIFIED_UNRESOLVED"
  | "INCONCLUSIVE"
  | "EXPIRED"
  | "DISABLED";

const loadingPolicy = ref(true);
const loadingEvidence = ref(false);
const policyItems = ref<EventQueryPolicyItemDto[]>([]);
const policyEnabled = ref(false);
const policySearch = ref("");
const policySearchActive = ref(false);
const eventCode = ref("");
const range = ref<EventQueryRange>("CURRENT_CASE_WINDOW");
const dialogVisible = ref(false);
const estimating = ref(false);
const running = ref(false);
const error = ref("");
const estimate = ref<CaseVerificationEstimateResponseDto | null>(null);
const run = ref<CaseVerificationRunResponseDto | null>(
  props.initialRun ?? null,
);
const pendingIdempotencyKey = ref<string | null>(null);
let evidenceGeneration = 0;
let scopeGeneration = 0;
let policySearchTimer: ReturnType<typeof setTimeout> | undefined;

const terminalCase = computed(() =>
  ["RESOLVED", "UNRESOLVED", "CANCELLED"].includes(props.caseStatus),
);
const selectedItem = computed(() =>
  policyItems.value.find((item) => item.stableCode === eventCode.value),
);
const periodOptions = computed(() => {
  const maxHours = selectedItem.value?.maxVerificationLookbackHours ?? 24;
  return eventQueryPeriodOptions({
    maxHours,
    caseCreatedAt: props.caseCreatedAt,
  });
});
const normalizedTimeRange = computed<
  EstimateCaseVerificationDto["queries"][number]["query"]["timeRange"]
>(() => {
  return eventQueryTimeRange(
    range.value,
    selectedItem.value?.maxVerificationLookbackHours ?? 1,
  );
});
const state = computed<VerificationState>(() => {
  if (loadingEvidence.value) return "RUNNING";
  if (terminalCase.value && !run.value) return "EXPIRED";
  if (!props.canVerify || !props.canPreview) return "DISABLED";
  if (running.value) return "RUNNING";
  if (run.value?.evaluation) return run.value.evaluation;
  if (
    !loadingPolicy.value &&
    (!policyEnabled.value ||
      (!policyItems.value.length && !policySearchActive.value))
  ) {
    return "NOT_CONFIGURED";
  }
  return "READY";
});
const command = computed<EstimateCaseVerificationDto>(() => ({
  queries: [
    {
      key: "goal_event",
      query: {
        eventCodes: eventCode.value ? [eventCode.value] : [],
        mode: "SUMMARY",
        timeRange: normalizedTimeRange.value,
      },
    },
  ],
  predicate: { operator: "EVENT_EXISTS", queryKey: "goal_event" },
}));
const displayed = computed(() => run.value ?? estimate.value);
const resultBytes = computed(() =>
  Object.values(displayed.value?.results ?? {}).reduce(
    (total, result) => total + (result.serializedBytes ?? 0),
    0,
  ),
);

function captureScope() {
  return {
    generation: scopeGeneration,
    projectId: props.projectId,
    caseId: props.caseId,
  };
}

function isCurrentScope(scope: ReturnType<typeof captureScope>) {
  return (
    scope.generation === scopeGeneration &&
    scope.projectId === props.projectId &&
    scope.caseId === props.caseId
  );
}

function normalizeRange() {
  const allowed = periodOptions.value.map((option) => option.value);
  if (!allowed.includes(range.value)) {
    range.value = allowed[0] ?? "POLICY_MAX";
  }
}

async function loadPolicy(search = policySearch.value.trim()) {
  const scope = captureScope();
  loadingPolicy.value = true;
  error.value = "";
  try {
    const catalog = await eventQueryRepository.listItems(scope.projectId, {
      audience: "INTERNAL_AI",
      effective: true,
      ...(search ? { search } : {}),
      limit: 100,
    });
    if (!isCurrentScope(scope)) return;
    policySearchActive.value = Boolean(search);
    if (!search || catalog.items.length > 0) {
      policyEnabled.value = catalog.items.length > 0;
    }
    policyItems.value = catalog.items.flatMap((candidate) => {
      const item = eventQueryPolicyItemFromConfiguration(
        candidate.eventCode,
        candidate.configuration,
      );
      return item ? [item] : [];
    });
    if (
      !policyItems.value.some((item) => item.stableCode === eventCode.value)
    ) {
      eventCode.value = policyItems.value[0]?.stableCode ?? "";
    }
    normalizeRange();
  } catch (cause) {
    if (!isCurrentScope(scope)) return;
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось проверить доступность событий";
  } finally {
    if (isCurrentScope(scope)) loadingPolicy.value = false;
  }
}

function schedulePolicySearch() {
  if (policySearchTimer) clearTimeout(policySearchTimer);
  policySearchTimer = setTimeout(() => void loadPolicy(), 250);
}

async function loadEvidence() {
  loadingEvidence.value = false;
  const generation = ++evidenceGeneration;
  const projectId = props.projectId;
  const caseId = props.caseId;
  const runId = props.runId;
  if (props.initialRun) {
    run.value = props.initialRun;
    return;
  }
  if (!runId || !props.canPreview) {
    run.value = null;
    return;
  }
  loadingEvidence.value = true;
  try {
    const restored = await eventQueryRepository.getCaseVerification(
      projectId,
      caseId,
      runId,
    );
    if (
      generation === evidenceGeneration &&
      projectId === props.projectId &&
      caseId === props.caseId
    ) {
      run.value = restored;
    }
  } catch (cause) {
    if (generation === evidenceGeneration) {
      error.value =
        cause instanceof Error
          ? cause.message
          : "Не удалось восстановить evidence проверки";
    }
  } finally {
    if (generation === evidenceGeneration) loadingEvidence.value = false;
  }
}

async function openEstimate() {
  if (state.value !== "READY" || !eventCode.value || estimating.value) return;
  const scope = captureScope();
  const request = structuredClone(command.value);
  estimating.value = true;
  error.value = "";
  estimate.value = null;
  run.value = null;
  pendingIdempotencyKey.value = null;
  try {
    const response = await eventQueryRepository.estimateCaseVerification(
      scope.projectId,
      scope.caseId,
      request,
    );
    if (!isCurrentScope(scope)) return;
    estimate.value = response;
    dialogVisible.value = true;
  } catch (cause) {
    if (!isCurrentScope(scope)) return;
    error.value = retryableMessage(cause);
  } finally {
    if (isCurrentScope(scope)) estimating.value = false;
  }
}

async function startVerification() {
  if (!estimate.value || running.value) return;
  const scope = captureScope();
  const request = structuredClone(command.value);
  running.value = true;
  error.value = "";
  const idempotencyKey = pendingIdempotencyKey.value ?? crypto.randomUUID();
  pendingIdempotencyKey.value = idempotencyKey;
  try {
    const response = await eventQueryRepository.startCaseVerification(
      scope.projectId,
      scope.caseId,
      {
        ...request,
        idempotencyKey,
      },
    );
    if (!isCurrentScope(scope)) return;
    run.value = response;
    pendingIdempotencyKey.value = null;
    emit("completed", response);
  } catch (cause) {
    if (!isCurrentScope(scope)) return;
    error.value = retryableMessage(cause);
  } finally {
    if (isCurrentScope(scope)) running.value = false;
  }
}

function retryableMessage(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "";
  return `${message || "Проверка временно недоступна"}. Итог операции не подтверждён; безопасно повторите запрос.`;
}

function formatBytes(value: number) {
  return value < 1024 ? `${value} Б` : `${(value / 1024).toFixed(1)} КБ`;
}

function stateDescription(value: VerificationState) {
  return {
    NOT_CONFIGURED: "Опубликованная Event Query policy не настроена.",
    READY:
      "Можно проверить цель по безопасным продуктовым событиям пользователя.",
    RUNNING: "Сервер проверяет ограниченный набор событий.",
    VERIFIED_RESOLVED:
      "Целевой продуктовый факт найден; обращение подтверждено решённым.",
    VERIFIED_UNRESOLVED: "Полная выборка не подтверждает достижение цели.",
    INCONCLUSIVE: "Недостаточно полных данных; обращение не отмечено решённым.",
    EXPIRED: "Закрытое или объединённое обращение нельзя проверять повторно.",
    DISABLED: "Нет разрешений на preview и доверенную проверку.",
  }[value];
}

watch(
  () => [props.projectId, props.caseId],
  () => {
    scopeGeneration += 1;
    evidenceGeneration += 1;
    loadingEvidence.value = false;
    loadingPolicy.value = true;
    estimating.value = false;
    running.value = false;
    error.value = "";
    estimate.value = null;
    run.value = props.initialRun ?? null;
    pendingIdempotencyKey.value = null;
    dialogVisible.value = false;
    policySearch.value = "";
    policySearchActive.value = false;
    void loadPolicy();
    void loadEvidence();
  },
);
watch(
  () => props.runId,
  () => {
    void loadEvidence();
  },
);
watch(
  () => props.initialRun,
  (value) => {
    if (value) run.value = value;
    else void loadEvidence();
  },
);
watch([eventCode, periodOptions], () => {
  normalizeRange();
});
onMounted(() => {
  void loadPolicy();
  void loadEvidence();
});
onBeforeUnmount(() => {
  if (policySearchTimer) clearTimeout(policySearchTimer);
});
</script>

<template>
  <section class="case-verification" aria-labelledby="case-verification-title">
    <div class="verification-heading">
      <div>
        <h3 id="case-verification-title">Проверка результата по событиям</h3>
        <p>
          Retenive получает только выбранные типы событий этого пользователя и
          ограниченный период.
        </p>
      </div>
      <span
        class="verification-state"
        :class="{ resolved: state === 'VERIFIED_RESOLVED' }"
        :data-state="state"
      >
        {{ state }}
      </span>
    </div>
    <p class="state-description">{{ stateDescription(state) }}</p>
    <Message v-if="error" severity="warn" :closable="false">{{
      error
    }}</Message>

    <div v-if="state === 'READY'" class="verification-controls">
      <label>
        <span>Найти событие</span>
        <InputText
          v-model="policySearch"
          placeholder="Название или код"
          :disabled="estimating"
          @input="schedulePolicySearch"
        />
        <small v-if="policySearchActive && !policyItems.length">
          По запросу ничего не найдено
        </small>
      </label>
      <label>
        <span>Целевое событие</span>
        <select v-model="eventCode" :disabled="estimating">
          <option
            v-for="item in policyItems"
            :key="item.stableCode"
            :value="item.stableCode"
          >
            {{ item.stableCode }} — {{ item.descriptionForAI }}
          </option>
        </select>
      </label>
      <label>
        <span>Период</span>
        <select
          v-model="range"
          data-test="verification-period"
          :disabled="estimating"
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
      <Button
        data-test="refresh-case-data"
        label="Обновить данные"
        icon="pi pi-refresh"
        :loading="estimating"
        :disabled="!eventCode || estimating"
        @click="openEstimate"
      />
    </div>

    <div v-if="run" class="verification-evidence">
      <div class="consumption-grid">
        <div>
          <span>Ответ ИИ: точное потребление</span>
          <strong>0 токенов · $0</strong>
          <small>модель не вызывалась: результат вычислен сервером.</small>
        </div>
        <div>
          <span>Данные событий: оценка вклада</span>
          <strong
            >{{ formatBytes(resultBytes) }} ·
            {{ run.estimatedAddedInputTokens }} токенов</strong
          >
          <small>Не является точной ценой доступа к событиям.</small>
        </div>
      </div>
      <div class="evidence-reference">
        <strong>Evidence</strong>
        <span>
          policy {{ run.policyRevisionId }} ·
          {{ new Date(run.snapshotReceivedAt).toLocaleString("ru-RU") }}
        </span>
        <code
          >{{ run.queries[0]?.query.eventCodes.join(", ") }} ·
          {{ run.queries[0]?.query.timeRange.kind }}</code
        >
      </div>
      <ul
        v-if="
          Object.values(run.results).some((result) => result.limitations.length)
        "
      >
        <template v-for="(result, key) in run.results" :key="key">
          <li v-for="limitation in result.limitations" :key="limitation">
            {{ limitation }}
          </li>
        </template>
      </ul>
    </div>
  </section>

  <Dialog
    v-model:visible="dialogVisible"
    modal
    header="Оценка проверки обращения"
    :style="{ width: 'min(620px, 94vw)' }"
  >
    <div v-if="estimate" class="estimate-dialog">
      <Message
        :severity="
          estimate.evaluation === 'VERIFIED_RESOLVED' ? 'success' : 'warn'
        "
        :closable="false"
      >
        Предварительный результат: {{ estimate.evaluation }}
      </Message>
      <div class="estimate-metrics">
        <div>
          <span>Event codes / период</span>
          <strong
            >{{ estimate.queries[0]?.query.eventCodes.join(", ") }} ·
            {{ estimate.queries[0]?.query.timeRange.kind }}</strong
          >
        </div>
        <div>
          <span>Безопасный результат</span>
          <strong>{{ formatBytes(resultBytes) }}</strong>
        </div>
        <div>
          <span>Данные событий: оценка вклада</span>
          <strong>{{ estimate.estimatedAddedInputTokens }} токенов</strong>
        </div>
      </div>
      <p>
        Проверка read-only. Project ID и End User ID берутся из обращения на
        сервере; исходные payload не передаются в интерфейс.
      </p>
      <Button
        data-test="start-case-verification"
        label="Запустить проверку"
        icon="pi pi-check-circle"
        :loading="running"
        :disabled="running"
        @click="startVerification"
      />
    </div>
  </Dialog>
</template>

<style scoped>
.case-verification {
  display: grid;
  gap: 12px;
  padding: 18px;
  border: 1px solid var(--border-default);
  border-radius: 18px;
  background: var(--surface-card);
}
.verification-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.verification-heading h3,
.verification-heading p,
.state-description {
  margin: 0;
}
.verification-heading p,
.state-description {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 0.74rem;
}
.verification-state {
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
  font-size: 0.65rem;
  font-weight: 800;
}
.verification-state.resolved {
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.verification-controls,
.consumption-grid,
.estimate-metrics {
  display: grid;
  grid-template-columns: minmax(160px, 0.8fr) 1fr 0.8fr auto;
  align-items: end;
  gap: 10px;
}
.verification-controls label,
.estimate-dialog,
.verification-evidence,
.evidence-reference {
  display: grid;
  gap: 7px;
}
.verification-controls select,
.verification-controls :deep(.p-inputtext) {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-primary);
}
.verification-controls small {
  color: var(--text-secondary);
}
.consumption-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.consumption-grid > div,
.estimate-metrics > div {
  padding: 12px;
  border-radius: 12px;
  background: var(--surface-subtle);
}
.consumption-grid span,
.consumption-grid strong,
.consumption-grid small,
.estimate-metrics span,
.estimate-metrics strong {
  display: block;
}
.consumption-grid span,
.estimate-metrics span {
  color: var(--text-tertiary);
  font-size: 0.67rem;
}
.consumption-grid small {
  margin-top: 4px;
  color: var(--text-tertiary);
}
.evidence-reference code {
  overflow-wrap: anywhere;
}
.estimate-dialog p {
  color: var(--text-secondary);
  font-size: 0.75rem;
}
@media (max-width: 720px) {
  .verification-controls,
  .consumption-grid,
  .estimate-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
