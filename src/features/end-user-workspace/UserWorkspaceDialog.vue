<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import Textarea from "primevue/textarea";
import { useAuthStore } from "@/features/auth/auth.store";
import { useAdminConversationConsole } from "@/features/admin-conversations/model/use-admin-conversation-console";
import { endUserProfileRepository } from "@/features/end-user-profile/api/end-user-profile-repository";
import { formatProfileValue } from "@/features/end-user-profile/model/profile-value";
import { useConversationAISuspensionStore } from "@/features/conversation-ai-suspension/model/conversation-ai-suspension.store";
import ConversationAISuspensionBanner from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionBanner.vue";
import ConversationAISuspensionDialog from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionDialog.vue";
import ConversationAISuspensionHistory from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionHistory.vue";
import type {
  ExtendConversationAISuspensionDto,
  ProfileProjectionResponseDto,
  ResumeConversationAIDto,
  StartConversationAISuspensionDto,
} from "@/shared/api/generated/models";
import { conversationAISuspensionEnabled } from "@/shared/config/features";
import { formatDate, relativeTime } from "@/shared/lib/format";
import type { ConversationMessage } from "@/shared/types/domain";
import { cmsRealtimeClient } from "@/shared/realtime/cms-realtime-client";
import type { CmsRealtimeState } from "@/shared/realtime/cms-realtime-contract";
import { repository } from "@/shared/api/repository";

type MobilePane = "LIST" | "CHAT" | "PROFILE";
type SuspensionMode = "START" | "EXTEND" | "RESUME";

interface ConversationMessageUpsertEvent {
  contractVersion: 1;
  projectId: string;
  endUserId: string;
  conversationId: string;
  message: {
    id: string;
    threadId: string;
    role: "USER" | "ASSISTANT" | "ADMIN" | "SCENARIO";
    status: "WRITING" | "COMPLETED" | "FAILED" | "CANCELLED";
    text: string;
    createdAt: string;
    updatedAt: string;
  };
}

const props = defineProps<{
  projectId: string;
  endUserId: string | null;
  externalUserId?: string;
  preferredConversationId?: string;
}>();
const emit = defineEmits<{
  changed: [];
  conversationSelected: [conversationId: string];
}>();
const visible = defineModel<boolean>("visible", { required: true });
const auth = useAuthStore();
const suspensionStore = useConversationAISuspensionStore();
const detail = ref<ProfileProjectionResponseDto | null>(null);
const detailLoading = ref(false);
const detailError = ref("");
const mobilePane = ref<MobilePane>("CHAT");
const historyElement = ref<HTMLElement | null>(null);
const newChatOpen = ref(false);
const newChatText = ref("");
const suspensionDialogVisible = ref(false);
const suspensionHistoryVisible = ref(false);
const suspensionDialogMode = ref<SuspensionMode>("START");
const combinedSend = ref(false);
const realtimeState = ref<CmsRealtimeState>("DISCONNECTED");
const realtimeRecovered = ref(false);
const profileCollapsed = ref(false);
const liveMessageIds = ref<string[]>([]);
let profileRequest = 0;
let unsubscribeMessage: (() => void) | undefined;
let unsubscribeReconcile: (() => void) | undefined;
let unsubscribeRealtimeState: (() => void) | undefined;
let presenceTimer: ReturnType<typeof setInterval> | undefined;
let recoveredTimer: ReturnType<typeof setTimeout> | undefined;

const consoleState = useAdminConversationConsole({
  projectId: () => props.projectId,
  endUserId: () => props.endUserId ?? undefined,
  updateRoute: (conversationId) => emit("conversationSelected", conversationId),
  beforeLoadMessages: (conversationId) =>
    cmsRealtimeClient.watchConversation(conversationId),
});
const {
  conversations,
  selectedConversation,
  messages,
  conversationsLoading,
  conversationsLoadingMore,
  nextConversationCursor,
  messagesLoading,
  messagesLoadingMore,
  nextMessageCursor,
  conversationError,
  onlineSession,
  replyText,
  sendingReply,
  creatingConversation,
  combinedSuspensionError,
  newMessageCount,
} = consoleState;

const selectedSuspensionEntry = computed(() =>
  selectedConversation.value
    ? suspensionStore.getEntry(selectedConversation.value.id)
    : undefined,
);
const canManageSuspension = computed(
  () => auth.user?.role === "OWNER" || auth.user?.role === "ADMIN",
);
const displayName = computed(
  () =>
    props.externalUserId ||
    detail.value?.externalUserId ||
    props.endUserId ||
    "Пользователь",
);
const hasUnsavedDraft = computed(
  () => consoleState.hasAnyDraft() || Boolean(newChatText.value.trim()),
);

watch(conversations, (value) => suspensionStore.ingestConversations(value), {
  flush: "sync",
});
watch(
  () => selectedConversation.value?.id,
  async (conversationId) => {
    if (!conversationId || !props.endUserId || !visible.value) return;
    liveMessageIds.value = [];
    if (conversationAISuspensionEnabled)
      void suspensionStore.loadDetail(props.endUserId, conversationId);
    mobilePane.value = "CHAT";
    await nextTick();
    scrollToLatest(false);
  },
);
watch(
  () => [visible.value, props.projectId, props.endUserId] as const,
  ([isVisible, , endUserId]) => {
    if (!isVisible || !endUserId) {
      closeWorkspace();
      return;
    }
    void openWorkspace(endUserId, props.preferredConversationId);
  },
  { immediate: true },
);

onMounted(() => {
  unsubscribeRealtimeState = cmsRealtimeClient.onState((state) => {
    const previous = realtimeState.value;
    realtimeState.value = state;
    if (
      state === "CONNECTED" &&
      (previous === "CONNECTING" || previous === "DEGRADED")
    ) {
      realtimeRecovered.value = true;
      if (recoveredTimer) clearTimeout(recoveredTimer);
      recoveredTimer = setTimeout(
        () => (realtimeRecovered.value = false),
        3000,
      );
    }
  });
  unsubscribeMessage = cmsRealtimeClient.subscribe(
    ["conversation.message.upserted.v1"],
    handleMessageUpsert,
  );
  unsubscribeReconcile = cmsRealtimeClient.reconcile(() =>
    visible.value ? consoleState.reconcileSelected() : undefined,
  );
  presenceTimer = setInterval(() => {
    if (visible.value) void consoleState.refreshPresence();
  }, 15_000);
});
onBeforeUnmount(() => {
  unsubscribeRealtimeState?.();
  unsubscribeMessage?.();
  unsubscribeReconcile?.();
  if (presenceTimer) clearInterval(presenceTimer);
  if (recoveredTimer) clearTimeout(recoveredTimer);
  closeWorkspace();
});

async function openWorkspace(
  endUserId: string,
  preferredConversationId?: string,
): Promise<void> {
  const request = ++profileRequest;
  detail.value = null;
  detailError.value = "";
  detailLoading.value = true;
  newChatOpen.value = false;
  newChatText.value = "";
  mobilePane.value = "CHAT";
  profileCollapsed.value = false;
  liveMessageIds.value = [];
  consoleState.reset();
  await cmsRealtimeClient.activateProject(props.projectId);
  const results = await Promise.allSettled([
    loadProfile(endUserId),
    consoleState.loadConversations(endUserId, preferredConversationId),
  ]);
  if (
    request !== profileRequest ||
    props.endUserId !== endUserId ||
    !visible.value
  )
    return;
  if (results[0].status === "fulfilled") detail.value = results[0].value;
  else detailError.value = "Не удалось загрузить профиль пользователя";
  detailLoading.value = false;
}

async function loadProfile(
  endUserId: string,
): Promise<ProfileProjectionResponseDto> {
  if (repository.mode !== "mock") {
    return endUserProfileRepository.profile(props.projectId, endUserId);
  }
  const page = await repository.getUsersPage(props.projectId, { limit: 100 });
  const user = page.items.find((item) => item.id === endUserId);
  if (!user) throw new Error("Пользователь не найден");
  const field = (key: string, label: string, value: string | undefined) => ({
    definitionId: `mock-${key}`,
    definitionRevisionId: `mock-${key}-r1`,
    key,
    label,
    valueType: "STRING",
    lifecycle: "ACTIVE" as const,
    classification: "INTERNAL" as const,
    access: "ALLOWED" as const,
    availability: value ? ("AVAILABLE" as const) : ("MISSING" as const),
    ...(value ? { value: { type: "STRING", value } } : {}),
  });
  return {
    endUserId: user.id,
    externalUserId: user.externalId,
    profileVersion: "demo",
    syncStatus: "VALID",
    fields: [
      field("name", "Имя", user.profile.name),
      field("email", "Email", user.profile.email),
      field("country", "Страна", user.profile.country),
      field("segment", "Сегмент", user.segment),
    ],
    observedAt: user.lastSeenAt,
    receivedAt: user.lastSeenAt,
    ageSeconds: Math.max(
      0,
      Math.round((Date.now() - Date.parse(user.lastSeenAt)) / 1000),
    ),
    contractRevision: 1,
    provenance: "PRODUCT_PROFILE",
  };
}

function closeWorkspace(): void {
  profileRequest += 1;
  const conversationId = selectedConversation.value?.id;
  if (conversationId) cmsRealtimeClient.unwatchConversation(conversationId);
  consoleState.reset();
  detail.value = null;
  detailLoading.value = false;
  newChatOpen.value = false;
  liveMessageIds.value = [];
}

function messageFromEvent(
  event: ConversationMessageUpsertEvent,
): ConversationMessage {
  return {
    id: event.message.id,
    conversationId: event.message.threadId,
    author: event.message.role,
    status: event.message.status,
    text: event.message.text,
    createdAt: event.message.createdAt,
    updatedAt: event.message.updatedAt,
  };
}

function requestVisibility(nextVisible: boolean): void {
  if (
    !nextVisible &&
    hasUnsavedDraft.value &&
    !window.confirm("Закрыть рабочее пространство и потерять черновик?")
  )
    return;
  visible.value = nextVisible;
}

function conversationIsSuspended(
  conversation: (typeof conversations.value)[number],
): boolean {
  const entry = suspensionStore.getEntry(conversation.id);
  const summary = entry?.summary ?? conversation.aiSuspension;
  return (
    summary.mode === "SUSPENDED" &&
    summary.lifecycle === "ACTIVE" &&
    !entry?.locallyExpired &&
    Boolean(summary.suspendedUntil) &&
    Date.parse(summary.suspendedUntil!) >
      Date.now() + (entry?.serverOffsetMs ?? 0)
  );
}

function handleMessageUpsert(value: unknown): void {
  if (!visible.value || !props.endUserId || !value || typeof value !== "object")
    return;
  const event = value as ConversationMessageUpsertEvent;
  const roles = ["USER", "ASSISTANT", "ADMIN", "SCENARIO", "SYSTEM"];
  const statuses = ["WRITING", "COMPLETED", "FAILED", "CANCELLED"];
  if (
    event.contractVersion !== 1 ||
    event.projectId !== props.projectId ||
    event.endUserId !== props.endUserId ||
    event.conversationId !== selectedConversation.value?.id ||
    event.message?.threadId !== event.conversationId ||
    typeof event.message.id !== "string" ||
    !roles.includes(event.message.role) ||
    !statuses.includes(event.message.status) ||
    typeof event.message.text !== "string" ||
    !Number.isFinite(Date.parse(event.message.createdAt)) ||
    !Number.isFinite(Date.parse(event.message.updatedAt))
  )
    return;
  const nearLatest = isNearLatest();
  const isNewMessage = !messages.value.some(
    (message) => message.id === event.message.id,
  );
  if (!consoleState.upsertMessage(messageFromEvent(event), !nearLatest)) return;
  if (isNewMessage)
    liveMessageIds.value = [...liveMessageIds.value, event.message.id];
  if (nearLatest) void nextTick(() => scrollToLatest(false));
}

function isNearLatest(): boolean {
  const element = historyElement.value;
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight < 96;
}

function scrollToLatest(smooth = true): void {
  const element = historyElement.value;
  if (!element) return;
  element.scrollTo({
    top: element.scrollHeight,
    behavior: smooth ? "smooth" : "auto",
  });
  consoleState.clearNewMessageCount();
}

async function handleHistoryScroll(force = false): Promise<void> {
  const element = historyElement.value;
  if (!element) return;
  if (isNearLatest()) consoleState.clearNewMessageCount();
  if (
    (!force && element.scrollTop > 72) ||
    !nextMessageCursor.value ||
    messagesLoadingMore.value
  )
    return;
  const previousHeight = element.scrollHeight;
  const previousTop = element.scrollTop;
  const added = await consoleState.loadOlderMessages();
  if (!added) return;
  await nextTick();
  element.scrollTop = previousTop + element.scrollHeight - previousHeight;
}

async function selectConversation(
  conversation: (typeof conversations.value)[number],
): Promise<void> {
  await consoleState.loadMessages(conversation);
  await nextTick();
  scrollToLatest(false);
}

async function createConversation(): Promise<void> {
  const conversationId = await consoleState.sendNewConversation(
    newChatText.value,
  );
  if (!conversationId) return;
  newChatText.value = "";
  newChatOpen.value = false;
  emit("changed");
}

function openSuspension(mode: SuspensionMode, combined = false): void {
  combinedSend.value = combined;
  suspensionDialogMode.value = mode;
  suspensionDialogVisible.value = true;
}

async function submitSuspension(value: {
  key: string;
  command:
    | StartConversationAISuspensionDto
    | ExtendConversationAISuspensionDto
    | ResumeConversationAIDto;
}): Promise<void> {
  const conversation = selectedConversation.value;
  const endUserId = props.endUserId;
  if (!conversation || !endUserId) return;
  if (combinedSend.value && suspensionDialogMode.value === "START") {
    const result = await consoleState.suspendAndSendReply(
      value.command as StartConversationAISuspensionDto,
      value.key,
    );
    if (!result) return;
    if (result.aiSuspension) {
      suspensionStore.applyConfirmedState(
        endUserId,
        conversation.id,
        result.aiSuspension.state,
        result.aiSuspension.inFlightCancellation?.status,
      );
    }
  } else {
    const succeeded =
      suspensionDialogMode.value === "START"
        ? await suspensionStore.start(
            endUserId,
            conversation.id,
            value.command as StartConversationAISuspensionDto,
            value.key,
          )
        : suspensionDialogMode.value === "EXTEND"
          ? await suspensionStore.extend(
              endUserId,
              conversation.id,
              value.command as ExtendConversationAISuspensionDto,
              value.key,
            )
          : await suspensionStore.resume(
              endUserId,
              conversation.id,
              value.command as ResumeConversationAIDto,
              value.key,
            );
    if (!succeeded) return;
  }
  suspensionDialogVisible.value = false;
  combinedSend.value = false;
  await suspensionStore.loadDetail(endUserId, conversation.id);
  emit("changed");
}

function isSuspended(): boolean {
  const entry = selectedSuspensionEntry.value;
  if (!entry || entry.locallyExpired || !entry.summary.suspendedUntil)
    return false;
  return (
    entry.summary.mode === "SUSPENDED" &&
    entry.summary.lifecycle === "ACTIVE" &&
    Date.parse(entry.summary.suspendedUntil) > Date.now() + entry.serverOffsetMs
  );
}

function authorLabel(author: ConversationMessage["author"]): string {
  return {
    USER: "Пользователь",
    ADMIN: "Оператор",
    ASSISTANT: "Lola",
    SCENARIO: "Сценарий Lola",
    SYSTEM: "Система",
  }[author];
}

function currentSessionLabel(count: number): string {
  const suffix = count % 10 === 1 && count % 100 !== 11 ? "сессии" : "сессиях";
  return `Текущий в ${count} ${suffix}`;
}

function displayField(
  field: ProfileProjectionResponseDto["fields"][number],
): string {
  return field.value ? formatProfileValue(field.value) : "—";
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="requestVisibility"
    modal
    maximizable
    :maximize-button-props="{
      'aria-label': 'Развернуть рабочее пространство',
    }"
    :draggable="false"
    :style="{ width: 'min(1500px, 96vw)' }"
    :content-style="{ padding: '0', overflow: 'hidden' }"
    class="user-workspace-dialog"
    :aria-label="`Рабочее пространство пользователя ${displayName}`"
  >
    <template #header>
      <div class="workspace-title">
        <span class="avatar">{{ displayName.slice(0, 1).toUpperCase() }}</span>
        <div>
          <span class="eyebrow">Пользователь и live-диалоги</span>
          <h2>{{ displayName }}</h2>
        </div>
        <Tag
          :value="onlineSession ? 'Онлайн' : 'Офлайн'"
          :severity="onlineSession ? 'success' : 'secondary'"
          rounded
        />
      </div>
    </template>

    <Message
      v-if="realtimeState === 'CONNECTING' || realtimeState === 'DEGRADED'"
      :severity="realtimeState === 'DEGRADED' ? 'warn' : 'secondary'"
      :closable="false"
      class="realtime-message"
    >
      {{
        realtimeState === "DEGRADED"
          ? "Live-связь временно недоступна. История сверяется через API."
          : "Подключаем live-обновления…"
      }}
    </Message>
    <Message
      v-else-if="realtimeRecovered"
      severity="success"
      :closable="false"
      class="realtime-message"
    >
      Live-связь восстановлена.
    </Message>

    <nav
      class="mobile-workspace-nav"
      aria-label="Разделы рабочего пространства"
    >
      <button
        :class="{ active: mobilePane === 'LIST' }"
        :aria-pressed="mobilePane === 'LIST'"
        @click="mobilePane = 'LIST'"
      >
        <i class="pi pi-comments" /> Диалоги
      </button>
      <button
        :class="{ active: mobilePane === 'CHAT' }"
        :aria-pressed="mobilePane === 'CHAT'"
        @click="mobilePane = 'CHAT'"
      >
        <i class="pi pi-comment" /> Чат
      </button>
      <button
        :class="{ active: mobilePane === 'PROFILE' }"
        :aria-pressed="mobilePane === 'PROFILE'"
        @click="mobilePane = 'PROFILE'"
      >
        <i class="pi pi-user" /> Профиль
      </button>
    </nav>

    <div
      class="workspace-grid"
      :class="{ 'profile-collapsed': profileCollapsed }"
      :data-mobile-pane="mobilePane"
    >
      <aside class="conversation-pane">
        <div class="pane-header">
          <div>
            <span class="eyebrow">История</span>
            <h3>Диалоги</h3>
          </div>
          <Button
            icon="pi pi-plus"
            label="Новый"
            size="small"
            outlined
            :disabled="!onlineSession"
            @click="newChatOpen = true"
          />
        </div>
        <Message
          v-if="!onlineSession"
          severity="secondary"
          :closable="false"
          class="compact-message"
        >
          Историю можно читать офлайн. Новое сообщение станет доступно после
          подключения.
        </Message>
        <div v-if="conversationsLoading" class="pane-loading">
          <Skeleton v-for="item in 5" :key="item" height="74px" />
        </div>
        <div v-else-if="!conversations.length" class="empty-state">
          <i class="pi pi-comments" /><strong>Диалогов пока нет</strong>
          <span>Начните новый разговор, когда пользователь будет онлайн.</span>
        </div>
        <div
          v-else
          class="conversation-list"
          role="navigation"
          aria-label="Диалоги пользователя"
        >
          <button
            v-for="conversation in conversations"
            :key="conversation.id"
            type="button"
            :aria-current="
              selectedConversation?.id === conversation.id ? 'page' : undefined
            "
            :class="{ selected: selectedConversation?.id === conversation.id }"
            @click="selectConversation(conversation)"
          >
            <span class="conversation-row-title">
              <strong>{{ conversation.title }}</strong>
              <i
                v-if="conversation.isCurrent"
                class="current-dot"
                title="Текущий диалог"
              />
            </span>
            <span
              >{{ relativeTime(conversation.lastMessageAt) }} ·
              {{ conversation.messageCount }} сообщ.</span
            >
            <Tag
              v-if="conversation.isCurrent"
              :value="
                currentSessionLabel(conversation.currentInteractionSessionCount)
              "
              severity="success"
              rounded
            />
            <Tag
              v-if="
                conversationAISuspensionEnabled &&
                conversationIsSuspended(conversation)
              "
              value="AI приостановлен"
              severity="warn"
              rounded
            />
          </button>
        </div>
        <Button
          v-if="nextConversationCursor"
          label="Показать ещё"
          icon="pi pi-chevron-down"
          severity="secondary"
          text
          :loading="conversationsLoadingMore"
          @click="consoleState.loadMoreConversations"
        />
      </aside>

      <main class="chat-pane">
        <div v-if="selectedConversation" class="chat-header">
          <div>
            <span class="eyebrow">Выбранный диалог</span>
            <h3>{{ selectedConversation.title }}</h3>
          </div>
          <div class="chat-header-status">
            <Button
              v-if="profileCollapsed"
              icon="pi pi-user"
              label="Показать профиль"
              severity="secondary"
              text
              size="small"
              @click="profileCollapsed = false"
            />
            <Tag
              v-if="selectedConversation.isCurrent"
              value="Текущий"
              severity="success"
              rounded
            />
            <Tag
              :value="
                selectedConversation.status === 'ACTIVE' ? 'Открыт' : 'Закрыт'
              "
              :severity="
                selectedConversation.status === 'ACTIVE' ? 'info' : 'secondary'
              "
            />
          </div>
        </div>
        <Message
          v-if="conversationError"
          severity="warn"
          :closable="false"
          class="chat-error"
        >
          {{ conversationError }}
        </Message>
        <ConversationAISuspensionBanner
          v-if="
            conversationAISuspensionEnabled &&
            selectedConversation &&
            selectedSuspensionEntry
          "
          :entry="selectedSuspensionEntry"
          :can-manage="canManageSuspension"
          :conversation-open="selectedConversation.status === 'ACTIVE'"
          @start="openSuspension('START')"
          @extend="openSuspension('EXTEND')"
          @resume="openSuspension('RESUME')"
          @history="suspensionHistoryVisible = true"
          @retry="
            props.endUserId &&
            suspensionStore.loadDetail(props.endUserId, selectedConversation.id)
          "
        />
        <div
          v-if="selectedConversation"
          ref="historyElement"
          class="message-history"
          role="log"
          :aria-live="messagesLoading || messagesLoadingMore ? 'off' : 'polite'"
          :aria-busy="messagesLoading || messagesLoadingMore"
          aria-relevant="additions text"
          tabindex="0"
          @scroll.passive="handleHistoryScroll()"
        >
          <div v-if="messagesLoadingMore" class="history-loader">
            <i class="pi pi-spin pi-spinner" /> Загружаем историю
          </div>
          <Button
            v-else-if="nextMessageCursor"
            label="Показать предыдущие сообщения"
            icon="pi pi-history"
            severity="secondary"
            text
            size="small"
            class="older-button"
            @click="handleHistoryScroll(true)"
          />
          <div v-if="messagesLoading" class="pane-loading message-skeletons">
            <Skeleton v-for="item in 6" :key="item" height="62px" />
          </div>
          <article
            v-for="message in messages"
            v-else
            :key="message.id"
            class="message-bubble"
            :class="[
              message.author.toLowerCase(),
              message.status.toLowerCase(),
              { 'live-enter': liveMessageIds.includes(message.id) },
            ]"
          >
            <div>
              <strong>{{ authorLabel(message.author) }}</strong
              ><time :datetime="message.createdAt">{{
                formatDate(message.createdAt)
              }}</time>
            </div>
            <p>
              {{
                message.text ||
                (message.status === "WRITING"
                  ? "Lola печатает…"
                  : "Сообщение без текста")
              }}
            </p>
            <small v-if="message.status === 'FAILED'"
              ><i class="pi pi-exclamation-circle" /> Не доставлено</small
            >
            <small v-else-if="message.status === 'WRITING' && message.text"
              ><i class="pi pi-spin pi-spinner" /> Обновляется…</small
            >
            <small v-else-if="message.status === 'CANCELLED'"
              ><i class="pi pi-ban" /> Ответ остановлен оператором</small
            >
          </article>
        </div>
        <div v-else class="empty-state chat-empty">
          <i class="pi pi-comment" /><strong>Выберите диалог</strong>
          <span>История и live-сообщения появятся здесь.</span>
        </div>
        <button
          v-if="newMessageCount"
          class="new-message-pill"
          @click="scrollToLatest()"
        >
          {{ newMessageCount }} новых сообщений <i class="pi pi-arrow-down" />
        </button>
        <form
          v-if="selectedConversation"
          class="composer"
          @submit.prevent="consoleState.sendReply"
        >
          <Textarea
            v-model="replyText"
            rows="3"
            maxlength="10000"
            auto-resize
            placeholder="Ответить от имени оператора"
            aria-label="Ответ пользователю"
            :disabled="
              !onlineSession || selectedConversation.status !== 'ACTIVE'
            "
          />
          <div class="composer-footer">
            <span>Отправка сообщения сама по себе не меняет режим AI.</span>
            <div>
              <Button
                v-if="
                  conversationAISuspensionEnabled &&
                  canManageSuspension &&
                  !isSuspended()
                "
                type="button"
                label="Приостановить AI и отправить"
                icon="pi pi-pause-circle"
                severity="secondary"
                text
                :disabled="!replyText.trim() || !onlineSession"
                @click="openSuspension('START', true)"
              />
              <Button
                type="submit"
                label="Отправить"
                icon="pi pi-send"
                :loading="sendingReply"
                :disabled="
                  !replyText.trim() ||
                  !onlineSession ||
                  selectedConversation.status !== 'ACTIVE'
                "
              />
            </div>
          </div>
        </form>
      </main>

      <aside
        class="profile-pane"
        tabindex="0"
        role="region"
        aria-label="Профиль пользователя"
      >
        <div class="pane-header">
          <div>
            <span class="eyebrow">Контекст</span>
            <h3>Профиль</h3>
          </div>
          <Button
            icon="pi pi-angle-right"
            aria-label="Скрыть профиль"
            severity="secondary"
            text
            rounded
            @click="profileCollapsed = true"
          />
        </div>
        <div v-if="detailLoading" class="pane-loading">
          <Skeleton v-for="item in 6" :key="item" height="60px" />
        </div>
        <Message v-else-if="detailError" severity="error" :closable="false">{{
          detailError
        }}</Message>
        <template v-else-if="detail">
          <dl class="profile-summary">
            <div>
              <dt>ID продукта</dt>
              <dd>{{ detail.externalUserId }}</dd>
            </div>
            <div>
              <dt>Версия профиля</dt>
              <dd>{{ detail.profileVersion }}</dd>
            </div>
            <div>
              <dt>Данные актуальны</dt>
              <dd>
                {{
                  detail.observedAt
                    ? relativeTime(detail.observedAt)
                    : "Нет данных"
                }}
              </dd>
            </div>
          </dl>
          <div class="profile-fields">
            <article v-for="field in detail.fields" :key="field.definitionId">
              <span>{{ field.label }}</span>
              <strong>{{ displayField(field) }}</strong>
              <small>{{
                field.availability === "AVAILABLE"
                  ? "Актуально"
                  : field.availability
              }}</small>
            </article>
          </div>
        </template>
      </aside>
    </div>

    <Dialog
      v-model:visible="newChatOpen"
      modal
      header="Новый диалог"
      :style="{ width: 'min(520px, 94vw)' }"
      class="new-chat-dialog"
    >
      <div class="new-chat-form">
        <p>
          Первое сообщение создаст отдельный диалог и сразу откроет его в
          рабочем пространстве.
        </p>
        <Textarea
          v-model="newChatText"
          rows="5"
          maxlength="10000"
          autofocus
          placeholder="Напишите первое сообщение"
          aria-label="Первое сообщение нового диалога"
        />
        <div>
          <Button
            label="Отмена"
            severity="secondary"
            text
            @click="newChatOpen = false"
          /><Button
            label="Создать и отправить"
            icon="pi pi-send"
            :loading="creatingConversation"
            :disabled="!newChatText.trim() || !onlineSession"
            @click="createConversation"
          />
        </div>
      </div>
    </Dialog>
  </Dialog>

  <ConversationAISuspensionDialog
    v-if="
      conversationAISuspensionEnabled &&
      selectedConversation &&
      selectedSuspensionEntry
    "
    v-model:visible="suspensionDialogVisible"
    :mode="suspensionDialogMode"
    :conversation-label="`${selectedConversation.title} · ${selectedConversation.id}${combinedSend ? ' · сообщение отправится той же операцией' : ''}`"
    :current="selectedSuspensionEntry.detail ?? null"
    :server-offset-ms="selectedSuspensionEntry.serverOffsetMs"
    :busy="
      Boolean(selectedSuspensionEntry.mutating) ||
      (combinedSend && sendingReply)
    "
    :error="
      combinedSend ? combinedSuspensionError : selectedSuspensionEntry.error
    "
    @submit="submitSuspension"
  />
  <ConversationAISuspensionHistory
    v-if="conversationAISuspensionEnabled && endUserId && selectedConversation"
    v-model:visible="suspensionHistoryVisible"
    :project-id="projectId"
    :end-user-id="endUserId"
    :conversation-id="selectedConversation.id"
  />
</template>

<style scoped>
.workspace-title,
.pane-header,
.chat-header,
.chat-header-status,
.composer-footer,
.composer-footer > div,
.conversation-row-title {
  display: flex;
  align-items: center;
}
.workspace-title {
  gap: 12px;
  min-width: 0;
}
.workspace-title h2,
.pane-header h3,
.chat-header h3 {
  margin: 2px 0 0;
  font-family: Manrope, sans-serif;
  letter-spacing: -0.025em;
}
.workspace-title h2 {
  font-size: 1.05rem;
}
.avatar {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 13px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
  font-weight: 800;
}
.eyebrow {
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--text-secondary);
  font-weight: 800;
}
.workspace-grid {
  display: grid;
  grid-template-columns: minmax(245px, 300px) minmax(420px, 1fr) minmax(
      260px,
      320px
    );
  height: min(760px, calc(100dvh - 170px));
  background: var(--surface-ground);
}
@media (min-width: 961px) {
  .workspace-grid.profile-collapsed {
    grid-template-columns: minmax(245px, 300px) minmax(420px, 1fr) 0;
  }
  .workspace-grid.profile-collapsed .profile-pane {
    display: none;
  }
}
.realtime-message {
  margin: 0;
  border-radius: 0;
  font-size: 0.72rem;
}
.conversation-pane,
.chat-pane,
.profile-pane {
  min-width: 0;
  min-height: 0;
  background: var(--surface-card);
}
.conversation-pane,
.profile-pane {
  display: flex;
  flex-direction: column;
  padding: 18px;
  overflow: hidden;
}
.conversation-pane {
  border-right: 1px solid var(--line);
}
.profile-pane {
  border-left: 1px solid var(--line);
  overflow-y: auto;
}
.chat-pane {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 18px 20px 16px;
  overflow: hidden;
}
.pane-header,
.chat-header {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.pane-header h3,
.chat-header h3 {
  font-size: 1rem;
}
.chat-header-status {
  gap: 7px;
}
.compact-message {
  margin-bottom: 10px;
  font-size: 0.72rem;
}
.pane-loading {
  display: grid;
  gap: 9px;
}
.conversation-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 3px;
}
.conversation-list button {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 5px;
  width: 100%;
  padding: 12px;
  border: 1px solid transparent;
  border-radius: 13px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: 0.16s ease;
}
.conversation-list button:hover {
  background: var(--surface-subtle);
}
.conversation-list button.selected {
  border-color: color-mix(in srgb, var(--accent) 34%, var(--line));
  background: var(--brand-soft);
}
.conversation-list strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.78rem;
}
.conversation-list button > span:not(.conversation-row-title) {
  color: var(--text-secondary);
  font-size: 0.64rem;
}
.conversation-row-title {
  justify-content: space-between;
  gap: 8px;
}
.current-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--status-success-text);
  box-shadow: 0 0 0 4px var(--status-success-soft);
}
.message-history {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 7px 18px;
  scrollbar-gutter: stable;
}
.history-loader,
.older-button {
  align-self: center;
}
.history-loader {
  padding: 8px;
  color: var(--text-secondary);
  font-size: 0.68rem;
}
.message-skeletons {
  width: 75%;
}
.message-bubble {
  align-self: flex-start;
  max-width: min(76%, 680px);
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 15px 15px 15px 4px;
  background: var(--surface-subtle);
}
.message-bubble.live-enter {
  animation: message-enter 0.2s ease-out;
}
.message-bubble.admin,
.message-bubble.assistant,
.message-bubble.scenario {
  align-self: flex-end;
  border-radius: 15px 15px 4px 15px;
  background: var(--status-violet-soft);
  color: var(--text-primary);
}
.message-bubble.admin {
  border-color: color-mix(in srgb, var(--accent) 30%, var(--line));
  background: var(--brand-soft);
}
.message-bubble.system {
  align-self: center;
  max-width: 90%;
  border-style: dashed;
  border-radius: 999px;
  background: transparent;
  text-align: center;
}
.message-bubble > div {
  display: flex;
  justify-content: space-between;
  gap: 14px;
}
.message-bubble strong,
.message-bubble time,
.message-bubble small {
  font-size: 0.61rem;
}
.message-bubble time,
.message-bubble small {
  color: var(--text-secondary);
}
.message-bubble p {
  margin: 5px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 0.78rem;
  line-height: 1.48;
}
.message-bubble.failed {
  border-color: var(--status-danger-border);
}
.message-bubble.cancelled {
  opacity: 0.72;
}
.new-message-pill {
  position: absolute;
  z-index: 2;
  left: 50%;
  bottom: 116px;
  translate: -50% 0;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-card);
  color: var(--text-primary);
  box-shadow: var(--shadow);
  font-size: 0.7rem;
  cursor: pointer;
}
.composer {
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.composer textarea {
  width: 100%;
}
.composer-footer {
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
}
.composer-footer > span {
  max-width: 340px;
  color: var(--text-secondary);
  font-size: 0.62rem;
}
.composer-footer > div {
  justify-content: flex-end;
  gap: 6px;
}
.chat-error {
  margin-bottom: 8px;
}
.profile-summary {
  display: grid;
  gap: 8px;
  margin: 0 0 15px;
}
.profile-summary > div,
.profile-fields article {
  padding: 10px 11px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface-subtle);
}
.profile-summary dt,
.profile-fields span,
.profile-fields small {
  color: var(--text-secondary);
  font-size: 0.61rem;
}
.profile-summary dd {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
  font-size: 0.75rem;
  font-weight: 700;
}
.profile-fields {
  display: grid;
  gap: 8px;
}
.profile-fields article {
  display: grid;
  gap: 4px;
}
.profile-fields strong {
  overflow-wrap: anywhere;
  font-size: 0.75rem;
}
.empty-state {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 7px;
  min-height: 180px;
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
}
.empty-state i {
  font-size: 1.4rem;
}
.empty-state strong {
  color: var(--text-primary);
  font-size: 0.82rem;
}
.empty-state span {
  max-width: 260px;
  font-size: 0.68rem;
  line-height: 1.45;
}
.chat-empty {
  height: 100%;
}
.new-chat-form {
  display: grid;
  gap: 14px;
}
.new-chat-form p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.78rem;
  line-height: 1.5;
}
.new-chat-form > div {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.mobile-workspace-nav {
  display: none;
}
@keyframes message-enter {
  from {
    opacity: 0;
    transform: translateY(7px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .message-bubble {
    animation: none;
  }
  .conversation-list button {
    transition: none;
  }
}
@media (max-width: 1150px) {
  .composer-footer > span {
    display: none;
  }
  .composer-footer > div {
    width: 100%;
  }
  .composer-footer :deep(.p-button) {
    padding: 0.55rem 0.7rem;
    font-size: 0.72rem;
  }
  .composer :deep(textarea) {
    height: 58px !important;
    min-height: 58px;
    overflow-y: auto !important;
  }
}
@media (max-width: 960px) {
  :global(.user-workspace-dialog.p-dialog) {
    width: 100vw !important;
    height: 100dvh !important;
    max-height: 100dvh !important;
    margin: 0 !important;
    border-radius: 0 !important;
  }
  :global(.user-workspace-dialog .p-dialog-content) {
    flex: 1;
    min-height: 0;
  }
  .mobile-workspace-nav {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    padding: 0 10px 10px;
    border-bottom: 1px solid var(--line);
    background: var(--surface-card);
  }
  .mobile-workspace-nav button {
    min-height: 44px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.69rem;
  }
  .mobile-workspace-nav button.active {
    border-color: var(--accent);
    color: var(--text-primary);
    font-weight: 700;
  }
  .workspace-grid {
    display: block;
    height: calc(100dvh - 154px);
  }
  .conversation-pane,
  .chat-pane,
  .profile-pane {
    display: none;
    width: 100%;
    height: 100%;
    border: 0;
  }
  .workspace-grid[data-mobile-pane="LIST"] .conversation-pane,
  .workspace-grid[data-mobile-pane="CHAT"] .chat-pane,
  .workspace-grid[data-mobile-pane="PROFILE"] .profile-pane {
    display: flex;
  }
  .workspace-grid[data-mobile-pane="CHAT"] .chat-pane {
    display: flex;
    flex-direction: column;
    padding: 13px 12px 10px;
  }
  .workspace-grid[data-mobile-pane="PROFILE"] .profile-pane {
    overflow-y: auto;
  }
  .message-bubble {
    max-width: 88%;
  }
  .composer-footer {
    align-items: flex-end;
  }
  .composer-footer > span {
    display: none;
  }
  .composer-footer > div {
    width: 100%;
    flex-wrap: wrap;
  }
  .composer-footer :deep(.p-button) {
    flex: 1 1 auto;
  }
  .new-message-pill {
    bottom: 126px;
  }
  :global(.new-chat-dialog.p-dialog) {
    width: 100vw !important;
    max-width: none;
    margin: 0;
    border-radius: 20px 20px 0 0;
    align-self: flex-end;
  }
}
@media (max-width: 440px) {
  .workspace-title .p-tag {
    display: none;
  }
  .conversation-pane,
  .profile-pane {
    padding: 14px;
  }
  .message-bubble {
    max-width: 94%;
  }
  .chat-header {
    margin-bottom: 8px;
  }
}
</style>
