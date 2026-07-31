<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Textarea from "primevue/textarea";
import { cmsAgentRepository } from "../api/cms-agent-repository";
import type {
  CmsAgentImmediateExecutionResponseDto,
  CmsAgentImmediateInterpretationResponseDtoOutcome,
  ProjectAIAnalysisEstimateResponseDto,
} from "@/shared/api/generated/models";

const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{ "analysis-created": [analysisId: string] }>();

type ComposerPhase =
  | "IDLE"
  | "ESTIMATING"
  | "CONFIRMATION"
  | "SUBMITTING"
  | "EXECUTING"
  | "SUCCEEDED"
  | "CLARIFICATION"
  | "UNSUPPORTED"
  | "FAILED"
  | "OUTCOME_UNKNOWN";

const phaseByOutcome = {
  CLARIFICATION_REQUIRED: "CLARIFICATION",
  UNSUPPORTED: "UNSUPPORTED",
  OUTCOME_UNKNOWN: "OUTCOME_UNKNOWN",
  FAILED: "FAILED",
  PENDING: "OUTCOME_UNKNOWN",
  PLANNED: "FAILED",
} satisfies Record<
  CmsAgentImmediateInterpretationResponseDtoOutcome,
  ComposerPhase
>;

const text = ref("");
const phase = ref<ComposerPhase>("IDLE");
const error = ref("");
const outcomeCode = ref("");
const pendingRequestId = ref<string | null>(null);
const pendingProjectId = ref<string | null>(null);
const idempotencyKey = ref<string | null>(null);
const submittedText = ref<string | null>(null);
const estimate = ref<ProjectAIAnalysisEstimateResponseDto | null>(null);
const requestGeneration = ref(0);

const trimmedText = computed(() => text.value.trim());
const busy = computed(
  () =>
    phase.value === "ESTIMATING" ||
    phase.value === "SUBMITTING" ||
    phase.value === "EXECUTING",
);
const terminal = computed(() =>
  [
    "CONFIRMATION",
    "SUCCEEDED",
    "CLARIFICATION",
    "UNSUPPORTED",
    "OUTCOME_UNKNOWN",
  ].includes(phase.value),
);
const submitRetryLocked = computed(
  () =>
    phase.value === "FAILED" &&
    idempotencyKey.value !== null &&
    pendingRequestId.value === null,
);
const canSubmit = computed(
  () =>
    !terminal.value &&
    trimmedText.value.length > 0 &&
    trimmedText.value.length <= 10_000,
);
const buttonLabel = computed(() =>
  phase.value === "ESTIMATING"
    ? "Оцениваем запрос"
    : phase.value === "SUBMITTING"
      ? "Сохраняем запрос"
      : phase.value === "EXECUTING"
        ? "Lola анализирует"
        : "Спросить Lola",
);
const estimateCost = computed(() =>
  estimate.value ? formatUsdTicks(estimate.value.reservedCostUsdTicks) : "—",
);

function createIdempotencyKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `cms-agent-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function formatUsdTicks(value: string): string {
  const ticks = BigInt(value);
  const scale = 10_000_000_000n;
  const whole = ticks / scale;
  const fraction = (ticks % scale)
    .toString()
    .padStart(10, "0")
    .replace(/0+$/, "");
  return `$${whole.toString()}${fraction ? `.${fraction}` : ""}`;
}

function applyExecution(result: CmsAgentImmediateExecutionResponseDto): void {
  outcomeCode.value = result.interpretation.code ?? "";
  if (result.analysis) {
    phase.value = "SUCCEEDED";
    emit("analysis-created", result.analysis.analysisId);
    return;
  }
  phase.value = phaseByOutcome[result.interpretation.outcome];
}

async function executePending(
  expectedGeneration = requestGeneration.value,
): Promise<void> {
  const requestId = pendingRequestId.value;
  const projectId = pendingProjectId.value;
  if (!requestId || !projectId || busy.value) return;
  phase.value = "EXECUTING";
  error.value = "";
  try {
    const result = await cmsAgentRepository.execute(projectId, requestId);
    if (
      requestGeneration.value !== expectedGeneration ||
      props.projectId !== projectId
    )
      return;
    applyExecution(result);
  } catch (cause) {
    if (
      requestGeneration.value !== expectedGeneration ||
      props.projectId !== projectId
    )
      return;
    phase.value = "FAILED";
    error.value =
      cause instanceof Error ? cause.message : "Не удалось запустить запрос";
  }
}

async function submit(): Promise<void> {
  if (!canSubmit.value || busy.value) return;
  if (pendingRequestId.value) {
    await executePending();
    return;
  }
  const projectId = props.projectId;
  const generation = requestGeneration.value;
  if (!estimate.value) {
    const question = trimmedText.value;
    phase.value = "ESTIMATING";
    error.value = "";
    outcomeCode.value = "";
    try {
      const quoted = await cmsAgentRepository.estimate(projectId, {
        executionPath: "CMS_AGENT",
        question,
      });
      if (
        requestGeneration.value !== generation ||
        props.projectId !== projectId
      )
        return;
      estimate.value = quoted;
      submittedText.value = question;
      if (quoted.confirmationRequired) {
        if (!quoted.confirmationToken || !quoted.confirmationExpiresAt) {
          throw new Error("Сервер не выдал подтверждение высокой стоимости");
        }
        phase.value = "CONFIRMATION";
        return;
      }
    } catch (cause) {
      if (
        requestGeneration.value !== generation ||
        props.projectId !== projectId
      )
        return;
      estimate.value = null;
      submittedText.value = null;
      phase.value = "FAILED";
      error.value =
        cause instanceof Error ? cause.message : "Не удалось оценить запрос";
      return;
    }
  }
  phase.value = "SUBMITTING";
  error.value = "";
  outcomeCode.value = "";
  idempotencyKey.value ??= createIdempotencyKey();
  try {
    const request = await cmsAgentRepository.submit(projectId, {
      idempotencyKey: idempotencyKey.value,
      text: submittedText.value ?? trimmedText.value,
      ...(estimate.value?.confirmationRequired
        ? { highCostConfirmationToken: estimate.value.confirmationToken! }
        : {}),
    });
    if (requestGeneration.value !== generation || props.projectId !== projectId)
      return;
    pendingRequestId.value = request.requestId;
    pendingProjectId.value = projectId;
    phase.value = "IDLE";
    await executePending(generation);
  } catch (cause) {
    if (requestGeneration.value !== generation || props.projectId !== projectId)
      return;
    phase.value = "FAILED";
    error.value =
      cause instanceof Error ? cause.message : "Не удалось отправить запрос";
  }
}

function confirmHighCost(): void {
  if (phase.value !== "CONFIRMATION") return;
  phase.value = "IDLE";
  void submit();
}

function startAnother(): void {
  text.value = "";
  resetRequest();
}

function reviseRequest(): void {
  resetRequest();
}

function resetRequest(): void {
  phase.value = "IDLE";
  error.value = "";
  outcomeCode.value = "";
  pendingRequestId.value = null;
  pendingProjectId.value = null;
  idempotencyKey.value = null;
  submittedText.value = null;
  estimate.value = null;
}

watch(
  () => props.projectId,
  () => {
    requestGeneration.value += 1;
    startAnother();
  },
);

onBeforeUnmount(() => {
  requestGeneration.value += 1;
});

function handleShortcut(event: KeyboardEvent): void {
  if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) return;
  event.preventDefault();
  void submit();
}
</script>

<template>
  <section
    class="ai-command-composer"
    data-testid="ai-command-composer"
    aria-labelledby="ai-command-title"
  >
    <div class="ai-command-heading">
      <span class="ai-orb" aria-hidden="true">
        <i class="pi pi-sparkles" />
      </span>
      <div>
        <div class="ai-label"><i class="pi pi-circle-fill" /> AI workspace</div>
        <h2 id="ai-command-title">Что нужно узнать о проекте?</h2>
        <p>
          Lola выберет только разрешённые источники, выполнит ограниченные
          read-only запросы и сохранит результат в журнале.
        </p>
      </div>
    </div>

    <form class="ai-command-form" :aria-busy="busy" @submit.prevent="submit">
      <Textarea
        v-model="text"
        rows="3"
        maxlength="10000"
        auto-resize
        :disabled="busy || terminal || submitRetryLocked"
        placeholder="Например: сколько пользователей вчера завершили депозит и из каких они GEO?"
        aria-label="Запрос к Lola"
        aria-describedby="ai-command-character-count"
        @keydown="handleShortcut"
      />
      <div class="ai-command-actions">
        <span id="ai-command-character-count"
          >{{ text.length.toLocaleString("ru-RU") }} / 10 000</span
        >
        <span class="shortcut">⌘ / Ctrl + Enter</span>
        <Button
          type="submit"
          :label="buttonLabel"
          icon="pi pi-arrow-up"
          :loading="busy"
          :disabled="!canSubmit || busy"
          rounded
        />
      </div>
    </form>

    <div
      class="ai-command-status"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <Message
        v-if="phase === 'CONFIRMATION'"
        severity="warn"
        :closable="false"
        class="ai-command-message"
      >
        <div class="message-content">
          <span>
            <strong>Нужно подтвердить высокий расход.</strong>
            Резерв до {{ estimateCost }}, модель {{ estimate?.model }}, максимум
            {{ estimate?.maxProviderCalls }} обращения к провайдеру.
            Подтверждение действует до
            {{
              estimate?.confirmationExpiresAt
                ? new Date(estimate.confirmationExpiresAt).toLocaleString(
                    "ru-RU",
                  )
                : "—"
            }}.
          </span>
          <span class="message-buttons">
            <Button
              data-testid="ai-command-confirm-cost"
              label="Подтвердить и запустить"
              size="small"
              severity="warn"
              @click="confirmHighCost"
            />
            <Button
              label="Изменить запрос"
              size="small"
              severity="secondary"
              text
              @click="reviseRequest"
            />
          </span>
        </div>
      </Message>
      <Message
        v-else-if="phase === 'SUCCEEDED'"
        severity="success"
        :closable="false"
        class="ai-command-message"
      >
        <div class="message-content">
          <span>
            <strong>Анализ поставлен в очередь.</strong>
            Ход выполнения, использованные данные и стоимость будут сохранены.
          </span>
          <Button
            label="Новый запрос"
            size="small"
            severity="secondary"
            text
            @click="startAnother"
          />
        </div>
      </Message>
      <Message
        v-else-if="phase === 'CLARIFICATION'"
        severity="warn"
        :closable="false"
        class="ai-command-message"
      >
        <div class="message-content">
          <span>
            <strong>Нужно уточнение.</strong>
            Укажите событие, период или пользователя точнее
            <span v-if="outcomeCode">({{ outcomeCode }})</span>.
          </span>
          <Button
            data-testid="ai-command-revise"
            label="Уточнить запрос"
            size="small"
            severity="secondary"
            text
            @click="reviseRequest"
          />
        </div>
      </Message>
      <Message
        v-else-if="phase === 'UNSUPPORTED'"
        severity="secondary"
        :closable="false"
        class="ai-command-message"
      >
        <div class="message-content">
          <span>
            Этот запрос пока не поддерживается доступными инструментами проекта.
          </span>
          <Button
            label="Изменить запрос"
            size="small"
            severity="secondary"
            text
            @click="reviseRequest"
          />
        </div>
      </Message>
      <Message
        v-else-if="phase === 'OUTCOME_UNKNOWN'"
        severity="warn"
        :closable="false"
        class="ai-command-message"
      >
        <div class="message-content">
          <span>
            Результат запуска пока неизвестен. Запрос сохранён; проверьте журнал
            операций перед повтором.
          </span>
          <Button
            label="Новый запрос"
            size="small"
            severity="secondary"
            text
            @click="startAnother"
          />
        </div>
      </Message>
      <Message
        v-else-if="phase === 'FAILED'"
        severity="error"
        :closable="false"
        class="ai-command-message"
      >
        <div class="message-content">
          <span>{{ error || "Запрос не удалось выполнить." }}</span>
          <Button
            data-testid="ai-command-retry"
            label="Повторить"
            size="small"
            text
            @click="submit"
          />
          <Button
            v-if="submitRetryLocked"
            data-testid="ai-command-change"
            label="Изменить запрос"
            size="small"
            severity="secondary"
            text
            @click="reviseRequest"
          />
        </div>
      </Message>
    </div>
  </section>
</template>

<style scoped>
.ai-command-composer {
  position: relative;
  display: grid;
  grid-template-columns: minmax(260px, 0.72fr) minmax(340px, 1.28fr);
  gap: 28px;
  margin-bottom: 18px;
  padding: 28px;
  overflow: hidden;
  color: var(--text-on-emphasis);
  background:
    radial-gradient(
      circle at 8% 20%,
      color-mix(in srgb, var(--status-violet) 26%, transparent),
      transparent 34%
    ),
    linear-gradient(
      125deg,
      var(--surface-emphasis),
      color-mix(in srgb, var(--surface-emphasis) 84%, var(--status-violet))
    );
  border: 1px solid var(--border-on-emphasis);
  border-radius: 22px;
  box-shadow: var(--shadow);
}
.ai-command-composer:after {
  content: "";
  position: absolute;
  width: 220px;
  height: 220px;
  right: -90px;
  bottom: -140px;
  border: 1px solid color-mix(in srgb, var(--brand) 30%, transparent);
  border-radius: 50%;
}
.ai-command-heading {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  gap: 15px;
}
.ai-orb {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  color: var(--surface-emphasis);
  background: var(--brand);
  border-radius: 15px;
  box-shadow: 0 0 0 7px color-mix(in srgb, var(--brand) 12%, transparent);
}
.ai-label {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 7px;
  color: var(--brand);
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.ai-label i {
  font-size: 0.34rem;
}
.ai-command-heading h2 {
  margin: 0;
  font: 700 1.35rem/1.15 var(--font-display);
  letter-spacing: -0.03em;
}
.ai-command-heading p {
  max-width: 440px;
  margin: 9px 0 0;
  color: var(--text-on-emphasis-muted);
  font-size: 0.76rem;
  line-height: 1.55;
}
.ai-command-form {
  position: relative;
  z-index: 1;
  align-self: center;
  padding: 8px;
  background: var(--surface-card);
  border: 1px solid var(--line);
  border-radius: 17px;
}
.ai-command-form :deep(textarea) {
  width: 100%;
  min-height: 76px;
  padding: 11px 12px 5px;
  color: var(--text);
  background: transparent;
  border: 0;
  box-shadow: none;
  resize: none;
  font-size: 0.85rem;
  line-height: 1.5;
}
.ai-command-actions,
.message-content {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ai-command-actions {
  padding: 2px 4px 2px 12px;
  color: var(--muted);
  font-size: 0.63rem;
}
.ai-command-actions .shortcut {
  flex: 1;
}
.ai-command-actions :deep(.p-button) {
  width: auto;
  min-width: 152px;
}
.ai-command-status {
  position: relative;
  z-index: 1;
  grid-column: 1 / -1;
}
.ai-command-status:empty {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
.ai-command-message {
  margin: -12px 0 0;
}
.message-content {
  width: 100%;
  justify-content: space-between;
}
.message-buttons {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 8px;
}
@media (max-width: 920px) {
  .ai-command-composer {
    grid-template-columns: 1fr;
    gap: 20px;
  }
}
@media (max-width: 600px) {
  .ai-command-composer {
    padding: 20px;
  }
  .ai-command-heading {
    display: block;
  }
  .ai-orb {
    margin-bottom: 15px;
  }
  .shortcut {
    display: none;
  }
  .ai-command-actions :deep(.p-button) {
    min-width: 0;
  }
  .message-content {
    align-items: flex-start;
    flex-direction: column;
  }
  .message-buttons {
    align-items: stretch;
    flex-direction: column;
    width: 100%;
  }
}
</style>
