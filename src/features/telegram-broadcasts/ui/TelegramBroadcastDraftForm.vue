<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  TELEGRAM_BROADCAST_TEXT_MAX_LENGTH,
  TELEGRAM_BROADCAST_TITLE_MAX_LENGTH,
  validateBroadcastDraft,
  type TelegramBroadcastDraft,
} from "../model/telegram-broadcast";

const props = defineProps<{
  draft: TelegramBroadcastDraft;
  disabled: boolean;
}>();

const emit = defineEmits<{
  save: [draft: TelegramBroadcastDraft];
  dirtyChange: [dirty: boolean];
}>();

const title = ref(props.draft.title);
const text = ref(props.draft.content.text);
const submitted = ref(false);
const candidate = computed<TelegramBroadcastDraft>(() => ({
  title: title.value,
  content: { text: text.value },
  audience: { kind: "ALL_EXPLICITLY_OPTED_IN" },
}));
const errors = computed(() => validateBroadcastDraft(candidate.value));
const dirty = computed(
  () =>
    title.value !== props.draft.title ||
    text.value !== props.draft.content.text,
);

watch(
  () => [props.draft.title, props.draft.content.text] as const,
  ([nextTitle, content]) => {
    title.value = nextTitle;
    text.value = content;
    submitted.value = false;
  },
);

watch(dirty, (value) => emit("dirtyChange", value), { immediate: true });

function submit(): void {
  submitted.value = true;
  if (Object.keys(errors.value).length) return;
  emit("save", {
    ...candidate.value,
    title: candidate.value.title.trim(),
    content: { text: candidate.value.content.text.trim() },
  });
}
</script>

<template>
  <form class="draft-form" :aria-busy="disabled" @submit.prevent="submit">
    <label for="broadcast-title">Название рассылки</label>
    <input
      id="broadcast-title"
      v-model="title"
      type="text"
      autocomplete="off"
      :maxlength="TELEGRAM_BROADCAST_TITLE_MAX_LENGTH"
      :disabled="disabled"
      :aria-invalid="submitted && Boolean(errors.title)"
      :aria-describedby="
        submitted && errors.title ? 'broadcast-title-error' : undefined
      "
    />
    <p v-if="submitted && errors.title" id="broadcast-title-error" class="error">
      {{ errors.title }}
    </p>

    <label for="broadcast-text">Сообщение</label>
    <textarea
      id="broadcast-text"
      v-model="text"
      rows="7"
      :maxlength="TELEGRAM_BROADCAST_TEXT_MAX_LENGTH"
      :disabled="disabled"
      :aria-invalid="submitted && Boolean(errors.text)"
      :aria-describedby="
        submitted && errors.text ? 'broadcast-text-error' : undefined
      "
    />
    <p v-if="submitted && errors.text" id="broadcast-text-error" class="error">
      {{ errors.text }}
    </p>

    <div class="audience-note">
      <i class="pi pi-shield" aria-hidden="true" />
      <div>
        <strong>Только пользователи с явным согласием</strong>
        <p>
          Аудиторию рассчитывает сервер. Неактивные и отозванные привязки будут
          исключены перед фиксацией снимка.
        </p>
      </div>
    </div>

    <button type="submit" class="primary-button" :disabled="disabled">
      Сохранить черновик
    </button>
  </form>
</template>

<style scoped>
.draft-form {
  display: grid;
  gap: 9px;
}
label {
  margin-top: 6px;
  font-weight: 700;
}
input,
textarea {
  width: 100%;
  padding: 11px 12px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: inherit;
}
textarea {
  resize: vertical;
}
[aria-invalid="true"] {
  border-color: var(--status-danger);
}
.error {
  margin: 0;
  color: var(--status-danger);
  font-size: 0.8rem;
}
.audience-note {
  display: flex;
  gap: 12px;
  padding: 14px;
  margin: 8px 0;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--surface-subtle);
}
.audience-note p {
  margin: 4px 0 0;
  color: var(--text-small-muted);
}
.primary-button {
  justify-self: start;
  min-height: 40px;
  padding: 0 14px;
  border: 0;
  border-radius: 10px;
  background: var(--surface-emphasis);
  color: var(--text-on-emphasis);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
button:disabled,
input:disabled,
textarea:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
