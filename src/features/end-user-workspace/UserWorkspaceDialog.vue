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
import { useToast } from "primevue/usetoast";
import { useAuthStore } from "@/features/auth/auth.store";
import { hasProjectPermission } from "@/features/auth/permission-access";
import { useAdminConversationConsole } from "@/features/admin-conversations/model/use-admin-conversation-console";
import { endUserProfileRepository } from "@/features/end-user-profile/api/end-user-profile-repository";
import { formatProfileValue } from "@/features/end-user-profile/model/profile-value";
import EndUserProfileSyncHistory from "@/features/end-user-profile/ui/EndUserProfileSyncHistory.vue";
import EndUserTelegramPanel from "@/features/telegram-product-installations/EndUserTelegramPanel.vue";
import { useConversationAISuspensionStore } from "@/features/conversation-ai-suspension/model/conversation-ai-suspension.store";
import ConversationAISuspensionBanner from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionBanner.vue";
import ConversationAISuspensionDialog from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionDialog.vue";
import ConversationAISuspensionHeaderActions from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionHeaderActions.vue";
import ConversationAISuspensionHistory from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionHistory.vue";
import { createConversationTranslationController } from "@/features/conversation-translation/model/use-conversation-translation";
import { isFrontendTranslationCandidate } from "@/features/conversation-translation/model/translation-eligibility";
import ConversationTranslationBanner from "@/features/conversation-translation/ui/ConversationTranslationBanner.vue";
import ReplyTranslationPreview from "@/features/conversation-translation/ui/ReplyTranslationPreview.vue";
import TranslatedMessageBody from "@/features/conversation-translation/ui/TranslatedMessageBody.vue";
import type {
  ExtendConversationAISuspensionDto,
  ProfileProjectionResponseDto,
  ResumeConversationAIDto,
  StartConversationAISuspensionDto,
} from "@/shared/api/generated/models";
import { conversationAISuspensionEnabled } from "@/shared/config/features";
import { formatDate, relativeTime } from "@/shared/lib/format";
import {
  inferLocaleFromText,
  localeDisplayName,
} from "@/shared/lib/locale";
import type { ConversationMessage } from "@/shared/types/domain";
import { cmsRealtimeClient } from "@/shared/realtime/cms-realtime-client";
import UserMemoryPanel from "@/features/user-memory/ui/UserMemoryPanel.vue";
import AIReviewDialog from "@/features/ai-review/ui/AIReviewDialog.vue";
import EndUserAiUsageCard from "@/features/ai-usage/EndUserAiUsageCard.vue";
import type { CmsRealtimeState } from "@/shared/realtime/cms-realtime-contract";
import { repository } from "@/shared/api/repository";
import ConversationTicketDrawer from "./ConversationTicketDrawer.vue";

type WorkspaceMode = "PROFILE" | "CHAT";
type MobilePane = "LIST" | "CHAT";
type SuspensionMode = "START" | "EXTEND" | "RESUME";
type MessageViewMode = "ORIGINAL" | "TRANSLATED";

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
  preferredEndUserCaseId?: string;
}>();
const emit = defineEmits<{
  changed: [];
  conversationSelected: [conversationId: string];
  profileSelected: [];
}>();
const visible = defineModel<boolean>("visible", { required: true });
const auth = useAuthStore();
const toast = useToast();
const suspensionStore = useConversationAISuspensionStore();
const detail = ref<ProfileProjectionResponseDto | null>(null);
const detailLoading = ref(false);
const detailError = ref("");
const workspaceMode = ref<WorkspaceMode>("PROFILE");
const mobilePane = ref<MobilePane>("CHAT");
const messageViewMode = ref<MessageViewMode>("TRANSLATED");
const conversationSearch = ref("");
const historyElement = ref<HTMLElement | null>(null);
const newChatOpen = ref(false);
const newChatText = ref("");
const suspensionDialogVisible = ref(false);
const suspensionHistoryVisible = ref(false);
const suspensionDialogMode = ref<SuspensionMode>("START");
const realtimeState = ref<CmsRealtimeState>("DISCONNECTED");
const aiReviewVisible = ref(false);
const liveMessageIds = ref<string[]>([]);
const telegramDraftDirty = ref(false);
const sendWithoutTranslationVisible = ref(false);
const sendWithoutTranslationReason = ref("");
const composerActionsVisible = ref(false);
const conversationMenuVisible = ref(false);
const ticketDrawerVisible = ref(false);
const replyTemplateGalleryVisible = ref(false);
const translationFeedbackEnabled = ref(false);
const replyTranslationRequested = ref(false);
let profileRequest = 0;
let unsubscribeMessage: (() => void) | undefined;
let unsubscribeTranslation: (() => void) | undefined;
let unsubscribeReconcile: (() => void) | undefined;
let unsubscribeRealtimeState: (() => void) | undefined;
let presenceTimer: ReturnType<typeof setInterval> | undefined;

const consoleState = useAdminConversationConsole({
  projectId: () => props.projectId,
  endUserId: () => props.endUserId ?? undefined,
  updateRoute: (conversationId) => {
    if (workspaceMode.value === "CHAT")
      emit("conversationSelected", conversationId);
  },
  beforeLoadMessages: (conversationId) =>
    cmsRealtimeClient.watchConversation(conversationId),
  canReadPresence: () =>
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      "project.end_users.read",
    ),
  endUserCaseId: () => props.preferredEndUserCaseId,
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
  newMessageCount,
} = consoleState;

const selectedSuspensionEntry = computed(() =>
  selectedConversation.value
    ? suspensionStore.getEntry(selectedConversation.value.id)
    : undefined,
);
const canManageSuspension = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    "project.conversations.ai_suspend",
  ),
);
const projectPermissions = computed(
  () => auth.project?.effectivePermissionCodes ?? [],
);
const canReadProfiles = computed(() =>
  hasProjectPermission(projectPermissions.value, "project.profiles.read"),
);
const canReadTelegramLinks = computed(() =>
  hasProjectPermission(projectPermissions.value, "project.telegram.links.read"),
);
const canSendTelegramPersonalMessages = computed(() =>
  hasProjectPermission(
    projectPermissions.value,
    "project.telegram.personal_messages.send",
  ),
);
const canReadUserMemory = computed(() =>
  hasProjectPermission(projectPermissions.value, "project.user_memory.read"),
);
const canReadAiUsage = computed(() =>
  hasProjectPermission(projectPermissions.value, "project.ai_usage.read"),
);
const canReadConversations = computed(() =>
  hasProjectPermission(projectPermissions.value, "project.conversations.read"),
);
const canReply = computed(() =>
  hasProjectPermission(projectPermissions.value, "project.conversations.reply"),
);
const canManageTranslation = computed(() =>
  hasProjectPermission(projectPermissions.value, "project.translation.create"),
);
const canReadTranslationDetails = computed(() =>
  hasProjectPermission(projectPermissions.value, "project.translation.read"),
);
const canReplyWithoutTranslation = computed(() =>
  Boolean(
    canReply.value &&
    hasProjectPermission(
      projectPermissions.value,
      "project.conversations.reply_without_translation",
    ),
  ),
);
const translation = createConversationTranslationController({
  projectId: () => props.projectId,
  endUserId: () => props.endUserId ?? undefined,
  conversationId: () => selectedConversation.value?.id,
  selectedCaseId: () => props.preferredEndUserCaseId,
  sourceText: () => replyText.value,
  restoreSourceText: (value) => {
    replyText.value = value;
  },
  reconcileMessages: () => consoleState.reconcileSelected(),
});
const visibleTranslationMessageIds = computed(() =>
  messages.value
    .filter(
      (message) =>
        isFrontendTranslationCandidate(
          message,
          translation.state.value?.preference.workingLocale,
        ) && !translation.messageTranslations.value.has(message.id),
    )
    .slice(-50)
    .map((message) => message.id),
);
const conversationLocale = computed(() => {
  const translationLocale = translation.state.value?.language.locale;
  if (translationLocale) return translationLocale;

  const userMessages = messages.value.filter(
    (message) => message.author === "USER" && message.text.trim(),
  );
  for (let index = userMessages.length - 1; index >= 0; index -= 1) {
    const message = userMessages[index];
    if (message.translation?.sourceLocale) {
      return message.translation.sourceLocale;
    }
  }

  if (userMessages.length) {
    return inferLocaleFromText(
      userMessages.map((message) => message.text).join("\n"),
    );
  }

  const completedText = messages.value
    .filter((message) => message.status === "COMPLETED" && message.text.trim())
    .map((message) => message.text)
    .join("\n");
  if (completedText) return inferLocaleFromText(completedText);

  const localeField = detail.value?.fields.find(
    (field) => field.key.toLocaleLowerCase() === "locale",
  );
  const localeValue = localeField?.value;
  if (
    localeValue &&
    localeValue.type === "STRING" &&
    typeof localeValue.value === "string"
  ) {
    return localeValue.value;
  }
  return null;
});
const workingLocaleLabel = computed(
  () =>
    translation.state.value?.preference.workingLocale?.toUpperCase() ?? "RU",
);
const filteredConversations = computed(() => {
  const query = conversationSearch.value.trim().toLocaleLowerCase("ru-RU");
  if (!query) return conversations.value;
  return conversations.value.filter((conversation) =>
    conversation.title.toLocaleLowerCase("ru-RU").includes(query),
  );
});
const replyTranslationInFlight = computed(
  () =>
    translation.previewing.value ||
    translation.editingReply.value ||
    translation.draft.value?.status === "PENDING" ||
    translation.draft.value?.status === "RUNNING",
);
const bulkTranslationIds = computed(() => [
  ...translation.translatingMessageIds.value,
]);
const bulkTranslationActive = computed(
  () => bulkTranslationIds.value.length > 1,
);
const bulkTranslationCompleted = computed(
  () =>
    bulkTranslationIds.value.filter((messageId) => {
      const state =
        translation.messageTranslations.value.get(messageId)?.state;
      return state === "COMPLETED" || state === "FAILED" || state === "SKIPPED";
    }).length,
);
const bulkTranslationProgress = computed(() => {
  if (!bulkTranslationIds.value.length) return 0;
  return Math.round(
    (bulkTranslationCompleted.value / bulkTranslationIds.value.length) * 100,
  );
});
const replyTemplates = [
  "Проверяю информацию. Одну минуту, пожалуйста.",
  "Спасибо за ожидание. Уточняю детали и скоро вернусь с ответом.",
  "Проверил информацию. Подскажите, проблема всё ещё актуальна?",
] as const;

async function setTranslationEnabled(enabled: boolean): Promise<void> {
  if (!(await ensureTranslationLoaded())) return;
  await translation.updatePreference({ enabled });
  if (enabled && translation.state.value?.preference.enabled) {
    await translation.translateMessages(visibleTranslationMessageIds.value);
  }
}

async function ensureTranslationLoaded(): Promise<boolean> {
  if (!canManageTranslation.value) return false;
  translationFeedbackEnabled.value = true;
  if (!translation.state.value && !translation.loading.value) {
    await translation.load();
  }
  return Boolean(translation.state.value);
}

async function showTranslatedMessages(): Promise<void> {
  const sourceLocale = conversationLocale.value?.toLocaleLowerCase();
  const workingLocale =
    translation.state.value?.preference.workingLocale.toLocaleLowerCase() ??
    "ru";
  if (
    sourceLocale &&
    sourceLocale.split(/[-_]/)[0] === workingLocale.split(/[-_]/)[0]
  ) {
    messageViewMode.value = "TRANSLATED";
    return;
  }
  if (!(await ensureTranslationLoaded())) return;
  if (!translation.state.value?.preference.enabled) {
    await translation.updatePreference({ enabled: true });
  }
  if (!translation.state.value?.preference.enabled) return;
  await translation.translateMessages(visibleTranslationMessageIds.value);
  messageViewMode.value = "TRANSLATED";
}

function toggleConversationMenu(): void {
  conversationMenuVisible.value = !conversationMenuVisible.value;
}

async function prepareReplyTranslation(): Promise<void> {
  if (!(await ensureTranslationLoaded())) return;
  const targetLocale = translation.targetLocale.value;
  const workingLocale = translation.state.value?.preference.workingLocale;
  if (!targetLocale || targetLocale === workingLocale) {
    conversationMenuVisible.value = true;
    toast.add({
      severity: "info",
      summary: "Выберите язык перевода",
      detail:
        "В меню «⋯» задайте язык, на котором пользователь должен получить ответ.",
      life: 5_000,
    });
    return;
  }
  replyTranslationRequested.value = true;
  await translation.createReplyPreview();
}
const canStartAIReview = computed(
  () =>
    hasProjectPermission(projectPermissions.value, "project.ai_review.read") &&
    hasProjectPermission(projectPermissions.value, "project.ai_review.run") &&
    hasProjectPermission(projectPermissions.value, "project.settings.read") &&
    hasProjectPermission(
      projectPermissions.value,
      "project.event_query_policy.preview",
    ) &&
    hasProjectPermission(projectPermissions.value, "project.ai_proposals.read"),
);
const projectTimezone = computed(() => {
  const scenarioEngine = auth.project?.settings?.scenarioEngine as
    { activity?: { timezone?: unknown } } | undefined;
  return typeof scenarioEngine?.activity?.timezone === "string"
    ? scenarioEngine.activity.timezone
    : "UTC";
});
const displayName = computed(
  () =>
    props.externalUserId ||
    detail.value?.externalUserId ||
    props.endUserId ||
    "Пользователь",
);
const realtimeStatus = computed(() => {
  if (realtimeState.value === "CONNECTED") {
    return { label: "Live", state: "connected" };
  }
  if (realtimeState.value === "CONNECTING") {
    return { label: "Подключение", state: "connecting" };
  }
  if (realtimeState.value === "DEGRADED") {
    return { label: "Ошибка связи", state: "error" };
  }
  return { label: "Нет связи", state: "disconnected" };
});
const hasUnsavedDraft = computed(
  () =>
    consoleState.hasAnyDraft() ||
    Boolean(newChatText.value.trim()) ||
    telegramDraftDirty.value,
);

watch(conversations, (value) => suspensionStore.ingestConversations(value), {
  flush: "sync",
});
watch(replyText, (value) => {
  if (!value.trim()) replyTranslationRequested.value = false;
});
watch(conversationError, (message) => {
  if (!message) return;
  toast.add({
    severity: "warn",
    summary: "Не удалось обновить диалог",
    detail: message,
    life: 6_000,
  });
});
watch(
  () => selectedSuspensionEntry.value?.error?.message,
  (message) => {
    if (!message) return;
    toast.add({
      severity: "warn",
      summary: "Не удалось обновить состояние AI",
      detail: message,
      life: 7_000,
    });
  },
);
watch(
  () => translation.error.value,
  (message) => {
    if (!message || !translationFeedbackEnabled.value) return;
    toast.add({
      severity: "warn",
      summary: message.startsWith("На сервере выключена обработка переводов")
        ? "Переводы временно выключены"
        : "Ошибка перевода",
      detail: message,
      life: 7_000,
    });
  },
);
watch(
  () => selectedConversation.value?.id,
  async (conversationId) => {
    messageViewMode.value = "ORIGINAL";
    translationFeedbackEnabled.value = false;
    replyTranslationRequested.value = false;
    translation.reset();
    composerActionsVisible.value = false;
    conversationMenuVisible.value = false;
    ticketDrawerVisible.value = false;
    replyTemplateGalleryVisible.value = false;
    sendWithoutTranslationReason.value = "";
    sendWithoutTranslationVisible.value = false;
    if (!conversationId || !props.endUserId || !visible.value) return;
    liveMessageIds.value = [];
    if (conversationAISuspensionEnabled)
      void suspensionStore.loadDetail(props.endUserId, conversationId);
    if (
      canManageTranslation.value &&
      translation.hasStoredReplyDraft()
    ) {
      await translation.load();
      replyTranslationRequested.value = Boolean(translation.draft.value);
    }
    mobilePane.value = "CHAT";
    await nextTick();
    scrollToLatest(false);
  },
);
watch(
  () => [visible.value, props.projectId, props.endUserId] as const,
  ([isVisible, , endUserId]) => {
    document.body.classList.toggle("workspace-scroll-locked", isVisible);
    if (!isVisible || !endUserId) {
      closeWorkspace();
      return;
    }
    void openWorkspace(endUserId, props.preferredConversationId);
  },
  { immediate: true },
);

onMounted(() => {
  document.body.classList.toggle("workspace-scroll-locked", visible.value);
  unsubscribeRealtimeState = cmsRealtimeClient.onState((state) => {
    realtimeState.value = state;
  });
  if (canReadConversations.value) {
    unsubscribeMessage = cmsRealtimeClient.subscribe(
      ["conversation.message.upserted.v1"],
      handleMessageUpsert,
    );
    unsubscribeTranslation = cmsRealtimeClient.subscribe(
      ["conversation.message.translation.upserted.v1"],
      (value) => {
        translation.mergeRealtimeTranslation(value);
      },
    );
    unsubscribeReconcile = cmsRealtimeClient.reconcile(async () => {
      if (!visible.value) return;
      await consoleState.reconcileSelected();
      if (
        canManageTranslation.value &&
        selectedConversation.value &&
        translationFeedbackEnabled.value
      ) {
        await translation.load();
      }
    });
  }
  if (canReadConversations.value) {
    presenceTimer = setInterval(() => {
      if (visible.value) void consoleState.refreshPresence();
    }, 15_000);
  }
});
onBeforeUnmount(() => {
  document.body.classList.remove("workspace-scroll-locked");
  unsubscribeRealtimeState?.();
  unsubscribeMessage?.();
  unsubscribeTranslation?.();
  unsubscribeReconcile?.();
  if (presenceTimer) clearInterval(presenceTimer);
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
  conversationSearch.value = "";
  mobilePane.value = "CHAT";
  workspaceMode.value = preferredConversationId ? "CHAT" : "PROFILE";
  liveMessageIds.value = [];
  consoleState.reset();
  const profilePromise = canReadProfiles.value
    ? loadProfile(endUserId)
    : Promise.resolve(null);
  const conversationsPromise = canReadConversations.value
    ? (async () => {
        await cmsRealtimeClient.activateProject(props.projectId);
        await consoleState.loadConversations(
          endUserId,
          preferredConversationId,
        );
      })()
    : Promise.resolve();
  const results = await Promise.allSettled([
    profilePromise,
    conversationsPromise,
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
  telegramDraftDirty.value = false;
  sendWithoutTranslationReason.value = "";
  sendWithoutTranslationVisible.value = false;
  composerActionsVisible.value = false;
  conversationMenuVisible.value = false;
  ticketDrawerVisible.value = false;
  replyTemplateGalleryVisible.value = false;
  translationFeedbackEnabled.value = false;
  replyTranslationRequested.value = false;
  translation.reset();
}

async function openChat(): Promise<void> {
  if (!canReadConversations.value) return;
  workspaceMode.value = "CHAT";
  mobilePane.value = selectedConversation.value ? "CHAT" : "LIST";
  if (selectedConversation.value) {
    emit("conversationSelected", selectedConversation.value.id);
    await nextTick();
    scrollToLatest(false);
  }
}

function openProfile(): void {
  workspaceMode.value = "PROFILE";
  emit("profileSelected");
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
  const previousMessage = messages.value.find(
    (message) => message.id === event.message.id,
  );
  const isNewMessage = !previousMessage;
  if (!consoleState.upsertMessage(messageFromEvent(event), !nearLatest)) return;
  if (isNewMessage)
    liveMessageIds.value = [...liveMessageIds.value, event.message.id];
  if (
    previousMessage?.status !== "COMPLETED" &&
    isFrontendTranslationCandidate(
      messageFromEvent(event),
      translation.state.value?.preference.workingLocale,
    ) &&
    canManageTranslation.value &&
    translation.state.value?.preference.enabled
  ) {
    void translation.translateMessage(event.message.id);
  }
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
  const previousIds = new Set(messages.value.map((message) => message.id));
  const added = await consoleState.loadOlderMessages();
  if (!added) return;
  if (
    canManageTranslation.value &&
    translation.state.value?.preference.enabled
  ) {
    const newEligibleIds = messages.value
      .filter(
        (message) =>
          !previousIds.has(message.id) &&
          isFrontendTranslationCandidate(
            message,
            translation.state.value?.preference.workingLocale,
          ),
      )
      .slice(0, 50)
      .map((message) => message.id);
    void translation.translateMessages(newEligibleIds);
  }
  await nextTick();
  element.scrollTop = previousTop + element.scrollHeight - previousHeight;
}

async function selectConversation(
  conversation: (typeof conversations.value)[number],
): Promise<void> {
  workspaceMode.value = "CHAT";
  mobilePane.value = "CHAT";
  await consoleState.loadMessages(conversation);
  await nextTick();
  scrollToLatest(false);
}

function applyReplyTemplate(
  template: (typeof replyTemplates)[number] = replyTemplates[0],
): void {
  replyText.value = template;
  composerActionsVisible.value = false;
  replyTemplateGalleryVisible.value = false;
  toast.add({
    severity: "success",
    summary: "Шаблон добавлен",
    detail: "Текст можно отредактировать перед переводом и отправкой.",
    life: 3_000,
  });
}

function openTicketDrawer(): void {
  composerActionsVisible.value = false;
  ticketDrawerVisible.value = true;
}

function showUnavailableAttachment(): void {
  composerActionsVisible.value = false;
  toast.add({
    severity: "info",
    summary: "Вложения пока недоступны",
    detail: "Live API принимает только текст. Файл не будет добавлен фиктивно.",
    life: 5_000,
  });
}

async function copyConversationId(): Promise<void> {
  const id = selectedConversation.value?.id;
  if (!id) return;
  try {
    await navigator.clipboard.writeText(id);
    toast.add({
      severity: "success",
      summary: "ID диалога скопирован",
      detail: id,
      life: 3_000,
    });
  } catch {
    toast.add({
      severity: "warn",
      summary: "Не удалось скопировать ID",
      detail: id,
      life: 5_000,
    });
  }
  conversationMenuVisible.value = false;
}

function exportConversation(): void {
  const conversation = selectedConversation.value;
  if (!conversation) return;
  const lines = messages.value.flatMap((message) => {
    const header = `[${formatDate(message.createdAt)}] ${authorLabel(message.author)}`;
    const original =
      message.translation?.originalText?.trim() || message.text.trim();
    const translated = message.translation?.translatedText?.trim();
    return [
      header,
      original,
      ...(translated && translated !== original
        ? [`Перевод: ${translated}`]
        : []),
      "",
    ];
  });
  const blob = new Blob([lines.join("\n")], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${conversation.title || conversation.id}.txt`.replace(
    /[/\\?%*:|"<>]/g,
    "-",
  );
  anchor.click();
  URL.revokeObjectURL(url);
  conversationMenuVisible.value = false;
}

async function createConversation(): Promise<void> {
  if (!canReply.value) return;
  const conversationId = await consoleState.sendNewConversation(
    newChatText.value,
  );
  if (!conversationId) return;
  newChatText.value = "";
  newChatOpen.value = false;
  emit("changed");
}

async function sendReply(): Promise<void> {
  if (!canReply.value) return;
  if (replyTranslationRequested.value) {
    if (translation.readyDraft.value) {
      await sendTranslatedReply();
    } else {
      await prepareReplyTranslation();
    }
    return;
  }
  await consoleState.sendReply();
}

function handleComposerEnter(event: KeyboardEvent): void {
  if (event.isComposing) return;
  event.preventDefault();
  if (translation.readyDraft.value && !translation.previewStale.value) {
    void sendTranslatedReply();
    return;
  }
  void sendReply();
}

async function sendTranslatedReply(editedText?: string): Promise<void> {
  if (
    !canReply.value ||
    translation.savingPreference.value ||
    translation.previewStale.value
  ) {
    return;
  }
  const beforeEdit = translation.readyDraft.value;
  if (
    beforeEdit &&
    editedText?.trim() &&
    editedText.trim() !==
      (beforeEdit.editedTranslatedText ?? beforeEdit.translatedText ?? "")
  ) {
    await translation.editReplyTranslation(editedText);
  } else {
    await translation.flushReplyEdit();
  }
  const ready = translation.readyDraft.value;
  if (!ready) return;
  const result = await consoleState.sendReply({
    replyTranslationDraftId: ready.id,
  });
  if (repository.mode === "mock" && result?.messageId) {
    const saved = messages.value.find(
      (message) => message.id === result.messageId,
    );
    if (saved) {
      const deliveredText =
        ready.editedTranslatedText ??
        ready.deliveredTextPreview ??
        ready.translatedText ??
        "";
      consoleState.upsertMessage({
        ...saved,
        text: deliveredText,
        translation: {
          id: ready.id,
          direction: "OUTBOUND",
          status: "COMPLETED",
          originalText: ready.sourceText ?? "",
          translatedText: ready.translatedText ?? null,
          deliveredText,
          viewText: deliveredText,
          sourceLocale: ready.sourceLocale,
          targetLocale: ready.targetLocale,
          errorCode: null,
          warnings: ready.editedTranslatedText ? ["OPERATOR_EDITED"] : [],
          updatedAt: new Date().toISOString(),
        },
      });
    }
  }
  if (!replyText.value.trim()) {
    translation.clearReplyDraft();
    replyTranslationRequested.value = false;
  }
}

async function sendReplyWithoutTranslation(): Promise<void> {
  const reason = sendWithoutTranslationReason.value.trim();
  if (!canReplyWithoutTranslation.value || !reason) return;
  await consoleState.sendReply({ sendWithoutTranslationReason: reason });
  if (!replyText.value.trim()) {
    sendWithoutTranslationReason.value = "";
    sendWithoutTranslationVisible.value = false;
    translation.clearReplyDraft();
    replyTranslationRequested.value = false;
  }
}

function setSendWithoutTranslationVisible(value: boolean): void {
  sendWithoutTranslationVisible.value = value;
  composerActionsVisible.value = false;
  if (!value) sendWithoutTranslationReason.value = "";
}

function openSuspension(mode: SuspensionMode): void {
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
  suspensionDialogVisible.value = false;
  await suspensionStore.loadDetail(endUserId, conversation.id);
  emit("changed");
}

function authorLabel(author: ConversationMessage["author"]): string {
  return {
    USER: "Пользователь",
    ADMIN: "Оператор",
    ASSISTANT: "Lola · AI",
    SCENARIO: "Сценарий · CMS",
    SYSTEM: "Система",
  }[author];
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
    block-scroll
    maximizable
    :maximize-button-props="{
      'aria-label': 'Развернуть рабочее пространство',
    }"
    :draggable="false"
    :style="{
      width: 'min(1480px, calc(100vw - 32px))',
      height: 'min(900px, calc(100dvh - 32px))',
      maxHeight: 'calc(100dvh - 32px)',
    }"
    :content-style="{ padding: '0', overflow: 'hidden' }"
    :class="[
      'user-workspace-dialog',
      { 'user-workspace-dialog--chat': workspaceMode === 'CHAT' },
    ]"
    :aria-label="`Рабочее пространство пользователя ${displayName}`"
  >
    <template #header>
      <div class="workspace-title">
        <Button
          v-if="workspaceMode === 'CHAT'"
          data-action="open-profile"
          icon="pi pi-arrow-left"
          label="К профилю"
          severity="secondary"
          size="small"
          class="workspace-back"
          @click="openProfile"
        />
        <span v-if="workspaceMode === 'CHAT'" class="workspace-divider" />
        <span class="avatar">{{ displayName.slice(0, 1).toUpperCase() }}</span>
        <div class="workspace-identity">
          <h2>{{ displayName }}</h2>
          <span class="workspace-identity-meta">
            {{
              workspaceMode === "CHAT"
                ? detail?.externalUserId || endUserId || "—"
                : "Профиль пользователя"
            }}
            <i
              v-if="workspaceMode === 'CHAT'"
              class="presence-dot"
              :class="{ online: Boolean(onlineSession) }"
              role="img"
              :aria-label="
                onlineSession ? 'Пользователь онлайн' : 'Пользователь офлайн'
              "
            />
          </span>
        </div>
        <div class="workspace-statuses">
          <span
            class="connection-status"
            :data-state="realtimeStatus.state"
            data-testid="live-connection-status"
            :title="
              realtimeStatus.state === 'error'
                ? 'Обновления в реальном времени недоступны, история сверяется через API'
                : undefined
            "
          >
            <i class="connection-live-dot" />
            {{ realtimeStatus.label }}
          </span>
        </div>
      </div>
    </template>

    <section
      v-if="workspaceMode === 'PROFILE'"
      class="profile-overview"
      data-testid="profile-overview"
    >
      <div class="profile-hero">
        <div class="profile-identity">
          <span class="profile-avatar">{{
            displayName.slice(0, 1).toUpperCase()
          }}</span>
          <div>
            <span class="eyebrow">Профиль пользователя</span>
            <h2>{{ displayName }}</h2>
            <p>
              {{ detail?.externalUserId || endUserId }}
              <template v-if="detail?.observedAt">
                · обновлён {{ relativeTime(detail.observedAt) }}
              </template>
            </p>
          </div>
        </div>
        <Button
          v-if="canReadConversations"
          data-action="open-chat"
          label="Открыть чат"
          icon="pi pi-arrow-right"
          icon-pos="right"
          @click="openChat"
        />
      </div>

      <div class="profile-layout">
        <main class="profile-main">
          <section class="profile-card">
            <header class="profile-card-header">
              <div>
                <span class="eyebrow">Контекст</span>
                <h3><i class="pi pi-id-card" /> Основная информация</h3>
              </div>
              <div class="profile-card-header-actions">
                <EndUserProfileSyncHistory
                  v-if="canReadProfiles && endUserId"
                  :project-id="projectId"
                  :end-user-id="endUserId"
                />
                <Tag
                  :value="onlineSession ? 'Онлайн' : 'Офлайн'"
                  :severity="onlineSession ? 'success' : 'secondary'"
                  rounded
                />
              </div>
            </header>
            <div v-if="detailLoading" class="profile-loading">
              <Skeleton v-for="item in 6" :key="item" height="64px" />
            </div>
            <Message v-else-if="detailError" severity="error" :closable="false">
              {{ detailError }}
            </Message>
            <template v-else-if="detail">
              <dl class="profile-facts">
                <div>
                  <dt>ID продукта</dt>
                  <dd>{{ detail.externalUserId }}</dd>
                </div>
                <div>
                  <dt>Версия профиля</dt>
                  <dd>{{ detail.profileVersion }}</dd>
                </div>
                <div>
                  <dt>Контракт полей</dt>
                  <dd>
                    {{
                      detail.contractRevision !== null &&
                      detail.contractRevision !== undefined
                        ? `v${detail.contractRevision}`
                        : "Не указан"
                    }}
                  </dd>
                </div>
                <div>
                  <dt>Публикация настроек</dt>
                  <dd>
                    {{
                      detail.publicationSequence !== null &&
                      detail.publicationSequence !== undefined
                        ? `#${detail.publicationSequence}`
                        : "Не указана"
                    }}
                  </dd>
                </div>
                <div>
                  <dt>Актуальность</dt>
                  <dd>
                    {{
                      detail.observedAt
                        ? relativeTime(detail.observedAt)
                        : "Нет данных"
                    }}
                  </dd>
                </div>
                <div v-for="field in detail.fields" :key="field.definitionId">
                  <dt>{{ field.label }}</dt>
                  <dd>{{ displayField(field) }}</dd>
                </div>
              </dl>
            </template>
            <div v-else class="profile-empty">
              Профиль скрыт вашими правами доступа.
            </div>
          </section>

          <EndUserAiUsageCard
            v-if="canReadAiUsage && endUserId"
            :project-id="projectId"
            :end-user-id="endUserId"
          />
          <section v-else class="profile-card profile-empty-card">
            <i class="pi pi-lock" />
            <div>
              <strong>Потребление AI недоступно</strong>
              <span>Нужно право на чтение статистики AI проекта.</span>
            </div>
          </section>
        </main>

        <aside class="profile-actions" aria-label="Действия с пользователем">
          <section class="profile-card action-card">
            <header class="profile-card-header">
              <div>
                <span class="eyebrow">Управление</span>
                <h3><i class="pi pi-bolt" /> Действия</h3>
              </div>
            </header>
            <section
              v-if="canStartAIReview && endUserId"
              class="ai-review-entry"
              data-testid="ai-review-entry"
            >
              <span class="ai-review-entry-icon"
                ><i class="pi pi-sparkles"
              /></span>
              <div>
                <strong>AI-анализ событий</strong>
                <span>Выберите события и сначала оцените объём запроса.</span>
              </div>
              <Button
                label="Запросить анализ"
                icon="pi pi-arrow-right"
                icon-pos="right"
                size="small"
                severity="secondary"
                outlined
                @click="aiReviewVisible = true"
              />
            </section>
            <EndUserTelegramPanel
              :visible="visible"
              :project-id="projectId"
              :end-user-id="endUserId"
              :can-read="canReadTelegramLinks"
              :can-send="canSendTelegramPersonalMessages"
              @dirty-change="telegramDraftDirty = $event"
            />
          </section>

          <section v-if="canReadUserMemory && endUserId" class="profile-card">
            <UserMemoryPanel
              :project-id="projectId"
              :end-user-id="endUserId"
              :user-label="displayName"
              :editable="
                hasProjectPermission(
                  projectPermissions,
                  'project.user_memory.manage',
                )
              "
            />
          </section>
        </aside>
      </div>
    </section>

    <div
      v-if="workspaceMode === 'CHAT'"
      class="workspace-grid"
      :data-mobile-pane="mobilePane"
      data-testid="chat-workspace"
    >
      <aside class="conversation-pane">
        <div class="mobile-conversation-profile">
          <span class="avatar">{{ displayName.slice(0, 1).toUpperCase() }}</span>
          <div>
            <strong>{{ displayName }}</strong>
            <small>
              {{ (conversationLocale ?? "—").toUpperCase() }}
            </small>
          </div>
          <span
            class="connection-status"
            :data-state="realtimeStatus.state"
          >
            <i class="connection-live-dot" />
            {{ realtimeStatus.label }}
          </span>
        </div>
        <div class="pane-header">
          <h3>Диалоги · {{ conversations.length }}</h3>
          <Button
            v-if="canReply"
            icon="pi pi-plus"
            label="Новый"
            size="small"
            outlined
            :disabled="!onlineSession"
            @click="newChatOpen = true"
          />
        </div>
        <label class="conversation-search">
          <i class="pi pi-search" aria-hidden="true" />
          <input
            v-model="conversationSearch"
            type="search"
            aria-label="Поиск по диалогам"
            placeholder="Поиск по диалогам"
          />
          <button
            v-if="conversationSearch"
            type="button"
            aria-label="Очистить поиск"
            @click="conversationSearch = ''"
          >
            <i class="pi pi-times" aria-hidden="true" />
          </button>
        </label>
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
            v-for="conversation in filteredConversations"
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
              <span
                v-if="
                  conversationAISuspensionEnabled &&
                  conversationIsSuspended(conversation)
                "
                class="conversation-badge warning"
              >
                AI ⏸
              </span>
              <span
                v-else-if="
                  selectedConversation?.id === conversation.id &&
                  conversationLocale
                "
                class="conversation-badge accent"
              >
                {{ conversationLocale.toUpperCase() }}
              </span>
            </span>
            <span
              >{{ relativeTime(conversation.lastMessageAt) }} ·
              {{ conversation.messageCount }} сообщ.<template
                v-if="conversation.isCurrent"
              >
                · текущий</template
              ></span
            >
          </button>
          <div
            v-if="!filteredConversations.length"
            class="conversation-search-empty"
          >
            Ничего не найдено
          </div>
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
        <div
          v-if="selectedConversation"
          class="conversation-state-rail"
          :data-online="Boolean(onlineSession)"
          aria-label="Состояние диалога"
        >
          <button
            type="button"
            class="mobile-chat-back"
            aria-label="К списку диалогов"
            @click="mobilePane = 'LIST'"
          >
            <i class="pi pi-arrow-left" aria-hidden="true" />
          </button>
          <div class="chat-heading">
            <h3>{{ selectedConversation.title }}</h3>
            <span>
              {{
                selectedConversation.status === "ACTIVE" ? "Открыт" : "Закрыт"
              }}
              · сессия #{{
                Math.max(
                  selectedConversation.currentInteractionSessionCount,
                  1,
                )
              }}
            </span>
          </div>
          <div
            v-if="canManageTranslation"
            class="conversation-language-fact"
          >
            <span>Пользователь пишет на</span>
            <strong>{{
              (conversationLocale ?? "—").toUpperCase()
            }}</strong>
          </div>
          <div
            v-if="canManageTranslation"
            class="message-view-switch"
            role="group"
            aria-label="Режим отображения сообщений"
          >
            <button
              type="button"
              data-action="show-original-messages"
              :class="{ active: messageViewMode === 'ORIGINAL' }"
              :aria-pressed="messageViewMode === 'ORIGINAL'"
              @click="messageViewMode = 'ORIGINAL'"
            >
              Оригинал
            </button>
            <button
              type="button"
              data-action="show-translated-messages"
              :class="{ active: messageViewMode === 'TRANSLATED' }"
              :aria-pressed="messageViewMode === 'TRANSLATED'"
              :disabled="translation.loading.value"
              @click="showTranslatedMessages"
            >
              Перевод ·
              {{ workingLocaleLabel }}
            </button>
          </div>
          <template
            v-if="conversationAISuspensionEnabled && selectedSuspensionEntry"
          >
            <ConversationAISuspensionHeaderActions
              :entry="selectedSuspensionEntry"
              :can-manage="canManageSuspension"
              :conversation-open="selectedConversation.status === 'ACTIVE'"
              hide-active-status
              :show-history="false"
              @start="openSuspension('START')"
              @history="suspensionHistoryVisible = true"
              @retry="
                props.endUserId &&
                suspensionStore.loadDetail(
                  props.endUserId,
                  selectedConversation.id,
                )
              "
            />
            <ConversationAISuspensionBanner
              :entry="selectedSuspensionEntry"
              :can-manage="canManageSuspension"
              :conversation-open="selectedConversation.status === 'ACTIVE'"
              compact
              :show-history="false"
              @extend="openSuspension('EXTEND')"
              @resume="openSuspension('RESUME')"
              @history="suspensionHistoryVisible = true"
            />
          </template>
          <div class="conversation-menu-anchor">
            <button
              type="button"
              class="conversation-more"
              aria-label="Другие действия с диалогом"
              aria-haspopup="menu"
              :aria-expanded="conversationMenuVisible"
              @click="toggleConversationMenu"
            >
              <i class="pi pi-ellipsis-h" aria-hidden="true" />
            </button>
            <div
              v-if="conversationMenuVisible"
              class="conversation-settings-menu"
              role="menu"
            >
              <span class="menu-section-label">Язык</span>
              <ConversationTranslationBanner
                v-if="canManageTranslation"
                :state="translation.state.value"
                :loading="translation.loading.value"
                :saving="translation.savingPreference.value"
                :can-manage="canManageTranslation"
                :eligible-count="visibleTranslationMessageIds.length"
                @reload="ensureTranslationLoaded"
                @update-enabled="setTranslationEnabled"
                @update-target-locale="
                  translation.updatePreference({
                    endUserLocaleOverride: $event,
                  })
                "
                @translate-visible="
                  translation.translateMessages(visibleTranslationMessageIds)
                "
              />
              <button
                type="button"
                role="menuitem"
                @click="
                  messageViewMode =
                    messageViewMode === 'ORIGINAL'
                      ? 'TRANSLATED'
                      : 'ORIGINAL'
                "
              >
                <i class="pi pi-eye" aria-hidden="true" />
                {{
                  messageViewMode === "ORIGINAL"
                    ? "Показывать переводы"
                    : "Показывать оригиналы"
                }}
              </button>
              <span class="menu-section-label">Диалог</span>
              <button
                type="button"
                role="menuitem"
                @click="suspensionHistoryVisible = true"
              >
                <i class="pi pi-history" aria-hidden="true" />
                История режима AI и пауз
              </button>
              <button type="button" role="menuitem" @click="copyConversationId">
                <i class="pi pi-copy" aria-hidden="true" />
                Скопировать ID диалога
              </button>
              <button type="button" role="menuitem" @click="exportConversation">
                <i class="pi pi-download" aria-hidden="true" />
                Выгрузить переписку
              </button>
            </div>
          </div>
        </div>
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
          <section
            v-if="bulkTranslationActive"
            class="bulk-translation-progress"
            role="status"
            aria-live="polite"
          >
            <div>
              <i class="pi pi-spin pi-spinner" aria-hidden="true" />
              <span>
                Переводим {{ bulkTranslationIds.length }} сообщений на
                {{
                  (
                    translation.state.value?.preference.workingLocale ?? "ru"
                  ).toUpperCase()
                }}…
                {{ bulkTranslationCompleted }} из
                {{ bulkTranslationIds.length }}
              </span>
              <button
                type="button"
                class="bulk-translation-progress__cancel"
                @click="translation.cancelMessageTranslations"
              >
                Отменить
              </button>
            </div>
            <span class="bulk-translation-progress__track" aria-hidden="true">
              <i :style="{ width: `${bulkTranslationProgress}%` }" />
            </span>
          </section>
          <div
            v-if="messagesLoading"
            class="message-skeletons message-skeletons--bottom message-skeletons--message-sized message-skeletons--full-width"
          >
            <span v-for="item in 20" :key="item" />
          </div>
          <div v-else-if="!messages.length" class="message-empty">
            <strong>Пока нет сообщений</strong>
            <span>
              Напишите первым. Язык пользователя определится по первому
              сообщению.
            </span>
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
            <div class="message-bubble__meta">
              <strong>{{ authorLabel(message.author) }}</strong
              ><time :datetime="message.createdAt">{{
                formatDate(message.createdAt)
              }}</time>
            </div>
            <div class="message-bubble__surface">
              <div
                v-if="message.status === 'WRITING' && !message.text"
                class="typing-indicator"
                aria-label="Пользователь печатает"
              >
                <i /><i /><i /><span>пользователь печатает</span>
              </div>
              <TranslatedMessageBody
                v-else
                :message="message"
                :requested="
                  translation.messageTranslations.value.get(message.id)
                "
                :view-mode="messageViewMode"
              />
              <small v-if="message.status === 'FAILED'"
                ><i class="pi pi-exclamation-circle" /> Не доставлено</small
              >
              <small v-else-if="message.status === 'WRITING' && message.text"
                ><i class="pi pi-spin pi-spinner" /> Обновляется…</small
              >
              <small v-else-if="message.status === 'CANCELLED'"
                ><i class="pi pi-ban" /> Ответ остановлен оператором</small
              >
            </div>
          </article>
        </div>
        <div v-else class="empty-state chat-empty">
          <i class="pi pi-comment" /><strong>Выберите диалог</strong>
          <span>История и live-сообщения появятся здесь.</span>
          <Button
            data-action="open-profile"
            icon="pi pi-user"
            label="К профилю"
            severity="secondary"
            text
            size="small"
            @click="openProfile"
          />
        </div>
        <button
          v-if="newMessageCount"
          class="new-message-pill"
          @click="scrollToLatest()"
        >
          {{ newMessageCount }} новых сообщений <i class="pi pi-arrow-down" />
        </button>
        <form
          v-if="selectedConversation && canReply"
          class="composer"
          :class="{
            'composer--translated': translation.readyDraft.value,
            'composer--loading': messagesLoading,
          }"
          @submit.prevent="sendReply"
        >
          <div class="composer-source">
            <div class="composer-label">
              <span>
                Ваш текст · {{ workingLocaleLabel }}
              </span>
              <span v-if="!onlineSession" class="composer-label__offline">
                <i class="pi pi-wifi" aria-hidden="true" /> Пользователь офлайн
              </span>
            </div>
            <Textarea
              v-model="replyText"
              rows="2"
              maxlength="10000"
              placeholder="Ответить от имени оператора"
              aria-label="Ответ пользователю"
              :disabled="
                messagesLoading ||
                !onlineSession ||
                selectedConversation.status !== 'ACTIVE' ||
                sendingReply ||
                replyTranslationInFlight
              "
              @keydown.enter.exact="handleComposerEnter"
            />
          </div>
          <ReplyTranslationPreview
            v-if="
              canManageTranslation &&
              replyTranslationRequested &&
              translation.state.value
            "
            :draft="translation.draft.value"
            :target-locale="translation.targetLocale.value"
            :busy="
              translation.previewing.value ||
              translation.editingReply.value ||
              translation.savingPreference.value ||
              sendingReply
            "
            :stale="translation.previewStale.value"
            :disabled="
              messagesLoading ||
              !replyText.trim() ||
              !onlineSession ||
              selectedConversation.status !== 'ACTIVE' ||
              translation.savingPreference.value ||
              !translation.state.value?.availability.available ||
              translation.state.value?.budget.hardExhausted
            "
            :show-provider-details="canReadTranslationDetails"
            @preview="prepareReplyTranslation"
            @reconcile="translation.reconcileReplyPreview"
            @retry="translation.retryReplyPreview"
            @save-edit="translation.editReplyTranslation"
            @send="sendTranslatedReply"
          />
          <div
            v-else-if="canManageTranslation && replyText.trim()"
            class="composer-assist"
          >
            <div>
              <span>Нужна языковая обработка?</span>
              <strong>
                {{
                  translation.targetLocale.value
                    ? `Перевод на ${translation.targetLocale.value.toUpperCase()}`
                    : "Язык можно выбрать в меню ⋯"
                }}
              </strong>
            </div>
            <Button
              type="button"
              :label="
                translation.targetLocale.value
                  ? `Перевести на ${translation.targetLocale.value.toUpperCase()}`
                  : 'Перевести ответ'
              "
              icon="pi pi-sparkles"
              size="small"
              :loading="translation.loading.value || translation.previewing.value"
              :disabled="
                messagesLoading ||
                !onlineSession ||
                selectedConversation.status !== 'ACTIVE'
              "
              @click="prepareReplyTranslation"
            />
          </div>
          <div class="composer-footer">
            <span>
              {{
                replyTranslationRequested
                  ? `Шаг ${translation.readyDraft.value ? "2 из 2: перевод готов и проверен" : "1 из 2: сначала перевод, затем отправка"}`
                  : "Enter — отправить · Shift+Enter — перенос строки"
              }}
            </span>
            <div>
              <div
                v-if="canReply"
                class="composer-action-menu"
              >
                <button
                  v-if="composerActionsVisible"
                  type="button"
                  class="action-menu-backdrop"
                  aria-label="Закрыть меню действий"
                  @click="composerActionsVisible = false"
                />
                <Button
                  type="button"
                  label="Действие"
                  icon="pi pi-plus"
                  severity="secondary"
                  outlined
                  aria-haspopup="menu"
                  :aria-expanded="composerActionsVisible"
                  :disabled="
                    messagesLoading ||
                    !onlineSession ||
                    sendingReply ||
                    replyTranslationInFlight
                  "
                  @click="composerActionsVisible = !composerActionsVisible"
                />
                <div
                  v-if="composerActionsVisible"
                  class="composer-action-menu__panel"
                  role="menu"
                >
                  <span class="mobile-sheet-handle" aria-hidden="true" />
                  <strong class="mobile-sheet-title"
                    >Действия в диалоге</strong
                  >
                  <span class="menu-section-label">Сейчас</span>
                  <button
                    type="button"
                    role="menuitem"
                    @click="showUnavailableAttachment"
                  >
                    <i class="pi pi-file" aria-hidden="true" />
                    <span>
                      <strong>Файл или скриншот</strong>
                      <small>Live API пока принимает только текст</small>
                    </span>
                  </button>
                  <span class="menu-section-label">Интеграции</span>
                  <button
                    type="button"
                    role="menuitem"
                    class="highlighted"
                    @click="openTicketDrawer"
                  >
                    <i class="pi pi-plus-square" aria-hidden="true" />
                    <span>
                      <strong>Создать тикет</strong>
                      <small>Форма откроется справа от диалога</small>
                    </span>
                  </button>
                  <button
                    v-if="
                      canReplyWithoutTranslation &&
                      replyTranslationRequested
                    "
                    type="button"
                    role="menuitem"
                    :disabled="!replyText.trim()"
                    @click="setSendWithoutTranslationVisible(true)"
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
                type="button"
                label="Шаблоны"
                severity="secondary"
                outlined
                :disabled="
                  messagesLoading ||
                  !onlineSession ||
                  sendingReply ||
                  replyTranslationInFlight
                "
                @click="replyTemplateGalleryVisible = true"
              />
              <Button
                type="button"
                label="Улучшить с AI"
                icon="pi pi-sparkles"
                severity="secondary"
                text
                class="composer-ai-action"
                title="Скоро — функция пока недоступна"
                disabled
              />
              <Button
                v-if="canReply && !replyTranslationRequested"
                type="submit"
                label="Отправить"
                icon="pi pi-send"
                class="composer-primary-action"
                :loading="sendingReply"
                :disabled="
                  messagesLoading ||
                  !replyText.trim() ||
                  !onlineSession ||
                  selectedConversation.status !== 'ACTIVE'
                "
              />
            </div>
          </div>
        </form>
        <ConversationTicketDrawer
          v-if="selectedConversation"
          :visible="ticketDrawerVisible"
          :external-user-id="detail?.externalUserId || endUserId || '—'"
          :conversation-title="selectedConversation.title"
          :message-count="messages.length"
          @close="ticketDrawerVisible = false"
        />
        <div
          v-if="replyTemplateGalleryVisible"
          class="template-gallery-backdrop"
          @click.self="replyTemplateGalleryVisible = false"
        >
          <section
            class="template-gallery"
            data-testid="reply-template-gallery"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reply-template-gallery-title"
          >
            <header>
              <div>
                <span>Быстрые ответы</span>
                <h3 id="reply-template-gallery-title">Галерея шаблонов</h3>
              </div>
              <button
                type="button"
                aria-label="Закрыть галерею шаблонов"
                @click="replyTemplateGalleryVisible = false"
              >
                <i class="pi pi-times" aria-hidden="true" />
              </button>
            </header>
            <div class="template-gallery__grid">
              <button
                v-for="(template, index) in replyTemplates"
                :key="template"
                type="button"
                @click="applyReplyTemplate(template)"
              >
                <span>Шаблон {{ index + 1 }}</span>
                <strong>{{ template }}</strong>
                <small>Выбрать и продолжить редактирование</small>
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>

    <AIReviewDialog
      v-if="aiReviewVisible && endUserId"
      v-model:visible="aiReviewVisible"
      :project-id="projectId"
      :end-user-id="endUserId"
      :timezone="projectTimezone"
    />

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
            v-if="canReply"
            label="Создать и отправить"
            icon="pi pi-send"
            :loading="creatingConversation"
            :disabled="!newChatText.trim() || !onlineSession"
            @click="createConversation"
          />
        </div>
      </div>
    </Dialog>

    <Dialog
      v-model:visible="sendWithoutTranslationVisible"
      @update:visible="setSendWithoutTranslationVisible"
      modal
      header="Отправить без перевода?"
      :style="{ width: 'min(500px, 94vw)' }"
    >
      <div class="send-without-translation">
        <Message severity="warn" :closable="false">
          Пользователь получит исходный русский текст вместо
          {{
            translation.targetLocale.value
              ? `перевода на ${localeDisplayName(translation.targetLocale.value)}`
              : "перевода"
          }}.
        </Message>
        <div class="field">
          <label for="send-without-translation-reason"
            >Причина исключения</label
          >
          <Textarea
            id="send-without-translation-reason"
            v-model="sendWithoutTranslationReason"
            rows="3"
            maxlength="500"
            placeholder="Почему сообщение нужно отправить без перевода?"
          />
          <small>{{ sendWithoutTranslationReason.length }}/500</small>
        </div>
        <div class="send-without-translation__actions">
          <Button
            label="Отмена"
            severity="secondary"
            text
            @click="setSendWithoutTranslationVisible(false)"
          />
          <Button
            label="Отправить исходный текст"
            icon="pi pi-send"
            severity="danger"
            :loading="sendingReply"
            :disabled="!sendWithoutTranslationReason.trim()"
            @click="sendReplyWithoutTranslation"
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
    :conversation-label="`${selectedConversation.title} · ${selectedConversation.id}`"
    :current="selectedSuspensionEntry.detail ?? null"
    :server-offset-ms="selectedSuspensionEntry.serverOffsetMs"
    :busy="Boolean(selectedSuspensionEntry.mutating)"
    :error="selectedSuspensionEntry.error"
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
  width: 100%;
  min-width: 0;
}
.workspace-identity {
  min-width: 0;
  flex: 1;
}
.workspace-back {
  flex: 0 0 auto;
}
.workspace-statuses {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}
.connection-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font-size: 0.67rem;
  font-weight: 700;
  white-space: nowrap;
}
.connection-live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
.connection-status[data-state="connected"] {
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.connection-status[data-state="connected"] .connection-live-dot {
  box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 35%, transparent);
  animation: live-pulse 2.2s ease-out infinite;
}
.connection-status[data-state="error"],
.connection-status[data-state="disconnected"] {
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.workspace-title h2,
.pane-header h3,
.chat-header h3 {
  margin: 2px 0 0;
  font-family: var(--font-display);
  letter-spacing: -0.025em;
}
.workspace-title h2 {
  font-size: 1.05rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
.profile-overview {
  height: min(760px, calc(100dvh - 170px));
  padding: 28px;
  overflow-y: auto;
  background: var(--surface-ground);
  animation: profile-enter 0.22s ease-out;
}
.profile-hero,
.profile-identity,
.profile-card-header {
  display: flex;
  align-items: center;
}
.profile-hero,
.profile-card-header {
  justify-content: space-between;
  gap: 18px;
}
.profile-hero {
  max-width: 1220px;
  padding: 4px 4px 24px;
  margin: 0 auto;
}
.profile-identity {
  min-width: 0;
  gap: 15px;
}
.profile-avatar {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  flex: 0 0 auto;
  border-radius: 18px;
  background: var(--surface-emphasis);
  color: var(--text-on-emphasis);
  font-size: 1.25rem;
  font-weight: 800;
}
.profile-identity h2 {
  margin: 3px 0;
  font: 750 clamp(1.25rem, 2vw, 1.7rem) var(--font-display);
  letter-spacing: -0.03em;
}
.profile-identity p {
  margin: 0;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 0.72rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.profile-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(340px, 390px);
  align-items: start;
  gap: 20px;
  max-width: 1220px;
  margin: 0 auto;
}
.profile-main,
.profile-actions {
  display: grid;
  align-content: start;
  gap: 18px;
  min-width: 0;
}
.profile-card {
  min-width: 0;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--surface-card);
  box-shadow: var(--shadow-card);
}
.profile-card-header {
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--line);
}
.profile-card-header h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0 0;
  font: 700 1rem var(--font-display);
}
.profile-card-header h3 i {
  color: var(--text-brand);
}
.profile-card-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.profile-facts,
.profile-loading {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 11px;
  margin: 0;
}
.profile-facts > div {
  min-width: 0;
  padding: 13px 14px;
  border-radius: 13px;
  background: var(--surface-subtle);
}
.profile-facts dt {
  color: var(--text-secondary);
  font-size: 0.62rem;
}
.profile-facts dd {
  margin: 6px 0 0;
  overflow-wrap: anywhere;
  font-size: 0.78rem;
  font-weight: 700;
}
.profile-empty {
  padding: 28px;
  color: var(--text-secondary);
  text-align: center;
  font-size: 0.72rem;
}
.profile-empty-card {
  display: flex;
  align-items: center;
  gap: 13px;
  color: var(--text-secondary);
}
.profile-empty-card i {
  font-size: 1.1rem;
}
.profile-empty-card div {
  display: grid;
  gap: 3px;
}
.profile-empty-card strong {
  color: var(--text-primary);
  font-size: 0.76rem;
}
.profile-empty-card span {
  font-size: 0.66rem;
}
.action-card .ai-review-entry {
  margin-top: 0;
}
.workspace-grid {
  display: grid;
  grid-template-columns: minmax(260px, 310px) minmax(420px, 1fr);
  height: min(760px, calc(100dvh - 170px));
  background: var(--surface-ground);
  animation: chat-enter 0.22s ease-out;
}
:global(.user-workspace-dialog.p-dialog-maximized .p-dialog-content) {
  flex: 1;
  min-height: 0;
}
:global(.user-workspace-dialog.p-dialog-maximized .workspace-grid),
:global(.user-workspace-dialog.p-dialog-maximized .profile-overview) {
  height: 100%;
  min-height: 0;
}
.conversation-pane,
.chat-pane {
  min-width: 0;
  min-height: 0;
  background: var(--surface-card);
}
.conversation-pane {
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow: hidden;
  background: color-mix(
    in srgb,
    var(--surface-subtle) 46%,
    var(--surface-card)
  );
}
.conversation-pane {
  border-right: 1px solid var(--line);
}
.chat-pane {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 14px 18px 14px;
  overflow: hidden;
}
.pane-header,
.chat-header {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.pane-header h3,
.chat-header h3 {
  font-size: 1rem;
}
.chat-header-status {
  gap: 7px;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.chat-heading {
  min-width: 0;
}
.chat-heading h3 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conversation-state-rail {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  margin-bottom: 8px;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: color-mix(
    in srgb,
    var(--surface-subtle) 72%,
    var(--surface-card)
  );
}
.conversation-open-state,
.conversation-language-fact {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  min-height: 30px;
  border-radius: 9px;
  white-space: nowrap;
}
.conversation-open-state {
  gap: 7px;
  padding: 0 9px;
  background: var(--surface-card);
  color: var(--text-secondary);
  font-size: 0.64rem;
  font-weight: 700;
  box-shadow: inset 0 0 0 1px var(--line);
}
.conversation-open-state i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-secondary);
}
.conversation-open-state[data-open="true"] {
  color: var(--status-success-text);
}
.conversation-open-state[data-open="true"] i {
  background: currentColor;
  box-shadow: 0 0 0 4px var(--status-success-soft);
}
.conversation-language-fact {
  gap: 5px;
  padding: 0 3px;
  color: var(--text-secondary);
  font-size: 0.61rem;
}
.conversation-language-fact strong {
  color: var(--text-primary);
  font-size: 0.67rem;
}
.message-view-switch {
  display: inline-flex;
  align-self: center;
  flex: 0 0 auto;
  gap: 3px;
  margin: 0;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-subtle);
}
.message-view-switch button {
  min-height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.66rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease;
}
.message-view-switch button:hover {
  color: var(--text-primary);
}
.message-view-switch button.active {
  background: var(--surface-card);
  color: var(--text-primary);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--text-primary) 8%, transparent);
}
.message-view-switch button:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.compact-message {
  margin-bottom: 10px;
  font-size: 0.72rem;
}
.conversation-search {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  margin-bottom: 10px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    background 0.16s ease;
}
.conversation-search:focus-within {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
  background: var(--surface-card);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 11%, transparent);
}
.conversation-search > i {
  font-size: 0.72rem;
}
.conversation-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.7rem;
  font-weight: 600;
}
.conversation-search input::placeholder {
  color: var(--text-secondary);
  font-weight: 500;
}
.conversation-search button {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.conversation-search button:hover {
  background: var(--surface-subtle);
  color: var(--text-primary);
}
.conversation-search-empty {
  padding: 28px 12px;
  color: var(--text-secondary);
  text-align: center;
  font-size: 0.7rem;
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
  border: 1px solid var(--line);
  border-radius: 13px;
  background: var(--surface-card);
  color: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--text-primary) 3%, transparent);
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease;
}
.conversation-list button:hover {
  border-color: color-mix(in srgb, var(--accent) 25%, var(--line));
  background: var(--surface-card);
  box-shadow: 0 8px 20px color-mix(in srgb, var(--text-primary) 7%, transparent);
  transform: translateY(-1px);
}
.conversation-list button.selected {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--line));
  border-left-width: 3px;
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
.conversation-list :deep(.p-tag) {
  align-self: flex-start;
  padding: 0.2rem 0.42rem;
  font-size: 0.56rem;
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
  padding: 12px 10px 18px;
  border-radius: 15px;
  background:
    radial-gradient(
      circle at 100% 0,
      color-mix(in srgb, var(--status-violet-soft) 22%, transparent),
      transparent 34%
    ),
    color-mix(in srgb, var(--surface-subtle) 34%, var(--surface-card));
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
  width: 100%;
}
.message-bubble {
  align-self: flex-start;
  max-width: min(76%, 680px);
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 15px 15px 15px 4px;
  background: var(--surface-card);
  box-shadow: 0 4px 14px color-mix(in srgb, var(--text-primary) 4%, transparent);
}
.message-bubble.live-enter {
  animation: message-enter 0.2s ease-out;
}
.message-bubble.admin,
.message-bubble.assistant,
.message-bubble.scenario {
  align-self: flex-end;
  border-radius: 15px 15px 4px 15px;
  background: color-mix(
    in srgb,
    var(--status-violet-soft) 78%,
    var(--surface-card)
  );
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
.message-bubble__meta {
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
  display: grid;
  gap: 9px;
  margin-top: 8px;
  padding: 11px;
  border: 1px solid var(--line);
  border-radius: 15px;
  background: color-mix(
    in srgb,
    var(--surface-subtle) 56%,
    var(--surface-card)
  );
  box-shadow: 0 -8px 28px
    color-mix(in srgb, var(--text-primary) 3%, transparent);
}
.composer-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 0.59rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.composer-label__offline {
  color: var(--status-warning-text);
  letter-spacing: normal;
  text-transform: none;
}
.composer textarea {
  width: 100%;
}
.composer :deep(textarea) {
  min-height: 62px;
  border-color: var(--line);
  border-radius: 12px;
  background: var(--surface-card);
  line-height: 1.5;
  resize: none;
}
.composer-footer {
  justify-content: space-between;
  gap: 12px;
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
.composer-primary-action {
  min-width: 118px;
}
.composer-action-menu {
  position: relative;
}
.composer-action-menu__panel {
  position: absolute;
  z-index: 5;
  right: auto;
  bottom: calc(100% + 8px);
  left: 0;
  width: 250px;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: var(--surface-card);
  box-shadow: var(--shadow);
  transform-origin: bottom left;
  animation: action-menu-enter 0.14s ease-out;
}
.composer-action-menu__panel button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 48px;
  padding: 8px 10px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}
.composer-action-menu__panel button:hover {
  background: var(--surface-subtle);
}
.composer-action-menu__panel button > i {
  color: var(--status-violet-text);
}
.composer-action-menu__panel button > span {
  display: grid;
  gap: 2px;
}
.composer-action-menu__panel strong {
  font-size: 0.7rem;
}
.composer-action-menu__panel small {
  color: var(--text-secondary);
  font-size: 0.59rem;
}
.send-without-translation {
  display: grid;
  gap: 16px;
}
.send-without-translation .field {
  display: grid;
  gap: 6px;
}
.send-without-translation .field label {
  font-size: 0.72rem;
  font-weight: 700;
}
.send-without-translation .field small {
  color: var(--text-secondary);
  font-size: 0.62rem;
  text-align: right;
}
.send-without-translation__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
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
.ai-review-entry {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 9px 10px;
  align-items: center;
  margin-top: 14px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--line));
  border-radius: 14px;
  background: linear-gradient(
    145deg,
    var(--brand-soft),
    var(--surface-card) 72%
  );
}
.ai-review-entry-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 11px;
  background: var(--surface-card);
  color: var(--accent);
  box-shadow: 0 5px 18px color-mix(in srgb, var(--accent) 14%, transparent);
}
.ai-review-entry > div {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.ai-review-entry strong {
  font-size: 0.76rem;
}
.ai-review-entry > div span {
  color: var(--text-secondary);
  font-size: 0.64rem;
  line-height: 1.35;
}
.ai-review-entry :deep(.p-button) {
  grid-column: 1 / -1;
  justify-content: center;
  width: 100%;
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
.mobile-conversation-profile,
.mobile-chat-back {
  display: none;
}
:global(.user-workspace-dialog.p-dialog) {
  overflow: hidden;
  border: 1px solid var(--border-default);
  border-radius: 20px;
  background: var(--surface-card);
  box-shadow: var(--shadow-dialog);
}
:global(body.p-overflow-hidden),
:global(body.workspace-scroll-locked) {
  overflow: hidden !important;
  overscroll-behavior: none;
}
:global(.user-workspace-dialog .p-dialog-header) {
  min-height: 64px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-card);
}
:global(.user-workspace-dialog .p-dialog-maximize-button),
:global(.user-workspace-dialog .p-dialog-close-button) {
  width: 36px;
  height: 36px;
  margin-left: 8px;
  border: 1px solid var(--border-default) !important;
  border-radius: 9px !important;
  background: var(--surface-card) !important;
  color: var(--text-small-muted) !important;
  box-shadow: none !important;
}
:global(.user-workspace-dialog .p-dialog-maximize-button:hover),
:global(.user-workspace-dialog .p-dialog-close-button:hover) {
  background: var(--surface-hover) !important;
  color: var(--text-primary) !important;
}
:global(.user-workspace-dialog .p-dialog-content) {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: var(--surface-card);
}
.workspace-title {
  gap: 12px;
}
.workspace-title h2,
.workspace-grid h3 {
  font-family: var(--font-sans);
}
.workspace-back {
  min-height: 40px;
  padding: 0 14px 0 10px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-hover);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 700;
}
.workspace-divider {
  width: 1px;
  height: 26px;
  flex: 0 0 auto;
  background: var(--border-default);
}
.avatar {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: var(--text-primary);
  color: var(--text-inverse);
  font-size: 14px;
}
.workspace-identity h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
  letter-spacing: 0;
}
.workspace-identity > span {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 1px;
  overflow: hidden;
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.presence-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--text-tertiary);
}
.presence-dot.online {
  background: var(--status-success-text);
  box-shadow: 0 0 0 3px var(--status-success-soft);
}
.workspace-statuses {
  margin-left: auto;
}
.connection-status {
  min-height: 28px;
  padding: 4px 10px;
  color: var(--status-success-text);
  font-size: 12px;
}
.workspace-dialogs {
  min-height: 36px;
  border-color: var(--border-default);
  border-radius: 9px;
  background: var(--surface-card);
  color: var(--text-small-muted);
  font-size: 13px;
}
.workspace-grid {
  position: relative;
  min-height: 0;
  flex: 1;
  grid-template-columns: 272px minmax(0, 1fr);
  height: 100%;
  overflow: hidden;
  background: var(--surface-card);
}
.conversation-pane {
  padding: 0;
  border-right: 1px solid var(--border-subtle);
  background: var(--surface-subtle);
}
.pane-header {
  min-height: 53px;
  margin: 0;
  padding: 10px 14px 8px;
}
.pane-header h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 13px;
  letter-spacing: 0;
}
.pane-header :deep(.p-button) {
  min-height: 30px;
  padding: 0 10px;
  border-color: var(--border-default);
  border-radius: 8px;
  background: var(--surface-card);
  color: var(--action-primary);
  font-size: 12px;
}
.conversation-search {
  min-height: 34px;
  margin: 0 14px 10px;
  border-color: var(--border-default);
  border-radius: 9px;
  background: var(--surface-card);
}
.conversation-search input {
  font-size: 13px;
  font-weight: 500;
}
.conversation-list {
  gap: 2px;
  padding: 0 8px 10px;
  overscroll-behavior-y: contain;
}
.conversation-list button {
  gap: 5px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  box-shadow: none;
}
.conversation-list button:hover {
  border-color: transparent;
  background: var(--surface-hover);
  box-shadow: none;
  transform: none;
}
.conversation-list button.selected {
  border: 1px solid var(--palette-violet-200);
  border-left: 3px solid var(--action-primary);
  background: var(--surface-card);
}
.conversation-list strong {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
}
.conversation-list button.selected strong {
  color: var(--text-primary);
  font-weight: 700;
}
.conversation-list button > span:not(.conversation-row-title) {
  color: var(--text-tertiary);
  font-size: 12px;
}
.conversation-badge {
  flex: 0 0 auto;
  padding: 2px 5px;
  border-radius: 5px;
  background: var(--border-subtle);
  color: var(--text-secondary);
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-size: 11px;
  font-weight: 600;
}
.conversation-badge.accent {
  background: var(--status-violet-soft);
  color: var(--action-primary);
}
.conversation-badge.warning {
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
}
.chat-pane {
  padding: 0;
  background: var(--surface-card);
}
.conversation-state-rail {
  position: relative;
  z-index: 5;
  min-height: 53px;
  gap: 10px;
  margin: 0;
  padding: 9px 20px;
  border: 0;
  border-bottom: 1px solid var(--border-subtle);
  border-radius: 0;
  background: var(--surface-subtle);
}
.conversation-state-rail[data-online="false"] {
  background: var(--surface-hover);
}
.chat-heading {
  min-width: 120px;
  flex: 1 1 auto;
}
.chat-heading h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
  letter-spacing: 0;
}
.chat-heading span {
  display: block;
  margin-top: 1px;
  color: var(--text-tertiary);
  font-size: 12px;
}
.conversation-open-state {
  display: none;
}
.conversation-language-fact {
  min-height: 32px;
  gap: 7px;
  padding: 0 11px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--surface-card);
  color: var(--text-small-muted);
  font-size: 12px;
  font-weight: 600;
}
.conversation-language-fact strong {
  color: var(--text-primary);
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-size: 12px;
}
.message-view-switch {
  height: 34px;
  padding: 3px;
  border-color: var(--border-default);
  border-radius: 9px;
  background: var(--surface-hover);
}
.message-view-switch button {
  min-height: 26px;
  padding: 0 11px;
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}
.message-view-switch button.active {
  background: var(--action-primary);
  color: var(--on-action-primary);
  box-shadow: none;
}
.conversation-menu-anchor {
  position: relative;
  flex: 0 0 auto;
}
.conversation-more {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--surface-card);
  color: var(--text-small-muted);
  cursor: pointer;
}
.conversation-more:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}
.conversation-settings-menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 8px);
  right: 0;
  display: flex;
  width: 370px;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--surface-card);
  box-shadow: var(--shadow-menu);
}
.conversation-settings-menu > button {
  display: flex;
  min-height: 40px;
  align-items: center;
  gap: 10px;
  padding: 0 11px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--text-primary);
  font: 600 13px inherit;
  text-align: left;
  cursor: pointer;
}
.conversation-settings-menu > button:hover {
  background: var(--surface-hover);
}
.conversation-settings-menu > button i {
  width: 18px;
  color: var(--text-secondary);
}
.conversation-settings-menu :deep(.translation-banner) {
  display: grid;
  gap: 10px;
  margin: 0 0 4px;
  padding: 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--surface-subtle);
}
.conversation-settings-menu
  :deep(.translation-banner__main > .translation-banner__icon) {
  display: none;
}
.conversation-settings-menu :deep(.translation-banner__main span) {
  max-width: 300px;
}
.conversation-settings-menu :deep(.translation-banner__controls) {
  justify-content: space-between;
}
.menu-section-label {
  padding: 8px 11px 4px;
  color: var(--text-tertiary);
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.message-history {
  gap: 14px;
  padding: 16px 24px;
  border-radius: 0;
  background: var(--surface-card);
  overscroll-behavior-y: contain;
  scrollbar-gutter: stable;
}
.message-bubble {
  display: flex;
  max-width: 62%;
  flex-direction: column;
  gap: 5px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.message-bubble:first-of-type {
  margin-top: auto;
}
.message-bubble.admin,
.message-bubble.assistant,
.message-bubble.scenario {
  align-self: flex-end;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.message-bubble.system {
  max-width: 90%;
}
.message-bubble__meta {
  justify-content: flex-start;
  gap: 8px;
  padding-left: 2px;
}
.message-bubble.admin .message-bubble__meta,
.message-bubble.assistant .message-bubble__meta,
.message-bubble.scenario .message-bubble__meta {
  flex-direction: row-reverse;
  padding-right: 2px;
  padding-left: 0;
}
.message-bubble strong {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
}
.message-bubble.assistant strong {
  color: var(--status-violet-text);
}
.message-bubble.admin strong {
  color: var(--status-success-text);
}
.message-bubble.scenario strong {
  color: var(--status-warning-text);
}
.message-bubble time,
.message-bubble small {
  color: var(--text-tertiary);
  font-size: 11px;
}
.message-bubble__surface {
  position: relative;
  padding: 12px 15px;
  border: 1px solid var(--border-subtle);
  border-radius: 4px 14px 14px;
  background: var(--surface-subtle);
  color: var(--text-primary);
}
.message-bubble.assistant .message-bubble__surface {
  border-color: var(--palette-violet-200);
  border-radius: 14px 4px 14px 14px;
  background: var(--status-violet-soft);
}
.message-bubble.admin .message-bubble__surface {
  border-color: var(--palette-green-200);
  border-radius: 14px 4px 14px 14px;
  background: var(--status-success-soft);
}
.message-bubble.scenario .message-bubble__surface {
  border-color: var(--palette-amber-200);
  border-radius: 14px 4px 14px 14px;
  background: var(--status-warning-soft);
}
.message-bubble.system .message-bubble__surface {
  padding: 8px 12px;
  border-style: dashed;
  border-radius: 999px;
  background: var(--surface-card);
}
.message-bubble :deep(.translated-message > p) {
  margin: 0;
  font-size: 15px;
  line-height: 1.5;
}
.message-bubble__surface > small {
  display: block;
  margin-top: 7px;
}
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--text-tertiary);
  font-size: 12px;
}
.typing-indicator > i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--border-strong);
  animation: typing-pulse 1.2s infinite;
}
.typing-indicator > i:nth-child(2) {
  animation-delay: 150ms;
}
.typing-indicator > i:nth-child(3) {
  animation-delay: 300ms;
}
.bulk-translation-progress {
  position: sticky;
  z-index: 3;
  top: 0;
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--palette-violet-200);
  border-radius: 11px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
}
.bulk-translation-progress > div {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
  font-weight: 600;
}
.bulk-translation-progress__cancel {
  margin-left: auto;
  padding: 3px 5px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.bulk-translation-progress__cancel:hover {
  text-decoration: underline;
}
.bulk-translation-progress__track {
  height: 4px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--palette-violet-100);
}
.bulk-translation-progress__track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--action-primary);
  transition: width 180ms ease;
}
.message-skeletons {
  display: flex;
  flex: 1;
  flex-direction: column-reverse;
  gap: 14px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  scrollbar-width: none;
}
.message-skeletons::-webkit-scrollbar {
  display: none;
}
.message-skeletons > span {
  flex: 0 0 52px;
  width: 58%;
  border-radius: 4px 14px 14px;
  background: linear-gradient(90deg, var(--surface-active) 25%, var(--surface-hover) 37%, var(--surface-active) 63%);
  background-size: 360px 100%;
  animation: skeleton-shimmer 1.3s infinite;
}
.message-skeletons > span:nth-child(3n + 2) {
  flex-basis: 74px;
  width: 66%;
  align-self: flex-end;
  border-radius: 14px 4px 14px 14px;
  animation-delay: 150ms;
}
.message-skeletons > span:nth-child(3n + 3) {
  width: 44%;
  animation-delay: 300ms;
}
.message-empty {
  display: flex;
  min-height: 180px;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed var(--border-default);
  border-radius: 12px;
  background: var(--surface-subtle);
  text-align: center;
}
.message-empty strong {
  color: var(--text-primary);
  font-size: 14px;
}
.message-empty span {
  max-width: 300px;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.45;
}
.composer {
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin: 0 20px 14px;
  padding: 10px 12px 9px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--surface-subtle);
  box-shadow: none;
}
.composer--translated {
  position: relative;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}
.composer-source {
  display: grid;
  min-width: 0;
  gap: 7px;
}
.composer--translated .composer-source {
  padding-right: 14px;
  padding-bottom: 46px;
  border-right: 1px solid var(--border-subtle);
}
.composer-label {
  min-height: 18px;
}
.composer-label > span:first-child {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 7px;
  border-radius: 5px;
  background: var(--border-subtle);
  color: var(--text-secondary);
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-size: 10px;
  letter-spacing: 0;
}
.composer :deep(textarea) {
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
.composer :deep(textarea:focus) {
  box-shadow: none;
}
.composer-assist {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 9px 7px 11px;
  border: 1px solid var(--palette-violet-200);
  border-radius: 10px;
  background: var(--status-violet-soft);
}
.composer-assist > div {
  display: grid;
  gap: 1px;
  min-width: 0;
}
.composer-assist span {
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.composer-assist strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.composer-assist :deep(.p-button) {
  min-height: 34px;
  flex: 0 0 auto;
  border-radius: 9px;
  font-size: 12px;
}
.composer-footer {
  grid-column: 1 / -1;
  min-height: 38px;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
}
.composer-footer > span {
  max-width: 610px;
  color: var(--text-tertiary);
  font-size: 11px;
}
.composer-footer > div {
  gap: 8px;
}
.composer--translated .composer-footer {
  position: absolute;
  bottom: 10px;
  left: 14px;
  width: calc(50% - 21px);
  min-height: 42px;
}
.composer--translated .composer-footer > span {
  display: none;
}
.composer--translated .composer-footer > div {
  width: 100%;
  justify-content: flex-start;
}
.composer-footer :deep(.p-button) {
  min-height: 36px;
  border-radius: 10px;
  font-size: 12px;
}
.composer-primary-action {
  min-width: 132px;
}
.composer-ai-action {
  opacity: 0.58;
}
.composer--loading {
  position: relative;
  min-height: 96px;
}
.composer--loading > * {
  visibility: hidden;
}
.composer--loading::after {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--text-tertiary);
  content: "композер заблокирован до загрузки";
  font-size: 12px;
}
.composer-action-menu__panel {
  right: auto;
  bottom: calc(100% + 8px);
  left: 0;
  width: 290px;
  padding: 8px;
  border-color: var(--border-default);
  border-radius: 14px;
  background: var(--surface-card);
}
.composer-action-menu__panel button {
  min-height: 52px;
  border-radius: 10px;
}
.composer-action-menu__panel button.highlighted {
  border: 1px solid var(--palette-violet-200);
  background: var(--status-violet-soft);
}
.composer-action-menu__panel button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.composer-action-menu__panel strong {
  color: var(--text-primary);
  font-size: 13px;
}
.composer-action-menu__panel small {
  color: var(--text-secondary);
  font-size: 11px;
}
.action-menu-backdrop {
  display: none;
}
.mobile-sheet-handle,
.mobile-sheet-title {
  display: none;
}
.template-gallery-backdrop {
  position: absolute;
  z-index: 35;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--overlay-backdrop);
}
.template-gallery {
  width: min(680px, 100%);
  max-height: min(620px, calc(100dvh - 80px));
  overflow-y: auto;
  padding: 18px;
  border: 1px solid var(--border-default);
  border-radius: 18px;
  background: var(--surface-card);
  box-shadow: var(--shadow-dialog);
}
.template-gallery > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.template-gallery > header span {
  color: var(--text-tertiary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.template-gallery > header h3 {
  margin: 3px 0 0;
  color: var(--text-primary);
  font-size: 18px;
}
.template-gallery > header button {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid var(--border-default);
  border-radius: 9px;
  background: var(--surface-card);
  color: var(--text-secondary);
  cursor: pointer;
}
.template-gallery__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.template-gallery__grid > button {
  display: grid;
  min-height: 126px;
  align-content: start;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 13px;
  background: var(--surface-subtle);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    transform 0.16s ease;
}
.template-gallery__grid > button:hover {
  border-color: var(--palette-violet-200);
  background: var(--status-violet-soft);
  transform: translateY(-1px);
}
.template-gallery__grid span,
.template-gallery__grid small {
  color: var(--text-tertiary);
  font-size: 11px;
}
.template-gallery__grid span {
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-weight: 700;
}
.template-gallery__grid strong {
  font-size: 13px;
  line-height: 1.45;
}
@keyframes skeleton-shimmer {
  from {
    background-position: -360px 0;
  }
  to {
    background-position: 360px 0;
  }
}
@keyframes typing-pulse {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 1;
  }
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
@keyframes profile-enter {
  from {
    opacity: 0;
    transform: translateX(-18px);
  }
}
@keyframes chat-enter {
  from {
    opacity: 0;
    transform: translateX(18px);
  }
}
@keyframes live-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 35%, transparent);
  }
  70%,
  100% {
    box-shadow: 0 0 0 7px transparent;
  }
}
@keyframes action-menu-enter {
  from {
    opacity: 0;
    transform: translateY(5px) scale(0.98);
  }
}
@media (prefers-reduced-motion: reduce) {
  .message-bubble {
    animation: none;
  }
  .conversation-list button {
    transition: none;
  }
  .message-view-switch button {
    transition: none;
  }
  .connection-status[data-state="connected"] .connection-live-dot {
    animation: none;
  }
  .profile-overview,
  .workspace-grid {
    animation: none;
  }
  .composer-action-menu__panel {
    animation: none;
  }
}
@media (max-width: 1150px) {
  .conversation-language-fact {
    display: none;
  }
  .conversation-state-rail {
    gap: 6px;
  }
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
  :global(.user-workspace-dialog--chat .p-dialog-header) {
    display: none;
  }
  .profile-overview {
    height: calc(100dvh - 82px);
    padding: 18px 14px 28px;
  }
  .profile-hero {
    align-items: flex-start;
    flex-direction: column;
  }
  .profile-hero :deep(.p-button) {
    width: 100%;
  }
  .profile-layout {
    grid-template-columns: 1fr;
  }
  .profile-actions {
    grid-row: auto;
  }
  .profile-facts,
  .profile-loading {
    grid-template-columns: 1fr;
  }
  .workspace-grid {
    display: block;
    height: 100dvh;
  }
  .conversation-pane,
  .chat-pane {
    display: none;
    width: 100%;
    height: 100%;
    border: 0;
  }
  .workspace-grid[data-mobile-pane="LIST"] .conversation-pane,
  .workspace-grid[data-mobile-pane="CHAT"] .chat-pane {
    display: flex;
  }
  .conversation-state-rail {
    flex-wrap: wrap;
    min-height: auto;
  }
  .conversation-state-rail .message-view-switch {
    order: 1;
  }
  .conversation-state-rail :deep(.translation-banner) {
    order: 2;
  }
  .workspace-grid[data-mobile-pane="CHAT"] .chat-pane {
    display: flex;
    flex-direction: column;
    padding: 0;
  }
  .mobile-conversation-profile {
    display: flex;
    min-height: 64px;
    align-items: center;
    gap: 10px;
    padding: 12px 14px 8px;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--surface-card);
  }
  .mobile-conversation-profile > div {
    display: grid;
    min-width: 0;
    flex: 1;
    gap: 1px;
  }
  .mobile-conversation-profile strong {
    overflow: hidden;
    color: var(--text-primary);
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mobile-conversation-profile small {
    color: var(--text-tertiary);
    font-size: 11px;
  }
  .mobile-chat-back {
    display: grid;
    width: 36px;
    height: 36px;
    place-items: center;
    flex: 0 0 auto;
    border: 1px solid var(--border-default);
    border-radius: 10px;
    background: var(--surface-hover);
    color: var(--action-primary);
  }
  .conversation-state-rail {
    display: grid;
    min-height: auto;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 9px 10px;
    padding: 11px 14px 10px;
  }
  .conversation-state-rail .chat-heading {
    grid-column: 2;
  }
  .conversation-language-fact {
    display: none;
  }
  .conversation-state-rail .message-view-switch {
    grid-column: 1 / 3;
    grid-row: 2;
    justify-self: start;
    order: initial;
  }
  .conversation-state-rail :deep(.ai-suspension-header-actions),
  .conversation-state-rail :deep(.suspension-banner.compact) {
    grid-column: 3;
    grid-row: 2;
    order: initial;
  }
  .conversation-state-rail
    :deep(.ai-suspension-header-actions .p-button) {
    min-height: 34px;
    padding-inline: 10px;
  }
  .conversation-state-rail
    :deep(.ai-suspension-header-actions .p-button-label) {
    overflow: hidden;
    max-width: 82px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .conversation-state-rail .conversation-menu-anchor {
    grid-column: 3;
    grid-row: 1;
  }
  .conversation-settings-menu {
    position: fixed;
    inset: auto 10px 10px;
    width: auto;
    max-height: calc(100dvh - 100px);
    overflow-y: auto;
    border-radius: 18px;
  }
  .message-bubble {
    max-width: 86%;
  }
  .message-history {
    padding: 14px;
  }
  .message-bubble :deep(.translated-message > p) {
    font-size: 14px;
  }
  .composer {
    margin: 0;
    padding: 11px 12px 10px;
    border: 0;
    border-top: 1px solid var(--border-subtle);
    border-radius: 0;
    background: var(--surface-card);
  }
  .composer--translated {
    grid-template-columns: 1fr;
  }
  .composer--translated :deep(.reply-preview) {
    order: 1;
  }
  .composer--translated .composer-source {
    order: 2;
    padding: 10px 0 0;
    border-top: 1px solid var(--border-subtle);
    border-right: 0;
  }
  .composer--translated .composer-footer {
    position: static;
    width: auto;
    order: 3;
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
  .composer-action-menu {
    flex: 1 1 auto;
  }
  .composer-action-menu > :deep(.p-button) {
    width: 100%;
  }
  .composer-assist {
    min-height: 42px;
  }
  .composer-ai-action {
    flex: 1 1 auto;
  }
  .template-gallery-backdrop {
    place-items: end stretch;
    padding: 0;
  }
  .template-gallery {
    width: 100%;
    max-height: 78dvh;
    padding: 16px;
    border-radius: 20px 20px 0 0;
  }
  .template-gallery__grid {
    grid-template-columns: 1fr;
  }
  .template-gallery__grid > button {
    min-height: 96px;
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
  .workspace-title > .avatar,
  .workspace-title .eyebrow {
    display: none;
  }
  .workspace-title {
    gap: 7px;
  }
  .workspace-back :deep(.p-button-label) {
    display: none;
  }
  .workspace-back {
    width: 38px;
    min-height: 38px;
    padding: 0;
  }
  .workspace-title h2 {
    font-size: 0.9rem;
  }
  .workspace-statuses .p-tag {
    display: none;
  }
  .conversation-pane,
  .profile-card {
    padding: 14px;
  }
  .profile-card-header {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .profile-card-header-actions {
    justify-content: space-between;
    width: 100%;
  }
  .message-bubble {
    max-width: 94%;
  }
  .chat-header {
    align-items: flex-start;
    flex-direction: column;
    margin-bottom: 8px;
  }
  .chat-header-status {
    justify-content: flex-start;
    width: 100%;
    flex-wrap: wrap;
  }
  .conversation-state-rail {
    padding: 5px;
    border-radius: 12px;
  }
  .conversation-open-state {
    min-height: 28px;
  }
  .message-view-switch {
    max-width: calc(100vw - 130px);
    overflow-x: auto;
  }
  .message-view-switch button {
    padding-inline: 8px;
    white-space: nowrap;
  }
  .composer {
    margin-top: 6px;
    padding: 9px;
    border-radius: 13px;
  }
  .composer-action-menu__panel {
    position: fixed;
    z-index: 32;
    right: 10px;
    bottom: 10px;
    left: 10px;
    width: auto;
    max-height: calc(100dvh - 90px);
    overflow-y: auto;
    padding: 10px;
    border-radius: 20px;
    transform-origin: bottom center;
  }
  .mobile-sheet-handle {
    display: block;
    width: 40px;
    height: 4px;
    margin: 1px auto 7px;
    border-radius: 3px;
    background: var(--border-default);
  }
  .mobile-sheet-title {
    display: block;
    padding: 2px 4px 5px;
    color: var(--text-primary);
    font-size: 15px;
  }
  .action-menu-backdrop {
    position: fixed;
    z-index: 30;
    inset: 0;
    display: block;
    border: 0;
    background: var(--overlay-backdrop);
  }
  .composer-action-menu__panel button {
    min-height: 58px;
  }
}
</style>
