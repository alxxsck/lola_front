<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Tag from "primevue/tag";
import type {
  SupportInternalNote,
  SupportInternalNoteRevision,
} from "@/features/support-internal-notes/api/support-internal-notes-source";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    notes: SupportInternalNote[];
    nextCursor: string | null;
    loading?: boolean;
    loadingMore?: boolean;
    error?: string;
    canReadHistory?: boolean;
    canCorrect?: boolean;
    canRedact?: boolean;
    correctingNoteId?: string | null;
    tombstoningNoteId?: string | null;
    mutationError?: string;
    selectedHistoryNote: SupportInternalNote | null;
    history: SupportInternalNoteRevision[];
    historyNextCursor: string | null;
    historyLoading?: boolean;
    historyLoadingMore?: boolean;
    historyError?: string;
  }>(),
  {
    loading: false,
    loadingMore: false,
    error: "",
    canReadHistory: false,
    canCorrect: false,
    canRedact: false,
    correctingNoteId: null,
    tombstoningNoteId: null,
    mutationError: "",
    historyLoading: false,
    historyLoadingMore: false,
    historyError: "",
  },
);

const emit = defineEmits<{
  "update:visible": [value: boolean];
  reload: [];
  loadMore: [];
  openHistory: [noteId: string];
  closeHistory: [];
  loadHistoryMore: [];
  correct: [
    noteId: string,
    body: string,
    reasonCode: string,
    onSucceeded: () => void,
  ];
  tombstone: [noteId: string, reasonCode: string, onSucceeded: () => void];
}>();

const correctionNoteId = ref<string | null>(null);
const correctionBody = ref("");
const correctionReason = ref("FACTUAL_CORRECTION");
const tombstoneNoteId = ref<string | null>(null);
const tombstoneReason = ref("CREATED_IN_ERROR");
const correctionByteLength = computed(
  () => new TextEncoder().encode(correctionBody.value.trim()).byteLength,
);
const correctionBodyInvalid = computed(
  () => !correctionBody.value.trim() || correctionByteLength.value > 20_480,
);

const visibleModel = computed({
  get: () => props.visible,
  set: (value: boolean) => emit("update:visible", value),
});

function lifecycleLabel(value: SupportInternalNote["lifecycle"]): string {
  return {
    ACTIVE: "Актуальна",
    TOMBSTONED: "Удалена",
    PURGED: "Недоступна",
  }[value];
}

function lifecycleSeverity(
  value: SupportInternalNote["lifecycle"],
): "success" | "warn" | "secondary" {
  if (value === "ACTIVE") return "success";
  return value === "TOMBSTONED" ? "warn" : "secondary";
}

function dateTime(value: string): string {
  return new Date(value).toLocaleString("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function revisionReasonLabel(
  value: SupportInternalNoteRevision["reasonCode"],
): string {
  return {
    INITIAL: "Создание заметки",
    FACTUAL_CORRECTION: "Исправление факта",
    CLARIFICATION: "Уточнение",
    REMOVE_SENSITIVE_DATA: "Удаление чувствительных данных",
    LEGACY_OTHER: "Изменение из прежней версии",
  }[value];
}

function resetCorrection(): void {
  correctionNoteId.value = null;
  correctionBody.value = "";
  correctionReason.value = "FACTUAL_CORRECTION";
}

function resetTombstone(): void {
  tombstoneNoteId.value = null;
  tombstoneReason.value = "CREATED_IN_ERROR";
}

watch(
  () => [props.visible, props.canCorrect, props.notes] as const,
  ([visible, canCorrect, notes]) => {
    const selected = notes.find((note) => note.id === correctionNoteId.value);
    if (!visible || !canCorrect || !selected || selected.lifecycle !== "ACTIVE")
      resetCorrection();
  },
  { flush: "sync" },
);

watch(
  () => [props.visible, props.canRedact, props.notes] as const,
  ([visible, canRedact, notes]) => {
    const selected = notes.find((note) => note.id === tombstoneNoteId.value);
    if (!visible || !canRedact || !selected || selected.lifecycle !== "ACTIVE")
      resetTombstone();
  },
  { flush: "sync" },
);

function startCorrection(note: SupportInternalNote): void {
  if (!props.canCorrect || note.lifecycle !== "ACTIVE" || !note.body) return;
  correctionNoteId.value = note.id;
  correctionBody.value = note.body;
  correctionReason.value = "FACTUAL_CORRECTION";
  tombstoneNoteId.value = null;
}

function submitCorrection(noteId: string): void {
  const body = correctionBody.value.trim();
  const reasonCode = correctionReason.value.trim().toUpperCase();
  if (correctionBodyInvalid.value || !reasonCode || props.correctingNoteId)
    return;
  emit("correct", noteId, body, reasonCode, () => {
    correctionNoteId.value = null;
    correctionBody.value = "";
  });
}

function startTombstone(noteId: string): void {
  if (!props.canRedact) return;
  tombstoneNoteId.value = noteId;
  tombstoneReason.value = "CREATED_IN_ERROR";
  correctionNoteId.value = null;
}

function submitTombstone(noteId: string): void {
  const reasonCode = tombstoneReason.value.trim().toUpperCase();
  if (!reasonCode || props.tombstoningNoteId) return;
  emit("tombstone", noteId, reasonCode, () => {
    tombstoneNoteId.value = null;
  });
}
</script>

<template>
  <Dialog
    v-model:visible="visibleModel"
    modal
    header="Внутренние заметки"
    :style="{ width: 'min(780px, calc(100vw - 24px))' }"
  >
    <Message severity="info" :closable="false">
      Внутреннюю заметку пользователь не увидит. Не вставляйте в неё секреты или
      текст, который должен уйти в публичный ответ.
    </Message>

    <Message v-if="error" severity="error" :closable="false">
      {{ error }}
      <Button
        type="button"
        label="Повторить"
        size="small"
        text
        @click="emit('reload')"
      />
    </Message>
    <Message v-if="mutationError" severity="error" :closable="false">
      {{ mutationError }}
      <Button
        type="button"
        label="Обновить список"
        size="small"
        text
        @click="emit('reload')"
      />
    </Message>
    <p v-if="loading" class="internal-notes-empty">Загружаем заметки…</p>
    <p v-else-if="!notes.length && !error" class="internal-notes-empty">
      В этом обращении пока нет доступных заметок.
    </p>
    <ol v-else class="internal-notes-list">
      <li v-for="note in notes" :key="note.id">
        <article class="internal-note" :data-note-id="note.id">
          <header class="internal-note__header">
            <div>
              <strong>Заметка</strong>
              <p>Создал(а) {{ note.creatorName }}</p>
            </div>
            <Tag
              :value="lifecycleLabel(note.lifecycle)"
              :severity="lifecycleSeverity(note.lifecycle)"
            />
          </header>
          <p
            v-if="note.body"
            class="internal-note__body"
            data-testid="internal-note-body"
          >
            {{ note.body }}
          </p>
          <p v-else class="internal-note__unavailable">
            {{
              note.lifecycle === "TOMBSTONED"
                ? "Текст заметки удалён."
                : "Текст заметки недоступен."
            }}
          </p>
          <p
            v-if="note.hasUnavailableReferences"
            class="internal-note__unavailable"
          >
            Некоторые связанные объекты больше недоступны.
          </p>
          <form
            v-if="correctionNoteId === note.id"
            class="internal-note-correction"
            :aria-busy="correctingNoteId === note.id"
            @submit.prevent="submitCorrection(note.id)"
          >
            <label>
              <span>Исправленный текст</span>
              <textarea
                v-model="correctionBody"
                rows="3"
                maxlength="20480"
                :disabled="correctingNoteId === note.id"
              />
              <small
                class="internal-note-correction__counter"
                :class="{ 'is-invalid': correctionByteLength > 20480 }"
              >
                {{ correctionByteLength.toLocaleString("ru-RU") }} / 20 480 байт
              </small>
            </label>
            <label>
              <span>Код причины</span>
              <select
                v-model="correctionReason"
                :disabled="correctingNoteId === note.id"
              >
                <option value="FACTUAL_CORRECTION">Исправление факта</option>
                <option value="CLARIFICATION">Уточнение</option>
                <option value="REMOVE_SENSITIVE_DATA">
                  Удаление чувствительных данных
                </option>
              </select>
            </label>
            <div class="internal-note-correction__actions">
              <Button
                type="button"
                label="Отменить"
                severity="secondary"
                text
                :disabled="correctingNoteId === note.id"
                @click="correctionNoteId = null"
              />
              <Button
                type="submit"
                label="Сохранить исправление"
                :loading="correctingNoteId === note.id"
                :disabled="correctionBodyInvalid || !correctionReason.trim()"
              />
            </div>
          </form>
          <section
            v-if="tombstoneNoteId === note.id"
            class="internal-note-tombstone"
            aria-label="Подтверждение удаления заметки"
          >
            <strong>Удалить текст заметки?</strong>
            <p>Текст будет скрыт, но audit trail и факт удаления сохранятся.</p>
            <label>
              <span>Код причины</span>
              <select
                v-model="tombstoneReason"
                :disabled="tombstoningNoteId === note.id"
              >
                <option value="CREATED_IN_ERROR">Создано по ошибке</option>
                <option value="DUPLICATE">Дубликат</option>
                <option value="POLICY_VIOLATION">Нарушение политики</option>
                <option value="PRIVACY_REQUEST">Запрос на приватность</option>
              </select>
            </label>
            <div class="internal-note-correction__actions">
              <Button
                type="button"
                label="Отменить"
                severity="secondary"
                text
                :disabled="tombstoningNoteId === note.id"
                @click="tombstoneNoteId = null"
              />
              <Button
                type="button"
                label="Удалить текст"
                severity="danger"
                :loading="tombstoningNoteId === note.id"
                :disabled="!tombstoneReason.trim()"
                @click="submitTombstone(note.id)"
              />
            </div>
          </section>
          <footer>
            <time :datetime="note.updatedAt">
              Обновлено {{ dateTime(note.updatedAt) }}
            </time>
            <div class="internal-note__actions">
              <Button
                v-if="canReadHistory"
                type="button"
                label="История заметки"
                icon="pi pi-history"
                severity="secondary"
                text
                @click="emit('openHistory', note.id)"
              />
              <Button
                v-if="canCorrect && note.lifecycle === 'ACTIVE'"
                type="button"
                label="Исправить"
                icon="pi pi-pencil"
                severity="secondary"
                text
                @click="startCorrection(note)"
              />
              <Button
                v-if="canRedact && note.lifecycle === 'ACTIVE'"
                type="button"
                label="Удалить текст"
                icon="pi pi-trash"
                severity="danger"
                text
                @click="startTombstone(note.id)"
              />
            </div>
          </footer>
        </article>
      </li>
    </ol>
    <Button
      v-if="nextCursor"
      type="button"
      label="Загрузить ещё"
      severity="secondary"
      outlined
      :loading="loadingMore"
      @click="emit('loadMore')"
    />

    <section v-if="selectedHistoryNote" class="internal-note-history">
      <header class="internal-note-history__header">
        <div>
          <span class="eyebrow">История</span>
          <h3>Заметка</h3>
        </div>
        <Button
          label="Закрыть историю"
          type="button"
          icon="pi pi-times"
          severity="secondary"
          text
          @click="emit('closeHistory')"
        />
      </header>
      <Message v-if="historyError" severity="error" :closable="false">
        {{ historyError }}
        <Button
          label="Повторить"
          type="button"
          size="small"
          text
          @click="emit('openHistory', selectedHistoryNote.id)"
        />
      </Message>
      <p v-else-if="historyLoading" class="internal-notes-empty">
        Загружаем историю…
      </p>
      <p v-else-if="!history.length" class="internal-notes-empty">
        Сервер не вернул доступных версий этой заметки.
      </p>
      <ol v-else class="internal-note-history__list">
        <li v-for="revision in history" :key="revision.id">
          <article>
            <header>
              <strong>Версия {{ revision.revisionNumber }}</strong>
              <time :datetime="revision.createdAt">
                {{ dateTime(revision.createdAt) }}
              </time>
            </header>
            <p class="internal-note-history__author">
              {{ revision.authorName }} ·
              {{ revisionReasonLabel(revision.reasonCode) }}
            </p>
            <p class="internal-note__body">{{ revision.body }}</p>
          </article>
        </li>
      </ol>
      <Button
        v-if="historyNextCursor"
        type="button"
        label="Загрузить ещё версий"
        severity="secondary"
        outlined
        :loading="historyLoadingMore"
        @click="emit('loadHistoryMore')"
      />
    </section>
  </Dialog>
</template>

<style scoped>
.internal-notes-list,
.internal-note-history__list {
  display: grid;
  gap: 12px;
  margin: 16px 0;
  padding: 0;
  list-style: none;
}
.internal-note,
.internal-note-history {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-muted);
}
.internal-note {
  padding: 14px;
}
.internal-note-correction,
.internal-note-tombstone {
  display: grid;
  gap: 10px;
  margin-top: 16px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-card);
}
.internal-note-correction > label,
.internal-note-tombstone > label {
  display: grid;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 0.76rem;
}
.internal-note-correction textarea,
.internal-note-correction select,
.internal-note-tombstone select {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-base);
  color: var(--text-primary);
  font: inherit;
}
.internal-note-correction textarea {
  min-height: 76px;
  padding: 9px;
  resize: vertical;
}
.internal-note-correction select,
.internal-note-tombstone select {
  min-height: 34px;
  padding: 6px 8px;
  font-family: var(--font-mono);
}
.internal-note-correction,
.internal-note-tombstone {
  margin-top: 12px;
  background: var(--surface-base);
}
.internal-note-tombstone {
  border-color: color-mix(in srgb, var(--status-danger-text) 35%, var(--line));
}
.internal-note-tombstone p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.78rem;
  line-height: 1.45;
}
.internal-note-correction__actions,
.internal-note__actions {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}
.internal-note-correction__counter {
  color: var(--text-muted);
  text-align: right;
}
.internal-note-correction__counter.is-invalid {
  color: var(--status-danger-text);
  font-weight: 700;
}
.internal-note__header,
.internal-note footer,
.internal-note-history__header,
.internal-note-history__list header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.internal-note__header p,
.internal-note__body,
.internal-note__unavailable,
.internal-note footer,
.internal-note-history__author,
.internal-note-history__list time {
  color: var(--text-muted);
  font-size: 0.8rem;
}
.internal-note__header p,
.internal-note__body,
.internal-note__unavailable,
.internal-note-history__author {
  margin: 4px 0 0;
}
.internal-note__body {
  color: var(--text-primary);
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.internal-note__unavailable {
  font-style: italic;
}
.internal-note footer {
  margin-top: 12px;
}
.internal-notes-empty {
  margin: 18px 0;
  color: var(--text-muted);
  text-align: center;
}
.internal-note-history {
  margin-top: 20px;
  padding: 14px;
  background: var(--surface-card);
}
.internal-note-history__header h3 {
  margin: 3px 0 0;
  font-size: 1rem;
}
.internal-note-history__list {
  gap: 0;
  border-left: 2px solid var(--line);
}
.internal-note-history__list li {
  position: relative;
  padding: 0 0 16px 14px;
}
.internal-note-history__list li::before {
  position: absolute;
  top: 4px;
  left: -6px;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--brand);
  content: "";
}
.internal-note-history__list article {
  padding-bottom: 2px;
}
@media (max-width: 520px) {
  .internal-note__header,
  .internal-note footer,
  .internal-note-history__header,
  .internal-note-history__list header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
