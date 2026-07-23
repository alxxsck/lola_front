<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Textarea from "primevue/textarea";
import { telegramPersonalMessagesApi } from "./telegram-personal-messages.api";
import {
  MAX_TELEGRAM_CAPTION_LENGTH,
  MAX_TELEGRAM_TEXT_LENGTH,
  TELEGRAM_MEDIA_ACCEPT,
  telegramPersonalFailureLabel,
  telegramPersonalStatusLabel,
  validateTelegramPersonalDraft,
  type TelegramPersonalLinkStatus,
} from "./telegram-personal-message.model";
import { createTelegramPersonalMessagesController } from "./use-telegram-personal-messages";

const props = defineProps<{
  projectId: string;
  endUserId: string | null;
  linkStatus: TelegramPersonalLinkStatus;
  canSend: boolean;
  targetLabel: string;
}>();
const emit = defineEmits<{
  "dirty-change": [dirty: boolean];
  "link-state-stale": [];
}>();
const visible = defineModel<boolean>("visible", { required: true });
const text = ref("");
const file = ref<File | null>(null);
const fileInputKey = ref(0);
const validationError = ref("");
const controller = createTelegramPersonalMessagesController({
  api: telegramPersonalMessagesApi,
  onLinkStateStale: () => emit("link-state-stale"),
});
const {
  history,
  historyLoading,
  submitting,
  polling,
  uploadProgress,
  error,
  feedback,
  transportRetryAvailable,
} = controller;

const dirty = computed(() =>
  Boolean(text.value || file.value || transportRetryAvailable.value),
);
const maximumTextLength = computed(() =>
  file.value ? MAX_TELEGRAM_CAPTION_LENGTH : MAX_TELEGRAM_TEXT_LENGTH,
);
const sendAllowed = computed(
  () =>
    props.canSend &&
    (props.linkStatus === "ACTIVE" || props.linkStatus === "UNKNOWN"),
);

watch(
  () =>
    [
      visible.value,
      props.projectId,
      props.endUserId,
      props.canSend,
      props.linkStatus,
    ] as const,
  ([isVisible, projectId, endUserId, canSend, linkStatus], previous) => {
    controller.setContext({
      visible: isVisible,
      projectId,
      endUserId,
      canSend,
      linkStatus,
    });
    const targetChanged =
      !previous || previous[1] !== projectId || previous[2] !== endUserId;
    const permissionLost = previous?.[3] === true && !canSend;
    if (!isVisible || targetChanged || permissionLost || !canSend) clearDraft();
    if (isVisible && canSend) void controller.loadHistory();
  },
  { immediate: true, flush: "sync" },
);
watch(dirty, (value) => emit("dirty-change", value), { immediate: true });

function clearDraft(): void {
  text.value = "";
  file.value = null;
  fileInputKey.value += 1;
  validationError.value = "";
  controller.discardTransportRetry();
}

function selectFile(event: Event): void {
  const selected = (event.target as HTMLInputElement).files?.[0] ?? null;
  file.value = selected;
  validationError.value = selected
    ? (validateTelegramPersonalDraft({ text: text.value, file: selected }) ??
      "")
    : "";
}

function removeFile(): void {
  file.value = null;
  fileInputKey.value += 1;
  validationError.value = "";
  controller.discardTransportRetry();
}

function editAfterTransportFailure(): void {
  controller.discardTransportRetry();
  validationError.value = "";
}

async function send(): Promise<void> {
  if (!sendAllowed.value || submitting.value) return;
  const draft = { text: text.value, file: file.value };
  validationError.value = validateTelegramPersonalDraft(draft) ?? "";
  if (validationError.value) return;
  if (await controller.send(draft)) clearDraft();
}

async function retryTransport(): Promise<void> {
  if (await controller.retryTransport()) clearDraft();
}

function requestVisible(next: boolean): void {
  if (
    !next &&
    dirty.value &&
    !window.confirm("Закрыть отправку и потерять черновик Telegram?")
  )
    return;
  visible.value = next;
}

function kindLabel(kind: string): string {
  return (
    {
      TEXT: "Текст",
      PHOTO: "Фото",
      VIDEO: "Видео",
      DOCUMENT: "Документ",
    }[kind] ?? "Сообщение"
  );
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? "—"
    : timestamp.toLocaleString("ru-RU");
}

function retryAtLabel(value: string | null | undefined): string {
  const formatted = formatTimestamp(value);
  return formatted === "—"
    ? "Время следующей попытки уточняется"
    : `Следующая попытка: ${formatted}`;
}

onBeforeUnmount(() => {
  controller.dispose();
  emit("dirty-change", false);
});
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="requestVisible"
    modal
    :draggable="false"
    header="Отправить в Telegram"
    :style="{ width: 'min(680px, 94vw)' }"
    class="telegram-send-dialog"
  >
    <div class="telegram-send">
      <p class="target">
        Получатель: <strong>{{ targetLabel }}</strong
        >. Адрес и product bot Lola определит на сервере.
      </p>

      <Message v-if="!canSend" severity="secondary" :closable="false">
        Недостаточно прав для отправки в Telegram.
      </Message>
      <Message
        v-else-if="linkStatus !== 'ACTIVE' && linkStatus !== 'UNKNOWN'"
        severity="warn"
        :closable="false"
      >
        Отправка доступна только при активной связи пользователя с Telegram.
      </Message>
      <Message
        v-else-if="linkStatus === 'UNKNOWN'"
        severity="info"
        :closable="false"
      >
        Статус связи скрыт вашими правами. Сервер проверит активную связь перед
        отправкой.
      </Message>

      <form v-if="canSend" class="composer" @submit.prevent="send">
        <label for="telegram-personal-text">
          {{ file ? "Подпись к файлу" : "Сообщение" }}
        </label>
        <Textarea
          id="telegram-personal-text"
          v-model="text"
          rows="5"
          auto-resize
          :maxlength="maximumTextLength"
          :disabled="submitting || transportRetryAvailable"
          placeholder="Текст будет отправлен как обычное сообщение без разметки"
          aria-label="Сообщение в Telegram"
          @update:model-value="
            validationError = '';
            controller.discardTransportRetry();
          "
        />
        <small>{{ text.length }}/{{ maximumTextLength }}</small>

        <div class="attachment">
          <label for="telegram-personal-file">Один файл, необязательно</label>
          <input
            :key="fileInputKey"
            id="telegram-personal-file"
            type="file"
            :accept="TELEGRAM_MEDIA_ACCEPT"
            :disabled="submitting || transportRetryAvailable"
            @change="selectFile"
          />
          <div v-if="file" class="selected-file">
            <span>{{ file.name }} · {{ Math.ceil(file.size / 1024) }} КБ</span>
            <Button
              type="button"
              label="Убрать"
              severity="secondary"
              text
              size="small"
              :disabled="submitting || transportRetryAvailable"
              @click="removeFile"
            />
          </div>
          <small>
            JPEG, PNG, WebP до 10 МБ; MP4, PDF, TXT или ZIP до 50 МБ.
          </small>
        </div>

        <Message v-if="validationError" severity="error" :closable="false">
          {{ validationError }}
        </Message>
        <Message v-if="error" severity="error" :closable="false">
          {{ error }}
        </Message>
        <Message
          v-if="feedback"
          severity="info"
          :closable="false"
          aria-live="polite"
        >
          {{ feedback }}
        </Message>
        <progress
          v-if="submitting && file"
          :value="uploadProgress"
          max="100"
          aria-label="Загрузка файла"
        />

        <div v-if="transportRetryAvailable" class="transport-retry">
          <p>
            Повтор использует тот же ключ и неизменённое содержимое. Новое
            сообщение создано не будет.
          </p>
          <Button
            type="button"
            label="Повторить тот же запрос"
            icon="pi pi-refresh"
            :loading="submitting"
            @click="retryTransport"
          />
          <Button
            type="button"
            label="Изменить сообщение"
            severity="secondary"
            text
            :disabled="submitting"
            @click="editAfterTransportFailure"
          />
        </div>
        <div v-else class="composer-actions">
          <Button
            type="submit"
            label="Отправить в Telegram"
            icon="pi pi-send"
            :loading="submitting"
            :disabled="!sendAllowed || submitting || (!text.trim() && !file)"
          />
        </div>
      </form>

      <section class="history" aria-labelledby="telegram-history-title">
        <header>
          <div>
            <span>Без содержимого сообщений</span>
            <h3 id="telegram-history-title">История доставки</h3>
          </div>
          <Button
            v-if="canSend"
            type="button"
            label="Обновить"
            icon="pi pi-refresh"
            severity="secondary"
            text
            size="small"
            :loading="historyLoading"
            @click="controller.loadHistory"
          />
        </header>
        <p v-if="historyLoading" role="status">Загружаем историю…</p>
        <p v-else-if="!history.length" class="empty">
          Отправок в Telegram пока нет.
        </p>
        <ol v-else>
          <li v-for="message in history" :key="message.id">
            <div>
              <strong>{{ kindLabel(message.kind) }}</strong>
              <span>{{ formatTimestamp(message.createdAt) }}</span>
            </div>
            <strong :data-status="message.status">
              {{ telegramPersonalStatusLabel(message) }}
            </strong>
            <small>Попыток: {{ message.attemptCount }}</small>
            <small v-if="message.status === 'RETRY_WAIT'">
              {{ retryAtLabel(message.nextAttemptAt) }}
            </small>
            <small v-if="message.providerMessageId">
              ID сообщения Telegram: {{ message.providerMessageId }}
            </small>
            <small
              v-if="
                message.status === 'FAILED_PERMANENT' ||
                message.status === 'CANCELLED'
              "
              class="failure"
            >
              {{ telegramPersonalFailureLabel(message.errorCode) }}
            </small>
            <small v-if="message.status === 'OUTCOME_UNKNOWN'" class="failure">
              Telegram мог принять сообщение. Автоматический повтор отключён.
            </small>
          </li>
        </ol>
        <p v-if="polling" role="status" aria-live="polite">
          Проверяем статус отправки…
        </p>
      </section>
    </div>
  </Dialog>
</template>

<style scoped>
.telegram-send,
.composer,
.attachment,
.history {
  display: grid;
  gap: 12px;
}
.target {
  margin: 0;
  color: var(--text-secondary);
}
.composer label,
.history h3 {
  font-weight: 700;
}
.composer small,
.attachment small,
.history header span,
.history li span,
.history li small,
.empty {
  color: var(--text-secondary);
  font-size: 0.72rem;
}
.attachment {
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
}
.selected-file,
.composer-actions,
.transport-retry,
.history header,
.history li > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.transport-retry {
  flex-wrap: wrap;
}
.transport-retry p {
  flex: 1 1 100%;
  margin: 0;
}
progress {
  width: 100%;
}
.history {
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}
.history h3 {
  margin: 2px 0 0;
}
.history ol {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.history li {
  display: grid;
  gap: 5px;
  padding: 11px;
  border-radius: 12px;
  background: var(--surface-ground);
}
.failure {
  color: var(--status-danger-text) !important;
}
@media (max-width: 520px) {
  .selected-file,
  .transport-retry {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
