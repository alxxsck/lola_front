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
  <section class="reply-preview" aria-label="Предпросмотр перевода ответа">
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
        <i class="pi pi-language" aria-hidden="true" />
        <span
          >Ответ будет переведён на
          <strong>{{
            targetLocale ? localeDisplayName(targetLocale) : "язык пользователя"
          }}</strong>
          до отправки.</span
        >
      </div>
      <Button
        type="button"
        label="Перевести и проверить"
        icon="pi pi-sparkles"
        size="small"
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
      <i class="pi pi-spin pi-spinner" aria-hidden="true" />
      <span
        ><strong>Готовим перевод</strong
        ><small>Обычно это занимает несколько секунд.</small></span
      >
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
          ><i class="pi pi-check-circle" aria-hidden="true" /> Перевод готов ·
          {{ localeDisplayName(draft.targetLocale) }}</span
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
        <span>Пользователь получит только перевод.</span>
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
  border: 1px solid
    color-mix(in srgb, var(--status-violet-text) 18%, var(--line));
  border-radius: 13px;
  background: color-mix(
    in srgb,
    var(--status-violet-soft) 42%,
    var(--surface-card)
  );
  overflow: hidden;
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
}
.reply-preview__start > div,
.reply-preview__processing {
  color: var(--text-secondary);
  font-size: 0.67rem;
}
.reply-preview__start i,
.reply-preview__processing > i,
.reply-preview__heading i {
  margin-right: 6px;
  color: var(--status-violet-text);
}
.reply-preview__processing {
  justify-content: flex-start;
}
.reply-preview__processing span {
  display: grid;
  gap: 2px;
}
.reply-preview__ready {
  display: grid;
  gap: 8px;
}
.reply-preview__heading span {
  font-size: 0.69rem;
  font-weight: 700;
}
.reply-preview__heading small,
.reply-preview__footer span {
  color: var(--text-secondary);
  font-size: 0.61rem;
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
@media (max-width: 620px) {
  .reply-preview__start,
  .reply-preview__footer {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
