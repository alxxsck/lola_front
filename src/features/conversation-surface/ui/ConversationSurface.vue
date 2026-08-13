<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Avatar from 'primevue/avatar';
import Button from 'primevue/button';
import ConversationAISuspensionHeaderActions from '@/features/conversation-ai-suspension/ui/ConversationAISuspensionHeaderActions.vue';
import TranslatedMessageBody from '@/features/conversation-translation/ui/TranslatedMessageBody.vue';
import { relativeTime } from '@/shared/lib/format';
import ConversationComposer from './ConversationComposer.vue';
import ConversationCollaborationStatus from './ConversationCollaborationStatus.vue';
import {
  conversationSurfaceDraftKey,
  type ConversationSurfaceAISuspensionCapability,
  type ConversationSurfaceAttachmentDownloadRequest,
  type ConversationSurfaceCollaboration,
  type ConversationSurfaceComposer,
  type ConversationSurfaceComposerAction,
  type ConversationSurfaceHistory,
  type ConversationSurfaceInternalNotes,
  type ConversationSurfaceMessage,
  type ConversationSurfaceReconcileIssue,
  type ConversationSurfaceSendRequest,
  type ConversationSurfaceTranslation,
} from '../model/conversation-surface-contract';
import {
  conversationSurfaceSessionKey,
  readConversationSurfaceScrollAnchor,
  writeConversationSurfaceScrollAnchor,
} from '../model/conversation-surface-session';

const props = defineProps<{
  title: string;
  messages: ConversationSurfaceMessage[];
  history: ConversationSurfaceHistory;
  translation: ConversationSurfaceTranslation;
  composer: ConversationSurfaceComposer;
  aiSuspension?: ConversationSurfaceAISuspensionCapability;
  collaboration?: ConversationSurfaceCollaboration;
  internalNotes?: ConversationSurfaceInternalNotes;
  canDownloadPublicAttachments?: boolean;
}>();

const emit = defineEmits<{
  'load-older': [];
  'load-newer': [];
  'visible-high-water': [ordinal: number];
  'cancel-translation': [];
  'change-translation-mode': [mode: 'ORIGINAL' | 'TRANSLATED'];
  'reconcile-required': [issues: ConversationSurfaceReconcileIssue[]];
  'draft-change': [request: ConversationSurfaceSendRequest];
  send: [request: ConversationSurfaceSendRequest];
  'request-reply-translation': [];
  'reconcile-reply-translation': [];
  'retry-reply-translation': [];
  'save-reply-translation': [text: string];
  'send-reply-translation': [request: ConversationSurfaceSendRequest];
  'check-send-outcome': [];
  'discard-send-attempt': [];
  'change-composer-mode': [mode: 'PUBLIC_REPLY' | 'INTERNAL_NOTE'];
  'composer-action': [action: ConversationSurfaceComposerAction];
  'start-ai-suspension': [];
  'show-ai-suspension-history': [];
  'retry-ai-suspension': [];
  'retry-delivery': [messageId: string];
  'open-internal-notes': [];
  'add-attachments': [files: File[]];
  'remove-attachment': [localId: string];
  'retry-attachment': [localId: string];
  'download-attachment': [request: ConversationSurfaceAttachmentDownloadRequest];
}>();

const logElement = ref<HTMLElement | null>(null);
const drafts = new Map<string, string>();
const draft = ref(props.composer.initialDraft);
const newMessageCount = ref(0);
let anchor: { height: number; top: number } | null = null;
let stickToLatest = true;
let keepLatestOnResize = false;
let surfaceResizeObserver: ResizeObserver | null = null;
let messageVisibilityObserver: IntersectionObserver | null = null;
let visibleHighWaterTimer: number | null = null;

const draftKey = computed(() => conversationSurfaceDraftKey(props.composer));
const scrollSessionKey = computed(() => conversationSurfaceSessionKey(props.composer.scope));
const composerDisabled = computed(
  () =>
    props.composer.visibility !== 'ENABLED' ||
    props.composer.sending ||
    props.composer.sendCapability.kind === 'BLOCKED',
);
const canSend = computed(
  () =>
    !composerDisabled.value &&
    props.composer.sendCapability.kind === 'SOURCE' &&
    (Boolean(draft.value.trim()) ||
      Boolean(
        props.composer.attachments?.items.some((item) => item.state === 'READY' && item.canAttach),
      )) &&
    !props.composer.attachments?.busy,
);
const translationSendDisabled = computed(() => {
  const preview = props.composer.replyPreview;
  return (
    composerDisabled.value ||
    props.composer.sendCapability.kind !== 'TRANSLATED_PREVIEW' ||
    !preview ||
    preview.busy ||
    preview.stale ||
    preview.disabled ||
    props.composer.attachments?.busy ||
    preview.draft?.status !== 'READY'
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
      issues.push({ kind: 'MESSAGE_ID_CONFLICT', messageId: message.id });
      continue;
    }
    byId.set(message.id, message);
  }

  const ordered = [...byId.values()].sort(
    (left, right) => left.ordinal - right.ordinal || left.id.localeCompare(right.id),
  );
  const idsByOrdinal = new Map<number, string[]>();
  for (const message of ordered) {
    const ids = idsByOrdinal.get(message.ordinal) ?? [];
    ids.push(message.id);
    idsByOrdinal.set(message.ordinal, ids);
  }
  for (const [ordinal, messageIds] of idsByOrdinal) {
    if (messageIds.length > 1) issues.push({ kind: 'ORDINAL_COLLISION', ordinal, messageIds });
  }
  const ordinals = [...idsByOrdinal.keys()].sort((left, right) => left - right);
  for (let index = 1; index < ordinals.length; index += 1) {
    const afterOrdinal = ordinals[index - 1]!;
    const beforeOrdinal = ordinals[index]!;
    if (beforeOrdinal - afterOrdinal > 1)
      issues.push({ kind: 'ORDINAL_GAP', afterOrdinal, beforeOrdinal });
  }

  return { messages: ordered, issues };
});
const orderedMessages = computed(() => messageProjection.value.messages);
const newMessageLabel = computed(() => {
  const count = newMessageCount.value;
  const mod100 = count % 100;
  const mod10 = count % 10;
  const noun =
    mod100 >= 11 && mod100 <= 14
      ? 'новых сообщений'
      : mod10 === 1
        ? 'новое сообщение'
        : mod10 >= 2 && mod10 <= 4
          ? 'новых сообщения'
          : 'новых сообщений';
  return `${count} ${noun}`;
});

function internalNoteCountLabel(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const noun =
    mod100 >= 11 && mod100 <= 14
      ? 'заметок'
      : mod10 === 1
        ? 'заметка'
        : mod10 >= 2 && mod10 <= 4
          ? 'заметки'
          : 'заметок';
  return `${count} ${noun}`;
}

function initials(value: string): string {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('') || '?'
  ).toUpperCase();
}

function setViewMode(mode: 'ORIGINAL' | 'TRANSLATED'): void {
  if (mode === props.translation.mode) return;
  if (
    mode === 'TRANSLATED' &&
    (!props.translation.available || props.translation.loading || props.translation.changing)
  )
    return;
  emit('change-translation-mode', mode);
}

function draftRequest(text = draft.value): ConversationSurfaceSendRequest {
  const ready = props.composer.attachments?.items.filter(
    (item) => item.state === 'READY' && item.canAttach,
  );
  return {
    scopeKey: draftKey.value,
    mode: props.composer.mode,
    text,
    ...(ready?.length
      ? {
          attachmentIds: ready.map((item) => item.id),
          attachmentDraftKey: props.composer.attachments?.draftKey,
        }
      : {}),
  };
}

function updateDraft(value: string): void {
  draft.value = value;
  drafts.set(draftKey.value, value);
  emit('draft-change', draftRequest(value));
}

function requestSend(): void {
  const text = draft.value.trim();
  if (
    !canSend.value ||
    (!text &&
      !props.composer.attachments?.items.some((item) => item.state === 'READY' && item.canAttach))
  )
    return;
  emit('send', draftRequest(text));
}

function requestTranslatedSend(text?: string): void {
  const previewText =
    props.composer.mode === 'PUBLIC_REPLY'
      ? (props.composer.replyPreview?.draft?.editedTranslatedText ??
        props.composer.replyPreview?.draft?.translatedText ??
        '')
      : '';
  const selectedText = text ?? previewText;
  if (
    props.composer.mode !== 'PUBLIC_REPLY' ||
    translationSendDisabled.value ||
    !selectedText.trim()
  )
    return;
  emit('send-reply-translation', draftRequest(selectedText));
}

function nearLatest(element = logElement.value): boolean {
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight < 96;
}

function atConversationLatest(element = logElement.value): boolean {
  return !props.history.hasNewer && nearLatest(element);
}

function composerIsNearLatest(element = logElement.value): boolean {
  if (!element || props.history.hasNewer) return false;
  return element.scrollHeight - element.scrollTop - element.clientHeight < 120;
}

function scrollToLatest(smooth = true): void {
  const element = logElement.value;
  if (!element) return;
  element.scrollTo?.({
    top: element.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto',
  });
  if (!element.scrollTo) element.scrollTop = element.scrollHeight;
  newMessageCount.value = 0;
  stickToLatest = true;
  keepLatestOnResize = true;
}

function scrollToOrdinal(ordinal: number): boolean {
  const element = logElement.value;
  if (!element) return false;
  const message = element.querySelector<HTMLElement>(`[data-message-ordinal="${ordinal}"]`);
  if (!message) return false;
  const logRect = element.getBoundingClientRect();
  element.scrollTop += message.getBoundingClientRect().top - logRect.top - 16;
  stickToLatest = false;
  return true;
}

function readingSurfaceIsAttended(): boolean {
  return (
    typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus()
  );
}

function reportVisibleHighWater(): void {
  if (!readingSurfaceIsAttended()) return;
  const element = logElement.value;
  if (!element) return;
  const logRect = element.getBoundingClientRect();
  if (logRect.height <= 0) return;
  let highWater = 0;
  for (const message of element.querySelectorAll<HTMLElement>('[data-message-ordinal]')) {
    const ordinal = Number(message.dataset.messageOrdinal);
    const rect = message.getBoundingClientRect();
    const visibleHeight = Math.min(rect.bottom, logRect.bottom) - Math.max(rect.top, logRect.top);
    const requiredHeight = Math.min(Math.max(rect.height, 0), 48);
    if (
      Number.isSafeInteger(ordinal) &&
      ordinal > 0 &&
      requiredHeight > 0 &&
      visibleHeight >= requiredHeight
    ) {
      highWater = Math.max(highWater, ordinal);
    }
  }
  if (highWater > 0) emit('visible-high-water', highWater);
}

function queueVisibleHighWater(): void {
  if (visibleHighWaterTimer !== null) return;
  visibleHighWaterTimer = window.setTimeout(() => {
    visibleHighWaterTimer = null;
    reportVisibleHighWater();
  }, 75);
}

function syncMessageVisibilityObserver(): void {
  messageVisibilityObserver?.disconnect();
  const element = logElement.value;
  if (!element || typeof IntersectionObserver === 'undefined') {
    messageVisibilityObserver = null;
    return;
  }
  messageVisibilityObserver = new IntersectionObserver(() => queueVisibleHighWater(), {
    root: element,
    threshold: 0,
  });
  for (const message of element.querySelectorAll<HTMLElement>('[data-message-ordinal]'))
    messageVisibilityObserver.observe(message);
}

function handleReadingAttentionChange(): void {
  if (!readingSurfaceIsAttended()) return;
  queueVisibleHighWater();
}

function captureScrollAnchor(key = scrollSessionKey.value): void {
  const element = logElement.value;
  if (!element) return;
  const logRect = element.getBoundingClientRect();
  const message = [...element.querySelectorAll<HTMLElement>('[data-message-id]')].find(
    (candidate) => candidate.getBoundingClientRect().bottom > logRect.top,
  );
  const messageId = message?.dataset.messageId;
  if (!message || !messageId) return;
  writeConversationSurfaceScrollAnchor(key, {
    messageId,
    offset: message.getBoundingClientRect().top - logRect.top,
    atLatest: nearLatest(element),
  });
}

async function restoreScrollAnchor(key = scrollSessionKey.value): Promise<void> {
  await nextTick();
  const element = logElement.value;
  if (!element) return;
  const firstUnreadOrdinal = props.history.firstUnreadOrdinal;
  if (
    firstUnreadOrdinal !== null &&
    firstUnreadOrdinal !== undefined &&
    scrollToOrdinal(firstUnreadOrdinal)
  ) {
    queueVisibleHighWater();
    return;
  }
  const saved = readConversationSurfaceScrollAnchor(key);
  if (!saved) {
    scrollToLatest(false);
    queueVisibleHighWater();
    return;
  }
  if (saved.atLatest) {
    scrollToLatest(false);
    queueVisibleHighWater();
    return;
  }
  const message = [...element.querySelectorAll<HTMLElement>('[data-message-id]')].find(
    (candidate) => candidate.dataset.messageId === saved.messageId,
  );
  if (!message) {
    scrollToLatest(false);
    return;
  }
  const logRect = element.getBoundingClientRect();
  element.scrollTop += message.getBoundingClientRect().top - logRect.top - saved.offset;
  queueVisibleHighWater();
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
  emit('load-older');
}

function requestNewer(): void {
  if (!props.history.hasNewer || props.history.loading || props.history.loadingNewer) return;
  emit('load-newer');
}

function handleLogScroll(): void {
  stickToLatest = atConversationLatest();
  keepLatestOnResize = composerIsNearLatest();
  if (stickToLatest) newMessageCount.value = 0;
  if ((logElement.value?.scrollTop ?? 100) <= 72) requestOlder();
  if (nearLatest() && props.history.hasNewer) requestNewer();
  captureScrollAnchor();
  queueVisibleHighWater();
}

watch(scrollSessionKey, async (nextKey, previousKey) => {
  if (previousKey) captureScrollAnchor(previousKey);
  newMessageCount.value = 0;
  anchor = null;
  await restoreScrollAnchor(nextKey);
});

let skipPurgedSensitiveDraftCache = false;

function purgeSensitiveDrafts(): void {
  const { projectId, actorId } = props.composer.scope;
  const prefix = `${projectId}:${actorId}:`;
  for (const key of drafts.keys()) {
    if (key.startsWith(prefix) && key.endsWith(':INTERNAL_NOTE')) drafts.delete(key);
  }
  skipPurgedSensitiveDraftCache = true;
  if (props.composer.mode === 'INTERNAL_NOTE') draft.value = props.composer.initialDraft;
}

function purgePublicDraft(): void {
  const { projectId, actorId, conversationId } = props.composer.scope;
  drafts.delete(`${projectId}:${actorId}:${conversationId}:PUBLIC_REPLY`);
  skipPurgedSensitiveDraftCache = true;
  if (props.composer.mode === 'PUBLIC_REPLY') draft.value = props.composer.initialDraft;
}

watch(
  () => props.composer.sensitiveDraftPurgeRevision,
  (revision, previousRevision) => {
    if (revision === previousRevision) return;
    purgeSensitiveDrafts();
  },
  { flush: 'sync' },
);

watch(
  () => props.composer.publicDraftPurgeRevision,
  (revision, previousRevision) => {
    if (revision === previousRevision) return;
    purgePublicDraft();
  },
  { flush: 'sync' },
);

watch(
  () => JSON.stringify(messageProjection.value.issues),
  () => {
    if (messageProjection.value.issues.length)
      emit('reconcile-required', messageProjection.value.issues);
  },
  { immediate: true },
);

watch(draftKey, (next, previous) => {
  if (previous && !(skipPurgedSensitiveDraftCache && previous.endsWith(':INTERNAL_NOTE')))
    drafts.set(previous, draft.value);
  skipPurgedSensitiveDraftCache = false;
  draft.value = drafts.get(next) ?? props.composer.initialDraft;
});

function acceptExternalDraft(value: string): void {
  draft.value = value;
  drafts.set(draftKey.value, value);
}

watch(
  () => [draftKey.value, props.composer.draftRevision] as const,
  ([nextKey], [previousKey]) => {
    if (nextKey === previousKey) acceptExternalDraft(props.composer.initialDraft);
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
      syncMessageVisibilityObserver();
      const firstUnreadOrdinal = props.history.firstUnreadOrdinal;
      if (
        firstUnreadOrdinal === null ||
        firstUnreadOrdinal === undefined ||
        !scrollToOrdinal(firstUnreadOrdinal)
      )
        scrollToLatest(false);
      queueVisibleHighWater();
      return;
    }
    const previousLast = previous.at(-1);
    const previousLastIndex = previousLast ? next.indexOf(previousLast) : -1;
    const appended = previousLastIndex >= 0 ? next.length - previousLastIndex - 1 : 0;
    if (!appended) return;
    const stickToBottom = atConversationLatest();
    await nextTick();
    syncMessageVisibilityObserver();
    if (stickToBottom) scrollToLatest(false);
    else newMessageCount.value += appended;
    queueVisibleHighWater();
  },
  { flush: 'pre' },
);

onMounted(() => {
  window.addEventListener('focus', handleReadingAttentionChange);
  document.addEventListener('visibilitychange', handleReadingAttentionChange);
  void nextTick(() => syncMessageVisibilityObserver());
  void restoreScrollAnchor();
  if (typeof ResizeObserver === 'undefined') return;
  surfaceResizeObserver = new ResizeObserver(() => {
    const shouldKeepLatest = stickToLatest || keepLatestOnResize;
    keepLatestOnResize = composerIsNearLatest();
    if (shouldKeepLatest)
      void nextTick(() => {
        scrollToLatest(false);
        queueVisibleHighWater();
      });
    else queueVisibleHighWater();
  });
  if (logElement.value) surfaceResizeObserver.observe(logElement.value);
});
onBeforeUnmount(() => {
  captureScrollAnchor();
  window.removeEventListener('focus', handleReadingAttentionChange);
  document.removeEventListener('visibilitychange', handleReadingAttentionChange);
  messageVisibilityObserver?.disconnect();
  messageVisibilityObserver = null;
  if (visibleHighWaterTimer !== null) {
    window.clearTimeout(visibleHighWaterTimer);
    visibleHighWaterTimer = null;
  }
  surfaceResizeObserver?.disconnect();
  surfaceResizeObserver = null;
});
</script>

<template>
  <section class="conversation-surface" :aria-label="`Диалог: ${title}`">
    <header class="conversation-surface__toolbar">
      <div class="conversation-surface__heading">
        <span>Переписка</span>
        <h2>{{ title }}</h2>
      </div>
      <div class="conversation-surface__toolbar-actions">
        <ConversationCollaborationStatus
          v-if="collaboration"
          variant="PRESENCE"
          :collaboration="collaboration"
        />
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

      <div v-if="history.loading" class="conversation-surface__skeletons" aria-hidden="true">
        <i v-for="index in 5" :key="index" />
      </div>
      <p v-else-if="history.error" class="conversation-surface__error" role="alert">
        {{ history.error }}
      </p>
      <div v-else-if="!orderedMessages.length" class="conversation-surface__empty">
        <i class="pi pi-comments" aria-hidden="true" />
        <strong>Пока нет сообщений</strong>
        <span>Начните диалог, когда будете готовы.</span>
      </div>
      <template v-for="message in orderedMessages" v-else :key="message.id">
        <div
          v-if="history.firstUnreadOrdinal === message.ordinal"
          class="conversation-surface__first-unread"
          role="separator"
          aria-label="Новые сообщения"
          :data-first-unread-ordinal="message.ordinal"
        >
          <span>Новые сообщения</span>
        </div>
        <article
          class="conversation-surface__message"
          :class="[
            `is-${message.placement.toLowerCase()}`,
            `is-${(message.tone ?? 'DEFAULT').toLowerCase()}`,
          ]"
          :data-message-id="message.id"
          :data-message-ordinal="message.ordinal"
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
            <time :datetime="message.createdAt">{{ relativeTime(message.createdAt) }}</time>
          </div>
          <TranslatedMessageBody
            :message="message.content"
            :requested="message.requestedTranslation"
            :view-mode="translation.mode"
          />
          <span
            v-if="message.macroProvenance"
            class="conversation-surface__macro-provenance"
            :title="`Отправлено из опубликованного шаблона, версия ${message.macroProvenance.revisionNumber}`"
          >
            <i class="pi pi-file-edit" aria-hidden="true" />
            Шаблон · версия {{ message.macroProvenance.revisionNumber }}
            {{ message.macroProvenance.edited ? '· изменён оператором' : '' }}
          </span>
          <span
            v-if="message.knowledgeProvenance"
            class="conversation-surface__knowledge-provenance"
            :title="`Внутренняя база знаний · точная редакция ${message.knowledgeProvenance.revisionNumber}`"
          >
            <i class="pi pi-book" aria-hidden="true" />
            Источник · версия {{ message.knowledgeProvenance.revisionNumber }}
            {{ message.knowledgeProvenance.edited ? '· изменён оператором' : '' }}
          </span>
          <ul
            v-if="message.attachments?.length"
            class="conversation-surface__message-attachments"
            aria-label="Вложения сообщения"
          >
            <li v-for="attachment in message.attachments" :key="attachment.id">
              <button
                type="button"
                :disabled="!canDownloadPublicAttachments"
                :title="canDownloadPublicAttachments ? 'Скачать файл' : 'Скачивание недоступно'"
                @click="
                  emit('download-attachment', {
                    attachmentId: attachment.id,
                    visibility: 'PUBLIC_REPLY',
                  })
                "
              >
                <i
                  :class="
                    attachment.contentType.startsWith('image/') ? 'pi pi-image' : 'pi pi-file'
                  "
                  aria-hidden="true"
                />
                <span>
                  <strong>{{ attachment.filename }}</strong>
                  <small
                    >{{
                      Math.max(1, Math.ceil(attachment.sizeBytes / 1024)).toLocaleString('ru-RU')
                    }}
                    КБ</small
                  >
                </span>
                <i class="pi pi-download" aria-hidden="true" />
              </button>
            </li>
          </ul>
          <span
            v-if="message.status"
            class="conversation-surface__message-status"
            :class="`is-${message.status.tone.toLowerCase()}`"
            >{{ message.status.label }}</span
          >
          <div
            v-if="message.delivery"
            class="conversation-surface__delivery"
            :class="`is-${message.delivery.tone.toLowerCase()}`"
          >
            <span class="conversation-surface__message-status" role="status">
              <i
                :class="
                  message.delivery.tone === 'SUCCESS'
                    ? 'pi pi-check-circle'
                    : message.delivery.tone === 'DANGER'
                      ? 'pi pi-exclamation-circle'
                      : 'pi pi-clock'
                "
                aria-hidden="true"
              />
              {{ message.delivery.label }}
            </span>
            <span v-if="message.delivery.detail" class="conversation-surface__delivery-detail">{{
              message.delivery.detail
            }}</span>
            <button
              v-if="message.delivery.action"
              type="button"
              class="conversation-surface__delivery-action"
              data-action="retry-delivery"
              :disabled="message.delivery.action.disabled || message.delivery.action.busy"
              :aria-busy="message.delivery.action.busy"
              @click="emit('retry-delivery', message.id)"
            >
              <i
                :class="message.delivery.action.busy ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'"
                aria-hidden="true"
              />
              {{ message.delivery.action.busy ? 'Повторяем…' : message.delivery.action.label }}
            </button>
          </div>
        </article>
      </template>

      <Button
        v-if="history.hasNewer"
        type="button"
        label="Показать следующие сообщения"
        icon="pi pi-chevron-down"
        severity="secondary"
        text
        size="small"
        class="conversation-surface__newer"
        data-action="load-newer"
        :loading="history.loadingNewer"
        :disabled="history.loading"
        @click="requestNewer"
      />

      <p v-if="history.readError" class="conversation-surface__read-error" role="status">
        <i class="pi pi-cloud-upload" aria-hidden="true" />
        <span>{{ history.readError }}</span>
        <button type="button" @click="queueVisibleHighWater">Повторить</button>
      </p>
    </div>

    <button
      v-if="newMessageCount"
      type="button"
      class="conversation-surface__new-messages"
      @click="scrollToLatest()"
    >
      {{ newMessageLabel }}
      <i class="pi pi-arrow-down" aria-hidden="true" />
    </button>

    <div class="conversation-surface__footer">
      <ConversationCollaborationStatus
        v-if="collaboration"
        variant="COLLISION"
        :collaboration="collaboration"
      />
      <Transition name="internal-note-rail">
        <section
          v-if="composer.mode === 'INTERNAL_NOTE' && internalNotes"
          class="conversation-surface__internal-notes"
          aria-label="Последние внутренние заметки"
        >
          <header>
            <span>
              <i class="pi pi-lock" aria-hidden="true" />
              <strong>Закрытая лента</strong>
              <small>{{ internalNoteCountLabel(internalNotes.totalVisible) }}</small>
            </span>
            <Button
              type="button"
              label="Все заметки"
              icon="pi pi-arrow-up-right"
              severity="secondary"
              text
              size="small"
              @click="emit('open-internal-notes')"
            />
          </header>
          <p v-if="internalNotes.loading">Обновляем заметки команды…</p>
          <p v-else-if="internalNotes.error" role="status">
            {{ internalNotes.error }}
          </p>
          <p v-else-if="!internalNotes.items.length">
            Здесь появится контекст, который пользователь не увидит.
          </p>
          <ol v-else>
            <li v-for="note in internalNotes.items" :key="note.id">
              <span>{{ note.creatorName }}</span>
              <p>
                {{
                  note.body ??
                  (note.lifecycle === 'TOMBSTONED'
                    ? 'Текст заметки удалён'
                    : 'Текст заметки недоступен')
                }}
              </p>
              <time :datetime="note.updatedAt">{{ relativeTime(note.updatedAt) }}</time>
            </li>
          </ol>
        </section>
      </Transition>

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
        @check-send-outcome="emit('check-send-outcome')"
        @discard-send-attempt="emit('discard-send-attempt')"
        @change-mode="emit('change-composer-mode', $event)"
        @action="emit('composer-action', $event)"
        @add-attachments="emit('add-attachments', $event)"
        @remove-attachment="emit('remove-attachment', $event)"
        @retry-attachment="emit('retry-attachment', $event)"
        @download-attachment="
          emit('download-attachment', {
            attachmentId: $event,
            visibility: composer.mode,
          })
        "
      />
      <p
        v-else-if="composer.sendCapability.kind === 'BLOCKED'"
        class="conversation-surface__unavailable"
      >
        {{ composer.sendCapability.reason }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.conversation-surface {
  position: relative;
  display: grid;
  container-name: conversation-surface;
  container-type: inline-size;
  grid-template-columns: minmax(0, 1fr);
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
.conversation-surface__footer {
  min-width: 0;
  background: var(--surface-card);
}
.conversation-surface__message-attachments {
  display: grid;
  gap: 6px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.conversation-surface__message-attachments button {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) 20px;
  width: min(100%, 320px);
  min-height: 48px;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: inherit;
  background: color-mix(in srgb, var(--surface-card) 88%, transparent);
  text-align: left;
  cursor: pointer;
}
.conversation-surface__message-attachments button:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
.conversation-surface__message-attachments button:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}
.conversation-surface__message-attachments span {
  min-width: 0;
}
.conversation-surface__message-attachments strong,
.conversation-surface__message-attachments small {
  display: block;
}
.conversation-surface__message-attachments strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
.conversation-surface__message-attachments small {
  color: var(--text-muted);
  font-size: 10px;
}
.conversation-surface__macro-provenance,
.conversation-surface__knowledge-provenance {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 5px;
  padding: 3px 7px;
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  background: var(--surface-subtle);
  color: var(--text-tertiary);
  font-size: 10px;
  font-weight: 700;
}
.conversation-surface__knowledge-provenance {
  margin-left: 4px;
  color: var(--text-brand);
}
.conversation-surface__internal-notes {
  display: grid;
  gap: 4px;
  margin: 0 20px 8px;
  padding: 6px 9px;
  overflow: hidden;
  border: 1px solid var(--status-warning-border, var(--border-default));
  border-radius: 12px;
  background: color-mix(in srgb, var(--status-warning-soft) 22%, var(--surface-card));
}
.conversation-surface__internal-notes > header {
  display: flex;
  min-height: 28px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.conversation-surface__internal-notes > header > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--status-warning-text);
  font-size: 11px;
}
.conversation-surface__internal-notes > header small {
  color: var(--text-secondary);
}
.conversation-surface__internal-notes > p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 11px;
}
.conversation-surface__internal-notes ol {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.conversation-surface__internal-notes li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 4px 7px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--surface-card) 72%, transparent);
}
.conversation-surface__internal-notes li > span,
.conversation-surface__internal-notes li > time {
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 700;
}
.conversation-surface__internal-notes li > p {
  display: block;
  margin: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.internal-note-rail-enter-active,
.internal-note-rail-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease,
    max-height 180ms ease;
}
.internal-note-rail-enter-from,
.internal-note-rail-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(6px);
}
.internal-note-rail-enter-to,
.internal-note-rail-leave-from {
  max-height: 180px;
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
  min-width: 0;
  min-height: 0;
  width: 100%;
  box-sizing: border-box;
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
.conversation-surface__newer {
  display: flex;
  margin: 6px auto 0;
}
.conversation-surface__first-unread {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0 16px;
  color: var(--status-accent-text);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.conversation-surface__first-unread::before,
.conversation-surface__first-unread::after {
  content: '';
  height: 1px;
  flex: 1;
  background: color-mix(in srgb, var(--status-accent-text) 26%, var(--line));
}
.conversation-surface__first-unread span {
  flex: 0 0 auto;
  padding: 5px 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--status-accent-soft) 76%, var(--surface-card));
}
.conversation-surface__read-error {
  position: sticky;
  bottom: 8px;
  z-index: 2;
  width: fit-content;
  max-width: 100%;
  margin: 12px auto 0;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid color-mix(in srgb, var(--status-warning-text) 24%, var(--line));
  border-radius: 10px;
  color: var(--status-warning-text);
  background: color-mix(in srgb, var(--status-warning-soft) 88%, var(--surface-card));
  font-size: 0.72rem;
}
.conversation-surface__read-error button {
  min-height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  color: inherit;
  background: transparent;
  font: inherit;
  font-weight: 750;
  cursor: pointer;
}
.conversation-surface__translation-progress {
  position: sticky;
  top: 0;
  z-index: 1;
  width: min(620px, 100%);
  margin: 0 auto 18px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--status-accent-text) 20%, var(--line));
  border-radius: 13px;
  background: color-mix(in srgb, var(--status-accent-soft) 82%, var(--surface-card));
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
  min-width: 0;
  width: fit-content;
  max-width: min(72cqi, 64ch);
  box-sizing: border-box;
  margin: 0 0 14px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 16px 16px 16px 5px;
  background: var(--surface-card);
  box-shadow: 0 7px 20px color-mix(in srgb, var(--text-primary) 5%, transparent);
  overflow-wrap: anywhere;
  animation: conversation-message-in 180ms cubic-bezier(0.23, 1, 0.32, 1) both;
}
@keyframes conversation-message-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.conversation-surface__message.is-outbound {
  margin-left: auto;
  border-color: color-mix(in srgb, var(--status-accent-text) 18%, var(--line));
  border-radius: 16px 16px 5px 16px;
  background: color-mix(in srgb, var(--status-accent-soft) 45%, var(--surface-card));
}
.conversation-surface__message.is-neutral,
.conversation-surface__message.is-system,
.conversation-surface__message.is-automation {
  max-width: min(86cqi, 72ch);
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
.conversation-surface__message-meta > span,
.conversation-surface__delivery,
.conversation-surface__delivery-detail {
  min-width: 0;
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
.conversation-surface__delivery {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin-top: 8px;
  color: var(--text-muted);
  font-size: 0.68rem;
}
.conversation-surface__delivery .conversation-surface__message-status {
  margin-top: 0;
}
.conversation-surface__delivery.is-success {
  color: var(--status-success-text);
}
.conversation-surface__delivery.is-warning {
  color: var(--status-warning-text);
}
.conversation-surface__delivery.is-danger {
  color: var(--status-danger-text);
}
.conversation-surface__delivery-detail {
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}
.conversation-surface__delivery-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 40px;
  margin: -8px 0 -8px auto;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-control, 8px);
  color: var(--status-danger-text);
  background: transparent;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition:
    color 140ms cubic-bezier(0.23, 1, 0.32, 1),
    background-color 140ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
}
.conversation-surface__delivery-action:hover:not(:disabled),
.conversation-surface__delivery-action:focus-visible {
  background: color-mix(in srgb, var(--status-danger-text) 9%, transparent);
}
.conversation-surface__delivery-action:focus-visible {
  outline: 2px solid var(--focus-ring, var(--status-accent-text));
  outline-offset: 2px;
}
.conversation-surface__delivery-action:active:not(:disabled) {
  transform: scale(0.97);
}
.conversation-surface__delivery-action:disabled {
  opacity: 0.56;
  cursor: not-allowed;
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
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--status-accent-text) 24%, var(--line));
  border-radius: 999px;
  color: var(--status-accent-text);
  background: var(--surface-card);
  box-shadow: 0 10px 30px color-mix(in srgb, var(--text-primary) 16%, transparent);
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
@container conversation-surface (max-width: 620px) {
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
}
@media (max-width: 767px) {
  .conversation-surface__internal-notes {
    margin: 0 0 6px;
    border-width: 1px 0;
    border-radius: 0;
  }
  .conversation-surface__internal-notes ol {
    grid-template-columns: 1fr;
  }
  .conversation-surface__internal-notes li:nth-child(n + 2) {
    display: none;
  }
  .conversation-surface__log {
    padding: 14px 12px 22px;
  }
  .conversation-surface__older {
    min-height: 44px;
  }
  .conversation-surface__newer {
    min-height: 44px;
  }
  .conversation-surface__message {
    max-width: min(88cqi, 64ch);
  }
  .conversation-surface__delivery-action {
    min-height: 44px;
  }
  .conversation-surface__new-messages {
    right: 14px;
    bottom: 138px;
  }
}
@media (min-width: 768px) and (max-height: 760px) {
  .conversation-surface__toolbar {
    flex-direction: row;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
  }
  .conversation-surface__heading {
    flex: 1 1 auto;
  }
  .conversation-surface__heading > span {
    font-size: 0.6rem;
  }
  .conversation-surface__heading h2 {
    margin-top: 1px;
    font-size: 0.9rem;
  }
  .conversation-surface__toolbar-actions {
    width: auto;
    flex: 0 1 auto;
    align-items: center;
    flex-direction: row;
    gap: 6px;
  }
  .conversation-surface__view-toggle {
    width: auto;
  }
  .conversation-surface__view-toggle button {
    min-height: 34px;
    padding-inline: 9px;
  }
  .conversation-surface__internal-notes {
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    margin: 0 12px 6px;
    padding: 4px 8px;
  }
  .conversation-surface__internal-notes > header {
    display: contents;
  }
  .conversation-surface__internal-notes > header > span {
    grid-column: 1;
    white-space: nowrap;
  }
  .conversation-surface__internal-notes > header > :deep(.p-button) {
    grid-column: 3;
    min-height: 32px;
  }
  .conversation-surface__internal-notes > p,
  .conversation-surface__internal-notes ol {
    grid-row: 1;
    grid-column: 2;
    min-width: 0;
  }
  .conversation-surface__internal-notes li {
    padding-block: 3px;
  }
  .conversation-surface__internal-notes li:nth-child(n + 2) {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .conversation-surface__message {
    animation: none;
  }
  .internal-note-rail-enter-active,
  .internal-note-rail-leave-active {
    transition: none;
  }
  .conversation-surface__delivery-action {
    transition: none;
  }
  .conversation-surface__delivery-action:active:not(:disabled) {
    transform: none;
  }
  .conversation-surface__translation-progress > span i {
    transition: none;
  }
  .conversation-surface__skeletons i {
    animation: none;
  }
}
</style>
