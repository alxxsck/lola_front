<script setup lang="ts">
import { ref, watch } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Textarea from "primevue/textarea";
import type { ReplyTranslationDraftResponseDto } from "@/shared/api/generated/models";
import { localeDisplayName } from "@/shared/lib/locale";

const props = defineProps<{
  draft: ReplyTranslationDraftResponseDto | null;
  targetLocale: string | null;
  busy: boolean;
  stale: boolean;
  disabled: boolean;
  showProviderDetails?: boolean;
}>();
const emit = defineEmits<{
  preview: [];
  reconcile: [];
  retry: [];
  saveEdit: [text: string];
  send: [text: string];
}>();
const editedText = ref("");

watch(
  () => props.draft,
  (draft) => {
    editedText.value =
      draft?.editedTranslatedText ?? draft?.translatedText ?? "";
  },
  { immediate: true },
);
</script>

<template>
  <section
    class="reply-preview"
    :class="{
      'is-ready': draft?.status === 'READY',
      'is-processing':
        draft?.status === 'PENDING' || draft?.status === 'RUNNING',
    }"
    aria-label="Предпросмотр перевода ответа"
  >
    <Message
      v-if="stale"
      severity="info"
      :closable="false"
      class="reply-preview__message"
    >
      <div class="reply-preview__error">
        <span>Текст или язык изменён — текущий перевод устарел.</span>
        <Button
          type="button"
          label="Обновить перевод"
          icon="pi pi-refresh"
          size="small"
          text
          :loading="busy"
          :disabled="busy || !targetLocale"
          @click="emit('preview')"
        />
      </div>
    </Message>
    <div
      v-if="!draft || draft.status === 'EXPIRED' || draft.status === 'CONSUMED'"
      class="reply-preview__start"
    >
      <div>
        <span>Уйдёт пользователю</span>
        <strong>{{
          targetLocale
            ? `${localeDisplayName(targetLocale)} · ${targetLocale.toUpperCase()}`
            : "Язык не определён"
        }}</strong>
      </div>
      <Button
        type="button"
        :label="
          targetLocale
            ? `Перевести на ${targetLocale.toUpperCase()}`
            : 'Перевести и проверить'
        "
        icon="pi pi-sparkles"
        :loading="busy"
        :disabled="disabled || !targetLocale"
        @click="emit('preview')"
      />
    </div>
    <div
      v-else-if="draft.status === 'PENDING' || draft.status === 'RUNNING'"
      class="reply-preview__processing"
      role="status"
    >
      <span>
        <strong
          >Переводим<template v-if="targetLocale">
            на {{ targetLocale.toUpperCase() }}</template
          >…</strong
        >
        <i class="translation-skeleton" />
        <i class="translation-skeleton short" />
      </span>
      <Button
        type="button"
        label="Проверить статус"
        icon="pi pi-refresh"
        size="small"
        text
        :loading="busy"
        :disabled="busy"
        @click="emit('reconcile')"
      />
    </div>
    <Message
      v-else-if="draft.status === 'FAILED'"
      severity="error"
      :closable="false"
      class="reply-preview__message"
    >
      <div class="reply-preview__error">
        <span>Не удалось подготовить перевод.</span>
        <Button
          type="button"
          label="Повторить"
          icon="pi pi-refresh"
          size="small"
          text
          :loading="busy"
          @click="emit('retry')"
        />
      </div>
    </Message>
    <div v-else-if="draft.status === 'READY'" class="reply-preview__ready">
      <div class="reply-preview__heading">
        <span
          ><i class="pi pi-check-circle" aria-hidden="true" /> Уйдёт
          пользователю · {{ draft.targetLocale.toUpperCase() }}</span
        >
        <small v-if="showProviderDetails">{{
          draft.model ?? "модель проекта"
        }}</small>
      </div>
      <Textarea
        v-model="editedText"
        rows="3"
        maxlength="10000"
        auto-resize
        aria-label="Переведённый текст для пользователя"
        @blur="
          editedText !==
            (draft.editedTranslatedText ?? draft.translatedText ?? '') &&
          emit('saveEdit', editedText)
        "
      />
      <div v-if="draft.warnings.length" class="reply-preview__warnings">
        <i class="pi pi-exclamation-triangle" aria-hidden="true" />
        Перевод требует дополнительной проверки перед отправкой.
      </div>
      <div class="reply-preview__footer">
        <span>Шаг 2 из 2 · перевод можно исправить перед отправкой.</span>
        <Button
          type="button"
          label="Перевести заново"
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          outlined
          :loading="busy"
          :disabled="disabled || !targetLocale"
          @click="emit('preview')"
        />
        <Button
          type="button"
          label="Отправить перевод"
          icon="pi pi-send"
          size="small"
          :loading="busy"
          :disabled="disabled || !editedText.trim()"
          @click="emit('send', editedText)"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.reply-preview {
  min-width: 0;
  border: 0;
  background: transparent;
}
.reply-preview__start,
.reply-preview__processing,
.reply-preview__heading,
.reply-preview__footer,
.reply-preview__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.reply-preview__start,
.reply-preview__processing,
.reply-preview__ready {
  padding: 10px 12px;
  border: 1px solid
    color-mix(in srgb, var(--status-violet-text) 18%, var(--line));
  border-radius: 12px;
  background: color-mix(
    in srgb,
    var(--status-violet-soft) 34%,
    var(--surface-card)
  );
}
.reply-preview__start > div {
  display: grid;
  gap: 3px;
}
.reply-preview__start > div > span {
  color: var(--text-secondary);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.reply-preview__start > div > strong {
  color: var(--text-primary);
  font-size: 0.76rem;
}
.reply-preview__processing {
  min-height: 64px;
  color: var(--status-violet-text);
  font-size: 0.67rem;
}
.reply-preview__heading i {
  margin-right: 6px;
  color: var(--status-violet-text);
}
.reply-preview__processing {
  justify-content: flex-start;
}
.reply-preview__processing span {
  display: grid;
  flex: 1;
  gap: 7px;
}
.translation-skeleton {
  display: block;
  width: 78%;
  height: 9px;
  border-radius: 5px;
  background: linear-gradient(
    90deg,
    var(--palette-violet-100) 25%,
    var(--palette-violet-100) 37%,
    var(--palette-violet-100) 63%
  );
  background-size: 360px 100%;
  animation: translation-shimmer 1.3s infinite;
}
.translation-skeleton.short {
  width: 46%;
  animation-delay: 180ms;
}
.reply-preview.is-ready .reply-preview__ready {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.reply-preview__ready {
  display: grid;
  gap: 9px;
}
.reply-preview__heading span {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 7px;
  border: 1px solid var(--palette-violet-200);
  border-radius: 5px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
}
.reply-preview__heading small,
.reply-preview__footer span {
  color: var(--text-secondary);
  font-size: 0.61rem;
}
.reply-preview__ready :deep(textarea) {
  min-height: 48px;
  max-height: 96px;
  padding: 6px 0;
  overflow-y: auto;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.5;
  box-shadow: none;
}
.reply-preview__footer {
  justify-content: flex-end;
  padding-top: 9px;
  border-top: 1px solid var(--border-subtle);
}
.reply-preview__footer span {
  margin-right: auto;
}
.reply-preview__footer :deep(.p-button) {
  min-height: 36px;
  border-radius: 10px;
  font-size: 12px;
}
.reply-preview__footer :deep(.p-button:last-child) {
  min-width: 146px;
}
.reply-preview__warnings {
  color: var(--status-warning-text);
  font-size: 0.61rem;
}
.reply-preview__message {
  margin: 0;
  border: 0;
  border-radius: 0;
}
@keyframes translation-shimmer {
  from {
    background-position: -360px 0;
  }
  to {
    background-position: 360px 0;
  }
}
@media (max-width: 620px) {
  .reply-preview__start {
    align-items: stretch;
    flex-direction: column;
  }
  .reply-preview__start :deep(.p-button) {
    width: 100%;
    min-height: 42px;
  }
  .reply-preview__footer {
    gap: 7px;
  }
  .reply-preview__footer :deep(.p-button) {
    min-width: 0;
    min-height: 40px;
    flex: 1 1 0;
  }
  .reply-preview__footer span {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .translation-skeleton {
    animation: none;
  }
}
</style>
