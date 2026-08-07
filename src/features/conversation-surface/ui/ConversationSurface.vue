<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import Avatar from "primevue/avatar";
import Button from "primevue/button";
import ConversationAISuspensionHeaderActions from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionHeaderActions.vue";
import TranslatedMessageBody from "@/features/conversation-translation/ui/TranslatedMessageBody.vue";
import { relativeTime } from "@/shared/lib/format";
import ConversationComposer from "./ConversationComposer.vue";
import {
  conversationSurfaceDraftKey,
  type ConversationSurfaceAISuspensionCapability,
  type ConversationSurfaceComposer,
  type ConversationSurfaceComposerAction,
  type ConversationSurfaceHistory,
  type ConversationSurfaceMessage,
  type ConversationSurfaceReconcileIssue,
  type ConversationSurfaceSendRequest,
  type ConversationSurfaceTranslation,
} from "../model/conversation-surface-contract";
import {
  conversationSurfaceSessionKey,
  readConversationSurfaceScrollAnchor,
  writeConversationSurfaceScrollAnchor,
} from "../model/conversation-surface-session";

const props = defineProps<{
  title: string;
  messages: ConversationSurfaceMessage[];
  history: ConversationSurfaceHistory;
  translation: ConversationSurfaceTranslation;
  composer: ConversationSurfaceComposer;
  aiSuspension?: ConversationSurfaceAISuspensionCapability;
}>();

const emit = defineEmits<{
  "load-older": [];
  "cancel-translation": [];
  "change-translation-mode": [mode: "ORIGINAL" | "TRANSLATED"];
  "reconcile-required": [issues: ConversationSurfaceReconcileIssue[]];
  "draft-change": [request: ConversationSurfaceSendRequest];
  send: [request: ConversationSurfaceSendRequest];
  "request-reply-translation": [];
  "reconcile-reply-translation": [];
  "retry-reply-translation": [];
  "save-reply-translation": [text: string];
  "send-reply-translation": [request: ConversationSurfaceSendRequest];
  "composer-action": [action: ConversationSurfaceComposerAction];
  "start-ai-suspension": [];
  "show-ai-suspension-history": [];
  "retry-ai-suspension": [];
}>();

const logElement = ref<HTMLElement | null>(null);
const drafts = new Map<string, string>();
const draft = ref(props.composer.initialDraft);
const newMessageCount = ref(0);
let anchor: { height: number; top: number } | null = null;

const draftKey = computed(() => conversationSurfaceDraftKey(props.composer));
const conversationKey = computed(() => {
  const { projectId, conversationId } = props.composer.scope;
  return `${projectId}:${conversationId}`;
});
const scrollSessionKey = computed(() =>
  conversationSurfaceSessionKey(props.composer.scope),
);
const composerDisabled = computed(
  () =>
    props.composer.visibility !== "ENABLED" ||
    props.composer.sending ||
    props.composer.sendCapability.kind === "BLOCKED",
);
const canSend = computed(
  () =>
    !composerDisabled.value &&
    props.composer.sendCapability.kind === "SOURCE" &&
    Boolean(draft.value.trim()),
);
const translationSendDisabled = computed(() => {
  const preview = props.composer.replyPreview;
  return (
    composerDisabled.value ||
    props.composer.sendCapability.kind !== "TRANSLATED_PREVIEW" ||
    !preview ||
    preview.busy ||
    preview.stale ||
    preview.disabled ||
    preview.draft?.status !== "READY"
  );
});

const messageProjection = computed(() => {
  const byId = new Map<string, ConversationSurfaceMessage>();
  const issues: ConversationSurfaceReconcileIssue[] = [];
  for (const message of props.messages) {
    const existing = byId.get(message.id);
    if (
      existing &&
      (existing.ordinal !== message.ordinal ||
        existing.revision !== message.revision ||
        existing.author.displayName !== message.author.displayName ||
        existing.author.avatarUrl !== message.author.avatarUrl)
    ) {
      issues.push({ kind: "MESSAGE_ID_CONFLICT", messageId: message.id });
      continue;
    }
    byId.set(message.id, message);
  }

  const ordered = [...byId.values()].sort(
    (left, right) =>
      left.ordinal - right.ordinal || left.id.localeCompare(right.id),
  );
  const idsByOrdinal = new Map<number, string[]>();
  for (const message of ordered) {
    const ids = idsByOrdinal.get(message.ordinal) ?? [];
    ids.push(message.id);
    idsByOrdinal.set(message.ordinal, ids);
  }
  for (const [ordinal, messageIds] of idsByOrdinal) {
    if (messageIds.length > 1)
      issues.push({ kind: "ORDINAL_COLLISION", ordinal, messageIds });
  }
  const ordinals = [...idsByOrdinal.keys()].sort((left, right) => left - right);
  for (let index = 1; index < ordinals.length; index += 1) {
    const afterOrdinal = ordinals[index - 1]!;
    const beforeOrdinal = ordinals[index]!;
    if (beforeOrdinal - afterOrdinal > 1)
      issues.push({ kind: "ORDINAL_GAP", afterOrdinal, beforeOrdinal });
  }

  return { messages: ordered, issues };
});
const orderedMessages = computed(() => messageProjection.value.messages);

function initials(value: string): string {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("") || "?"
  ).toUpperCase();
}

function setViewMode(mode: "ORIGINAL" | "TRANSLATED"): void {
  if (mode === props.translation.mode) return;
  if (
    mode === "TRANSLATED" &&
    (!props.translation.available ||
      props.translation.loading ||
      props.translation.changing)
  )
    return;
  emit("change-translation-mode", mode);
}

function draftRequest(text = draft.value): ConversationSurfaceSendRequest {
  return { scopeKey: draftKey.value, mode: props.composer.mode, text };
}

function updateDraft(value: string): void {
  draft.value = value;
  drafts.set(draftKey.value, value);
  emit("draft-change", draftRequest(value));
}

function requestSend(): void {
  const text = draft.value.trim();
  if (!canSend.value || !text) return;
  emit("send", draftRequest(text));
}

function requestTranslatedSend(text?: string): void {
  const previewText =
    props.composer.mode === "PUBLIC_REPLY"
      ? (props.composer.replyPreview?.draft?.editedTranslatedText ??
        props.composer.replyPreview?.draft?.translatedText ??
        "")
      : "";
  const selectedText = text ?? previewText;
  if (
    props.composer.mode !== "PUBLIC_REPLY" ||
    translationSendDisabled.value ||
    !selectedText.trim()
  )
    return;
  emit("send-reply-translation", draftRequest(selectedText));
}

function nearLatest(element = logElement.value): boolean {
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight < 96;
}

function scrollToLatest(smooth = true): void {
  const element = logElement.value;
  if (!element) return;
  element.scrollTo?.({
    top: element.scrollHeight,
    behavior: smooth ? "smooth" : "auto",
  });
  if (!element.scrollTo) element.scrollTop = element.scrollHeight;
  newMessageCount.value = 0;
}

function captureScrollAnchor(key = scrollSessionKey.value): void {
  const element = logElement.value;
  if (!element) return;
  const logRect = element.getBoundingClientRect();
  const message = [
    ...element.querySelectorAll<HTMLElement>("[data-message-id]"),
  ].find((candidate) => candidate.getBoundingClientRect().bottom > logRect.top);
  const messageId = message?.dataset.messageId;
  if (!message || !messageId) return;
  writeConversationSurfaceScrollAnchor(key, {
    messageId,
    offset: message.getBoundingClientRect().top - logRect.top,
    atLatest: nearLatest(element),
  });
}

async function restoreScrollAnchor(
  key = scrollSessionKey.value,
): Promise<void> {
  await nextTick();
  const element = logElement.value;
  if (!element) return;
  const saved = readConversationSurfaceScrollAnchor(key);
  if (!saved || saved.atLatest) {
    scrollToLatest(false);
    return;
  }
  const message = [
    ...element.querySelectorAll<HTMLElement>("[data-message-id]"),
  ].find((candidate) => candidate.dataset.messageId === saved.messageId);
  if (!message) {
    scrollToLatest(false);
    return;
  }
  const logRect = element.getBoundingClientRect();
  element.scrollTop +=
    message.getBoundingClientRect().top - logRect.top - saved.offset;
}

function requestOlder(): void {
  const element = logElement.value;
  if (
    !element ||
    !props.history.hasOlder ||
    props.history.loading ||
    props.history.loadingOlder ||
    anchor
  )
    return;
  anchor = { height: element.scrollHeight, top: element.scrollTop };
  emit("load-older");
}

function handleLogScroll(): void {
  if (nearLatest()) newMessageCount.value = 0;
  if ((logElement.value?.scrollTop ?? 100) <= 72) requestOlder();
  captureScrollAnchor();
}

watch(conversationKey, () => {
  newMessageCount.value = 0;
  anchor = null;
  void nextTick(() => scrollToLatest(false));
});

watch(
  () => JSON.stringify(messageProjection.value.issues),
  () => {
    if (messageProjection.value.issues.length)
      emit("reconcile-required", messageProjection.value.issues);
  },
  { immediate: true },
);

watch(draftKey, (next, previous) => {
  if (previous) drafts.set(previous, draft.value);
  draft.value = drafts.get(next) ?? props.composer.initialDraft;
});

function acceptExternalDraft(value: string): void {
  draft.value = value;
  drafts.set(draftKey.value, value);
}

watch(
  () => [draftKey.value, props.composer.draftRevision] as const,
  ([nextKey], [previousKey]) => {
    if (nextKey === previousKey)
      acceptExternalDraft(props.composer.initialDraft);
  },
);

watch(
  () => props.composer.initialDraft,
  (value) => {
    if (value === draft.value) return;
    acceptExternalDraft(value);
  },
);

watch(
  () => [props.history.loadingOlder, orderedMessages.value.length] as const,
  async ([loadingOlder]) => {
    if (!anchor || loadingOlder) return;
    await nextTick();
    const element = logElement.value;
    if (!element) return;
    element.scrollTop = anchor.top + (element.scrollHeight - anchor.height);
    anchor = null;
  },
);

watch(
  () => orderedMessages.value.map((message) => message.id),
  async (next, previous) => {
    if (!next.length || anchor) return;
    if (!previous.length) {
      await nextTick();
      scrollToLatest(false);
      return;
    }
    const previousLast = previous.at(-1);
    const previousLastIndex = previousLast ? next.indexOf(previousLast) : -1;
    const appended =
      previousLastIndex >= 0 ? next.length - previousLastIndex - 1 : 0;
    if (!appended) return;
    const stickToBottom = nearLatest();
    await nextTick();
    if (stickToBottom) scrollToLatest(false);
    else newMessageCount.value += appended;
  },
  { flush: "pre" },
);

onMounted(() => void restoreScrollAnchor());
onBeforeUnmount(() => captureScrollAnchor());
</script>

<template>
  <section class="conversation-surface" :aria-label="`Диалог: ${title}`">
    <header class="conversation-surface__toolbar">
      <div class="conversation-surface__heading">
        <span>Переписка</span>
        <h2>{{ title }}</h2>
      </div>
      <div class="conversation-surface__toolbar-actions">
        <ConversationAISuspensionHeaderActions
          v-if="aiSuspension"
          :entry="aiSuspension.entry"
          :can-manage="aiSuspension.canManage"
          :conversation-open="aiSuspension.conversationOpen"
          :show-history="aiSuspension.showHistory"
          :hide-active-status="aiSuspension.hideActiveStatus"
          @start="emit('start-ai-suspension')"
          @history="emit('show-ai-suspension-history')"
          @retry="emit('retry-ai-suspension')"
        />
        <div
          v-if="translation.available"
          class="conversation-surface__view-toggle"
          role="group"
          aria-label="Режим отображения сообщений"
        >
          <button
            type="button"
            data-action="show-original-messages"
            :class="{ active: translation.mode === 'ORIGINAL' }"
            :aria-pressed="translation.mode === 'ORIGINAL'"
            :disabled="translation.changing"
            @click="setViewMode('ORIGINAL')"
          >
            Оригинал
          </button>
          <button
            type="button"
            data-action="show-translated-messages"
            :class="{ active: translation.mode === 'TRANSLATED' }"
            :aria-pressed="translation.mode === 'TRANSLATED'"
            :disabled="translation.loading || translation.changing"
            @click="setViewMode('TRANSLATED')"
          >
            <i class="pi pi-language" aria-hidden="true" />
            Перевод · {{ translation.workingLocaleLabel }}
          </button>
        </div>
      </div>
    </header>

    <div
      ref="logElement"
      class="conversation-surface__log"
      role="log"
      :aria-live="history.loading || history.loadingOlder ? 'off' : 'polite'"
      :aria-busy="history.loading || history.loadingOlder"
      aria-relevant="additions text"
      tabindex="0"
      @scroll.passive="handleLogScroll"
    >
      <Button
        v-if="history.hasOlder"
        type="button"
        label="Показать предыдущие сообщения"
        icon="pi pi-history"
        severity="secondary"
        text
        size="small"
        class="conversation-surface__older"
        data-action="load-older"
        :loading="history.loadingOlder"
        :disabled="history.loading"
        @click="requestOlder"
      />

      <section
        v-if="translation.progress"
        class="conversation-surface__translation-progress"
        role="status"
        aria-live="polite"
      >
        <div>
          <span>
            <i class="pi pi-spin pi-spinner" aria-hidden="true" />
            Переводим на {{ translation.workingLocaleLabel }} ·
            {{ translation.progress.completed }} из
            {{ translation.progress.total }}
          </span>
          <button
            v-if="translation.progress.cancellable"
            type="button"
            @click="emit('cancel-translation')"
          >
            Отменить
          </button>
        </div>
        <span aria-hidden="true">
          <i
            :style="{
              width: `${Math.round((translation.progress.completed / Math.max(translation.progress.total, 1)) * 100)}%`,
            }"
          />
        </span>
      </section>

      <div
        v-if="history.loading"
        class="conversation-surface__skeletons"
        aria-hidden="true"
      >
        <i v-for="index in 5" :key="index" />
      </div>
      <p
        v-else-if="history.error"
        class="conversation-surface__error"
        role="alert"
      >
        {{ history.error }}
      </p>
      <div
        v-else-if="!orderedMessages.length"
        class="conversation-surface__empty"
      >
        <i class="pi pi-comments" aria-hidden="true" />
        <strong>Пока нет сообщений</strong>
        <span>Начните диалог, когда будете готовы.</span>
      </div>
      <article
        v-for="message in orderedMessages"
        v-else
        :key="message.id"
        class="conversation-surface__message"
        :class="[
          `is-${message.placement.toLowerCase()}`,
          `is-${(message.tone ?? 'DEFAULT').toLowerCase()}`,
        ]"
        :data-message-id="message.id"
      >
        <div class="conversation-surface__message-meta">
          <span>
            <Avatar
              :image="message.author.avatarUrl ?? undefined"
              :label="initials(message.author.displayName)"
              shape="circle"
              :aria-label="`Автор: ${message.author.displayName}`"
            />
            <strong>{{ message.author.displayName }}</strong>
          </span>
          <time :datetime="message.createdAt">{{
            relativeTime(message.createdAt)
          }}</time>
        </div>
        <TranslatedMessageBody
          :message="message.content"
          :requested="message.requestedTranslation"
          :view-mode="translation.mode"
        />
        <span
          v-if="message.status"
          class="conversation-surface__message-status"
          :class="`is-${message.status.tone.toLowerCase()}`"
          >{{ message.status.label }}</span
        >
        <span
          v-if="message.delivery"
          class="conversation-surface__message-status"
          :class="`is-${message.delivery.tone.toLowerCase()}`"
          role="status"
        >
          <i
            :class="
              message.delivery.tone === 'SUCCESS'
                ? 'pi pi-check-circle'
                : 'pi pi-clock'
            "
            aria-hidden="true"
          />
          {{ message.delivery.label }}
        </span>
      </article>
    </div>

    <button
      v-if="newMessageCount"
      type="button"
      class="conversation-surface__new-messages"
      @click="scrollToLatest()"
    >
      {{ newMessageCount }} новых сообщений
      <i class="pi pi-arrow-down" aria-hidden="true" />
    </button>

    <ConversationComposer
      v-if="composer.visibility !== 'HIDDEN'"
      :composer="composer"
      :draft="draft"
      :working-locale-label="translation.workingLocaleLabel"
      @update:draft="updateDraft"
      @send-source="requestSend"
      @request-reply-translation="emit('request-reply-translation')"
      @reconcile-reply-translation="emit('reconcile-reply-translation')"
      @retry-reply-translation="emit('retry-reply-translation')"
      @save-reply-translation="emit('save-reply-translation', $event)"
      @send-reply-translation="requestTranslatedSend"
      @action="emit('composer-action', $event)"
    />
    <p
      v-else-if="composer.sendCapability.kind === 'BLOCKED'"
      class="conversation-surface__unavailable"
    >
      {{ composer.sendCapability.reason }}
    </p>
  </section>
</template>

<style scoped>
.conversation-surface {
  position: relative;
  display: grid;
  container-name: conversation-surface;
  container-type: inline-size;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  color: var(--text-primary);
  background: var(--surface-card);
}
.conversation-surface__toolbar {
  position: relative;
  z-index: 2;
  background: color-mix(in srgb, var(--surface-card) 94%, transparent);
  backdrop-filter: blur(16px);
}
.conversation-surface__unavailable {
  margin: 0;
  padding: 14px 22px;
  border-top: 1px solid var(--line);
  color: var(--text-muted);
  background: var(--surface-card);
  font-size: 0.75rem;
}
.conversation-surface__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 22px;
  border-bottom: 1px solid var(--line);
}
.conversation-surface__heading {
  min-width: 0;
}
.conversation-surface__heading > span {
  color: var(--text-muted);
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.conversation-surface__heading h2 {
  margin: 3px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conversation-surface__heading h2 {
  font-size: 1rem;
}
.conversation-surface__toolbar-actions {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.conversation-surface__view-toggle {
  display: inline-flex;
  flex: none;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-muted);
}
.conversation-surface__view-toggle button {
  min-height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 9px;
  color: var(--text-secondary);
  background: transparent;
  font: inherit;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
}
.conversation-surface__view-toggle button.active {
  color: var(--status-accent-text);
  background: var(--surface-card);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--text-primary) 10%, transparent);
}
.conversation-surface__view-toggle button:disabled {
  cursor: wait;
  opacity: 0.55;
}
.conversation-surface__log {
  min-height: 0;
  padding: 18px clamp(16px, 3vw, 36px) 26px;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  background:
    radial-gradient(
      circle at 12% 8%,
      color-mix(in srgb, var(--status-accent-soft) 42%, transparent),
      transparent 28%
    ),
    linear-gradient(180deg, var(--surface-muted), var(--surface-card) 52%);
}
.conversation-surface__older {
  display: flex;
  margin: 0 auto 14px;
}
.conversation-surface__translation-progress {
  position: sticky;
  top: 0;
  z-index: 1;
  width: min(620px, 100%);
  margin: 0 auto 18px;
  padding: 10px 12px;
  border: 1px solid
    color-mix(in srgb, var(--status-accent-text) 20%, var(--line));
  border-radius: 13px;
  background: color-mix(
    in srgb,
    var(--status-accent-soft) 82%,
    var(--surface-card)
  );
  box-shadow: 0 8px 24px color-mix(in srgb, var(--text-primary) 8%, transparent);
}
.conversation-surface__translation-progress > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--status-accent-text);
  font-size: 0.75rem;
  font-weight: 700;
}
.conversation-surface__translation-progress button {
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  cursor: pointer;
}
.conversation-surface__translation-progress > span {
  display: block;
  height: 3px;
  margin-top: 8px;
  overflow: hidden;
  border-radius: 99px;
  background: color-mix(in srgb, var(--status-accent-text) 14%, transparent);
}
.conversation-surface__translation-progress > span i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--status-accent-text);
  transition: width 180ms ease;
}
.conversation-surface__message {
  width: fit-content;
  max-width: min(72%, 64ch);
  margin: 0 0 14px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 16px 16px 16px 5px;
  background: var(--surface-card);
  box-shadow: 0 7px 20px color-mix(in srgb, var(--text-primary) 5%, transparent);
}
.conversation-surface__message.is-outbound {
  margin-left: auto;
  border-color: color-mix(in srgb, var(--status-accent-text) 18%, var(--line));
  border-radius: 16px 16px 5px 16px;
  background: color-mix(
    in srgb,
    var(--status-accent-soft) 45%,
    var(--surface-card)
  );
}
.conversation-surface__message.is-neutral,
.conversation-surface__message.is-system,
.conversation-surface__message.is-automation {
  max-width: min(86%, 72ch);
  margin-right: auto;
  margin-left: auto;
  border-style: dashed;
  background: color-mix(in srgb, var(--surface-muted) 84%, var(--surface-card));
}
.conversation-surface__message-meta,
.conversation-surface__message-meta > span {
  display: flex;
  align-items: center;
  gap: 8px;
}
.conversation-surface__message-meta {
  justify-content: space-between;
  margin-bottom: 8px;
}
.conversation-surface__message-meta :deep(.p-avatar) {
  width: 24px;
  height: 24px;
  font-size: 0.6rem;
}
.conversation-surface__message-meta strong {
  font-size: 0.75rem;
}
.conversation-surface__message-meta time {
  color: var(--text-muted);
  font-size: 0.66rem;
  white-space: nowrap;
}
.conversation-surface__message-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
  color: var(--text-muted);
  font-size: 0.68rem;
}
.conversation-surface__message-status.is-success {
  color: var(--status-success-text);
}
.conversation-surface__message-status.is-warning {
  color: var(--status-warning-text);
}
.conversation-surface__message-status.is-danger {
  color: var(--status-danger-text);
}
.conversation-surface__skeletons {
  display: grid;
  gap: 14px;
}
.conversation-surface__skeletons i {
  width: min(68%, 560px);
  height: 82px;
  border-radius: 16px;
  background: linear-gradient(
    90deg,
    var(--surface-card),
    var(--surface-muted),
    var(--surface-card)
  );
  background-size: 220% 100%;
  animation: conversation-surface-shimmer 1.3s linear infinite;
}
.conversation-surface__skeletons i:nth-child(even) {
  margin-left: auto;
}
.conversation-surface__empty,
.conversation-surface__error {
  display: grid;
  justify-items: center;
  gap: 7px;
  max-width: 440px;
  margin: 14vh auto 0;
  color: var(--text-muted);
  text-align: center;
}
.conversation-surface__empty > i {
  font-size: 1.8rem;
}
.conversation-surface__new-messages {
  position: absolute;
  right: 24px;
  bottom: 126px;
  z-index: 3;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid
    color-mix(in srgb, var(--status-accent-text) 24%, var(--line));
  border-radius: 999px;
  color: var(--status-accent-text);
  background: var(--surface-card);
  box-shadow: 0 10px 30px
    color-mix(in srgb, var(--text-primary) 16%, transparent);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 800;
  cursor: pointer;
}
@keyframes conversation-surface-shimmer {
  to {
    background-position: -220% 0;
  }
}
@media (max-width: 767px) {
  .conversation-surface__toolbar {
    align-items: stretch;
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px;
  }
  .conversation-surface__view-toggle {
    width: 100%;
  }
  .conversation-surface__toolbar-actions {
    width: 100%;
    align-items: stretch;
    flex-direction: column;
  }
  .conversation-surface__view-toggle button {
    flex: 1;
    min-height: 44px;
    padding: 0 8px;
  }
  .conversation-surface__log {
    padding: 14px 12px 22px;
  }
  .conversation-surface__older {
    min-height: 44px;
  }
  .conversation-surface__message {
    max-width: 88%;
  }
  .conversation-surface__new-messages {
    right: 14px;
    bottom: 138px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .conversation-surface__translation-progress > span i {
    transition: none;
  }
  .conversation-surface__skeletons i {
    animation: none;
  }
}
</style>
