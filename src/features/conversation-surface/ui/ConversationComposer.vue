<script setup lang="ts">
import { computed, ref } from "vue";
import Button from "primevue/button";
import Textarea from "primevue/textarea";
import ReplyTranslationPreview from "@/features/conversation-translation/ui/ReplyTranslationPreview.vue";
import type {
  ConversationSurfaceComposer,
  ConversationSurfaceComposerAction,
} from "../model/conversation-surface-contract";

const props = defineProps<{
  composer: ConversationSurfaceComposer;
  draft: string;
  workingLocaleLabel: string;
}>();

const emit = defineEmits<{
  "update:draft": [value: string];
  "send-source": [];
  "request-reply-translation": [];
  "reconcile-reply-translation": [];
  "retry-reply-translation": [];
  "save-reply-translation": [text: string];
  "send-reply-translation": [text?: string];
  "check-send-outcome": [];
  "discard-send-attempt": [];
  "change-mode": [mode: "PUBLIC_REPLY" | "INTERNAL_NOTE"];
  action: [action: ConversationSurfaceComposerAction];
  "add-attachments": [files: File[]];
  "remove-attachment": [localId: string];
  "retry-attachment": [localId: string];
  "download-attachment": [attachmentId: string];
}>();

const actionMenuVisible = ref(false);
const attachmentInput = ref<HTMLInputElement | null>(null);
const readyAttachmentCount = computed(
  () => props.composer.attachments?.items.filter((item) => item.state === "READY" && item.canAttach).length ?? 0,
);
const blocked = computed(
  () =>
    props.composer.visibility !== "ENABLED" ||
    props.composer.sending ||
    props.composer.outcome?.state === "CHECKING_OUTCOME" ||
    props.composer.outcome?.state === "BLOCKED" ||
    props.composer.sendCapability.kind === "BLOCKED",
);
const sourceSendEnabled = computed(
  () =>
    !blocked.value &&
    props.composer.sendCapability.kind === "SOURCE" &&
    (Boolean(props.draft.trim()) || readyAttachmentCount.value > 0) &&
    !props.composer.attachments?.busy &&
    (props.composer.mode !== "INTERNAL_NOTE" ||
      new TextEncoder().encode(props.draft.trim()).byteLength <= 20_480),
);
const noteByteLength = computed(() =>
  props.composer.mode === "INTERNAL_NOTE"
    ? new TextEncoder().encode(props.draft).byteLength
    : 0,
);
const translatedSendDisabled = computed(() => {
  const preview = props.composer.replyPreview;
  return (
    blocked.value ||
    props.composer.mode !== "PUBLIC_REPLY" ||
    props.composer.sendCapability.kind !== "TRANSLATED_PREVIEW" ||
    !preview ||
    preview.busy ||
    preview.stale ||
    preview.disabled ||
    props.composer.attachments?.busy ||
    preview.draft?.status !== "READY"
  );
});
const blockedReason = computed(() =>
  props.composer.sendCapability.kind === "BLOCKED"
    ? props.composer.sendCapability.reason
    : "",
);
const translated = computed(
  () =>
    props.composer.mode === "PUBLIC_REPLY" &&
    Boolean(props.composer.replyPreview),
);
const hasActionMenuItems = computed(() =>
  [
    props.composer.actions.attachment,
    props.composer.actions.createTicket,
    props.composer.actions.classifyCase,
    props.composer.actions.internalNotes,
    props.composer.actions.sendWithoutTranslation,
  ].some((action) => action && action.visibility !== "HIDDEN"),
);
const footerVisible = computed(
  () =>
    props.composer.sendCapability.kind !== "TRANSLATED_PREVIEW" ||
    hasActionMenuItems.value ||
    props.composer.actions.templates.visibility !== "HIDDEN" ||
    props.composer.actions.improveWithAI.visibility !== "HIDDEN",
);

function requestSourceSend(): void {
  if (sourceSendEnabled.value) emit("send-source");
}

function requestTranslatedSend(text?: string): void {
  if (!translatedSendDisabled.value && (text === undefined || text.trim()))
    emit("send-reply-translation", text);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.isComposing || event.shiftKey) return;
  const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
  const command = (event.ctrlKey || event.metaKey) && !event.altKey;
  if (!plain && !command) return;
  event.preventDefault();
  if (props.composer.sendCapability.kind === "TRANSLATED_PREVIEW")
    requestTranslatedSend();
  else requestSourceSend();
}

function runAction(action: ConversationSurfaceComposerAction): void {
  actionMenuVisible.value = false;
  if (blocked.value) return;
  if (action === "ATTACHMENT") {
    attachmentInput.value?.click();
    return;
  }
  emit("action", action);
}

function selectAttachments(event: Event): void {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = "";
  if (files.length) emit("add-attachments", files);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} КБ`;
  return `${(value / (1024 * 1024)).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
}

function attachmentStateLabel(state: NonNullable<ConversationSurfaceComposer["attachments"]>["items"][number]["state"]): string {
  return {
    QUEUED: "Готовим",
    UPLOADING: "Загружаем",
    SCANNING: "Проверяем",
    READY: "Готово",
    REJECTED: "Отклонено",
    FAILED: "Ошибка",
    EXPIRED: "Срок истёк",
    REVOKED: "Удалено",
  }[state];
}

function runOutcomeAction(): void {
  if (props.composer.outcome?.action?.kind === "DISCARD") {
    emit("discard-send-attempt");
    return;
  }
  emit("check-send-outcome");
}
</script>

<template>
  <form
    class="conversation-composer"
    :class="{
      'is-translated': translated,
      'is-note': composer.mode === 'INTERNAL_NOTE',
      'is-blocked': blocked,
    }"
    :aria-label="
      composer.mode === 'INTERNAL_NOTE'
        ? 'Внутренняя заметка'
        : 'Ответ пользователю'
    "
    @submit.prevent="requestSourceSend"
  >
    <div
      v-if="composer.modeSwitch"
      class="conversation-composer__mode-switch"
      role="group"
      aria-label="Вид сообщения"
    >
      <button
        type="button"
        :class="{ active: composer.mode === 'PUBLIC_REPLY' }"
        :aria-pressed="composer.mode === 'PUBLIC_REPLY'"
        :disabled="composer.modeSwitch.publicReply.visibility !== 'ENABLED'"
        :title="composer.modeSwitch.publicReply.reason"
        @click="emit('change-mode', 'PUBLIC_REPLY')"
      >
        <i class="pi pi-send" aria-hidden="true" />
        Ответ пользователю
      </button>
      <button
        type="button"
        :class="{ active: composer.mode === 'INTERNAL_NOTE' }"
        :aria-pressed="composer.mode === 'INTERNAL_NOTE'"
        :disabled="composer.modeSwitch.internalNote.visibility !== 'ENABLED'"
        :title="composer.modeSwitch.internalNote.reason"
        @click="emit('change-mode', 'INTERNAL_NOTE')"
      >
        <i class="pi pi-lock" aria-hidden="true" />
        Внутренняя заметка
      </button>
      <span v-if="composer.mode === 'INTERNAL_NOTE'">
        <i class="pi pi-shield" aria-hidden="true" />
        Видно только команде
      </span>
    </div>
    <div class="conversation-composer__source">
      <div class="conversation-composer__label">
        <span>
          {{ composer.mode === "INTERNAL_NOTE" ? "Заметка" : "Ваш текст" }} ·
          {{ workingLocaleLabel }}
        </span>
        <span
          v-if="composer.recipientStatus"
          class="conversation-composer__recipient"
          :class="`is-${composer.recipientStatus.tone.toLowerCase()}`"
        >
          <i
            :class="
              composer.recipientStatus.tone === 'ONLINE'
                ? 'pi pi-circle-fill'
                : 'pi pi-wifi'
            "
            aria-hidden="true"
          />
          {{ composer.recipientStatus.label }}
        </span>
      </div>
      <Textarea
        :model-value="draft"
        rows="2"
        :maxlength="composer.mode === 'INTERNAL_NOTE' ? 20480 : 10000"
        :placeholder="
          composer.mode === 'INTERNAL_NOTE'
            ? 'Добавьте заметку для команды'
            : 'Ответить от имени оператора'
        "
        :aria-label="
          composer.mode === 'INTERNAL_NOTE'
            ? 'Внутренняя заметка'
            : 'Ответ пользователю'
        "
        :disabled="blocked"
        @update:model-value="emit('update:draft', $event)"
        @keydown="handleKeydown"
      />
      <input
        v-if="composer.attachments"
        ref="attachmentInput"
        hidden
        type="file"
        multiple
        :accept="composer.attachments.accept"
        tabindex="-1"
        @change="selectAttachments"
      />
      <section
        v-if="composer.attachments?.items.length || composer.attachments?.loading"
        class="conversation-composer__attachments"
        aria-label="Вложения к сообщению"
        aria-live="polite"
      >
        <header>
          <span><i class="pi pi-paperclip" aria-hidden="true" /> Вложения</span>
          <small>{{ composer.attachments.items.filter((item) => ['QUEUED', 'UPLOADING', 'SCANNING', 'READY'].includes(item.state)).length }} из {{ composer.attachments.maxFiles }}</small>
        </header>
        <ul>
          <li v-for="item in composer.attachments.items" :key="item.localId" :class="`is-${item.state.toLowerCase()}`">
            <i :class="item.contentType.startsWith('image/') ? 'pi pi-image' : 'pi pi-file'" aria-hidden="true" />
            <span>
              <strong :title="item.filename">{{ item.filename }}</strong>
              <small>
                {{ formatBytes(item.sizeBytes) }} ·
                {{ item.state === 'FAILED' && !item.canRetry ? 'Выберите файл заново' : attachmentStateLabel(item.state) }}
              </small>
            </span>
            <span class="conversation-composer__attachment-state" aria-hidden="true">
              <i v-if="['QUEUED', 'UPLOADING', 'SCANNING'].includes(item.state)" class="pi pi-spin pi-spinner" />
              <i v-else-if="item.state === 'READY'" class="pi pi-check-circle" />
              <i v-else class="pi pi-exclamation-circle" />
            </span>
            <span class="conversation-composer__attachment-actions">
              <button
                v-if="item.state === 'FAILED' && item.canRetry"
                type="button"
                :aria-label="`Повторить загрузку ${item.filename}`"
                title="Повторить загрузку"
                :disabled="blocked"
                @click="emit('retry-attachment', item.localId)"
              ><i class="pi pi-refresh" aria-hidden="true" /></button>
              <button
                v-if="item.id && item.state === 'READY' && composer.attachments.canDownload"
                type="button"
                :aria-label="`Скачать ${item.filename}`"
                title="Скачать"
                :disabled="blocked"
                @click="emit('download-attachment', item.id)"
              ><i class="pi pi-download" aria-hidden="true" /></button>
              <button
                type="button"
                :aria-label="`Убрать ${item.filename}`"
                title="Убрать вложение"
                :disabled="blocked"
                @click="emit('remove-attachment', item.localId)"
              ><i class="pi pi-times" aria-hidden="true" /></button>
            </span>
          </li>
        </ul>
      </section>
      <p v-if="composer.attachments?.error" class="conversation-composer__attachment-error" role="alert">
        {{ composer.attachments.error }}
      </p>
      <p
        v-if="composer.mode === 'INTERNAL_NOTE'"
        class="conversation-composer__private-hint"
        :class="{ 'is-invalid': noteByteLength > 20480 }"
      >
        <span>Не попадёт пользователю, в AI или в публичную историю.</span>
        <span>{{ noteByteLength.toLocaleString("ru-RU") }} / 20 480 байт</span>
      </p>
    </div>

    <ReplyTranslationPreview
      v-if="composer.mode === 'PUBLIC_REPLY' && composer.replyPreview"
      :draft="composer.replyPreview.draft"
      :target-locale="composer.replyPreview.targetLocale"
      :busy="composer.replyPreview.busy"
      :stale="composer.replyPreview.stale"
      :disabled="composer.replyPreview.disabled"
      :send-disabled="translatedSendDisabled"
      :show-provider-details="composer.replyPreview.showProviderDetails"
      @preview="emit('request-reply-translation')"
      @reconcile="emit('reconcile-reply-translation')"
      @retry="emit('retry-reply-translation')"
      @save-edit="emit('save-reply-translation', $event)"
      @send="requestTranslatedSend"
    />

    <div
      v-else-if="
        composer.mode === 'PUBLIC_REPLY' &&
        composer.translationAssist &&
        draft.trim()
      "
      class="conversation-composer__assist"
    >
      <div>
        <span>Нужна языковая обработка?</span>
        <strong>
          {{
            composer.translationAssist.targetLocale
              ? `Перевод на ${composer.translationAssist.targetLocale.toUpperCase()}`
              : "Язык можно выбрать в настройках"
          }}
        </strong>
      </div>
      <Button
        type="button"
        :label="
          composer.translationAssist.targetLocale
            ? `Перевести на ${composer.translationAssist.targetLocale.toUpperCase()}`
            : 'Перевести ответ'
        "
        icon="pi pi-sparkles"
        size="small"
        :loading="composer.translationAssist.busy"
        :disabled="composer.translationAssist.disabled"
        @click="emit('request-reply-translation')"
      />
    </div>

    <p
      v-if="composer.outcome"
      class="conversation-composer__outcome"
      :class="`is-${composer.outcome.state.toLowerCase()}`"
      role="status"
      aria-live="polite"
    >
      <span>
        <i
          :class="
            composer.outcome.state === 'CHECKING_OUTCOME'
              ? 'pi pi-search'
              : composer.outcome.state === 'RETRYABLE'
                ? 'pi pi-refresh'
                : 'pi pi-lock'
          "
          aria-hidden="true"
        />
        {{ composer.outcome.label }}
      </span>
      <Button
        v-if="composer.outcome.action"
        type="button"
        :label="composer.outcome.action.label"
        :icon="
          composer.outcome.action.kind === 'DISCARD'
            ? 'pi pi-refresh'
            : 'pi pi-search'
        "
        severity="secondary"
        outlined
        size="small"
        :loading="composer.sending"
        @click="runOutcomeAction"
      />
    </p>

    <p
      v-if="blockedReason"
      class="conversation-composer__blocked"
      role="status"
    >
      {{ blockedReason }}
    </p>

    <footer v-if="footerVisible" class="conversation-composer__footer">
      <span>
        {{
          translated
            ? `Шаг ${composer.replyPreview?.draft?.status === "READY" ? "2 из 2 · перевод готов и проверен" : "1 из 2 · сначала перевод, затем отправка"}`
            : "Enter — отправить · Shift+Enter — перенос строки"
        }}
      </span>
      <div>
        <div v-if="hasActionMenuItems" class="conversation-composer__actions">
          <button
            v-if="actionMenuVisible"
            type="button"
            class="conversation-composer__backdrop"
            aria-label="Закрыть меню действий"
            @click="actionMenuVisible = false"
          />
          <Button
            type="button"
            label="Действие"
            icon="pi pi-plus"
            severity="secondary"
            outlined
            aria-haspopup="menu"
            :aria-expanded="actionMenuVisible"
            :disabled="blocked"
            @click="actionMenuVisible = !actionMenuVisible"
          />
          <div
            v-if="actionMenuVisible"
            class="conversation-composer__action-menu"
            role="menu"
          >
            <strong>Действия в диалоге</strong>
            <button
              v-if="composer.actions.attachment.visibility !== 'HIDDEN'"
              type="button"
              role="menuitem"
              :disabled="blocked || composer.actions.attachment.visibility === 'DISABLED'"
              :title="composer.actions.attachment.reason"
              @click="runAction('ATTACHMENT')"
            >
              <i class="pi pi-paperclip" aria-hidden="true" />
              <span>
                <strong>Файл или скриншот</strong>
                <small>Добавить вложение к ответу</small>
              </span>
            </button>
            <button
              v-if="composer.actions.createTicket.visibility !== 'HIDDEN'"
              type="button"
              role="menuitem"
              :disabled="
                composer.actions.createTicket.visibility === 'DISABLED'
              "
              :title="composer.actions.createTicket.reason"
              @click="runAction('CREATE_TICKET')"
            >
              <i class="pi pi-plus-square" aria-hidden="true" />
              <span>
                <strong>Создать тикет</strong>
                <small>Открыть форму внешнего обращения</small>
              </span>
            </button>
            <button
              v-if="
                composer.actions.classifyCase &&
                composer.actions.classifyCase.visibility !== 'HIDDEN'
              "
              type="button"
              role="menuitem"
              :disabled="
                composer.actions.classifyCase.visibility === 'DISABLED'
              "
              :title="composer.actions.classifyCase.reason"
              @click="runAction('CLASSIFY_CASE')"
            >
              <i class="pi pi-tags" aria-hidden="true" />
              <span>
                <strong>Изменить классификацию</strong>
                <small>Тема и приоритет обращения</small>
              </span>
            </button>
            <button
              v-if="
                composer.actions.internalNotes &&
                composer.actions.internalNotes.visibility !== 'HIDDEN'
              "
              type="button"
              role="menuitem"
              :disabled="
                composer.actions.internalNotes.visibility === 'DISABLED'
              "
              :title="composer.actions.internalNotes.reason"
              @click="runAction('INTERNAL_NOTES')"
            >
              <i class="pi pi-lock" aria-hidden="true" />
              <span>
                <strong>Внутренние заметки</strong>
                <small>Открыть обсуждение команды</small>
              </span>
            </button>
            <button
              v-if="
                composer.actions.sendWithoutTranslation.visibility !== 'HIDDEN'
              "
              type="button"
              role="menuitem"
              :disabled="
                composer.actions.sendWithoutTranslation.visibility ===
                'DISABLED'
              "
              :title="composer.actions.sendWithoutTranslation.reason"
              @click="runAction('SEND_WITHOUT_TRANSLATION')"
            >
              <i class="pi pi-send" aria-hidden="true" />
              <span>
                <strong>Отправить без перевода</strong>
                <small>Потребуется указать причину</small>
              </span>
            </button>
          </div>
        </div>
        <Button
          v-if="composer.actions.templates.visibility !== 'HIDDEN'"
          type="button"
          label="Шаблоны"
          severity="secondary"
          outlined
          :disabled="
            composer.actions.templates.visibility === 'DISABLED' || blocked
          "
          :title="composer.actions.templates.reason"
          @click="emit('action', 'TEMPLATES')"
        />
        <Button
          v-if="composer.actions.improveWithAI.visibility !== 'HIDDEN'"
          type="button"
          label="Улучшить с AI"
          icon="pi pi-sparkles"
          severity="secondary"
          text
          class="conversation-composer__ai"
          :disabled="
            composer.actions.improveWithAI.visibility === 'DISABLED' || blocked
          "
          :title="composer.actions.improveWithAI.reason"
          @click="emit('action', 'IMPROVE_WITH_AI')"
        />
        <Button
          v-if="composer.sendCapability.kind !== 'TRANSLATED_PREVIEW'"
          type="submit"
          :label="
            composer.mode === 'INTERNAL_NOTE'
              ? 'Добавить заметку'
              : composer.outcome?.state === 'RETRYABLE'
                ? 'Повторить отправку'
                : 'Отправить'
          "
          :icon="
            composer.mode === 'INTERNAL_NOTE' ? 'pi pi-lock' : 'pi pi-send'
          "
          class="conversation-composer__send"
          :loading="composer.sending"
          :disabled="!sourceSendEnabled"
        />
      </div>
    </footer>
  </form>
</template>

<style scoped>
.conversation-composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin: 0 20px 14px;
  padding: 10px 12px 9px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--surface-subtle);
}
.conversation-composer__mode-switch {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
}
.conversation-composer__mode-switch button {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}
.conversation-composer__mode-switch button:hover:not(:disabled) {
  background: var(--surface-card);
  color: var(--text-primary);
}
.conversation-composer__mode-switch button:active:not(:disabled) {
  transform: translateY(1px);
}
.conversation-composer__mode-switch button.active {
  border-color: var(--border-default);
  background: var(--surface-card);
  color: var(--text-primary);
}
.is-note .conversation-composer__mode-switch button.active {
  border-color: var(--status-warning-border, var(--border-default));
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
}
.conversation-composer__mode-switch button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.conversation-composer__mode-switch > span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  color: var(--status-warning-text);
  font-size: 11px;
  font-weight: 750;
}
.conversation-composer.is-translated {
  position: relative;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}
.conversation-composer.is-note {
  background: color-mix(
    in srgb,
    var(--status-warning-soft) 20%,
    var(--surface-card)
  );
}
.conversation-composer.is-note :deep(textarea) {
  min-height: 42px;
  max-height: 76px;
}
.conversation-composer.is-note .conversation-composer__label {
  display: none;
}
.conversation-composer.is-note .conversation-composer__footer {
  min-height: 34px;
  padding-top: 6px;
}
.conversation-composer.is-blocked {
  opacity: 0.72;
}
.conversation-composer__source {
  display: grid;
  min-width: 0;
  gap: 7px;
}
.conversation-composer__private-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: -2px 0 0;
  color: var(--text-secondary);
  font-size: 10px;
}
.conversation-composer__private-hint.is-invalid {
  color: var(--status-danger-text);
  font-weight: 700;
}
.conversation-composer__attachments {
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface-ground) 58%, transparent);
  animation: attachment-tray-in 160ms ease-out;
}
.conversation-composer__attachments > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 750;
}
.conversation-composer__attachments > header span { display: inline-flex; align-items: center; gap: 5px; }
.conversation-composer__attachments ul {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.conversation-composer__attachments li {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 20px auto;
  min-height: 44px;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface-card);
}
.conversation-composer__attachments li > span { min-width: 0; }
.conversation-composer__attachments li strong,
.conversation-composer__attachments li small { display: block; }
.conversation-composer__attachments li strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conversation-composer__attachments li small { color: var(--text-muted); font-size: 9px; }
.conversation-composer__attachment-actions { display: inline-flex; align-items: center; justify-content: flex-end; gap: 2px; }
.conversation-composer__attachment-actions > button {
  display: inline-grid;
  width: 28px;
  height: 28px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 7px;
  color: var(--text-secondary);
  background: transparent;
  cursor: pointer;
}
.conversation-composer__attachment-actions > button:hover { background: var(--surface-hover); color: var(--text-primary); }
.conversation-composer__attachment-actions > button:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
.conversation-composer__attachments .is-ready > .pi-check-circle { color: var(--status-success); }
.conversation-composer__attachments .is-rejected,
.conversation-composer__attachments .is-failed,
.conversation-composer__attachments .is-expired { border-color: var(--status-danger-border); background: var(--status-danger-soft); }
.conversation-composer__attachment-error { margin: 0; color: var(--status-danger-text); font-size: 10px; }
@keyframes attachment-tray-in { from { opacity: 0; transform: translateY(4px); } }
.is-translated .conversation-composer__source {
  padding-right: 14px;
  padding-bottom: 46px;
  border-right: 1px solid var(--border-subtle);
}
.conversation-composer__label {
  display: flex;
  min-height: 22px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.conversation-composer__label > span:first-child {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 7px;
  border-radius: 5px;
  background: var(--border-subtle);
  color: var(--text-secondary);
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
}
.conversation-composer__recipient {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
}
.conversation-composer__recipient.is-online {
  color: var(--status-success);
}
.conversation-composer__recipient.is-offline {
  color: var(--status-warning-text);
}
.conversation-composer__recipient i {
  margin-right: 4px;
  font-size: 9px;
}
.conversation-composer :deep(textarea) {
  width: 100%;
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
  resize: none;
  box-shadow: none;
}
.conversation-composer :deep(.reply-preview) {
  min-width: 0;
}
.conversation-composer__assist {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 9px 7px 11px;
  border: 1px solid var(--palette-blue-200);
  border-radius: 10px;
  background: var(--status-accent-soft);
}
.conversation-composer__assist > div {
  display: grid;
  min-width: 0;
  gap: 1px;
}
.conversation-composer__assist span {
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}
.conversation-composer__assist strong {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conversation-composer__blocked {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--status-warning-text);
  font-size: 11px;
}
.conversation-composer__outcome {
  display: flex;
  grid-column: 1 / -1;
  min-height: 38px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
  padding: 7px 9px;
  border: 1px solid var(--palette-blue-200);
  border-radius: 10px;
  background: var(--status-accent-soft);
  color: var(--text-secondary);
  font-size: 11px;
}
.conversation-composer__outcome > span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.conversation-composer__outcome.is-retryable {
  border-color: var(--status-warning-border, var(--border-default));
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
}
.conversation-composer__outcome.is-blocked {
  border-color: var(--status-danger-border, var(--border-default));
  background: var(--status-danger-soft, var(--surface-subtle));
  color: var(--status-danger);
}
.conversation-composer__footer {
  display: flex;
  grid-column: 1 / -1;
  min-height: 38px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
}
.conversation-composer__footer > span {
  max-width: 610px;
  color: var(--text-tertiary);
  font-size: 11px;
}
.conversation-composer__footer > div {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.conversation-composer__footer :deep(.p-button) {
  min-height: 36px;
  border-radius: 10px;
  font-size: 12px;
}
.conversation-composer__send {
  min-width: 132px;
}
.conversation-composer__ai {
  opacity: 0.58;
}
.is-translated .conversation-composer__footer {
  position: absolute;
  bottom: 10px;
  left: 14px;
  width: calc(50% - 21px);
  min-height: 42px;
}
.is-translated .conversation-composer__footer > span {
  display: none;
}
.is-translated .conversation-composer__footer > div {
  width: 100%;
  justify-content: flex-start;
}
.conversation-composer__actions {
  position: relative;
}
.conversation-composer__backdrop {
  display: none;
}
.conversation-composer__action-menu {
  position: absolute;
  z-index: 5;
  bottom: calc(100% + 8px);
  left: 0;
  display: grid;
  width: 290px;
  gap: 3px;
  padding: 8px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--surface-card);
  box-shadow: var(--shadow);
}
.conversation-composer__action-menu > strong {
  padding: 7px 10px;
  font-size: 12px;
}
.conversation-composer__action-menu button {
  display: flex;
  min-height: 52px;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}
.conversation-composer__action-menu button:hover {
  background: var(--surface-subtle);
}
.conversation-composer__action-menu button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.conversation-composer__action-menu button > i {
  color: var(--status-accent-text);
}
.conversation-composer__action-menu button > span {
  display: grid;
  gap: 2px;
}
.conversation-composer__action-menu strong {
  font-size: 13px;
}
.conversation-composer__action-menu small {
  color: var(--text-secondary);
  font-size: 11px;
}
@container conversation-surface (max-width: 720px) {
  .conversation-composer.is-translated {
    grid-template-columns: 1fr;
  }
  .is-translated :deep(.reply-preview) {
    order: 2;
    padding-top: 10px;
    border-top: 1px solid var(--border-subtle);
  }
  .is-translated .conversation-composer__source {
    order: 1;
    padding: 0;
    border-right: 0;
  }
  .is-translated .conversation-composer__footer {
    position: static;
    width: auto;
    order: 3;
  }
  .conversation-composer__footer {
    align-items: flex-end;
  }
  .conversation-composer__footer > span {
    display: none;
  }
  .conversation-composer__footer > div {
    width: 100%;
    flex-wrap: wrap;
  }
  .conversation-composer__footer :deep(.p-button),
  .conversation-composer__actions {
    flex: 1 1 auto;
  }
  .conversation-composer__actions > :deep(.p-button) {
    width: 100%;
    min-height: 44px;
  }
  .conversation-composer__footer :deep(.p-button) {
    min-height: 44px;
  }
  .conversation-composer.is-note
    .conversation-composer__footer
    :deep(.p-button) {
    min-height: 40px;
  }
}
@media (max-width: 767px) {
  .conversation-composer {
    margin: 0;
    padding: 11px 12px calc(12px + env(safe-area-inset-bottom));
    border-width: 1px 0 0;
    border-radius: 0;
    background: var(--surface-card);
  }
  .conversation-composer__action-menu {
    position: fixed;
    right: 12px;
    bottom: 12px;
    left: 12px;
    width: auto;
  }
  .conversation-composer__mode-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .conversation-composer__mode-switch button {
    justify-content: center;
    min-height: 40px;
    padding-inline: 7px;
  }
  .conversation-composer__mode-switch > span {
    grid-column: 1 / -1;
    margin: 2px 0 0;
  }
}
@media (max-width: 767px) and (max-height: 600px) {
  .conversation-composer {
    gap: 5px;
    padding-top: 8px;
  }
  .conversation-composer__label {
    display: none;
  }
  .conversation-composer :deep(textarea) {
    min-height: 38px;
    max-height: 64px;
    padding-block: 3px;
  }
  .conversation-composer__footer {
    min-height: 36px;
    padding-top: 5px;
  }
}
@media (min-width: 768px) and (max-height: 760px) {
  .conversation-composer {
    gap: 5px;
    margin: 0 12px 8px;
    padding: 7px 10px 6px;
  }
  .conversation-composer__mode-switch button {
    min-height: 28px;
    padding-inline: 8px;
  }
  .conversation-composer.is-note :deep(textarea) {
    min-height: 34px;
    max-height: 48px;
    padding-block: 3px;
  }
  .conversation-composer__private-hint {
    margin-top: -3px;
  }
  .conversation-composer.is-note .conversation-composer__footer {
    min-height: 32px;
    padding-top: 4px;
  }
  .conversation-composer__footer :deep(.p-button) {
    min-height: 32px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .conversation-composer__mode-switch button {
    transition: none;
  }
}
</style>
