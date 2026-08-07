<script setup lang="ts">
import { computed } from "vue";
import type {
  RequestedMessageTranslation,
  TranslatedMessageContent,
} from "../model/translation-presentation";

const props = defineProps<{
  message: TranslatedMessageContent;
  requested?: RequestedMessageTranslation;
  viewMode?: "ORIGINAL" | "TRANSLATED";
}>();
const outbound = computed(
  () => props.message.translation?.direction === "OUTBOUND",
);
const originalVisible = computed(() => props.viewMode === "ORIGINAL");

const status = computed(
  () => props.requested?.state ?? props.message.translation?.status,
);
const translatedText = computed(
  () =>
    props.requested?.translatedText ??
    (props.message.translation?.direction === "OUTBOUND"
      ? (props.message.translation.deliveredText ??
        props.message.translation.viewText)
      : props.message.translation?.translatedText) ??
    null,
);
const originalText = computed(
  () => props.message.translation?.originalText ?? props.message.text,
);
const displayText = computed(() => {
  if (outbound.value) {
    return originalVisible.value
      ? translatedText.value
      : originalText.value || props.message.text;
  }
  if (originalVisible.value) return originalText.value;
  return (
    translatedText.value ??
    props.message.translation?.viewText ??
    props.message.text
  );
});
const skipReasonLabels = {
  SAME_LANGUAGE: "Язык сообщения совпадает с рабочим — перевод не требуется.",
  EMPTY_OR_NOISE: "В сообщении нет текста для перевода.",
  UNSUPPORTED_ROLE: "Этот тип сообщения нельзя перевести.",
  LANGUAGE_UNRESOLVED:
    "Язык сообщения не удалось определить. Выберите язык диалога вручную.",
} as const;
const skippedText = computed(() =>
  props.requested?.state === "SKIPPED"
    ? props.requested.skipReason
      ? (skipReasonLabels[props.requested.skipReason] ??
        "Перевод пропущен без обращения к модели.")
      : "Перевод пропущен без обращения к модели."
    : null,
);
</script>

<template>
  <div class="translated-message">
    <p>
      {{
        displayText ||
        (message.status === "WRITING"
          ? "Retenive печатает…"
          : "Сообщение без текста")
      }}
    </p>
    <div
      v-if="
        status === 'PENDING' ||
        status === 'RUNNING' ||
        status === 'FAILED' ||
        status === 'SKIPPED' ||
        (message.translation?.direction === 'OUTBOUND' &&
          message.translation.warnings.includes('OPERATOR_EDITED'))
      "
      class="translated-message__status"
    >
      <span
        v-if="status === 'PENDING' || status === 'RUNNING'"
        role="status"
        aria-live="polite"
      >
        <i class="pi pi-spin pi-spinner" aria-hidden="true" />
        Переводим…
      </span>
      <span v-else-if="status === 'FAILED'" class="is-error">
        <i class="pi pi-exclamation-circle" aria-hidden="true" />
        Не перевелось
      </span>
      <span v-else-if="status === 'SKIPPED'" role="status" aria-live="polite">
        <i class="pi pi-info-circle" aria-hidden="true" />
        {{ skippedText }}
      </span>
      <span
        v-if="
          message.translation?.direction === 'OUTBOUND' &&
          message.translation.warnings.includes('OPERATOR_EDITED')
        "
      >
        Изменено оператором
      </span>
    </div>
  </div>
</template>

<style scoped>
.translated-message > p {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.translated-message {
  position: relative;
}
.translated-message__status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 7px;
}
.translated-message__status > span {
  color: var(--text-secondary);
  font-size: 0.61rem;
}
.translated-message__status .is-error {
  color: var(--status-danger-text);
}
</style>
