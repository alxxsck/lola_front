<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  TELEGRAM_BROADCAST_END_USER_EXTERNAL_ID_MAX_LENGTH,
  TELEGRAM_BROADCAST_TEST_LABEL_MAX_LENGTH,
  validBroadcastEndUserExternalId,
  validBroadcastTestLabel,
  type TelegramBroadcastExclusionReason,
  type TelegramBroadcastPreview,
} from "../model/telegram-broadcast";
import type {
  TelegramBroadcastTestSend,
} from "../model/use-telegram-broadcasts";

const props = defineProps<{
  preview: TelegramBroadcastPreview;
  latestTestSend: TelegramBroadcastTestSend | null;
  canTest: boolean;
  disabled: boolean;
}>();

const emit = defineEmits<{
  testSend: [endUserExternalId: string, label: string];
}>();

const endUserExternalId = ref("");
const testLabel = ref("");
const canSubmitTest = computed(
  () =>
    validBroadcastEndUserExternalId(endUserExternalId.value) &&
    validBroadcastTestLabel(testLabel.value),
);

watch(
  () => props.preview.revisionId,
  () => {
    endUserExternalId.value = "";
    testLabel.value = "";
  },
);

const exclusionLabels: Record<TelegramBroadcastExclusionReason, string> = {
  CONSENT_NOT_ACTIVE: "Без активного явного согласия",
  STALE_CONSENT: "Согласие относится к прошлой версии",
  NO_ACTIVE_LINK: "Неактивная привязка Telegram",
  INSTALLATION_UNAVAILABLE: "Telegram-канал недоступен",
};

function sendTest(): void {
  if (!canSubmitTest.value) return;
  emit("testSend", endUserExternalId.value.trim(), testLabel.value.trim());
}
</script>

<template>
  <section class="preview-panel" aria-labelledby="broadcast-preview-title">
    <header>
      <div>
        <span class="step">Шаг 2</span>
        <h2 id="broadcast-preview-title">Предпросмотр и тест</h2>
      </div>
      <span>Ревизия {{ preview.revisionId }}</span>
    </header>
    <div class="message-preview">
      <span>Lola в Telegram</span>
      <p>{{ preview.renderedText }}</p>
    </div>
    <div class="audience-summary">
      <strong>{{ preview.eligibleRecipientCount }} получателей</strong>
      <span>рассчитано сервером для текущей ревизии</span>
    </div>
    <ul v-if="preview.exclusions.length" class="exclusions">
      <li v-for="item in preview.exclusions" :key="item.reason">
        <span>{{ exclusionLabels[item.reason] }}</span>
        <strong>{{ item.count }}</strong>
      </li>
    </ul>
    <div v-if="canTest" class="test-send">
      <div class="test-field">
        <label for="broadcast-test-external-id">External ID пользователя</label>
        <input
          id="broadcast-test-external-id"
          v-model="endUserExternalId"
          type="text"
          autocomplete="off"
          required
          :maxlength="TELEGRAM_BROADCAST_END_USER_EXTERNAL_ID_MAX_LENGTH"
          aria-describedby="broadcast-test-external-id-hint"
          :disabled="disabled"
        />
        <small id="broadcast-test-external-id-hint">
          Идентификатор пользователя в текущем проекте. Согласие и активную
          привязку проверит сервер.
        </small>
      </div>
      <div class="test-field">
        <label for="broadcast-test-label">Метка теста</label>
        <input
          id="broadcast-test-label"
          v-model="testLabel"
          type="text"
          autocomplete="off"
          required
          :maxlength="TELEGRAM_BROADCAST_TEST_LABEL_MAX_LENGTH"
          aria-describedby="broadcast-test-label-hint"
          :disabled="disabled"
        />
        <small id="broadcast-test-label-hint">
          Понятное оператору название этой тестовой отправки.
        </small>
      </div>
      <button
        type="button"
        class="secondary-button"
        data-action="test-send"
        :disabled="disabled || !canSubmitTest"
        @click="sendTest"
      >
        Отправить тест
      </button>
      <p
        v-if="latestTestSend"
        class="test-result"
        role="status"
        aria-live="polite"
      >
        Тестовое сообщение: {{ latestTestSend.status }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.preview-panel {
  display: grid;
  gap: 16px;
}
header,
.audience-summary,
.exclusions li {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
header {
  align-items: flex-start;
}
h2 {
  margin: 4px 0 0;
}
.step,
header > span,
.audience-summary span {
  color: var(--text-small-muted);
  font-size: 0.8rem;
}
.message-preview {
  max-width: 560px;
  padding: 16px;
  border: 1px solid var(--border-default);
  border-radius: 16px 16px 16px 4px;
  background: var(--surface-subtle);
}
.message-preview span {
  color: var(--text-brand);
  font-size: 0.72rem;
  font-weight: 700;
}
.message-preview p {
  margin: 8px 0 0;
  white-space: pre-wrap;
}
.audience-summary {
  align-items: baseline;
}
.exclusions {
  display: grid;
  gap: 8px;
  padding: 0;
  margin: 0;
  list-style: none;
}
.exclusions li {
  padding: 10px 12px;
  border-radius: 9px;
  background: var(--surface-subtle);
}
.test-send {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto;
  gap: 8px;
  align-items: end;
}
.test-result {
  grid-column: 1 / -1;
}
.test-field {
  display: grid;
  gap: 6px;
}
.test-field label {
  font-weight: 700;
}
.test-field small {
  color: var(--text-small-muted);
}
input {
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: inherit;
}
.secondary-button {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.test-result {
  margin: 4px 0 0;
}
.test-access-note {
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-subtle);
}
button:disabled,
input:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
@media (max-width: 620px) {
  .test-send {
    grid-template-columns: 1fr;
  }
}
</style>
