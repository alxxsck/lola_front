<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import type { ConversationMessageTranslationItemResponseDto } from "@/shared/api/generated/models";
import type { ConversationMessage } from "@/shared/types/domain";
import { isFrontendTranslationCandidate } from "@/features/conversation-translation/model/translation-eligibility";

const props = defineProps<{
  message: ConversationMessage;
  requested?: ConversationMessageTranslationItemResponseDto;
  busy?: boolean;
  canTranslate: boolean;
  workingLocale?: string | null;
  viewMode?: "ORIGINAL" | "TRANSLATED";
}>();
const emit = defineEmits<{
  translate: [messageId: string];
  retry: [messageId: string];
  reconcile: [messageId: string];
}>();
const localOriginalOverride = ref<boolean | null>(null);
watch(
  () => props.viewMode,
  () => {
    localOriginalOverride.value = null;
  },
);
const outbound = computed(
  () => props.message.translation?.direction === "OUTBOUND",
);
const originalVisible = computed(
  () =>
    localOriginalOverride.value ??
    (props.viewMode ? props.viewMode === "ORIGINAL" : false),
);

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
const canRequest = computed(
  () =>
    props.canTranslate &&
    isFrontendTranslationCandidate(props.message, props.workingLocale) &&
    !props.requested &&
    !props.message.translation,
);
const versionActionOverlaid = computed(
  () =>
    Boolean(props.viewMode && translatedText.value) &&
    !props.message.translation?.warnings.includes("OPERATOR_EDITED"),
);
</script>

<template>
  <div class="translated-message">
    <p>
      {{
        displayText ||
        (message.status === "WRITING"
          ? "Lola печатает…"
          : "Сообщение без текста")
      }}
    </p>
    <div
      v-if="
        canRequest ||
        translatedText ||
        status === 'PENDING' ||
        status === 'RUNNING' ||
        status === 'FAILED' ||
        status === 'SKIPPED'
      "
      class="translated-message__actions"
      :class="{
        'translated-message__actions--overlay': versionActionOverlaid,
      }"
    >
      <Button
        v-if="canRequest"
        label="Перевести"
        icon="pi pi-language"
        size="small"
        text
        :loading="busy"
        @click="emit('translate', message.id)"
      />
      <span
        v-else-if="status === 'PENDING' || status === 'RUNNING'"
        role="status"
        aria-live="polite"
      >
        <i class="pi pi-spin pi-spinner" aria-hidden="true" />
        Переводим…
        <Button
          v-if="!busy"
          label="Проверить статус"
          icon="pi pi-refresh"
          size="small"
          text
          @click="emit('reconcile', message.id)"
        />
      </span>
      <Button
        v-else-if="status === 'FAILED' && canTranslate"
        label="Повторить перевод"
        icon="pi pi-refresh"
        severity="danger"
        size="small"
        text
        @click="emit('retry', message.id)"
      />
      <span v-else-if="status === 'SKIPPED'" role="status" aria-live="polite">
        <i class="pi pi-info-circle" aria-hidden="true" />
        {{ skippedText }}
      </span>
      <Button
        v-else-if="translatedText"
        :icon="originalVisible ? 'pi pi-eye' : 'pi pi-language'"
        :aria-pressed="originalVisible"
        :aria-label="
          outbound
            ? originalVisible
              ? 'Показать текст оператора'
              : 'Показать доставленный текст'
            : originalVisible
              ? 'Показать перевод'
              : 'Показать оригинал'
        "
        title="Показать вторую языковую версию"
        size="small"
        text
        rounded
        class="translated-message__version-toggle"
        @click="localOriginalOverride = !originalVisible"
      />
      <span
        v-if="translatedText && !viewMode"
        class="translated-message__locale"
      >
        {{
          originalVisible
            ? outbound
              ? `Перевод · ${requested?.targetLocale ?? message.translation?.targetLocale}`
              : "Оригинал"
            : outbound
              ? "Оригинал оператора"
              : `Перевод · ${requested?.targetLocale ?? message.translation?.targetLocale}`
        }}
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
.translated-message__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 7px;
  min-height: 24px;
}
.translated-message__actions--overlay {
  position: absolute;
  right: -7px;
  bottom: -7px;
  min-height: 0;
  margin: 0;
}
.translated-message__actions :deep(.p-button) {
  padding: 2px 0;
  font-size: 0.63rem;
}
.translated-message__version-toggle {
  opacity: 0;
  transition: opacity 0.16s ease;
}
.translated-message:hover .translated-message__version-toggle,
.translated-message__version-toggle:focus-visible {
  opacity: 1;
}
.translated-message__actions > span {
  color: var(--text-secondary);
  font-size: 0.61rem;
}
.translated-message__locale {
  padding-left: 7px;
  border-left: 1px solid var(--line);
}
@media (hover: none) {
  .translated-message__version-toggle {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .translated-message__version-toggle {
    transition: none;
  }
}
</style>
