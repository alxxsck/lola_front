<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import { useAuthStore } from "@/features/auth/auth.store";
import { hasProjectPermission } from "@/features/auth/permission-access";
import { endUserCasesRepository } from "@/features/end-user-cases/api/end-user-cases-repository";
import { createSupportCaseDeskController } from "@/features/support-case-desk/model/use-support-case-desk";
import { useConversationAISuspensionStore } from "@/features/conversation-ai-suspension/model/conversation-ai-suspension.store";
import ConversationAISuspensionBanner from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionBanner.vue";
import ConversationAISuspensionDialog from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionDialog.vue";
import ConversationAISuspensionHistory from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionHistory.vue";
import { createConversationTranslationController } from "@/features/conversation-translation/model/use-conversation-translation";
import { isFrontendTranslationCandidate } from "@/features/conversation-translation/model/translation-eligibility";
import ConversationTranslationBanner from "@/features/conversation-translation/ui/ConversationTranslationBanner.vue";
import type {
  ConversationSurfaceComposer,
  ConversationSurfaceComposerAction,
  ConversationSurfaceAISuspensionCapability,
  ConversationSurfaceHistory,
  ConversationSurfaceSendRequest,
  ConversationSurfaceTranslation,
} from "@/features/conversation-surface/model/conversation-surface-contract";
import { clearConversationSurfaceProjectSession } from "@/features/conversation-surface/model/conversation-surface-session";
import {
  defaultConversationReplyTemplates,
  type ConversationReplyTemplate,
} from "@/features/conversation-surface/model/conversation-reply-templates";
import ConversationTemplateGallery from "@/features/conversation-surface/ui/ConversationTemplateGallery.vue";
import { createSupportConversationController } from "@/features/support-conversation/model/use-support-conversation";
import SupportConversationPane from "@/features/support-conversation/ui/SupportConversationPane.vue";
import { createSupportInboxController } from "@/features/support-inbox/model/use-support-inbox";
import SupportInboxPane from "@/features/support-inbox/ui/SupportInboxPane.vue";
import { supportSearchSource, type SupportSearchResult } from "@/features/support-search/api/support-search-source";
import {
  hasSupportSearchCriteria,
  normalizeSupportSearchState,
  readSupportSearchRoute,
  writeSupportSearchRoute,
  type SupportSearchRouteState,
} from "@/features/support-search/model/support-search-route";
import { createSupportSearchController } from "@/features/support-search/model/use-support-search";
import { supportViewsSource, type SupportViewSelection } from "@/features/support-views/api/support-views-source";
import { createSavedViewCommand } from "@/features/support-views/model/support-view-draft";
import { isCustomSupportViewRoute, readSupportViewSelection, shouldLoadCustomSupportView, supportViewRouteKeys, writeSupportViewSelection } from "@/features/support-views/model/support-view-route";
import { createSupportViewsController } from "@/features/support-views/model/use-support-views";
import { createSupportReplyController } from "@/features/support-reply/model/use-support-reply";
import { supportMessageDeliverySource } from "@/features/conversation-delivery/api/support-message-delivery-source";
import { createSupportMessageDeliveryController } from "@/features/conversation-delivery/model/use-support-message-delivery";
import { supportAssignmentSource } from "@/features/support-case-assignment/api/support-assignment-source";
import { createSupportAssignmentController } from "@/features/support-case-assignment/model/use-support-assignment";
import SupportAssignmentOfferTray from "@/features/support-case-assignment/ui/SupportAssignmentOfferTray.vue";
import { supportLeadAssignmentSource } from "@/features/support-lead-assignment/api/support-lead-assignment-source";
import { createSupportLeadAssignmentController } from "@/features/support-lead-assignment/model/use-support-lead-assignment";
import { supportAvailabilitySource } from "@/features/support-availability/api/support-availability-source";
import { createSupportAvailabilityController } from "@/features/support-availability/model/use-support-availability";
import SupportAvailabilityStatus from "@/features/support-availability/ui/SupportAvailabilityStatus.vue";
import { supportInternalNotesSource } from "@/features/support-internal-notes/api/support-internal-notes-source";
import { createSupportInternalNotesController } from "@/features/support-internal-notes/model/use-support-internal-notes";
import SupportInternalNotesDialog from "@/features/support-internal-notes/ui/SupportInternalNotesDialog.vue";
import {
  supportWorkspaceSource,
  type SupportInboxItem,
  type SupportInboxMode,
} from "@/features/support-workspace/api/support-workspace-source";
import {
  canManageOwnSupportAvailability,
  canManageOwnSupportAssignments,
  canForceSupportAssignments,
  canOverrideSupportAssignments,
  canManageSupportConversationAiSuspension,
  canReceiveSupportRoutingOffers,
  canReadSupportWorkspace,
  canReadSupportConversationAiSuspension,
  canReadSupportInternalNoteHistory,
  canReadSupportInternalNotes,
} from "@/features/support-workspace/model/support-workspace-access";
import { supportUserProfileSource } from "@/features/support-workspace/api/support-user-profile-source";
import SupportConversationContext from "@/features/support-workspace/ui/SupportConversationContext.vue";
import FullViewportWorkspaceShell from "@/features/support-workspace/presentation/FullViewportWorkspaceShell.vue";
import ResponsiveWorkspaceInspector from "@/features/support-workspace/presentation/ResponsiveWorkspaceInspector.vue";
import { createSupportUserProfileController } from "@/features/support-user-profile/model/use-support-user-profile";
import { createSupportWorkspaceLiveController } from "@/features/support-workspace/model/use-support-workspace-live";
import { repository } from "@/shared/api/repository";
import { cmsRealtimeClient } from "@/shared/realtime/cms-realtime-client";
import type {
  ExtendConversationAISuspensionDto,
  ResumeConversationAIDto,
  StartConversationAISuspensionDto,
} from "@/shared/api/generated/models";
import { conversationAISuspensionEnabled } from "@/shared/config/features";

const auth = useAuthStore();
const aiSuspension = useConversationAISuspensionStore();
const route = useRoute();
const router = useRouter();
const canReadInbox = computed(() =>
  canReadSupportWorkspace(auth.project?.effectivePermissionCodes ?? []),
);
const canSearchSupport = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    "project.support.search.read",
  ),
);
const canReadSavedViews = computed(() =>
  hasProjectPermission(auth.project?.effectivePermissionCodes ?? [], "project.support.saved_views.read") ||
  hasProjectPermission(auth.project?.effectivePermissionCodes ?? [], "project.support.saved_views.self_manage") ||
  hasProjectPermission(auth.project?.effectivePermissionCodes ?? [], "project.support.saved_views.manage"),
);
const canCreateSavedViews = computed(() =>
  hasProjectPermission(auth.project?.effectivePermissionCodes ?? [], "project.support.saved_views.self_manage") ||
  hasProjectPermission(auth.project?.effectivePermissionCodes ?? [], "project.support.saved_views.manage"),
);
const canManageAllSavedViews = computed(() =>
  hasProjectPermission(auth.project?.effectivePermissionCodes ?? [], "project.support.saved_views.manage"),
);
const routeCaseId = computed(() => {
  const routeId = route.params.caseId;
  return typeof routeId === "string" ? routeId : undefined;
});
const routeConversationId = computed(() => {
  const routeId = route.params.conversationId;
  return typeof routeId === "string" ? routeId : undefined;
});
const inboxMode = computed<SupportInboxMode>(() => {
  if (routeCaseId.value) return "CASES";
  if (routeConversationId.value) return "ALL_CONVERSATIONS";
  return route.query.mode === "cases" ? "CASES" : "ALL_CONVERSATIONS";
});
const inbox = createSupportInboxController(
  {
    projectId: () => auth.project?.id,
    mode: () => inboxMode.value,
    async onForbidden() {
      try {
        await auth.refreshContext();
      } catch {
        // Rows are already purged; route recovery below remains fail-closed.
      }
      if (!canReadInbox.value) await router.replace({ name: "overview" });
    },
  },
  supportWorkspaceSource,
);
const searchState = ref<SupportSearchRouteState>(
  readSupportSearchRoute(route.query),
);
const searchOpen = ref(hasSupportSearchCriteria(searchState.value));
const searchActive = computed(
  () =>
    canSearchSupport.value &&
    (searchOpen.value || hasSupportSearchCriteria(searchState.value)),
);
const supportSearch = createSupportSearchController(
  {
    projectId: () => auth.project?.id,
    canSearch: () => canSearchSupport.value,
    request: () => normalizeSupportSearchState(searchState.value),
    async onForbidden() {
      try {
        await auth.refreshContext();
      } catch {
        // Search results are already purged; renewed permissions own recovery.
      }
    },
  },
  supportSearchSource,
);
const supportViews = createSupportViewsController(
  {
    projectId: () => auth.project?.id,
    canSearch: () => canSearchSupport.value,
    canReadSaved: () => canReadSavedViews.value,
    canMutate: () => canCreateSavedViews.value,
    phrase: () => searchState.value.phrase,
    beforeSelection() {
      searchState.value = readSupportSearchRoute({});
      searchOpen.value = false;
    },
    async onSelection(selection) {
      const query = Object.fromEntries(
        Object.entries(route.query).filter(([key]) => !supportViewRouteKeys.has(key) && !supportSearchRouteKeys.has(key)),
      );
      await router.replace({ query: { ...query, ...writeSupportViewSelection(selection) } });
    },
  },
  supportViewsSource,
);
const supportSearchVisibleError = computed(() => supportViews.error.value || supportSearch.error.value);
const supportViewIntentKeys = new Map<string, string>();
function supportViewIntentKey(signature: string): string {
  const current = supportViewIntentKeys.get(signature);
  if (current) return current;
  const key = globalThis.crypto.randomUUID();
  supportViewIntentKeys.set(signature, key);
  return key;
}
const viewActive = computed(() => canSearchSupport.value && Boolean(supportViews.selection.value));
const supportSearchRouteKeys = new Set([
  "search",
  "scope",
  "status",
  "waiting",
  "assignment",
  "priority",
  "sla",
  "channel",
  "queue",
  "topic",
  "category",
  "language",
  "team",
  "assignee",
  "unread",
  "draft",
  "delivery",
  "from",
  "to",
  "sort",
  "direction",
  "caseId",
  "conversationId",
  "messageId",
  "endUserId",
  "externalEndUserId",
]);
let supportSearchTimer: number | undefined;
const availabilityDialogVisible = ref(false);
const supportContext = ref<InstanceType<typeof SupportConversationContext> | null>(null);
const workspaceFullscreen = ref(true);
const workspacePresentedFullscreen = ref(true);
const workspacePresentationTransitioning = ref(false);
let workspacePresentationLauncher: HTMLElement | null = null;
let workspacePresentationFocusTarget: HTMLElement | null = null;

function setWorkspaceFullscreen(fullscreen: boolean, event?: Event): void {
  if (workspacePresentationTransitioning.value) return;
  const eventTarget =
    event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  if (fullscreen && eventTarget) workspacePresentationLauncher = eventTarget;
  workspacePresentationFocusTarget = fullscreen
    ? eventTarget
    : (workspacePresentationLauncher ?? eventTarget);
  workspaceFullscreen.value = fullscreen;
}

function handleWorkspacePresentationTransition(transitioning: boolean): void {
  workspacePresentationTransitioning.value = transitioning;
  if (transitioning || !workspacePresentationFocusTarget) return;
  const target = workspacePresentationFocusTarget;
  workspacePresentationFocusTarget = null;
  void nextTick(() => {
    if (target.isConnected) target.focus({ preventScroll: true });
  });
}

function handleWorkspacePresented(mode: "windowed" | "full-tab"): void {
  workspacePresentedFullscreen.value = mode === "full-tab";
}

const requestedSelectionKey = computed(() =>
  routeCaseId.value
    ? `CASE:${routeCaseId.value}`
    : routeConversationId.value
      ? `CONVERSATION:${routeConversationId.value}`
      : "",
);
const conversation = createSupportConversationController(
  {
    projectId: () => auth.project?.id,
    conversationId: () => routeConversationId.value,
    caseId: () => routeCaseId.value,
    onForbidden: handleConversationForbidden,
    onReadStateChange(conversationId, state) {
      inbox.applyConversationReadState(conversationId, state);
    },
  },
  supportWorkspaceSource,
);
const reply = createSupportReplyController(
  {
    projectId: () => auth.project?.id,
    actorId: () => auth.user?.id,
    selection: () => conversation.selection.value,
    async reconcile() {
      await Promise.all([inbox.load(), conversation.reconcile()]);
    },
  },
  repository,
);
const messageDelivery = createSupportMessageDeliveryController(
  {
    projectId: () => auth.project?.id,
    selection: () => conversation.selection.value,
    messages: () => conversation.messages.value,
    applyDeliveryReceipt: conversation.applyDeliveryReceipt,
    async reconcile() {
      await Promise.all([inbox.load(), conversation.reconcile()]);
    },
  },
  supportMessageDeliverySource,
);
const canManageTranslation = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    "project.translation.create",
  ),
);
const canReadTranslationDetails = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    "project.translation.read",
  ),
);
const replyTranslationRequested = ref(false);
const replyTemplateGalleryVisible = ref(false);
const translationSettingsVisible = ref(false);
const sendWithoutTranslationVisible = ref(false);
const sendWithoutTranslationReason = ref("");
const messageViewMode = ref<"ORIGINAL" | "TRANSLATED">("ORIGINAL");
let replyTranslationLoad: Promise<boolean> | null = null;
let replyTranslationLoadScope: string | undefined;
const translation = createConversationTranslationController({
  projectId: () => auth.project?.id,
  endUserId: () => conversation.selection.value?.endUser.id,
  conversationId: () => conversation.selection.value?.conversation?.id,
  selectedCaseId: () => conversation.selection.value?.case?.id,
  sourceText: () => reply.draft.value,
  restoreSourceText: (value) => {
    reply.draft.value = value;
  },
  reconcileMessages: async () => {
    await Promise.all([inbox.load(), conversation.reconcile()]);
  },
});
const replyTranslationBusy = computed(
  () =>
    reply.sending.value ||
    translation.loading.value ||
    translation.previewing.value ||
    translation.editingReply.value ||
    translation.savingPreference.value,
);
const translationPolicyRequiresReviewedReply = computed(() => {
  const preference = translation.state.value?.preference;
  const targetLocale = translation.targetLocale.value;
  return Boolean(
    preference?.enabled &&
    preference.workingLocale &&
    (!targetLocale || preference.workingLocale !== targetLocale),
  );
});
const replyPolicyChecking = computed(
  () => canManageTranslation.value && !translation.state.value,
);
const canSubmitPublicReply = computed(() => {
  if (!reply.canReply.value || replyPolicyChecking.value) return false;
  if (
    replyTranslationRequested.value ||
    translationPolicyRequiresReviewedReply.value
  )
    return Boolean(
      translation.readyDraft.value &&
      !translation.previewStale.value &&
      !replyTranslationBusy.value,
    );
  return true;
});
const publicReplyBlockedReason = computed(() => {
  if (!reply.canReply.value) return "";
  if (replyPolicyChecking.value)
    return translation.error.value || "Проверяем правила перевода…";
  if (
    replyTranslationRequested.value ||
    translationPolicyRequiresReviewedReply.value
  )
    return translation.targetLocale.value
      ? "Сначала подготовьте и проверьте перевод."
      : "Выберите язык ответа или используйте разрешённое исключение.";
  return "";
});
const supportComposerWorkingLocale = computed(
  () =>
    translation.state.value?.preference.workingLocale?.toUpperCase() ?? "RU",
);
const supportConversationComposer = computed<
  Extract<ConversationSurfaceComposer, { mode: "PUBLIC_REPLY" }>
>(() => {
  const selection = conversation.selection.value;
  const translatedMode =
    replyTranslationRequested.value ||
    translationPolicyRequiresReviewedReply.value;
  const busy = replyTranslationBusy.value;
  const replyPreview =
    canManageTranslation.value && translatedMode && translation.state.value
      ? {
          draft: translation.draft.value,
          targetLocale: translation.targetLocale.value,
          busy,
          stale: translation.previewStale.value,
          disabled:
            !reply.canReply.value ||
            !reply.draft.value.trim() ||
            translation.savingPreference.value ||
            !translation.state.value.availability.available ||
            translation.state.value.budget.hardExhausted,
          showProviderDetails: canReadTranslationDetails.value,
        }
      : null;
  const sendCapability = replyPolicyChecking.value
    ? {
        kind: "BLOCKED" as const,
        reason: publicReplyBlockedReason.value,
      }
    : translatedMode
      ? { kind: "TRANSLATED_PREVIEW" as const }
      : canSubmitPublicReply.value
        ? { kind: "SOURCE" as const }
        : {
            kind: "BLOCKED" as const,
            reason:
              publicReplyBlockedReason.value ||
              "Ответ в этом диалоге сейчас недоступен.",
          };

  return {
    visibility: reply.canReply.value ? "ENABLED" : "HIDDEN",
    mode: "PUBLIC_REPLY",
    scope: {
      projectId: auth.project?.id ?? "unselected-project",
      actorId: auth.user?.id ?? "current-operator",
      conversationId: selection?.conversation?.id ?? "unselected-conversation",
    },
    initialDraft: reply.draft.value,
    draftRevision:
      translation.draft.value?.id ??
      selection?.actionRevisions.conversationUpdatedAt ??
      selection?.conversation?.updatedAt ??
      "unselected",
    sending: reply.sending.value,
    outcome:
      reply.outcomeState.value === "IDLE" ||
      reply.outcomeState.value === "SENDING"
        ? undefined
        : {
            state: reply.outcomeState.value,
            label:
              reply.outcomeState.value === "CHECKING_OUTCOME"
                ? "Результат пока неизвестен. Сообщение не отправляется заново."
                : reply.outcomeState.value === "RETRYABLE"
                  ? "Отправка не найдена. Черновик сохранён."
                  : "Отправка заблокирована. Черновик сохранён.",
            ...(reply.outcomeState.value === "CHECKING_OUTCOME" &&
            !reply.sending.value
              ? {
                  action: {
                    kind: "CHECK" as const,
                    label: "Проверить результат",
                  },
                }
              : reply.outcomeState.value === "BLOCKED"
                ? {
                    action: {
                      kind: "DISCARD" as const,
                      label: "Начать новую попытку",
                    },
                  }
                : {}),
          },
    recipientStatus: selection?.conversation
      ? selection.conversation.currentInteractionSessionCount > 0
        ? { label: "Пользователь онлайн", tone: "ONLINE" as const }
        : { label: "Пользователь офлайн", tone: "OFFLINE" as const }
      : null,
    actions: {
      attachment: {
        visibility: "DISABLED",
        reason: "Backend-контракт вложений для ответа ещё не опубликован.",
      },
      createTicket: {
        visibility: "HIDDEN",
      },
      classifyCase: {
        visibility: selection?.case
          ? canManageSelectedCase.value
            ? "ENABLED"
            : "HIDDEN"
          : "DISABLED",
        reason: selection?.case
          ? undefined
          : "Диалог пока не привязан к обращению.",
      },
      internalNotes: {
        visibility: selection?.case
          ? canReadSelectedInternalNotes.value
            ? "ENABLED"
            : "HIDDEN"
          : "DISABLED",
        reason: selection?.case
          ? undefined
          : "Внутренние заметки доступны после привязки обращения.",
      },
      templates: {
        visibility: busy ? "DISABLED" : "ENABLED",
        reason: busy ? "Дождитесь завершения текущего действия." : undefined,
      },
      improveWithAI: {
        visibility: "DISABLED",
        reason: "Backend-команда улучшения ответа с AI ещё не опубликована.",
      },
      sendWithoutTranslation: {
        visibility:
          reply.canSendWithoutTranslation.value && translatedMode
            ? reply.draft.value.trim() && !busy
              ? "ENABLED"
              : "DISABLED"
            : "HIDDEN",
      },
    },
    sendCapability,
    replyPreview,
    translationAssist: canManageTranslation.value
      ? {
          targetLocale: translation.targetLocale.value,
          busy,
          disabled: !reply.canReply.value || busy,
        }
      : null,
  };
});
const visibleTranslationMessageIds = computed(() =>
  conversation.messages.value
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
const bulkTranslationIds = computed(() => [
  ...translation.translatingMessageIds.value,
]);
const bulkTranslationCompleted = computed(
  () =>
    bulkTranslationIds.value.filter((messageId) => {
      const state = translation.messageTranslations.value.get(messageId)?.state;
      return state === "COMPLETED" || state === "FAILED" || state === "SKIPPED";
    }).length,
);
const supportConversationHistory = computed<ConversationSurfaceHistory>(() => ({
  loading: conversation.loading.value,
  loadingOlder: conversation.loadingOlder.value,
  loadingNewer: conversation.loadingNewer.value,
  hasOlder: Boolean(conversation.nextMessageCursor.value),
  hasNewer: Boolean(conversation.newerMessageCursor.value),
  firstUnreadOrdinal: conversation.firstUnreadOrdinal.value,
  readError: conversation.readError.value || undefined,
  error:
    !conversation.loading.value && !conversation.messages.value.length
      ? conversation.error.value || undefined
      : undefined,
}));
const supportConversationTranslation = computed<ConversationSurfaceTranslation>(
  () => ({
    available: canManageTranslation.value,
    mode: messageViewMode.value,
    changing: translation.loading.value || translation.savingPreference.value,
    workingLocaleLabel: supportComposerWorkingLocale.value,
    loading: translation.loading.value,
    progress:
      bulkTranslationIds.value.length > 1
        ? {
            completed: bulkTranslationCompleted.value,
            total: bulkTranslationIds.value.length,
            cancellable: true,
          }
        : null,
  }),
);
const workspaceLive = createSupportWorkspaceLiveController(
  {
    async reconcile() {
      await Promise.all([inbox.load(), conversation.reconcile()]);
    },
  },
  cmsRealtimeClient,
);
const workspaceLiveLabel = computed(() =>
  workspaceLive.state.value === "CONNECTED"
    ? "Обновления подключены"
    : workspaceLive.state.value === "CONNECTING"
      ? "Подключаем обновления"
      : workspaceLive.state.value === "DEGRADED"
        ? "Обновления восстанавливаются"
        : "Снимок сервера",
);
const workspaceLiveSeverity = computed(() =>
  workspaceLive.state.value === "CONNECTED"
    ? "success"
    : workspaceLive.state.value === "DEGRADED"
      ? "warn"
      : "info",
);
const selectedConversation = computed(() => {
  return conversation.selection.value?.conversation ?? null;
});
const selectedCase = computed(() => conversation.selection.value?.case ?? null);
const lastInboxSelectionKey = ref("");
const selectedInboxKey = computed(
  () => requestedSelectionKey.value || lastInboxSelectionKey.value || undefined,
);
const selectedAssignmentAuthorityKey = computed(() => {
  const supportCase = conversation.selection.value?.case;
  const assignment = supportCase?.assignment;
  return [
    supportCase?.id ?? "",
    assignment?.id ?? "",
    assignment?.version ?? "",
    assignment?.actionEtag ?? "",
    conversation.selection.value?.capabilitiesRevision ?? "",
    conversation.selection.value?.capabilities.claimAssignment ?? false,
    conversation.selection.value?.capabilities.releaseAssignment ?? false,
    conversation.selection.value?.capabilities.transferAssignment ?? false,
  ].join("\u0000");
});
const aiSuspensionAccessDenied = ref(false);
const canReadSelectedAiSuspension = computed(
  () =>
    !aiSuspensionAccessDenied.value &&
    conversationAISuspensionEnabled &&
    aiSuspension.projectId === auth.project?.id &&
    Boolean(conversation.selection.value?.conversation) &&
    canReadSupportConversationAiSuspension(
      auth.project?.effectivePermissionCodes ?? [],
    ),
);
const canManageSelectedAiSuspension = computed(
  () =>
    canReadSelectedAiSuspension.value &&
    canManageSupportConversationAiSuspension(
      auth.project?.effectivePermissionCodes ?? [],
      Boolean(conversation.selection.value?.capabilities.suspendAi),
    ),
);
const selectedAiSuspensionEntry = computed(() => {
  const conversationId = conversation.selection.value?.conversation?.id;
  return conversationId ? aiSuspension.getEntry(conversationId) : undefined;
});
const supportConversationAiSuspension = computed<
  ConversationSurfaceAISuspensionCapability | undefined
>(() => {
  const entry = selectedAiSuspensionEntry.value;
  if (!canReadSelectedAiSuspension.value || !entry) return undefined;
  return {
    entry,
    canManage: canManageSelectedAiSuspension.value,
    conversationOpen: selectedConversation.value?.status === "OPEN",
    showHistory: true,
  };
});
const selectedAiSuspensionError = computed(() => {
  const conversationId = conversation.selection.value?.conversation?.id;
  return conversationId ? aiSuspension.getError(conversationId) : null;
});
const selectedAiSuspensionKey = computed(() => {
  const selection = conversation.selection.value;
  return [
    auth.project?.id ?? "",
    selection?.endUser.id ?? "",
    selection?.conversation?.id ?? "",
    selection?.capabilities.suspendAi ? "allowed" : "denied",
  ].join("\u0000");
});
const aiSuspensionDialogVisible = ref(false);
const aiSuspensionHistoryVisible = ref(false);
const aiSuspensionDialogMode = ref<"START" | "EXTEND" | "RESUME">("START");
const contextDrawerVisible = ref(false);
const isMobileWorkspace = ref(false);
const isCompactWorkspace = ref(false);
let mobileWorkspaceMedia: MediaQueryList | null = null;
let compactWorkspaceMedia: MediaQueryList | null = null;
let contextTrigger: HTMLElement | null = null;
const mobileInspectorRequested = computed(
  () => route.query.panel === "inspector",
);
const mobileInspectorVisible = computed(
  () =>
    isMobileWorkspace.value &&
    mobileInspectorRequested.value &&
    Boolean(conversation.selection.value),
);
const workspaceInspectorMode = computed<"DESKTOP" | "TABLET" | "MOBILE">(() =>
  isMobileWorkspace.value
    ? "MOBILE"
    : isCompactWorkspace.value
      ? "TABLET"
      : "DESKTOP",
);
const canManageSelectedCase = computed(
  () =>
    Boolean(conversation.selection.value?.case) &&
    Boolean(conversation.selection.value?.capabilities.manageCase) &&
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      "project.cases.manage",
    ),
);
const canReadSelectedCaseDesk = computed(
  () =>
    Boolean(conversation.selection.value?.case) &&
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      "project.cases.read",
    ),
);
const caseDesk = createSupportCaseDeskController(endUserCasesRepository, {
  projectId: () => auth.project?.id ?? "",
  caseId: () => conversation.selection.value?.case?.id ?? "",
  canRead: () => canReadSelectedCaseDesk.value,
  async onProjectionChanged() {
    await Promise.all([inbox.load(), conversation.reconcile()]);
  },
  async onForbidden() {
    try {
      await auth.refreshContext();
    } catch {
      // The exact Case projection is already purged and stays fail-closed.
    }
    await Promise.allSettled([inbox.load(), conversation.reconcile()]);
  },
});
const selectedCaseDeskAuthorityKey = computed(() => {
  const selection = conversation.selection.value;
  return [
    auth.project?.id ?? "",
    selection?.case?.id ?? "",
    canReadSelectedCaseDesk.value ? "read" : "denied",
  ].join("\u0000");
});
const selectedCaseDeskFreshnessKey = computed(() => {
  const selection = conversation.selection.value;
  return [
    auth.project?.id ?? "",
    selection?.case?.id ?? "",
    selection?.case?.version ?? "",
    selection?.capabilitiesRevision ?? "",
  ].join("\u0000");
});
const internalNotesAccessDenied = ref(false);
const canReadSelectedInternalNotes = computed(
  () =>
    !internalNotesAccessDenied.value &&
    Boolean(conversation.selection.value?.case) &&
    canReadSupportInternalNotes(auth.project?.effectivePermissionCodes ?? []),
);
const canReadSelectedInternalNoteHistory = computed(
  () =>
    canReadSelectedInternalNotes.value &&
    canReadSupportInternalNoteHistory(
      auth.project?.effectivePermissionCodes ?? [],
    ),
);
/**
 * The published workspace selection has no Case-scoped note action
 * projection. Project permissions alone must not infer mutation authority.
 */
const canWriteSelectedInternalNotes = computed(() => false);
const canRedactSelectedInternalNotes = computed(() => false);
const selectedInternalNotesAuthorityKey = computed(() => {
  const selection = conversation.selection.value;
  return [
    auth.project?.id ?? "",
    selection?.case?.id ?? "",
    selection?.capabilitiesRevision ?? "",
    selection?.checkpoint ?? "",
  ].join("\u0000");
});
const internalNotesVisible = ref(false);
const internalNotes = createSupportInternalNotesController(
  {
    projectId: () => auth.project?.id,
    caseId: () => conversation.selection.value?.case?.id,
    canRead: () => canReadSelectedInternalNotes.value,
    canReadHistory: () => canReadSelectedInternalNoteHistory.value,
    canWrite: () => canWriteSelectedInternalNotes.value,
    canRedact: () => canRedactSelectedInternalNotes.value,
    async onForbidden() {
      internalNotesAccessDenied.value = true;
      internalNotesVisible.value = false;
      try {
        await auth.refreshContext();
      } catch {
        // Private note text was already purged before refreshing authority.
      }
      await Promise.all([inbox.load(), conversation.reconcile()]).catch(
        () => undefined,
      );
    },
  },
  supportInternalNotesSource,
);
const availabilityAccessDenied = ref(false);
const canReadAvailability = computed(
  () =>
    !availabilityAccessDenied.value &&
    canManageOwnSupportAvailability(
      auth.project?.effectivePermissionCodes ?? [],
    ),
);
const canManageOwnAvailability = computed(() => canReadAvailability.value);
const availability = createSupportAvailabilityController(
  {
    projectId: () => auth.project?.id,
    operatorId: () => auth.user?.id,
    canRead: () => canReadAvailability.value,
    canManage: () => canManageOwnAvailability.value,
    async onForbidden() {
      availabilityAccessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // The self-availability snapshot has already been purged.
      }
    },
  },
  supportAvailabilitySource,
);
const assignmentAccessDenied = ref(false);
const canManageOwnAssignments = computed(
  () =>
    !assignmentAccessDenied.value &&
    canManageOwnSupportAssignments(
      auth.project?.effectivePermissionCodes ?? [],
    ),
);
const canOverrideAssignments = computed(
  () =>
    !assignmentAccessDenied.value &&
    canOverrideSupportAssignments(
      auth.project?.effectivePermissionCodes ?? [],
    ),
);
const canForceAssignments = computed(
  () =>
    !assignmentAccessDenied.value &&
    canForceSupportAssignments(auth.project?.effectivePermissionCodes ?? []),
);
const canManageRoutingOffers = computed(
  () =>
    !assignmentAccessDenied.value &&
    canReceiveSupportRoutingOffers(
      auth.project?.effectivePermissionCodes ?? [],
    ),
);
const assignment = createSupportAssignmentController(
  supportAssignmentSource,
  {
    projectId: () => auth.project?.id,
    selection: () => conversation.selection.value,
    canManageOwn: () => canManageOwnAssignments.value,
    canOverride: () => canOverrideAssignments.value,
    canReceiveOffers: () => canManageRoutingOffers.value,
    async onForbidden() {
      assignmentAccessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // Assignment capabilities and private offers were already purged.
      }
      await Promise.all([inbox.load(), conversation.reconcile()]).catch(
        () => undefined,
      );
    },
    async onChanged() {
      await Promise.all([
        inbox.load(),
        conversation.reconcile(),
        canReadAvailability.value ? availability.load() : Promise.resolve(),
      ]);
    },
  },
);
const leadAssignment = createSupportLeadAssignmentController(
  supportLeadAssignmentSource,
  {
    projectId: () => auth.project?.id,
    canOverride: () => canOverrideAssignments.value,
    canForce: () => canForceAssignments.value,
    canReadAudit: () =>
      hasProjectPermission(
        auth.project?.effectivePermissionCodes ?? [],
        "project.support.lead_control.read",
      ),
    async onForbidden() {
      assignmentAccessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // Lead assignment state has already been purged by the controller.
      }
      await Promise.all([inbox.load(), conversation.reconcile()]).catch(
        () => undefined,
      );
    },
    async onChanged() {
      await Promise.all([
        inbox.load(),
        conversation.reconcile(),
        canReadAvailability.value ? availability.load() : Promise.resolve(),
      ]);
    },
  },
);
const assignmentAvailabilityLabel = computed(() => {
  const snapshot = availability.availability.value;
  if (!canReadAvailability.value) return "Нет права на просмотр";
  if (!snapshot) return availability.loading.value ? "Загружается…" : "Не загружена";
  const state =
    {
      AVAILABLE: "Доступен для новых обращений",
      BUSY: "Занят",
      AWAY: "Отошёл",
      DRAINING: "Завершает текущую работу",
      OFFLINE: "Офлайн",
    }[snapshot.effectiveState] ?? snapshot.effectiveState;
  return snapshot.acceptsNewWork ? state : `${state} · новую работу не принимает`;
});
const assignmentSurfaceController = computed(() =>
  canManageOwnAssignments.value || canOverrideAssignments.value
    ? assignment
    : undefined,
);
const leadAssignmentSurfaceController = computed(() =>
  canOverrideAssignments.value ? leadAssignment : undefined,
);
const profileAccessDenied = ref(false);
const canReadProfile = computed(
  () =>
    !profileAccessDenied.value &&
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      "project.profiles.read",
    ),
);
const profile = createSupportUserProfileController(
  {
    projectId: () => auth.project?.id,
    endUserId: () => conversation.selection.value?.endUser.id,
    canRead: () => canReadProfile.value,
    async onForbidden() {
      profileAccessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // The sensitive projection is already purged; the next route guard owns recovery.
      }
    },
  },
  supportUserProfileSource,
);

async function openInboxItem(item: SupportInboxItem): Promise<void> {
  const selectionKey = `${item.kind}:${item.id}`;
  lastInboxSelectionKey.value = selectionKey;
  if (selectionKey === requestedSelectionKey.value) return;
  const query = { ...route.query };
  delete query.panel;
  await router.push(
    item.kind === "CASE"
      ? {
          name: "support-inbox-case",
          params: { caseId: item.id },
          query,
        }
      : {
          name: "support-inbox-conversation",
          params: { conversationId: item.id },
          query,
        },
  );
}

async function changeInboxMode(mode: SupportInboxMode): Promise<void> {
  const query = { ...route.query };
  delete query.panel;
  if (mode === "ALL_CONVERSATIONS") delete query.mode;
  else query.mode = "cases";
  await router.push({ name: "support-inbox", query });
}

function clearSupportSearchTimer(): void {
  if (supportSearchTimer === undefined) return;
  window.clearTimeout(supportSearchTimer);
  supportSearchTimer = undefined;
}

async function syncSupportSearchRoute(
  state: SupportSearchRouteState,
): Promise<void> {
  const query = Object.fromEntries(
    Object.entries(route.query).filter(
      ([key]) => !supportSearchRouteKeys.has(key),
    ),
  );
  await router.replace({ query: { ...query, ...writeSupportSearchRoute(state) } });
}

function runSupportSearch(state: SupportSearchRouteState): void {
  clearSupportSearchTimer();
  searchState.value = normalizeSupportSearchState(state);
  if (supportViews.selection.value) {
    void supportViews.query();
    return;
  }
  searchOpen.value = true;
  void syncSupportSearchRoute(searchState.value);
  if (!hasSupportSearchCriteria(searchState.value)) {
    supportSearch.reset();
    return;
  }
  void supportSearch.search();
}

function changeSupportSearch(state: SupportSearchRouteState): void {
  const normalized = normalizeSupportSearchState(state);
  searchState.value = state;
  searchOpen.value = true;
  clearSupportSearchTimer();
  if (supportViews.selection.value) {
    supportViews.resetResults();
    supportSearchTimer = window.setTimeout(() => {
      supportSearchTimer = undefined;
      void supportViews.query();
    }, 250);
    return;
  }
  void syncSupportSearchRoute(normalized);
  if (!hasSupportSearchCriteria(normalized)) {
    supportSearch.reset();
    return;
  }
  supportSearch.reset();
  supportSearchTimer = window.setTimeout(() => {
    supportSearchTimer = undefined;
    void supportSearch.search();
  }, 250);
}

async function selectSupportView(selection: SupportViewSelection): Promise<void> {
  clearSupportSearchTimer();
  searchOpen.value = false;
  supportSearch.reset();
  await supportViews.select(selection);
}

async function startCustomSupportSearch(): Promise<void> {
  clearSupportSearchTimer();
  supportSearch.reset();
  searchState.value = readSupportSearchRoute({});
  searchOpen.value = true;
  await supportViews.clearSelection();
  await syncSupportSearchRoute(searchState.value);
}

async function createSupportView(value: { name: string; code: string; scope: "PERSONAL" | "TEAM" | "PROJECT"; teamId: string }): Promise<void> {
  const command = createSavedViewCommand(value.name, value.code, value.scope, value.teamId, searchState.value);
  if (!command) return;
  const signature = `create:${JSON.stringify(command)}`;
  if (await supportViews.create(command, supportViewIntentKey(signature))) supportViewIntentKeys.delete(signature);
}

async function replaceSupportView(value: { view: import("@/shared/api/generated/models").SavedSupportViewResponseDto; displayName: string }): Promise<void> {
  const { view } = value;
  const displayName = value.displayName.trim();
  if (!view.permissions.replaceDraft || displayName.length < 2 || displayName.length > 120) return;
  const command = { draft: { ...view.draft, displayName } };
  const signature = `replace:${view.id}:${view.etag}:${JSON.stringify(command)}`;
  if (await supportViews.replace(view, command, supportViewIntentKey(signature))) supportViewIntentKeys.delete(signature);
}

async function setDefaultSupportView(selection: SupportViewSelection): Promise<void> {
  const command = selection.kind === "SYSTEM"
      ? { kind: "SYSTEM" as const, presetCode: selection.code }
      : { kind: "SAVED" as const, savedViewId: selection.id };
  const signature = `default:${JSON.stringify(command)}:${supportViews.defaultView.value?.etag ?? "none"}`;
  if (await supportViews.setDefault(command, supportViewIntentKey(signature))) supportViewIntentKeys.delete(signature);
}

async function publishSupportView(view: import("@/shared/api/generated/models").SavedSupportViewResponseDto): Promise<void> {
  if (!view.permissions.publish) return;
  const signature = `publish:${view.id}:${view.etag}`;
  if (await supportViews.publish(view, supportViewIntentKey(signature))) supportViewIntentKeys.delete(signature);
}

async function archiveSupportView(view: import("@/shared/api/generated/models").SavedSupportViewResponseDto): Promise<void> {
  if (!view.permissions.archive) return;
  const signature = `archive:${view.id}:${view.etag}`;
  if (await supportViews.archive(view, supportViewIntentKey(signature))) supportViewIntentKeys.delete(signature);
}

async function closeSupportSearch(): Promise<void> {
  clearSupportSearchTimer();
  searchOpen.value = false;
  supportSearch.reset();
  searchState.value = readSupportSearchRoute({});
  if (supportViews.selection.value) void supportViews.query();
  const query = Object.fromEntries(
    Object.entries(route.query).filter(
      ([key]) => !supportSearchRouteKeys.has(key),
    ),
  );
  await router.replace({ query });
  await nextTick();
  const selected = document.querySelector<HTMLElement>(
    '.inbox-row[aria-current="true"]',
  );
  selected?.focus({ preventScroll: true });
}

async function openSupportSearchResult(item: SupportSearchResult): Promise<void> {
  const query = { ...route.query };
  delete query.panel;
  if (item.selection.kind === "CASE") {
    await router.push({
      name: "support-inbox-case",
      params: { caseId: item.selection.id },
      query,
    });
    return;
  }
  if (item.selection.kind === "CONVERSATION") {
    await router.push({
      name: "support-inbox-conversation",
      params: { conversationId: item.selection.id },
      query,
    });
    return;
  }
  await router.push({ name: "users", params: { endUserId: item.selection.id } });
}

async function classifySelectedCase(): Promise<void> {
  const caseId = conversation.selection.value?.case?.id;
  if (!caseId || !canManageSelectedCase.value) return;
  if (isMobileWorkspace.value) {
    await router.push({ query: { ...route.query, panel: "inspector" } });
  } else if (isCompactWorkspace.value) {
    contextDrawerVisible.value = true;
  }
  await nextTick();
  supportContext.value?.requestClassification();
}

async function backToInbox(): Promise<void> {
  contextDrawerVisible.value = false;
  const query =
    inboxMode.value === "CASES"
      ? { ...route.query, mode: "cases" }
      : Object.fromEntries(
          Object.entries(route.query).filter(([key]) => key !== "mode"),
        );
  delete query.panel;
  const inboxLocation = {
    name: "support-inbox",
    query,
  } as const;
  if (window.history.state?.back === router.resolve(inboxLocation).fullPath) {
    router.back();
    return;
  }
  await router.replace(inboxLocation);
}

function syncMobileWorkspace(
  event: MediaQueryList | MediaQueryListEvent,
): void {
  const drawerWasVisible = contextDrawerVisible.value;
  isMobileWorkspace.value = event.matches;
  if (event.matches && drawerWasVisible && requestedSelectionKey.value) {
    contextDrawerVisible.value = false;
    void router.replace({
      query: { ...route.query, panel: "inspector" },
    });
    return;
  }
  if (!event.matches && mobileInspectorRequested.value) {
    contextDrawerVisible.value = window.matchMedia(
      "(max-width: 1279px)",
    ).matches;
    const query = { ...route.query };
    delete query.panel;
    void router.replace({ query });
  }
}

function syncCompactWorkspace(
  event: MediaQueryList | MediaQueryListEvent,
): void {
  isCompactWorkspace.value = event.matches;
}

async function openConversationContext(event: Event): Promise<void> {
  contextTrigger =
    event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  if (!isMobileWorkspace.value) {
    contextDrawerVisible.value = true;
    return;
  }
  await router.push({
    query: { ...route.query, panel: "inspector" },
  });
}

async function closeMobileInspector(): Promise<void> {
  const query = { ...route.query };
  delete query.panel;
  const target = router.resolve({
    name: route.name ?? undefined,
    params: route.params,
    query,
  }).fullPath;
  if (window.history.state?.back === target) {
    router.back();
    return;
  }
  await router.replace({ query });
}

function openInternalNotes(): void {
  if (!canReadSelectedInternalNotes.value) return;
  internalNotesVisible.value = true;
  void internalNotes.load();
}

async function createInternalNote(
  body: string,
  onSucceeded: () => void,
): Promise<void> {
  const conversationId = conversation.selection.value?.conversation?.id;
  if (await internalNotes.create(body, conversationId)) onSucceeded();
}

async function correctInternalNote(
  noteId: string,
  body: string,
  reasonCode: string,
  onSucceeded: () => void,
): Promise<void> {
  if (await internalNotes.correct(noteId, body, reasonCode)) onSucceeded();
}

async function tombstoneInternalNote(
  noteId: string,
  reasonCode: string,
  onSucceeded: () => void,
): Promise<void> {
  if (await internalNotes.tombstone(noteId, reasonCode)) onSucceeded();
}

let internalNotesRefreshTimer: number | undefined;

function stopInternalNotesReconciliation(): void {
  if (internalNotesRefreshTimer === undefined) return;
  window.clearInterval(internalNotesRefreshTimer);
  internalNotesRefreshTimer = undefined;
}

function syncInternalNotesReconciliation(): void {
  stopInternalNotesReconciliation();
  if (
    typeof window === "undefined" ||
    !internalNotesVisible.value ||
    !canReadSelectedInternalNotes.value
  )
    return;
  internalNotesRefreshTimer = window.setInterval(() => {
    if (internalNotes.loading.value || internalNotes.loadingMore.value) return;
    void internalNotes.reconcile();
  }, 30_000);
}

function keyboardNavigationIsBlocked(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return Boolean(
    target.closest(
      "input, textarea, select, button, a, [contenteditable='true'], [role='button'], [role='dialog'], [role='textbox'], [role='menuitem'], [role='option']",
    ) || document.querySelector("[role='dialog'][aria-modal='true']"),
  );
}

function moveInboxSelection(direction: -1 | 1): void {
  const items = inbox.items.value;
  if (!items.length) return;
  const currentKey = requestedSelectionKey.value;
  const currentIndex = currentKey
    ? items.findIndex((item) => `${item.kind}:${item.id}` === currentKey)
    : -1;
  const nextIndex = Math.max(
    0,
    Math.min(
      items.length - 1,
      currentIndex < 0
        ? direction > 0
          ? 0
          : items.length - 1
        : currentIndex + direction,
    ),
  );
  const next = items[nextIndex];
  if (next) void openInboxItem(next);
}

function handleWorkspaceKeydown(event: KeyboardEvent): void {
  if (
    event.key === "Escape" &&
    document.querySelector("[role='dialog'][aria-modal='true']")
  )
    return;
  if (
    workspaceFullscreen.value &&
    workspacePresentationLauncher &&
    event.key === "Escape"
  ) {
    event.preventDefault();
    void setWorkspaceFullscreen(false);
    return;
  }
  if (
    canSearchSupport.value &&
    !event.altKey &&
    !event.shiftKey &&
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === "k" &&
    !document.querySelector("[role='dialog'][aria-modal='true']")
  ) {
    event.preventDefault();
    searchOpen.value = true;
    void nextTick(() =>
      document
        .querySelector<HTMLInputElement>("[data-support-search-input]")
        ?.focus({ preventScroll: true }),
    );
    return;
  }
  if (
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    keyboardNavigationIsBlocked(event.target)
  )
    return;
  const direction =
    event.key === "ArrowDown" || event.key.toLowerCase() === "j"
      ? 1
      : event.key === "ArrowUp" || event.key.toLowerCase() === "k"
        ? -1
        : null;
  if (!direction) return;
  event.preventDefault();
  moveInboxSelection(direction);
}

async function reload(): Promise<void> {
  assignmentAccessDenied.value = false;
  aiSuspensionAccessDenied.value = false;
  internalNotesAccessDenied.value = false;
  aiSuspensionDialogVisible.value = false;
  aiSuspensionHistoryVisible.value = false;
  internalNotesVisible.value = false;
  setSendWithoutTranslationVisible(false);
  internalNotes.reset();
  await Promise.all([
    inbox.load(),
    conversation.load(),
    canReadAvailability.value ? availability.load() : Promise.resolve(),
  ]);
  await Promise.all([
    canManageOwnAssignments.value || canOverrideAssignments.value
      ? assignment.loadCase()
      : Promise.resolve(),
    canManageRoutingOffers.value
      ? assignment.loadOffers()
      : Promise.resolve(),
  ]);
  reply.syncSelection();
  reloadSelectedAiSuspension();
}

async function sendReply(): Promise<void> {
  const policyLoaded = canManageTranslation.value
    ? await ensureReplyTranslationLoaded()
    : true;
  if (!policyLoaded) {
    replyTranslationRequested.value = true;
    return;
  }
  if (
    replyTranslationRequested.value ||
    translationPolicyRequiresReviewedReply.value
  ) {
    replyTranslationRequested.value = true;
    if (translation.readyDraft.value) {
      await sendTranslatedReply();
      return;
    }
    await prepareReplyTranslation();
    return;
  }
  await reply.send();
}

function setSendWithoutTranslationVisible(visible: boolean): void {
  sendWithoutTranslationVisible.value = visible;
  if (!visible) sendWithoutTranslationReason.value = "";
}

async function sendReplyWithoutTranslation(): Promise<void> {
  const reason = sendWithoutTranslationReason.value.trim();
  if (!reason || !reply.canSendWithoutTranslation.value) return;
  await reply.sendWithoutTranslation(reason);
  if (!reply.draft.value.trim()) {
    setSendWithoutTranslationVisible(false);
    translation.clearReplyDraft();
    replyTranslationRequested.value = false;
  }
}

async function ensureReplyTranslationLoaded(): Promise<boolean> {
  if (!canManageTranslation.value) return false;
  if (translation.state.value) return true;
  const scope = [
    auth.project?.id ?? "",
    conversation.selection.value?.endUser.id ?? "",
    conversation.selection.value?.conversation?.id ?? "",
  ].join("\u0000");
  if (!scope.replaceAll("\u0000", "")) return false;
  if (replyTranslationLoad && replyTranslationLoadScope === scope)
    return replyTranslationLoad;
  const request = translation
    .load()
    .then(() => Boolean(translation.state.value))
    .finally(() => {
      if (replyTranslationLoad === request) {
        replyTranslationLoad = null;
        replyTranslationLoadScope = undefined;
      }
    });
  replyTranslationLoad = request;
  replyTranslationLoadScope = scope;
  return request;
}

async function setTranslationEnabled(enabled: boolean): Promise<void> {
  if (!(await ensureReplyTranslationLoaded())) return;
  await translation.updatePreference({ enabled });
}

async function setTranslationTargetLocale(
  locale: string | null,
): Promise<void> {
  if (!(await ensureReplyTranslationLoaded())) return;
  await translation.updatePreference({ endUserLocaleOverride: locale });
}

async function showTranslatedMessages(): Promise<void> {
  if (!(await ensureReplyTranslationLoaded())) return;
  if (!translation.state.value?.preference.enabled) {
    await translation.updatePreference({ enabled: true });
  }
  if (!translation.state.value?.preference.enabled) return;
  await translation.translateMessages(visibleTranslationMessageIds.value);
  messageViewMode.value = "TRANSLATED";
}

async function changeSupportTranslationMode(
  mode: "ORIGINAL" | "TRANSLATED",
): Promise<void> {
  if (mode === "ORIGINAL") {
    messageViewMode.value = "ORIGINAL";
    return;
  }
  await showTranslatedMessages();
}

function changeSupportDraft(request: ConversationSurfaceSendRequest): void {
  reply.draft.value = request.text;
}

async function sendSupportReply(
  request: ConversationSurfaceSendRequest,
): Promise<void> {
  reply.draft.value = request.text;
  await sendReply();
}

async function sendSupportTranslatedReply(
  request: ConversationSurfaceSendRequest,
): Promise<void> {
  await sendTranslatedReply(request.text);
}

function reconcileSupportSurface(): void {
  void Promise.all([inbox.load(), conversation.reconcile()]);
}

function handleSupportComposerAction(
  action: ConversationSurfaceComposerAction,
): void {
  switch (action) {
    case "TEMPLATES":
      replyTemplateGalleryVisible.value = true;
      break;
    case "CLASSIFY_CASE":
      void classifySelectedCase();
      break;
    case "INTERNAL_NOTES":
      openInternalNotes();
      break;
    case "SEND_WITHOUT_TRANSLATION":
      setSendWithoutTranslationVisible(true);
      break;
    case "ATTACHMENT":
    case "CREATE_TICKET":
    case "IMPROVE_WITH_AI":
      break;
  }
}

function applySupportReplyTemplate(template: ConversationReplyTemplate): void {
  reply.draft.value = template.text;
  replyTemplateGalleryVisible.value = false;
}

async function prepareReplyTranslation(): Promise<void> {
  if (!(await ensureReplyTranslationLoaded())) return;
  const targetLocale = translation.targetLocale.value;
  const workingLocale = translation.state.value?.preference.workingLocale;
  if (!targetLocale || targetLocale === workingLocale) {
    translationSettingsVisible.value = true;
    return;
  }
  replyTranslationRequested.value = true;
  await translation.createReplyPreview();
}

async function sendTranslatedReply(editedText?: string): Promise<void> {
  if (
    translation.savingPreference.value ||
    translation.previewStale.value ||
    !reply.canReply.value
  )
    return;
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
  await reply.sendTranslatedReply(ready.id);
  if (!reply.draft.value.trim()) {
    translation.clearReplyDraft();
    replyTranslationRequested.value = false;
  }
}

function reloadSelectedAiSuspension(): void {
  const selection = conversation.selection.value;
  if (!canReadSelectedAiSuspension.value || !selection?.conversation) return;
  aiSuspension.restoreConversation(selection.conversation.id);
  void aiSuspension.loadDetail(selection.endUser.id, selection.conversation.id);
}

function revokeSelectedAiSuspensionAccess(scope?: {
  projectId: string;
  endUserId: string;
  conversationId: string;
}): void {
  const selection = conversation.selection.value;
  const conversationId = selection?.conversation?.id;
  if (
    scope &&
    (scope.projectId !== auth.project?.id ||
      scope.endUserId !== selection?.endUser.id ||
      scope.conversationId !== conversationId)
  )
    return;
  if (conversationId) aiSuspension.revokeConversation(conversationId);
  aiSuspensionAccessDenied.value = true;
  aiSuspensionDialogVisible.value = false;
  aiSuspensionHistoryVisible.value = false;
  void auth.refreshContext().catch(() => undefined);
  void Promise.all([inbox.load(), conversation.reconcile()]);
}

async function handleConversationForbidden(): Promise<void> {
  contextDrawerVisible.value = false;
  internalNotesVisible.value = false;
  aiSuspensionDialogVisible.value = false;
  aiSuspensionHistoryVisible.value = false;
  setSendWithoutTranslationVisible(false);
  reply.reset();
  messageDelivery.reset();
  translation.reset();
  profile.reset();
  internalNotes.reset();
  assignment.resetCase();
  try {
    await auth.refreshContext();
  } catch {
    // The revoked conversation was purged before authority recovery.
  }
  await inbox.load().catch(() => undefined);
  if (requestedSelectionKey.value)
    await router.replace({
      name: "support-inbox",
      query: inboxMode.value === "CASES" ? { mode: "cases" } : {},
    });
}

function openAiSuspensionDialog(mode: "START" | "EXTEND" | "RESUME"): void {
  if (!canManageSelectedAiSuspension.value || !selectedAiSuspensionEntry.value)
    return;
  aiSuspensionDialogMode.value = mode;
  aiSuspensionDialogVisible.value = true;
}

async function submitAiSuspension(value: {
  key: string;
  command:
    | StartConversationAISuspensionDto
    | ExtendConversationAISuspensionDto
    | ResumeConversationAIDto;
}): Promise<void> {
  const selection = conversation.selection.value;
  if (
    !selection?.conversation ||
    !canManageSelectedAiSuspension.value ||
    !selectedAiSuspensionEntry.value
  )
    return;
  const { endUser, conversation: selected } = selection;
  const succeeded =
    aiSuspensionDialogMode.value === "START"
      ? await aiSuspension.start(
          endUser.id,
          selected.id,
          value.command as StartConversationAISuspensionDto,
          value.key,
        )
      : aiSuspensionDialogMode.value === "EXTEND"
        ? await aiSuspension.extend(
            endUser.id,
            selected.id,
            value.command as ExtendConversationAISuspensionDto,
            value.key,
          )
        : await aiSuspension.resume(
            endUser.id,
            selected.id,
            value.command as ResumeConversationAIDto,
            value.key,
          );
  if (!succeeded) return;
  aiSuspensionDialogVisible.value = false;
  await Promise.all([
    aiSuspension.loadDetail(endUser.id, selected.id),
    inbox.load(),
    conversation.reconcile(),
  ]);
}

onMounted(async () => {
  window.addEventListener("keydown", handleWorkspaceKeydown);
  mobileWorkspaceMedia = window.matchMedia("(max-width: 767px)");
  compactWorkspaceMedia = window.matchMedia("(max-width: 1279px)");
  syncMobileWorkspace(mobileWorkspaceMedia);
  syncCompactWorkspace(compactWorkspaceMedia);
  mobileWorkspaceMedia.addEventListener("change", syncMobileWorkspace);
  compactWorkspaceMedia.addEventListener("change", syncCompactWorkspace);
  await inbox.load();
  const initialCustomSearch = shouldLoadCustomSupportView(route.query, hasSupportSearchCriteria(searchState.value));
  if (initialCustomSearch) {
    searchOpen.value = true;
    await supportViews.loadCustom();
    if (!isCustomSupportViewRoute(route.query)) {
      await router.replace({ query: { ...route.query, ...writeSupportViewSelection(null) } });
    }
  } else await supportViews.load(readSupportViewSelection(route.query));
  if (!supportViews.selection.value && hasSupportSearchCriteria(searchState.value)) await supportSearch.search();
  if (canReadAvailability.value) {
    await availability.load();
    availability.startHeartbeat();
  }
  if (canManageRoutingOffers.value) await assignment.loadOffers();
});

watch(
  () => auth.project?.id,
  (projectId, previousProjectId) => {
    const projectChanged =
      previousProjectId !== undefined && projectId !== previousProjectId;
    if (previousProjectId)
      clearConversationSurfaceProjectSession(previousProjectId);
    if (projectChanged) {
      clearSupportSearchTimer();
      searchOpen.value = false;
      searchState.value = readSupportSearchRoute({});
      void syncSupportSearchRoute(searchState.value);
    }
    lastInboxSelectionKey.value = "";
    contextDrawerVisible.value = false;
    profileAccessDenied.value = false;
    availabilityAccessDenied.value = false;
    assignmentAccessDenied.value = false;
    aiSuspensionAccessDenied.value = false;
    internalNotesAccessDenied.value = false;
    aiSuspensionDialogVisible.value = false;
    aiSuspensionHistoryVisible.value = false;
    internalNotesVisible.value = false;
    assignment.reset();
    leadAssignment.reset();
    availability.reset();
    profile.reset();
    internalNotes.reset();
    caseDesk.reset();
    reply.reset();
    messageDelivery.reset();
    replyTranslationRequested.value = false;
    replyTemplateGalleryVisible.value = false;
    translationSettingsVisible.value = false;
    setSendWithoutTranslationVisible(false);
    messageViewMode.value = "ORIGINAL";
    translation.reset();
    conversation.reset();
    inbox.reset();
    supportSearch.reset();
    supportViews.reset();
    supportViewIntentKeys.clear();
    void (async () => {
      await inbox.load();
      const resumeCustomSearch = !projectChanged && shouldLoadCustomSupportView(route.query, hasSupportSearchCriteria(searchState.value));
      if (resumeCustomSearch) {
        searchOpen.value = true;
        await supportViews.loadCustom();
      } else await supportViews.load(projectChanged ? null : readSupportViewSelection(route.query));
      if (!supportViews.selection.value && !projectChanged && hasSupportSearchCriteria(searchState.value))
        await supportSearch.search();
      if (canReadAvailability.value) {
        await availability.load();
        availability.startHeartbeat();
      }
      if (canManageRoutingOffers.value) await assignment.loadOffers();
    })();
  },
);

watch(canReadAvailability, (allowed) => {
  if (!allowed) {
    availability.reset();
    return;
  }
  void availability.load().then(() => availability.startHeartbeat());
});

watch(canSearchSupport, (allowed) => {
  if (allowed) return;
  clearSupportSearchTimer();
  searchOpen.value = false;
  supportSearch.reset();
  supportViews.reset();
  supportViewIntentKeys.clear();
  searchState.value = readSupportSearchRoute({});
});

watch(canReadSavedViews, (allowed) => {
  if (!allowed) {
    void supportViews.purgeSaved();
    return;
  }
  if (!canSearchSupport.value) return;
  const custom = shouldLoadCustomSupportView(route.query, hasSupportSearchCriteria(searchState.value));
  void (custom ? supportViews.loadCustom() : supportViews.load(readSupportViewSelection(route.query)));
});
watch(canCreateSavedViews, (allowed) => {
  if (!allowed) supportViewIntentKeys.clear();
});

watch(canManageRoutingOffers, (allowed) => {
  if (!allowed) {
    assignment.resetOffers();
    return;
  }
  void assignment.loadOffers();
});

watch([canManageOwnAssignments, canOverrideAssignments], ([canOwn, canOverride]) => {
  if (!canOwn && !canOverride) {
    assignment.resetCase();
    leadAssignment.reset();
    return;
  }
  if (!canOverride) leadAssignment.reset();
  void assignment.loadCase();
});

watch(canReadSelectedAiSuspension, (allowed) => {
  if (allowed) {
    reloadSelectedAiSuspension();
    return;
  }
  aiSuspensionDialogVisible.value = false;
  aiSuspensionHistoryVisible.value = false;
});

watch(canReadSelectedInternalNotes, (allowed) => {
  if (allowed) return;
  internalNotesVisible.value = false;
  internalNotes.reset();
});

watch(canReadSelectedInternalNoteHistory, (allowed) => {
  if (!allowed) internalNotes.closeHistory();
});

watch(
  [
    internalNotesVisible,
    canReadSelectedInternalNotes,
    selectedInternalNotesAuthorityKey,
  ],
  syncInternalNotesReconciliation,
);

watch(selectedAiSuspensionKey, (selectionKey, previousSelectionKey) => {
  if (selectionKey === previousSelectionKey) return;
  aiSuspensionDialogVisible.value = false;
  aiSuspensionHistoryVisible.value = false;
  aiSuspensionAccessDenied.value = false;
  reloadSelectedAiSuspension();
});

watch(
  () => selectedAiSuspensionError.value?.kind,
  (kind) => {
    if (kind !== "FORBIDDEN" && kind !== "NOT_FOUND") return;
    revokeSelectedAiSuspensionAccess();
  },
);

watch(
  selectedInternalNotesAuthorityKey,
  (authorityKey, previousAuthorityKey) => {
    if (authorityKey === previousAuthorityKey) return;
    internalNotesAccessDenied.value = false;
    internalNotesVisible.value = false;
    internalNotes.reset();
  },
);

watch(selectedAssignmentAuthorityKey, (authorityKey, previousAuthorityKey) => {
  if (authorityKey === previousAuthorityKey) return;
  const caseId = authorityKey.split("\u0000", 1)[0];
  const previousCaseId = previousAuthorityKey?.split("\u0000", 1)[0];
  if (caseId !== previousCaseId || !assignment.mutating.value)
    assignment.resetCase();
  if (caseId !== previousCaseId) leadAssignment.reset();
  if (canManageOwnAssignments.value || canOverrideAssignments.value)
    void assignment.loadCase();
});

watch(
  selectedCaseDeskAuthorityKey,
  async (authorityKey, previousAuthorityKey) => {
    if (authorityKey === previousAuthorityKey) return;
    caseDesk.reset();
    if (canReadSelectedCaseDesk.value) await caseDesk.load().catch(() => undefined);
  },
  { immediate: true },
);

watch(
  selectedCaseDeskFreshnessKey,
  async (freshnessKey, previousFreshnessKey) => {
    if (
      freshnessKey === previousFreshnessKey ||
      !canReadSelectedCaseDesk.value ||
      caseDesk.mutating.value ||
      caseDesk.exactCase.value?.id !== conversation.selection.value?.case?.id
    )
      return;
    await caseDesk.load().catch(() => undefined);
  },
);

watch(inboxMode, async () => {
  inbox.reset();
  await inbox.load();
});

watch(
  () => route.query,
  (query) => {
    const next = readSupportSearchRoute(query);
    if (
      JSON.stringify(writeSupportSearchRoute(next)) ===
      JSON.stringify(writeSupportSearchRoute(searchState.value))
    )
      return;
    clearSupportSearchTimer();
    searchState.value = next;
    searchOpen.value = hasSupportSearchCriteria(next);
    supportSearch.reset();
    if (searchOpen.value) void supportSearch.search();
  },
  { deep: true },
);

watch(
  () => route.query.view,
  () => {
    const custom = shouldLoadCustomSupportView(route.query, hasSupportSearchCriteria(readSupportSearchRoute(route.query)));
    if (custom) {
      searchOpen.value = true;
      if (supportViews.selection.value && canSearchSupport.value) void supportViews.loadCustom();
      return;
    }
    const requested = readSupportViewSelection(route.query);
    const current = supportViews.selection.value;
    const same = requested?.kind === current?.kind && (requested?.kind === "SYSTEM"
      ? requested.code === (current?.kind === "SYSTEM" ? current.code : undefined)
      : requested?.id === (current?.kind === "SAVED" ? current.id : undefined));
    if (!same && canSearchSupport.value) void supportViews.load(requested);
  },
);

watch(
  requestedSelectionKey,
  (selectionKey, previousSelectionKey) => {
    if (selectionKey) lastInboxSelectionKey.value = selectionKey;
    if (!selectionKey && previousSelectionKey && isMobileWorkspace.value) {
      void nextTick(() => {
        [...document.querySelectorAll<HTMLElement>("[data-selection-key]")]
          .find(
            (element) => element.dataset.selectionKey === previousSelectionKey,
          )
          ?.focus({ preventScroll: true });
      });
    }
    contextDrawerVisible.value = false;
    profileAccessDenied.value = false;
    assignmentAccessDenied.value = false;
    aiSuspensionAccessDenied.value = false;
    internalNotesAccessDenied.value = false;
    aiSuspensionDialogVisible.value = false;
    aiSuspensionHistoryVisible.value = false;
    internalNotesVisible.value = false;
    assignment.resetCase();
    profile.reset();
    internalNotes.reset();
    messageDelivery.reset();
    void conversation.load();
  },
  { immediate: true },
);

watch(mobileInspectorRequested, (requested, previousRequested) => {
  if (requested && !requestedSelectionKey.value) {
    const query = { ...route.query };
    delete query.panel;
    void router.replace({ query });
    return;
  }
  if (!requested && previousRequested) {
    void nextTick(() => {
      if (contextDrawerVisible.value) return;
      const trigger =
        contextTrigger ??
        document.querySelector<HTMLElement>(
          ".conversation-pane .mobile-context",
        );
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
  }
});

watch(mobileInspectorVisible, (visible) => {
  if (!visible) return;
  void nextTick(() => {
    document
      .querySelector<HTMLElement>(".mobile-inspector-back")
      ?.focus({ preventScroll: true });
  });
});

watch(contextDrawerVisible, (visible, previousVisible) => {
  if (visible || !previousVisible) return;
  void nextTick(() => {
    if (contextTrigger?.isConnected)
      contextTrigger.focus({ preventScroll: true });
  });
});

watch(
  [
    () => conversation.selection.value?.conversation?.id,
    () => conversation.selection.value?.endUser.id,
  ],
  () => {
    reply.syncSelection();
    if (reply.outcomeState.value === "CHECKING_OUTCOME")
      void reply.checkOutcome();
    replyTranslationRequested.value = false;
    replyTemplateGalleryVisible.value = false;
    translationSettingsVisible.value = false;
    setSendWithoutTranslationVisible(false);
    messageViewMode.value = "ORIGINAL";
    translation.reset();
    if (canManageTranslation.value) void ensureReplyTranslationLoaded();
  },
);

watch(
  () => reply.draft.value,
  (draft) => {
    if (!draft.trim()) {
      replyTranslationRequested.value = false;
      setSendWithoutTranslationVisible(false);
    }
  },
);

watch(
  () => reply.translationRequired.value,
  (required) => {
    if (required) replyTranslationRequested.value = true;
  },
);

watch(
  [
    () => auth.project?.id,
    () => conversation.selection.value?.conversation?.id,
  ],
  ([projectId, conversationId]) => {
    void workspaceLive
      .setSelection(projectId, conversationId)
      .catch(() => undefined);
  },
  { immediate: true },
);

watch(canReadProfile, (allowed) => {
  if (!allowed) profile.reset();
});

onBeforeUnmount(() => {
  clearSupportSearchTimer();
  window.removeEventListener("keydown", handleWorkspaceKeydown);
  mobileWorkspaceMedia?.removeEventListener("change", syncMobileWorkspace);
  compactWorkspaceMedia?.removeEventListener("change", syncCompactWorkspace);
  mobileWorkspaceMedia = null;
  compactWorkspaceMedia = null;
  stopInternalNotesReconciliation();
  profile.reset();
  internalNotes.reset();
  reply.reset();
  replyTemplateGalleryVisible.value = false;
  translation.reset();
  setSendWithoutTranslationVisible(false);
  workspaceLive.dispose();
  availability.reset();
  assignment.reset();
  leadAssignment.reset();
  aiSuspensionDialogVisible.value = false;
  aiSuspensionHistoryVisible.value = false;
  inbox.reset();
  supportSearch.reset();
  supportViews.reset();
  supportViewIntentKeys.clear();
  conversation.reset();
});
</script>

<template>
  <FullViewportWorkspaceShell
    :mode="workspaceFullscreen ? 'full-tab' : 'windowed'"
    @transitioning="handleWorkspacePresentationTransition"
    @presented="handleWorkspacePresented"
  >
    <section
      class="page support-workspace-page"
      :class="{
        'support-workspace-page--full-tab': workspacePresentedFullscreen,
      }"
    >
      <header class="page-header support-workspace-header">
        <div class="support-workspace-title">
          <span class="support-workspace-title__icon">
            <i class="pi pi-headphones" aria-hidden="true" />
          </span>
          <div>
            <h1>Поддержка</h1>
            <p>Рабочее место оператора</p>
          </div>
        </div>
        <div class="header-actions">
          <Tag :value="workspaceLiveLabel" :severity="workspaceLiveSeverity" />
          <Button
            v-if="canReadAvailability"
            label="Моя доступность"
            icon="pi pi-user"
            severity="secondary"
            outlined
            @click="availabilityDialogVisible = true"
          />
          <Button
            :label="workspaceFullscreen ? 'Свернуть' : 'На весь экран'"
            :icon="
              workspaceFullscreen
                ? 'pi pi-window-minimize'
                : 'pi pi-window-maximize'
            "
            severity="secondary"
            outlined
            :disabled="workspacePresentationTransitioning"
            @click="setWorkspaceFullscreen(!workspaceFullscreen, $event)"
          />
          <Button
            label="Обновить"
            icon="pi pi-refresh"
            severity="secondary"
            outlined
            :loading="
              inbox.loading.value ||
              conversation.loading.value ||
              availability.loading.value ||
              availability.changing.value ||
              assignment.caseLoading.value ||
              assignment.offerLoading.value ||
              assignment.mutating.value ||
              Boolean(assignment.offerChangingId.value)
            "
            @click="reload"
          />
        </div>
      </header>

      <SupportAssignmentOfferTray
        v-if="canManageRoutingOffers"
        :controller="assignment"
      />

      <div
        class="support-workspace card"
        :class="{
          'has-route-selection': Boolean(requestedSelectionKey),
          'has-mobile-inspector': mobileInspectorVisible,
        }"
      >
        <SupportInboxPane
          :mode="inboxMode"
          :items="inbox.items.value"
          :selected-key="selectedInboxKey"
          :loading="inbox.loading.value"
          :error="inbox.error.value"
          :failure="inbox.failure.value"
          :has-more="Boolean(inbox.nextCursor.value)"
          :can-read-cases="canReadInbox"
          :can-read-conversations="canReadInbox"
          :can-search="canSearchSupport"
          :search-state="searchState"
          :search-active="searchActive"
          :search-items="viewActive ? supportViews.items.value : supportSearch.items.value"
          :search-loading="viewActive ? supportViews.loading.value : supportSearch.loading.value"
          :search-error="viewActive ? supportViews.error.value : supportSearchVisibleError"
          :search-failure="supportSearch.failure.value"
          :search-freshness="viewActive ? supportViews.freshness.value : supportSearch.freshness.value"
          :search-has-more="Boolean(viewActive ? supportViews.nextCursor.value : supportSearch.nextCursor.value)"
          :view-system="supportViews.system.value"
          :view-saved="supportViews.saved.value"
          :view-selection="supportViews.selection.value"
          :view-can-create="canCreateSavedViews"
          :view-can-manage-all="canManageAllSavedViews"
          :view-mutating="supportViews.mutating.value"
          :view-conflict="supportViews.conflict.value"
          :view-active="viewActive"
          @select="openInboxItem"
          @change-mode="changeInboxMode"
          @load-more="inbox.loadMore"
          @retry="inbox.load"
          @change-search="changeSupportSearch"
          @submit-search="runSupportSearch"
          @close-search="closeSupportSearch"
          @select-search="openSupportSearchResult"
          @load-more-search="viewActive ? supportViews.loadMore() : supportSearch.loadMore()"
          @select-view="selectSupportView"
          @create-view="createSupportView"
          @replace-view="replaceSupportView"
          @publish-view="publishSupportView"
          @archive-view="archiveSupportView"
          @default-view="setDefaultSupportView"
          @custom-search="startCustomSupportSearch"
        />

        <main class="conversation-pane" aria-label="Выбранный диалог">
          <template v-if="selectedConversation">
            <header class="conversation-header">
              <div>
                <Button
                  class="mobile-back"
                  label="Назад к списку диалогов"
                  icon="pi pi-arrow-left"
                  severity="secondary"
                  text
                  @click="backToInbox"
                />
                <span class="eyebrow">{{
                  selectedCase
                    ? `Обращение #${selectedCase.projectSequence}`
                    : selectedConversation.status === "OPEN"
                      ? "Активный диалог"
                      : "Архивный диалог"
                }}</span>
                <h2>{{ selectedCase?.title ?? selectedConversation.title }}</h2>
                <p>
                  {{
                    selectedCase
                      ? `${selectedCase.groupCode} · ${selectedConversation.title}`
                      : "Безопасный контекст доступен в панели диалога."
                  }}
                </p>
              </div>
              <div class="conversation-header__actions">
                <Button
                  class="mobile-context"
                  label="Контекст"
                  icon="pi pi-user"
                  severity="secondary"
                  text
                  @click="openConversationContext"
                />
                <Tag
                  :value="
                    selectedConversation.status === 'OPEN' ? 'Активен' : 'Архив'
                  "
                  :severity="
                    selectedConversation.status === 'OPEN'
                      ? 'success'
                      : 'secondary'
                  "
                />
              </div>
            </header>

            <ConversationAISuspensionBanner
              v-if="canReadSelectedAiSuspension && selectedAiSuspensionEntry"
              :entry="selectedAiSuspensionEntry"
              :can-manage="canManageSelectedAiSuspension"
              :conversation-open="selectedConversation.status === 'OPEN'"
              :show-history="canReadSelectedAiSuspension"
              @extend="openAiSuspensionDialog('EXTEND')"
              @resume="openAiSuspensionDialog('RESUME')"
              @history="aiSuspensionHistoryVisible = true"
            />

            <div
              v-if="conversation.loading.value"
              class="message-skeletons"
              aria-busy="true"
            >
              <Skeleton
                v-for="index in 5"
                :key="index"
                height="64px"
                border-radius="14px"
              />
            </div>
            <Message
              v-else-if="conversation.error.value"
              severity="error"
              :closable="false"
            >
              {{ conversation.error.value }}
            </Message>
            <SupportConversationPane
              v-else-if="conversation.selection.value"
              :title="selectedConversation.title"
              :messages="conversation.messages.value"
              :translations="translation.messageTranslations.value"
              :assistant-label="auth.project?.assistantName ?? 'Lola'"
              :history="supportConversationHistory"
              :translation="supportConversationTranslation"
              :composer="supportConversationComposer"
              :ai-suspension="supportConversationAiSuspension"
              :delivery-actions="messageDelivery.deliveryActions.value"
              @load-older="conversation.loadOlder"
              @load-newer="conversation.loadNewer"
              @visible-high-water="conversation.markVisible"
              @cancel-translation="translation.cancelMessageTranslations"
              @change-translation-mode="changeSupportTranslationMode"
              @reconcile-required="reconcileSupportSurface"
              @draft-change="changeSupportDraft"
              @send="sendSupportReply"
              @request-reply-translation="prepareReplyTranslation"
              @reconcile-reply-translation="translation.reconcileReplyPreview"
              @retry-reply-translation="translation.retryReplyPreview"
              @save-reply-translation="translation.editReplyTranslation"
              @send-reply-translation="sendSupportTranslatedReply"
              @check-send-outcome="reply.checkOutcome"
              @discard-send-attempt="reply.discardBlockedAttempt"
              @composer-action="handleSupportComposerAction"
              @start-ai-suspension="openAiSuspensionDialog('START')"
              @show-ai-suspension-history="aiSuspensionHistoryVisible = true"
              @retry-ai-suspension="reloadSelectedAiSuspension"
              @retry-delivery="messageDelivery.retry"
            />
            <p v-else class="empty-pane support-conversation-unavailable">
              Выбранный диалог недоступен.
            </p>
            <Message
              v-if="reply.error.value && reply.outcomeState.value === 'IDLE'"
              severity="error"
              :closable="false"
              class="support-reply-error"
              role="alert"
            >
              {{ reply.error.value }}
            </Message>
            <ConversationTemplateGallery
              :visible="replyTemplateGalleryVisible"
              :templates="defaultConversationReplyTemplates"
              @close="replyTemplateGalleryVisible = false"
              @select="applySupportReplyTemplate"
            />
            <Message
              v-if="canManageTranslation && translation.error.value"
              severity="error"
              :closable="false"
              class="reply-translation-error"
            >
              {{ translation.error.value }}
            </Message>
            <div
              v-if="canManageTranslation && translationSettingsVisible"
              class="reply-translation-settings"
            >
              <ConversationTranslationBanner
                :state="translation.state.value"
                :loading="translation.loading.value"
                :saving="translation.savingPreference.value"
                :can-manage="canManageTranslation"
                :eligible-count="0"
                @reload="ensureReplyTranslationLoaded"
                @update-enabled="setTranslationEnabled($event)"
                @update-target-locale="setTranslationTargetLocale($event)"
              />
            </div>
            <Dialog
              :visible="sendWithoutTranslationVisible"
              modal
              header="Отправить без перевода?"
              :style="{ width: 'min(500px, calc(100vw - 32px))' }"
              @update:visible="setSendWithoutTranslationVisible"
            >
              <div class="send-without-translation">
                <Message severity="warn" :closable="false">
                  Пользователь получит исходный текст вместо
                  {{
                    translation.targetLocale.value
                      ? `перевода на ${translation.targetLocale.value.toUpperCase()}`
                      : "перевода"
                  }}.
                </Message>
                <label for="support-send-without-translation-reason">
                  Причина исключения
                </label>
                <textarea
                  id="support-send-without-translation-reason"
                  v-model="sendWithoutTranslationReason"
                  rows="3"
                  maxlength="500"
                  placeholder="Почему сообщение нужно отправить без перевода?"
                />
                <small>{{ sendWithoutTranslationReason.length }}/500</small>
                <div class="send-without-translation__actions">
                  <Button
                    type="button"
                    label="Отмена"
                    severity="secondary"
                    text
                    @click="setSendWithoutTranslationVisible(false)"
                  />
                  <Button
                    type="button"
                    label="Отправить исходный текст"
                    icon="pi pi-send"
                    severity="danger"
                    :loading="reply.sending.value"
                    :disabled="!sendWithoutTranslationReason.trim()"
                    @click="sendReplyWithoutTranslation"
                  />
                </div>
              </div>
            </Dialog>
          </template>
          <div
            v-else-if="selectedCase && conversation.selection.value"
            class="case-without-conversation"
          >
            <header class="conversation-header">
              <div>
                <Button
                  class="mobile-back"
                  label="Назад к обращениям"
                  icon="pi pi-arrow-left"
                  severity="secondary"
                  text
                  @click="backToInbox"
                />
                <span class="eyebrow"
                  >Обращение #{{ selectedCase.projectSequence }}</span
                >
                <h2>{{ selectedCase.title }}</h2>
                <p>Рабочий контекст обращения загружен с сервера.</p>
              </div>
              <Button
                class="mobile-context"
                label="Контекст"
                icon="pi pi-briefcase"
                severity="secondary"
                text
                @click="openConversationContext"
              />
            </header>
            <div class="case-channel-empty">
              <i class="pi pi-comments" aria-hidden="true" />
              <h2>У обращения нет связанного чата</h2>
              <p>
                Обращение остаётся доступно как отдельный рабочий объект. Чат
                здесь не создаётся и не подменяется другим диалогом.
              </p>
            </div>
          </div>
          <div
            v-else-if="inbox.loading.value || conversation.loading.value"
            class="empty-selection"
            aria-busy="true"
          >
            <Skeleton width="180px" height="24px" />
            <Skeleton width="240px" height="16px" />
          </div>
          <div v-else class="empty-selection">
            <i class="pi pi-comments" aria-hidden="true" />
            <template v-if="route.params.conversationId || route.params.caseId">
              <h2>
                {{
                  route.params.caseId
                    ? "Обращение недоступно"
                    : "Диалог недоступен"
                }}
              </h2>
              <p>Он не найден или у вас больше нет прав на его просмотр.</p>
            </template>
            <template v-else>
              <h2>Выберите элемент входящих</h2>
              <p>История и безопасный контекст появятся здесь.</p>
            </template>
          </div>
        </main>

        <ResponsiveWorkspaceInspector
          v-if="conversation.selection.value"
          :mode="workspaceInspectorMode"
          :mobile-visible="mobileInspectorVisible"
          :drawer-visible="contextDrawerVisible"
          @close-mobile="closeMobileInspector"
          @update:drawer-visible="contextDrawerVisible = $event"
        >
          <SupportConversationContext
            ref="supportContext"
            :conversation="selectedConversation"
            :selection="conversation.selection.value"
            :case-desk="caseDesk"
            :can-read-case-desk="canReadSelectedCaseDesk"
            :can-manage-case="canManageSelectedCase"
            :assignment-controller="assignmentSurfaceController"
            :lead-assignment-controller="leadAssignmentSurfaceController"
            :availability-label="assignmentAvailabilityLabel"
            :can-read-internal-notes="canReadSelectedInternalNotes"
            :can-read-profile="canReadProfile"
            :profile="profile.profile.value"
            :profile-loading="profile.loading.value"
            :profile-error="profile.error.value"
            @load-profile="profile.load"
            @open-internal-notes="openInternalNotes"
            @classify-case="classifySelectedCase"
          />
        </ResponsiveWorkspaceInspector>
      </div>
      <Dialog
        v-if="canReadAvailability"
        v-model:visible="availabilityDialogVisible"
        modal
        header="Моя доступность"
        :style="{ width: 'min(680px, calc(100vw - 32px))' }"
      >
        <SupportAvailabilityStatus
          :availability="availability.availability.value"
          :loading="availability.loading.value"
          :changing="availability.changing.value"
          :error="availability.error.value"
          :can-manage="canManageOwnAvailability"
          :unknown-outcome="availability.unknownOutcome.value"
          :needs-reconcile="availability.needsReconcile.value"
          :can-retry-after-reconcile="availability.canRetryAfterReconcile.value"
          :draft="availability.draft.value"
          @refresh="availability.load"
          @change="availability.change"
          @retry="availability.retryUnknownOutcome"
          @retry-after-reconcile="availability.retryAfterReconcile"
        />
      </Dialog>
      <SupportInternalNotesDialog
        v-if="
          canReadSelectedInternalNotes && conversation.selection.value?.case
        "
        v-model:visible="internalNotesVisible"
        :notes="internalNotes.notes.value"
        :next-cursor="internalNotes.nextCursor.value"
        :loading="internalNotes.loading.value"
        :loading-more="internalNotes.loadingMore.value"
        :error="internalNotes.error.value"
        :can-read-history="canReadSelectedInternalNoteHistory"
        :can-write="canWriteSelectedInternalNotes"
        :can-redact="canRedactSelectedInternalNotes"
        :creating="internalNotes.creating.value"
        :correcting-note-id="internalNotes.correctingNoteId.value"
        :tombstoning-note-id="internalNotes.tombstoningNoteId.value"
        :mutation-error="internalNotes.mutationError.value"
        :selected-history-note="internalNotes.selectedHistoryNote.value"
        :history="internalNotes.history.value"
        :history-next-cursor="internalNotes.historyNextCursor.value"
        :history-loading="internalNotes.historyLoading.value"
        :history-loading-more="internalNotes.historyLoadingMore.value"
        :history-error="internalNotes.historyError.value"
        @reload="internalNotes.load"
        @load-more="
          internalNotes.load(internalNotes.nextCursor.value ?? undefined)
        "
        @open-history="internalNotes.openHistory"
        @close-history="internalNotes.closeHistory"
        @load-history-more="
          internalNotes.loadHistory(
            internalNotes.historyNextCursor.value ?? undefined,
          )
        "
        @create="createInternalNote"
        @correct="correctInternalNote"
        @tombstone="tombstoneInternalNote"
      />
      <ConversationAISuspensionDialog
        v-if="
          canManageSelectedAiSuspension &&
          selectedConversation &&
          selectedAiSuspensionEntry
        "
        v-model:visible="aiSuspensionDialogVisible"
        :mode="aiSuspensionDialogMode"
        :conversation-label="selectedConversation.title"
        :current="selectedAiSuspensionEntry.detail ?? null"
        :server-offset-ms="selectedAiSuspensionEntry.serverOffsetMs"
        :busy="Boolean(selectedAiSuspensionEntry.mutating)"
        :error="selectedAiSuspensionEntry.error"
        @submit="submitAiSuspension"
      />
      <ConversationAISuspensionHistory
        v-if="
          canReadSelectedAiSuspension &&
          selectedConversation &&
          conversation.selection.value
        "
        v-model:visible="aiSuspensionHistoryVisible"
        :project-id="auth.project?.id ?? ''"
        :end-user-id="conversation.selection.value.endUser.id"
        :conversation-id="selectedConversation.id"
        @access-revoked="revokeSelectedAiSuspensionAccess"
      />
    </section>
  </FullViewportWorkspaceShell>
</template>

<style scoped>
.support-workspace-header,
.header-actions,
.pane-heading,
.conversation-row__top,
.conversation-header,
.conversation-header__actions {
  display: flex;
  align-items: center;
}
.support-workspace-header,
.conversation-header,
.pane-heading,
.conversation-row__top {
  justify-content: space-between;
}
.header-actions {
  gap: 10px;
  flex-wrap: wrap;
}
.conversation-header__actions {
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.support-workspace-page {
  min-width: 0;
}
.support-workspace-header {
  margin-bottom: 14px;
}
.support-workspace-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.support-workspace-title__icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: var(--brand-soft);
  color: var(--brand);
}
.support-workspace-header h1 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 650;
}
.support-workspace-title p {
  margin: 2px 0 0;
  color: var(--text-muted);
  font-size: 0.75rem;
}
.support-workspace-page--full-tab {
  width: 100%;
  max-width: none;
  height: 100%;
  margin: 0;
  padding: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-canvas);
}
.support-workspace-page--full-tab .support-workspace-header {
  flex: 0 0 auto;
}
.support-workspace-page--full-tab .support-workspace {
  height: auto;
  min-height: 0;
  flex: 1 1 auto;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.support-workspace {
  height: calc(100dvh - 150px);
  min-height: 620px;
  padding: 0;
  display: grid;
  grid-template-columns: minmax(270px, 310px) minmax(480px, 1fr) minmax(
      320px,
      360px
    );
  overflow: hidden;
  border-color: color-mix(in srgb, var(--line) 82%, transparent);
  box-shadow: var(--shadow-raised);
}
.pane-heading {
  gap: 12px;
  margin-bottom: 16px;
}
.pane-heading h2,
.conversation-header h2,
.empty-selection h2 {
  margin: 0;
  font-size: 1.05rem;
}
.inbox-count {
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: var(--surface-muted);
  font-weight: 700;
}
.queue-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0 2px 14px;
  padding: 9px 10px;
  border-radius: 10px;
  background: var(--surface-muted);
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 700;
}
.queue-summary span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.queue-summary small {
  color: var(--text-muted);
  font-size: 0.62rem;
  font-weight: 600;
}
.conversation-list,
.inbox-skeletons,
.message-skeletons {
  display: grid;
  gap: 8px;
}
.conversation-list > :deep(.p-button),
.load-older {
  justify-self: start;
}
.conversation-row {
  box-sizing: border-box;
  width: 100%;
  padding: 12px 12px 12px 10px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    transform 160ms ease;
}
.conversation-row:hover {
  background: var(--surface-muted);
}
.conversation-row:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 2px;
}
.conversation-row.selected {
  background: var(--brand-soft);
  border-color: color-mix(in srgb, var(--brand) 32%, var(--line));
  box-shadow: inset 3px 0 0 var(--brand);
}
.conversation-row strong {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conversation-row__top {
  gap: 8px;
}
.conversation-row time {
  flex: 0 0 auto;
  white-space: nowrap;
}
.conversation-avatar {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: var(--surface-muted);
  color: var(--text-secondary);
  font-size: 0.64rem;
  font-weight: 800;
}
.conversation-row.selected .conversation-avatar {
  background: var(--brand);
  color: var(--on-brand);
}
.conversation-row time,
.conversation-row__meta,
.conversation-header p {
  color: var(--text-muted);
  font-size: 0.78rem;
}
.conversation-row p {
  margin: 8px 0 9px 36px;
  color: var(--text-muted);
  font-size: 0.85rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.conversation-row__meta {
  margin-left: 36px;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  white-space: nowrap;
}
.conversation-state {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--surface-muted);
  color: var(--text-secondary);
  font-size: 0.64rem;
  font-weight: 700;
}
.conversation-state.open {
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.conversation-pane {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface-base);
}
.case-without-conversation {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.case-channel-empty {
  min-height: 0;
  flex: 1;
  padding: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-secondary);
  text-align: center;
  background: radial-gradient(
    circle at center,
    var(--brand-soft),
    transparent 46%
  );
}
.case-channel-empty i {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: var(--surface-card);
  color: var(--brand);
  box-shadow: var(--shadow-subtle);
  font-size: 1.2rem;
}
.case-channel-empty h2,
.case-channel-empty p {
  margin: 0;
}
.case-channel-empty h2 {
  color: var(--text-primary);
  font-size: 1rem;
}
.case-channel-empty p {
  max-width: 460px;
  font-size: 0.84rem;
  line-height: 1.55;
}
.conversation-header {
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
}
.conversation-header p {
  margin: 4px 0 0;
}
.mobile-back {
  display: none;
}
.mobile-context {
  display: none;
}
.message-skeletons {
  padding: 22px;
}
.support-conversation-pane {
  min-height: 0;
  height: auto;
  flex: 1;
}
.support-reply-error {
  flex: 0 0 auto;
  margin: 0 12px 12px;
}
.support-conversation-unavailable {
  padding: 24px;
}
.reply-translation-settings {
  padding-top: 2px;
}
.send-without-translation {
  display: grid;
  gap: 12px;
}
.send-without-translation label {
  font-weight: 600;
}
.send-without-translation textarea {
  width: 100%;
  min-height: 88px;
  resize: vertical;
}
.send-without-translation small {
  color: var(--text-muted);
  font-size: 0.75rem;
  text-align: right;
}
.send-without-translation__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.empty-pane {
  color: var(--text-muted);
  line-height: 1.5;
}
.empty-selection {
  min-height: 320px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 8px;
  padding: 32px;
  text-align: center;
  color: var(--text-muted);
}
.empty-selection i {
  font-size: 2rem;
  color: var(--brand);
}
.empty-selection p {
  margin: 0;
}
@media (max-width: 1279px) {
  .support-workspace {
    grid-template-columns: minmax(230px, 300px) minmax(0, 1fr);
  }
  .mobile-context {
    display: inline-flex;
  }
}
@media (max-width: 767px) {
  .support-workspace-page--full-tab {
    padding: 0;
  }
  .support-workspace-page--full-tab .support-workspace-header {
    margin: 0;
    padding: 8px 10px;
    gap: 8px;
  }
  .support-workspace-page--full-tab
    .support-workspace-header
    > div:first-child {
    width: 100%;
  }
  .support-workspace-page--full-tab .support-workspace-header h1 {
    margin: 0;
    font-size: 1rem;
  }
  .support-workspace-page--full-tab .header-actions {
    width: 100%;
    flex-wrap: nowrap;
    gap: 6px;
  }
  .support-workspace-page--full-tab .header-actions :deep(.p-tag) {
    margin-right: auto;
  }
  .support-workspace-page--full-tab .header-actions :deep(.p-button) {
    width: 40px;
    min-width: 40px;
    height: 40px;
    padding: 0;
  }
  .support-workspace-page--full-tab .header-actions :deep(.p-button-label) {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .support-workspace {
    display: block;
    height: auto;
  }
  .support-workspace-page--full-tab .support-workspace {
    height: auto;
    display: block;
  }
  .support-workspace-page--full-tab
    .support-workspace.has-route-selection
    .conversation-pane,
  .support-workspace-page--full-tab
    .support-workspace:not(.has-route-selection)
    .support-inbox-pane {
    height: 100%;
  }
  .support-workspace:not(.has-route-selection) .conversation-pane,
  .support-workspace.has-route-selection .support-inbox-pane {
    display: none;
  }
  .support-workspace.has-mobile-inspector .conversation-pane {
    display: none;
  }
  .support-inbox-pane {
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .conversation-list {
    max-height: 260px;
    overflow-x: hidden;
    overflow-y: auto;
  }
  .conversation-header {
    align-items: flex-start;
    padding: 16px;
  }
  .support-workspace-page--full-tab .conversation-header {
    min-height: 48px;
    align-items: center;
    padding: 4px 8px;
  }
  .support-workspace-page--full-tab
    .conversation-header
    > div:first-child
    > :not(.mobile-back) {
    display: none;
  }
  .support-workspace-page--full-tab .mobile-back {
    width: 40px;
    height: 40px;
    margin: 0;
    padding: 0;
  }
  .support-workspace-page--full-tab .mobile-back :deep(.p-button-label) {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .conversation-header__actions {
    justify-content: flex-end;
  }
  .mobile-back {
    display: inline-flex;
    margin: -8px 0 8px -8px;
  }
  .mobile-context {
    display: inline-flex;
  }
  .message-skeletons {
    padding: 16px;
  }
}
</style>
