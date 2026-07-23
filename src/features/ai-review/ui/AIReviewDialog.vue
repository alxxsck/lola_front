<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import MultiSelect from "primevue/multiselect";
import ProgressSpinner from "primevue/progressspinner";
import Textarea from "primevue/textarea";
import { eventCatalogRepository } from "@/shared/api/repository/event-catalog";
import { aiReviewRepository } from "../api/ai-review-repository";
import type {
  AIReviewEstimate,
  AIReviewRun,
  AIReviewSettings,
} from "../model/ai-review";

const props = defineProps<{
  projectId: string;
  endUserId: string;
  timezone?: string;
}>();
const visible = defineModel<boolean>("visible", { required: true });
const router = useRouter();
const settings = ref<AIReviewSettings | null>(null);
const options = ref<Array<{ label: string; value: string }>>([]);
const estimate = ref<AIReviewEstimate | null>(null);
const run = ref<AIReviewRun | null>(null);
const loading = ref(false);
const estimating = ref(false);
const starting = ref(false);
const error = ref("");
const confirmedExpensive = ref(false);
const submissionKey = ref("");
const form = reactive({
  localDate: localInputDate(new Date(), props.timezone ?? "UTC"),
  eventCodes: [] as string[],
  instruction: "",
});
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let pollFailures = 0;
let estimateGeneration = 0;
let loadGeneration = 0;

const scopeReady = computed(
  () => Boolean(form.localDate) && form.eventCodes.length > 0,
);
const canStart = computed(
  () =>
    Boolean(estimate.value) &&
    !estimate.value?.blocked &&
    (!estimate.value?.requiresConfirmation || confirmedExpensive.value),
);
const running = computed(
  () => run.value?.status === "PENDING" || run.value?.status === "RUNNING",
);

watch(
  visible,
  (isVisible) => {
    if (isVisible) void load();
    else stopPolling();
  },
  { immediate: true },
);
watch(
  () => [props.projectId, props.endUserId],
  () => {
    estimateGeneration += 1;
    estimate.value = null;
    run.value = null;
    confirmedExpensive.value = false;
    submissionKey.value = "";
    estimating.value = false;
    starting.value = false;
    pollFailures = 0;
    stopPolling();
    if (visible.value) void load();
  },
);
watch(
  () => [form.localDate, form.eventCodes, form.instruction],
  () => {
    estimateGeneration += 1;
    estimate.value = null;
    estimating.value = false;
    confirmedExpensive.value = false;
    submissionKey.value = "";
    pollFailures = 0;
  },
  { deep: true },
);
onBeforeUnmount(stopPolling);

async function load() {
  const generation = ++loadGeneration;
  const projectId = props.projectId;
  loading.value = true;
  error.value = "";
  run.value = null;
  estimate.value = null;
  pollFailures = 0;
  try {
    const [nextSettings, definitions] = await Promise.all([
      aiReviewRepository.getSettings(projectId),
      eventCatalogRepository.listDefinitions(projectId, "ACTIVE"),
    ]);
    if (generation !== loadGeneration || projectId !== props.projectId) return;
    settings.value = nextSettings;
    options.value = definitions.map((item) => ({
      label: `${item.metadata.name} · ${item.code}`,
      value: item.code,
    }));
  } catch (cause) {
    if (generation !== loadGeneration) return;
    error.value =
      cause instanceof Error ? cause.message : "Не удалось открыть AI Review";
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
}

function scope() {
  return {
    endUserId: props.endUserId,
    localDate: form.localDate,
    eventCodes: [...form.eventCodes].sort(),
    ...(form.instruction.trim()
      ? { instruction: form.instruction.trim() }
      : {}),
  };
}

async function calculateEstimate() {
  if (!scopeReady.value) return;
  await nextTick();
  const generation = ++estimateGeneration;
  estimating.value = true;
  error.value = "";
  run.value = null;
  try {
    const nextEstimate = await aiReviewRepository.estimate(
      props.projectId,
      scope(),
    );
    if (generation !== estimateGeneration) return;
    estimate.value = nextEstimate;
  } catch (cause) {
    if (generation !== estimateGeneration) return;
    error.value =
      cause instanceof Error ? cause.message : "Не удалось оценить запрос";
  } finally {
    if (generation === estimateGeneration) estimating.value = false;
  }
}

async function start() {
  if (!canStart.value || starting.value) return;
  const generation = estimateGeneration;
  starting.value = true;
  error.value = "";
  try {
    submissionKey.value ||= crypto.randomUUID();
    const nextRun = await aiReviewRepository.start(props.projectId, {
      ...scope(),
      idempotencyKey: submissionKey.value,
      confirmedExpensive: confirmedExpensive.value,
    });
    if (generation !== estimateGeneration) return;
    run.value = nextRun;
    if (run.value.status === "SUCCEEDED") await openProposal(run.value);
    else if (running.value) schedulePoll();
  } catch (cause) {
    if (generation !== estimateGeneration) return;
    error.value =
      cause instanceof Error ? cause.message : "Не удалось запустить AI Review";
  } finally {
    if (generation === estimateGeneration) starting.value = false;
  }
}

function schedulePoll() {
  stopPolling();
  const delay = Math.min(1_500 * 2 ** pollFailures, 15_000);
  pollTimer = setTimeout(() => void poll(), delay);
}

async function poll() {
  if (!visible.value || !run.value) return;
  const projectId = props.projectId;
  const runId = run.value.id;
  try {
    const nextRun = await aiReviewRepository.get(projectId, runId);
    if (
      projectId !== props.projectId ||
      run.value?.id !== runId ||
      !visible.value
    )
      return;
    run.value = nextRun;
    error.value = "";
    pollFailures = 0;
    if (run.value.status === "SUCCEEDED") await openProposal(run.value);
    else if (running.value) schedulePoll();
  } catch (cause) {
    if (
      projectId !== props.projectId ||
      run.value?.id !== runId ||
      !visible.value
    )
      return;
    error.value =
      cause instanceof Error ? cause.message : "Не удалось обновить статус";
    pollFailures += 1;
    if (visible.value && running.value) schedulePoll();
  }
}

async function openProposal(value: AIReviewRun) {
  stopPolling();
  if (!value.proposalId) return;
  visible.value = false;
  await router.push({
    name: "ai-proposal-detail",
    params: { proposalId: value.proposalId },
  });
}

function stopPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = undefined;
}

function formatBytes(value: number) {
  return value < 1024 ? `${value} Б` : `${(value / 1024).toFixed(1)} КБ`;
}

function localInputDate(value: Date, timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
  } catch {
    return value.toISOString().slice(0, 10);
  }
}

function formatRange(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="AI Review событий"
    :style="{ width: 'min(680px, 94vw)' }"
    class="ai-review-dialog"
  >
    <div class="review-form">
      <Message severity="warn" :closable="false">
        Анализ использует токены. Сначала Lola посчитает объём без обращения к
        модели; дорогой запрос потребует отдельного подтверждения.
      </Message>
      <Message v-if="error" severity="error" :closable="false">{{
        error
      }}</Message>
      <div v-if="loading" class="loading">
        <ProgressSpinner stroke-width="4" />
      </div>
      <template v-else>
        <Message
          v-if="settings && !settings.enabled"
          severity="secondary"
          :closable="false"
        >
          AI Review выключен в настройках проекта. Включите его, чтобы запускать
          анализ.
        </Message>
        <label>
          <span>Дата в часовом поясе проекта</span>
          <InputText v-model="form.localDate" type="date" :disabled="running" />
        </label>
        <label>
          <span>События</span>
          <MultiSelect
            v-model="form.eventCodes"
            :options="options"
            option-label="label"
            option-value="value"
            display="chip"
            filter
            placeholder="Выберите от 1 до 20 событий"
            :max-selected-labels="5"
            :selection-limit="20"
            :disabled="running"
          />
        </label>
        <label>
          <span
            >Что проверить <small>необязательно, до 500 символов</small></span
          >
          <Textarea
            v-model="form.instruction"
            rows="3"
            maxlength="500"
            placeholder="Например: проверь, почему не прошли попытки депозита"
            :disabled="running"
          />
        </label>
        <Button
          label="Оценить объём"
          icon="pi pi-calculator"
          severity="secondary"
          :loading="estimating"
          :disabled="!scopeReady || running || !settings?.enabled"
          @click="calculateEstimate"
        />

        <section
          v-if="estimate"
          class="estimate"
          :data-cost="estimate.costLevel"
        >
          <div>
            <strong
              >{{ estimate.eventCount }} событий ·
              {{ formatBytes(estimate.redactedBytes) }}</strong
            >
            <span
              >Консервативная оценка:
              {{ estimate.estimatedInputTokens.toLocaleString("ru-RU") }}
              входных токенов</span
            >
            <span
              >Часовой пояс проекта: {{ estimate.timezone }} · UTC
              {{ formatRange(estimate.range.start) }} —
              {{ formatRange(estimate.range.end) }}</span
            >
          </div>
          <span class="cost">{{ estimate.costLevel }}</span>
        </section>
        <Message v-if="estimate?.blocked" severity="error" :closable="false">
          {{ estimate.blockedReason }}. Выберите меньше событий.
        </Message>
        <label
          v-if="estimate?.requiresConfirmation && !estimate.blocked"
          class="confirm"
        >
          <Checkbox
            v-model="confirmedExpensive"
            binary
            input-id="confirm-ai-review"
          />
          <span>Подтверждаю запуск дорогого AI Review</span>
        </label>
        <Message
          v-if="
            run && (run.status === 'FAILED' || run.status === 'OUTCOME_UNKNOWN')
          "
          :severity="run.status === 'OUTCOME_UNKNOWN' ? 'warn' : 'error'"
          :closable="false"
        >
          {{
            run.status === "OUTCOME_UNKNOWN"
              ? "Ответ провайдера потерян. Автоматический повтор отключён, чтобы не списать токены дважды."
              : `Анализ завершился с ошибкой: ${run.errorCode ?? "UNKNOWN"}`
          }}
        </Message>
        <div v-if="running" class="running">
          <ProgressSpinner stroke-width="5" />
          <span>Lola анализирует события в фоне…</span>
        </div>
        <Button
          label="Запустить AI Review"
          icon="pi pi-sparkles"
          :loading="starting"
          :disabled="!canStart || running || !settings?.enabled"
          @click="start"
        />
      </template>
    </div>
  </Dialog>
</template>

<style scoped>
.review-form {
  display: grid;
  gap: 14px;
}
.review-form label {
  display: grid;
  gap: 7px;
  font-size: 0.76rem;
  font-weight: 700;
}
.review-form label small {
  color: var(--text-small-muted);
  font-weight: 400;
}
.review-form :deep(.p-inputtext),
.review-form :deep(.p-multiselect-label),
.review-form :deep(.p-textarea) {
  font-size: 0.82rem;
  font-weight: 400;
  line-height: 1.45;
}
.review-form :deep(.p-inputtext),
.review-form :deep(.p-multiselect) {
  min-height: 44px;
}
.review-form :deep(.p-inputtext::placeholder),
.review-form :deep(.p-multiselect-label.p-placeholder),
.review-form :deep(.p-textarea::placeholder) {
  color: var(--text-secondary);
  font-weight: 400;
  opacity: 1;
}
.review-form :deep(.p-button) {
  min-height: 44px;
  font-size: 0.8rem;
  font-weight: 700;
}
.loading,
.running {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 90px;
  color: var(--muted);
}
.loading :deep(.p-progressspinner),
.running :deep(.p-progressspinner) {
  width: 28px;
  height: 28px;
}
.estimate {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 15px;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--surface-subtle);
}
.estimate > div {
  display: grid;
  gap: 4px;
}
.estimate span {
  font-size: 0.72rem;
  color: var(--muted);
}
.estimate .cost {
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
  font-weight: 800;
}
.estimate[data-cost="HIGH"] .cost {
  background: var(--status-red-soft);
  color: var(--status-red-text);
}
.confirm {
  display: flex !important;
  grid-template-columns: auto 1fr !important;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--status-red-border);
  border-radius: 12px;
  background: var(--status-red-soft);
}
</style>
