<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Textarea from "primevue/textarea";
import { cmsAgentRepository } from "../api/cms-agent-repository";
import type { ProjectAIAnalysisEstimateResponseDto } from "@/shared/api/generated/models";
import type { CmsAgentExecution } from "../model/cms-agent-execution";
import { aiErrorMessage } from "@/features/ai-errors/model/ai-error-message";

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

const phaseByExecutionKind = {
  CLARIFICATION_REQUIRED: "CLARIFICATION",
  UNSUPPORTED: "UNSUPPORTED",
  OUTCOME_UNKNOWN: "OUTCOME_UNKNOWN",
  FAILED: "FAILED",
  PROTOCOL_ERROR: "FAILED",
} satisfies Record<
  Exclude<CmsAgentExecution["kind"], "ANALYSIS_QUEUED">,
  ComposerPhase
>;

const text = ref("");
const phase = ref<ComposerPhase>("IDLE");
const error = ref("");
const pendingRequestId = ref<string | null>(null);
const pendingProjectId = ref<string | null>(null);
const idempotencyKey = ref<string | null>(null);
const submittedText = ref<string | null>(null);
const estimate = ref<ProjectAIAnalysisEstimateResponseDto | null>(null);
const createdAnalysisId = ref<string | null>(null);
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

function applyExecution(result: CmsAgentExecution): void {
  if (result.kind === "ANALYSIS_QUEUED") {
    phase.value = "SUCCEEDED";
    createdAnalysisId.value = result.analysisId;
    emit("analysis-created", result.analysisId);
    return;
  }
  phase.value = phaseByExecutionKind[result.kind];
  if (result.kind === "FAILED") {
    error.value = aiErrorMessage(
      result.code,
      "Запрос не удалось выполнить. Откройте журнал операции для технических данных.",
    );
  }
  if (result.kind === "PROTOCOL_ERROR") {
    error.value =
      "Сервер запустил запрос, но вернул неполный результат. Проверьте журнал анализов перед повтором.";
  }
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
  pendingRequestId.value = null;
  pendingProjectId.value = null;
  idempotencyKey.value = null;
  submittedText.value = null;
  estimate.value = null;
  createdAnalysisId.value = null;
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
    :class="{ 'is-busy': busy }"
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
      <label class="composer-label" for="ai-command-input">Запрос к Lola</label>
      <Textarea
        id="ai-command-input"
        v-model="text"
        rows="3"
        maxlength="10000"
        auto-resize
        :disabled="busy || terminal || submitRetryLocked"
        placeholder="Например: кто завершил депозит вчера и из каких GEO?"
        aria-describedby="ai-command-hint ai-command-character-count"
        @keydown="handleShortcut"
      />
      <div class="ai-command-actions">
        <span id="ai-command-hint" class="composer-context">
          <i class="pi pi-shield" aria-hidden="true" />
          Только чтение
        </span>
        <span
          id="ai-command-character-count"
          class="character-count"
          :class="{ 'is-visible': text.length > 0 }"
          >{{ text.length.toLocaleString("ru-RU") }} / 10 000</span
        >
        <span v-if="busy" class="composer-progress" aria-live="polite">
          <i class="pi pi-sparkles" aria-hidden="true" />
          {{ buttonLabel }}
        </span>
        <span
          v-else
          class="shortcut"
          aria-label="Command или Control плюс Enter"
        >
          <kbd>⌘/Ctrl</kbd><span aria-hidden="true">+</span><kbd>Enter</kbd>
        </span>
        <Button
          type="submit"
          icon="pi pi-arrow-up"
          :loading="busy"
          :disabled="!canSubmit || busy"
          :aria-label="buttonLabel"
          :title="buttonLabel"
          class="ai-submit"
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
          <span class="message-buttons">
            <RouterLink
              v-if="createdAnalysisId"
              :to="{
                name: 'ai-analysis-detail',
                params: { analysisId: createdAnalysisId },
                query: { projectId },
              }"
              class="analysis-result-link"
            >
              Открыть анализ <i class="pi pi-arrow-up-right" />
            </RouterLink>
            <Button
              label="Новый запрос"
              size="small"
              severity="secondary"
              text
              @click="startAnother"
            />
          </span>
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
            Укажите событие, период или пользователя точнее.
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
  isolation: isolate;
  grid-template-columns: minmax(280px, 0.72fr) minmax(380px, 1.28fr);
  gap: clamp(24px, 3vw, 44px);
  margin-bottom: 24px;
  padding: clamp(24px, 3vw, 38px);
  overflow: hidden;
  color: var(--text-primary);
  background:
    radial-gradient(
      circle at 4% 8%,
      color-mix(in srgb, var(--ai-aura-violet) 21%, transparent),
      transparent 34%
    ),
    radial-gradient(
      circle at 94% 92%,
      color-mix(in srgb, var(--ai-aura-lime) 24%, transparent),
      transparent 32%
    ),
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--surface-card) 91%, var(--status-violet-soft)),
      color-mix(in srgb, var(--surface-card) 92%, var(--brand-soft))
    );
  border: 1px solid
    color-mix(in srgb, var(--status-violet) 24%, var(--border-default));
  border-radius: 30px;
  box-shadow:
    0 28px 72px color-mix(in srgb, var(--status-violet) 10%, transparent),
    0 12px 32px color-mix(in srgb, var(--brand) 7%, transparent),
    inset 0 1px color-mix(in srgb, var(--surface-card) 88%, transparent);
}
.ai-command-composer::before {
  content: "";
  position: absolute;
  z-index: 0;
  inset: -20%;
  background:
    radial-gradient(
      circle at 12% 30%,
      color-mix(in srgb, var(--ai-aura-lime) 24%, transparent),
      transparent 26%
    ),
    radial-gradient(
      circle at 80% 52%,
      color-mix(in srgb, var(--ai-aura-violet) 26%, transparent),
      transparent 34%
    );
  opacity: 0.34;
  animation: ai-aura-drift 32s ease-in-out infinite alternate;
  pointer-events: none;
}
.ai-command-composer::after {
  position: absolute;
  z-index: 0;
  right: -88px;
  bottom: -148px;
  width: 250px;
  height: 250px;
  border: 1px solid color-mix(in srgb, var(--status-violet) 22%, transparent);
  border-radius: 50%;
  content: "";
  box-shadow:
    0 0 0 38px color-mix(in srgb, var(--brand) 5%, transparent),
    0 0 0 76px color-mix(in srgb, var(--status-violet) 4%, transparent);
  opacity: 0.72;
  animation: ai-rings-breathe 9s ease-in-out infinite;
  pointer-events: none;
}
.ai-command-heading {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  gap: 15px;
}
.ai-orb {
  position: relative;
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  flex: 0 0 auto;
  color: var(--on-brand);
  background: linear-gradient(
    145deg,
    var(--ai-label),
    color-mix(in srgb, var(--ai-label) 74%, var(--ai-aura-violet))
  );
  border-radius: 17px;
  box-shadow:
    0 0 0 7px color-mix(in srgb, var(--ai-aura-lime) 14%, transparent),
    0 10px 30px color-mix(in srgb, var(--ai-aura-lime) 23%, transparent);
}
.ai-orb::before {
  position: absolute;
  inset: -8px;
  border: 1px solid color-mix(in srgb, var(--ai-border-start) 42%, transparent);
  border-radius: 22px;
  box-shadow:
    0 0 18px color-mix(in srgb, var(--ai-aura-violet) 14%, transparent),
    inset 0 0 12px color-mix(in srgb, var(--ai-aura-lime) 8%, transparent);
  content: "";
  animation: ai-orb-halo 4.8s ease-in-out infinite;
}
.ai-orb i {
  font-size: 1.05rem;
  animation: ai-spark-breathe 2.8s ease-in-out infinite;
}
.ai-label {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 7px;
  color: var(--status-violet-text);
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.ai-label i {
  color: var(--text-brand);
  font-size: 0.34rem;
}
.ai-command-heading h2 {
  margin: 0;
  font: 750 clamp(1.45rem, 2vw, 1.85rem) / 1.12 var(--font-display);
  letter-spacing: -0.03em;
}
.ai-command-heading p {
  max-width: 440px;
  margin: 9px 0 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.6;
}
.ai-command-form {
  position: relative;
  z-index: 1;
  align-self: center;
  padding: 7px;
  overflow: hidden;
  color: var(--text-primary);
  background: color-mix(
    in srgb,
    var(--surface-raised) 94%,
    var(--surface-card)
  );
  border: 1px solid
    color-mix(in srgb, var(--status-violet) 18%, var(--border-default));
  border-radius: 24px;
  box-shadow:
    0 22px 52px color-mix(in srgb, var(--status-violet) 10%, transparent),
    0 3px 12px color-mix(in srgb, var(--text-primary) 7%, transparent),
    inset 0 1px color-mix(in srgb, var(--surface-card) 86%, transparent);
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}
.ai-command-form::before {
  position: absolute;
  z-index: 0;
  top: -42%;
  left: -44%;
  width: 32%;
  height: 184%;
  background: linear-gradient(
    100deg,
    transparent,
    color-mix(in srgb, var(--ai-aura-violet) 16%, transparent),
    color-mix(in srgb, var(--ai-aura-lime) 18%, transparent),
    transparent
  );
  content: "";
  opacity: 0;
  transform: rotate(10deg);
  animation: ai-composer-sheen 9s ease-in-out infinite;
  pointer-events: none;
}
.ai-command-form:focus-within {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--ai-focus) 68%, var(--border-default));
  box-shadow:
    0 24px 58px color-mix(in srgb, var(--status-violet) 14%, transparent),
    0 0 0 4px color-mix(in srgb, var(--ai-focus) 20%, transparent),
    inset 0 1px color-mix(in srgb, var(--surface-card) 88%, transparent);
}
.composer-label,
.ai-command-form :deep(textarea),
.ai-command-actions {
  position: relative;
  z-index: 1;
}
.ai-command-form :deep(textarea) {
  width: 100%;
  min-height: 98px;
  padding: 8px 18px 12px;
  color: var(--text-primary);
  caret-color: var(--action-primary);
  background: transparent;
  border: 0;
  box-shadow: none;
  resize: none;
  font-size: 1rem;
  font-weight: 560;
  line-height: 1.55;
}
.composer-label {
  display: block;
  padding: 12px 18px 0;
  color: var(--text-secondary);
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}
.ai-command-form :deep(textarea:focus) {
  box-shadow: none;
}
.ai-command-form :deep(textarea:disabled) {
  background: transparent;
  opacity: 0.62;
}
.ai-command-form :deep(textarea::placeholder) {
  color: var(--input-placeholder);
  opacity: 1;
}
.ai-command-actions,
.message-content {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ai-command-actions {
  min-height: 52px;
  padding: 7px 7px 7px 10px;
  color: var(--text-secondary);
  border-top: 1px solid var(--border-subtle);
  font-size: 0.7rem;
}
.composer-context {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 6px;
  padding: 7px 9px;
  color: var(--text-secondary);
  background: var(--surface-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  font-weight: 750;
}
.composer-context i {
  color: var(--text-brand);
  font-size: 0.7rem;
}
.character-count {
  max-width: 0;
  overflow: hidden;
  opacity: 0;
  white-space: nowrap;
  transition:
    max-width 0.2s ease,
    opacity 0.2s ease;
}
.character-count.is-visible {
  max-width: 90px;
  opacity: 1;
}
.ai-command-actions .shortcut,
.composer-progress {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 1;
  gap: 4px;
}
.shortcut kbd {
  padding: 3px 6px;
  color: var(--text-secondary);
  background: var(--surface-subtle);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  box-shadow: 0 1px 0 var(--border-default);
  font: 650 0.64rem/1.2 var(--font-sans);
}
.composer-progress {
  color: var(--status-violet-text);
  font-weight: 750;
}
.composer-progress i {
  color: var(--text-brand);
  animation: ai-progress-spark 0.9s ease-in-out infinite;
}
.ai-command-actions :deep(.ai-submit.p-button) {
  width: 44px;
  min-width: 44px;
  height: 44px;
  margin-left: auto;
  padding: 0;
  color: var(--on-brand);
  background: var(--ai-label);
  border-color: var(--ai-label);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--ai-label) 30%, transparent);
  transition:
    transform 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease;
}
.ai-command-actions :deep(.ai-submit.p-button:not(:disabled):hover) {
  transform: translateY(-1px);
  background: var(--brand-hover);
  border-color: var(--brand-hover);
  box-shadow: 0 10px 22px color-mix(in srgb, var(--ai-label) 38%, transparent);
}
.ai-command-actions :deep(.ai-submit.p-button:disabled) {
  color: var(--text-disabled);
  background: var(--input-background-disabled);
  border-color: var(--border-subtle);
  box-shadow: none;
  opacity: 1;
}
.ai-command-composer.is-busy {
  animation: ai-working-pulse 1.4s ease-in-out infinite;
}
.ai-command-composer.is-busy::before {
  opacity: 0.62;
  animation-duration: 3.4s;
}
.ai-command-composer.is-busy::after {
  animation-duration: 1.8s;
}
.ai-command-composer.is-busy .ai-command-form::before {
  animation-duration: 1.5s;
}
.ai-command-composer.is-busy .ai-orb::before {
  animation-duration: 1.1s;
}
.ai-command-composer.is-busy .ai-orb i {
  animation-duration: 0.7s;
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
.analysis-result-link {
  color: var(--brand);
  font-size: 0.75rem;
  font-weight: 800;
  text-decoration: none;
  white-space: nowrap;
}
@keyframes ai-aura-drift {
  from {
    opacity: 0.31;
    transform: translate3d(-1%, 1%, 0) scale(0.99);
  }
  to {
    opacity: 0.35;
    transform: translate3d(1%, -1%, 0) scale(1.01);
  }
}
@keyframes ai-rings-breathe {
  0%,
  100% {
    opacity: 0.48;
    transform: translate3d(0, 0, 0) scale(0.96);
  }
  50% {
    opacity: 0.84;
    transform: translate3d(-10px, -8px, 0) scale(1.04);
  }
}
@keyframes ai-composer-sheen {
  0%,
  18% {
    opacity: 0;
    transform: translateX(0) rotate(10deg);
  }
  30% {
    opacity: 0.42;
  }
  52%,
  100% {
    opacity: 0;
    transform: translateX(460%) rotate(10deg);
  }
}
@keyframes ai-working-pulse {
  0%,
  100% {
    border-color: color-mix(
      in srgb,
      var(--status-violet) 28%,
      var(--border-default)
    );
  }
  50% {
    border-color: color-mix(in srgb, var(--brand) 54%, var(--status-violet));
  }
}
@keyframes ai-orb-halo {
  0%,
  100% {
    opacity: 0.36;
    transform: scale(0.96);
  }
  50% {
    opacity: 0.76;
    transform: scale(1.04);
  }
}
@keyframes ai-spark-breathe {
  0%,
  100% {
    opacity: 0.72;
    transform: scale(0.92) rotate(-4deg);
  }
  50% {
    opacity: 1;
    transform: scale(1.08) rotate(4deg);
  }
}
@keyframes ai-progress-spark {
  0%,
  100% {
    opacity: 0.55;
    transform: scale(0.86) rotate(-8deg);
  }
  50% {
    opacity: 1;
    transform: scale(1.14) rotate(8deg);
  }
}
@media (max-width: 920px) {
  .ai-command-composer {
    grid-template-columns: 1fr;
    gap: 20px;
  }
}
@media (max-width: 600px) {
  .ai-command-composer {
    gap: 22px;
    padding: 22px 18px;
    border-radius: 22px;
  }
  .ai-orb {
    width: 48px;
    height: 48px;
    border-radius: 15px;
  }
  .ai-command-actions .shortcut,
  .composer-progress {
    display: none;
  }
  .ai-command-form :deep(textarea) {
    font-size: 1rem;
  }
  .ai-command-actions {
    gap: 8px;
  }
  .ai-command-actions :deep(.ai-submit.p-button) {
    flex: 0 0 44px;
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
  .message-buttons :deep(.p-button),
  .analysis-result-link {
    min-height: 44px;
  }
  .analysis-result-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 12px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ai-command-composer,
  .ai-command-composer::before,
  .ai-command-composer::after,
  .ai-command-form::before,
  .ai-orb::before,
  .ai-orb i,
  .composer-progress i {
    animation: none !important;
    transform: none;
  }
}
</style>
