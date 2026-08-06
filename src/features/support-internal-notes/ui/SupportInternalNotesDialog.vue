<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Tag from "primevue/tag";
import type {
  SupportInternalNote,
  SupportInternalNoteRevision,
} from "@/features/support-internal-notes/api/support-internal-notes-source";

const props = withDefaults(defineProps<{
  visible: boolean;
  notes: SupportInternalNote[];
  nextCursor: string | null;
  loading?: boolean;
  loadingMore?: boolean;
  error?: string;
  canReadHistory?: boolean;
  selectedHistoryNote: SupportInternalNote | null;
  history: SupportInternalNoteRevision[];
  historyNextCursor: string | null;
  historyLoading?: boolean;
  historyLoadingMore?: boolean;
  historyError?: string;
}>(), {
  loading: false,
  loadingMore: false,
  error: "",
  canReadHistory: false,
  historyLoading: false,
  historyLoadingMore: false,
  historyError: "",
});

const emit = defineEmits<{
  "update:visible": [value: boolean];
  reload: [];
  loadMore: [];
  openHistory: [noteId: string];
  closeHistory: [];
  loadHistoryMore: [];
}>();

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
</script>

<template>
  <Dialog
    v-model:visible="visibleModel"
    modal
    header="Внутренние заметки"
    :style="{ width: 'min(780px, calc(100vw - 24px))' }"
  >
    <Message severity="info" :closable="false">
      Заметки доступны только для чтения. Действия появятся после публикации
      серверных capability для выбранного Case.
    </Message>

    <Message v-if="error" severity="error" :closable="false">
      {{ error }}
      <Button label="Повторить" size="small" text @click="emit('reload')" />
    </Message>
    <p v-if="loading" class="internal-notes-empty">Загружаем заметки…</p>
    <p v-else-if="!notes.length && !error" class="internal-notes-empty">
      В этом Case пока нет доступных заметок.
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
          <p v-if="note.hasUnavailableReferences" class="internal-note__unavailable">
            Некоторые связанные объекты больше недоступны.
          </p>
          <footer>
            <time :datetime="note.updatedAt">
              Обновлено {{ dateTime(note.updatedAt) }}
            </time>
            <Button
              v-if="canReadHistory"
              label="История заметки"
              icon="pi pi-history"
              severity="secondary"
              text
              @click="emit('openHistory', note.id)"
            />
          </footer>
        </article>
      </li>
    </ol>
    <Button
      v-if="nextCursor"
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
              {{ revision.authorName }}
            </p>
            <p class="internal-note__body">{{ revision.body }}</p>
          </article>
        </li>
      </ol>
      <Button
        v-if="historyNextCursor"
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
