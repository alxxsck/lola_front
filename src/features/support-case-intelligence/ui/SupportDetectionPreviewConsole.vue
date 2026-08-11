<script setup lang="ts">
import { computed, ref } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Select from "primevue/select";
import Tag from "primevue/tag";
import Textarea from "primevue/textarea";
import {
  caseIntelligenceReasonLabel,
  previewStageLabel,
} from "../model/support-case-intelligence-policy";
import type {
  CaseIntelligenceDryRunResponseDto,
  CaseIntelligencePreviewMessageDto,
} from "@/shared/api/generated/models";

const props = defineProps<{
  result: CaseIntelligenceDryRunResponseDto | null;
  locales: string[];
  canPreview: boolean;
  blocked: boolean;
  loading: boolean;
}>();

const emit = defineEmits<{
  preview: [messages: CaseIntelligencePreviewMessageDto[]];
}>();

const roleOptions = [
  { label: "Пользователь", value: "USER" },
  { label: "Lola", value: "ASSISTANT" },
];

const messages = ref<CaseIntelligencePreviewMessageDto[]>([
  {
    id: crypto.randomUUID(),
    role: "USER",
    text: "Списали деньги дважды, помогите вернуть оплату",
    locale: props.locales[0] ?? "ru-RU",
  },
]);

const localeOptions = computed(() =>
  (props.locales.length ? props.locales : ["ru-RU"]).map((value) => ({
    label: value,
    value,
  })),
);
const valid = computed(
  () =>
    messages.value.some(
      (message) => message.role === "USER" && message.text.trim(),
    ) && messages.value.every((message) => message.text.trim()),
);
const finalMessageResult = computed(
  () => props.result?.messageResults.at(-1) ?? null,
);

function addMessage(role: "USER" | "ASSISTANT") {
  if (messages.value.length >= 8) return;
  messages.value.push({
    id: crypto.randomUUID(),
    role,
    text: "",
    locale: props.locales[0] ?? "ru-RU",
  });
}

function removeMessage(index: number) {
  if (messages.value.length === 1) return;
  messages.value.splice(index, 1);
}

function runPreview() {
  if (!valid.value || props.blocked || !props.canPreview) return;
  emit(
    "preview",
    messages.value.map((message) => ({ ...message, text: message.text.trim() })),
  );
}

function decisionLabel(value: string) {
  const labels: Record<string, string> = {
    NO_CASE: "Не создавать обращение",
    CREATE: "Создать обращение",
    ATTACH: "Привязать к открытому",
    REOPEN: "Открыть повторно",
    DEFER: "Передать на проверку",
  };
  return labels[value] ?? "Передать на проверку";
}

function confidenceLabel() {
  const confidence = finalMessageResult.value?.confidence;
  if (!confidence || confidence.value === null || confidence.value === undefined)
    return "Доверие не рассчитано";
  return `${Math.round(confidence.value * 100)}%`;
}

function intervalLabel() {
  const interval = finalMessageResult.value?.confidence.interval;
  if (!interval) return "Недостаточно данных";
  return `${Math.round(interval.lower * 100)}–${Math.round(interval.upper * 100)}%`;
}

function formatMicroUsd(value: string) {
  if (!/^\d+$/u.test(value)) return "—";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6,
  }).format(Number(value) / 1_000_000);
}
</script>

<template>
  <aside class="test-console" aria-labelledby="preview-title">
    <div class="test-console__heading">
      <div>
        <div class="card-kicker">Безопасная проверка</div>
        <h2 id="preview-title">Небольшой диалог</h2>
        <p>
          Сервер применит точные правила, но не вызовет модель и ничего не
          изменит в обращениях.
        </p>
      </div>
      <Tag :value="`${messages.length}/8`" severity="secondary" />
    </div>

    <div class="dialog-editor" aria-label="Сообщения для проверки">
      <div
        v-for="(message, index) in messages"
        :key="message.id"
        class="dialog-message"
        :data-role="message.role"
      >
        <div class="dialog-message__meta">
          <Select
            v-model="message.role"
            :options="roleOptions"
            option-label="label"
            option-value="value"
            :aria-label="`Автор сообщения ${index + 1}`"
          />
          <Select
            v-model="message.locale"
            :options="localeOptions"
            option-label="label"
            option-value="value"
            :aria-label="`Язык сообщения ${index + 1}`"
          />
          <Button
            icon="pi pi-trash"
            severity="secondary"
            text
            rounded
            :disabled="messages.length === 1"
            :aria-label="`Удалить сообщение ${index + 1}`"
            @click="removeMessage(index)"
          />
        </div>
        <Textarea
          v-model="message.text"
          :aria-label="`Текст сообщения ${index + 1}`"
          rows="3"
          auto-resize
          maxlength="4000"
        />
      </div>
    </div>

    <div class="dialog-actions">
      <Button
        label="Добавить пользователя"
        icon="pi pi-user-plus"
        size="small"
        severity="secondary"
        outlined
        :disabled="messages.length >= 8"
        @click="addMessage('USER')"
      />
      <Button
        label="Добавить ответ Lola"
        icon="pi pi-sparkles"
        size="small"
        severity="secondary"
        outlined
        :disabled="messages.length >= 8"
        @click="addMessage('ASSISTANT')"
      />
    </div>

    <Button
      label="Проверить диалог"
      icon="pi pi-play"
      :loading="loading"
      :disabled="!canPreview || blocked || !valid"
      @click="runPreview"
    />
    <p v-if="!canPreview" class="permission-note">
      <i class="pi pi-lock" /> У вашей роли нет права проверять примеры.
    </p>

    <section v-if="result" class="test-result" aria-label="Результат проверки">
      <div class="result-hero">
        <span class="result-label">Итоговое решение</span>
        <strong>{{ decisionLabel(result.caseDecision) }}</strong>
        <p>{{ caseIntelligenceReasonLabel(result.reasonCode) }}</p>
      </div>

      <dl class="result-facts">
        <div>
          <dt>Доверие</dt>
          <dd>{{ confidenceLabel() }}</dd>
        </div>
        <div>
          <dt>Интервал</dt>
          <dd>{{ intervalLabel() }}</dd>
        </div>
        <div>
          <dt>Вызовы модели</dt>
          <dd>{{ result.cost.providerCalls }}</dd>
        </div>
        <div>
          <dt>Расчётная стоимость</dt>
          <dd>{{ formatMicroUsd(result.cost.estimatedMicroUsd) }}</dd>
        </div>
      </dl>

      <Message
        v-if="finalMessageResult && !finalMessageResult.confidence.autoApplyAllowed"
        severity="warn"
        :closable="false"
      >
        Автоматическое действие не подтверждено: смысловая модель в этой
        безопасной проверке не запускается.
      </Message>

      <div class="result-section">
        <span class="result-label">Совпавшие правила</span>
        <div class="tag-row">
          <Tag
            v-for="code in result.matchedRuleCodes"
            :key="code"
            :value="code"
            severity="info"
          />
          <span v-if="!result.matchedRuleCodes.length" class="muted">
            Совпавших правил нет
          </span>
        </div>
      </div>

      <div class="result-section">
        <span class="result-label">Категории-кандидаты</span>
        <ol v-if="result.candidates.length" class="candidate-list">
          <li v-for="candidate in result.candidates" :key="candidate.topicCode">
            <span>
              <strong>{{ candidate.label }}</strong>
              <small>{{ candidate.topicCode }}</small>
            </span>
            <b>{{ Math.round(candidate.score * 100) }}%</b>
          </li>
        </ol>
        <span v-else class="muted">Подходящих категорий не найдено</span>
      </div>

      <div class="result-section">
        <span class="result-label">Этапы проверки</span>
        <ol class="stage-list">
          <li v-for="stage in result.stages" :key="stage.code">
            <i
              :class="stage.state === 'COMPLETED' ? 'pi pi-check' : 'pi pi-minus'"
              aria-hidden="true"
            />
            <span>{{ previewStageLabel(stage.code) }}</span>
            <small>{{ stage.state === "COMPLETED" ? "Готово" : "Пропущено" }}</small>
          </li>
        </ol>
      </div>
    </section>
  </aside>
</template>

<style scoped>
.test-console {
  position: sticky;
  top: 16px;
  display: grid;
  gap: 14px;
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--border-on-emphasis);
  border-radius: 14px;
  background: var(--surface-emphasis);
  color: var(--text-on-emphasis);
  box-shadow: var(--shadow-raised);
}
.test-console__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.test-console h2 {
  margin: 5px 0 6px;
  font-size: 1.15rem;
}
.test-console p {
  margin: 0;
  color: var(--text-on-emphasis-muted);
  line-height: 1.45;
}
.card-kicker,
.result-label {
  color: var(--text-on-emphasis-muted);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}
.dialog-editor {
  display: grid;
  gap: 10px;
  max-height: 28rem;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.dialog-message {
  display: grid;
  gap: 7px;
  padding: 10px;
  border: 1px solid var(--border-on-emphasis);
  border-radius: 10px;
  background: var(--surface-emphasis-raised);
}
.dialog-message[data-role="USER"] {
  box-shadow: inset 3px 0 0 var(--action-primary);
}
.dialog-message__meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(82px, 0.65fr) auto;
  gap: 6px;
}
.test-console :deep(.p-inputtext),
.test-console :deep(.p-select),
.test-console :deep(.p-textarea) {
  width: 100%;
  border-color: var(--border-on-emphasis);
  background: var(--surface-emphasis-raised);
  color: var(--text-on-emphasis);
}
.test-console :deep(.p-select-label),
.test-console :deep(.p-select-dropdown) {
  color: var(--text-on-emphasis);
}
.dialog-actions :deep(.p-button-secondary) {
  border-color: var(--border-on-emphasis);
  color: var(--text-on-emphasis);
}
.dialog-actions,
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.permission-note {
  display: flex;
  gap: 7px;
  font-size: 0.82rem;
}
.test-result {
  display: grid;
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--border-on-emphasis);
  border-radius: 12px;
  background: var(--surface-emphasis-raised);
}
.result-hero strong {
  display: block;
  margin: 5px 0;
  font-size: 1.15rem;
}
.result-facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin: 0;
  border-block: 1px solid var(--border-on-emphasis);
}
.result-facts div {
  padding: 10px 0;
}
.result-facts dt {
  color: var(--text-on-emphasis-muted);
  font-size: 0.7rem;
}
.result-facts dd {
  margin: 3px 0 0;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}
.result-section {
  display: grid;
  gap: 8px;
}
.candidate-list,
.stage-list {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.candidate-list li,
.stage-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-on-emphasis);
}
.candidate-list li > span {
  display: grid;
  min-width: 0;
  margin-right: auto;
}
.candidate-list small,
.stage-list small,
.muted {
  color: var(--text-on-emphasis-muted);
}
.candidate-list b {
  font-variant-numeric: tabular-nums;
}
.stage-list span {
  margin-right: auto;
}
@media (max-width: 1400px) {
  .test-console {
    position: static;
    grid-column: 1 / -1;
  }
}
@media (max-width: 520px) {
  .dialog-message__meta,
  .result-facts {
    grid-template-columns: 1fr;
  }
  .dialog-actions :deep(.p-button) {
    width: 100%;
  }
}
@media (prefers-reduced-motion: no-preference) {
  .dialog-message,
  .test-result {
    animation: preview-enter 180ms cubic-bezier(0.23, 1, 0.32, 1);
  }
}
@keyframes preview-enter {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
