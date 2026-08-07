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
import Avatar from "primevue/avatar";
import Dialog from "primevue/dialog";
import Drawer from "primevue/drawer";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import { useAuthStore } from "@/features/auth/auth.store";
import { hasProjectPermission } from "@/features/auth/permission-access";
import { useEndUserCasesStore } from "@/features/end-user-cases/model/end-user-cases.store";
import EndUserCaseDialogs from "@/features/end-user-cases/ui/EndUserCaseDialogs.vue";
import { useConversationAISuspensionStore } from "@/features/conversation-ai-suspension/model/conversation-ai-suspension.store";
import ConversationAISuspensionBanner from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionBanner.vue";
import ConversationAISuspensionDialog from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionDialog.vue";
import ConversationAISuspensionHeaderActions from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionHeaderActions.vue";
import ConversationAISuspensionHistory from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionHistory.vue";
import { createConversationTranslationController } from "@/features/conversation-translation/model/use-conversation-translation";
import { isFrontendTranslationCandidate } from "@/features/conversation-translation/model/translation-eligibility";
import ConversationTranslationBanner from "@/features/conversation-translation/ui/ConversationTranslationBanner.vue";
import TranslatedMessageBody from "@/features/conversation-translation/ui/TranslatedMessageBody.vue";
import type {
  ConversationSurfaceComposer,
  ConversationSurfaceComposerAction,
} from "@/features/conversation-surface/model/conversation-surface-contract";
import { createSupportConversationController } from "@/features/support-conversation/model/use-support-conversation";
import SupportMessageDeliveryStatus from "@/features/support-conversation/ui/SupportMessageDeliveryStatus.vue";
import { createSupportInboxController } from "@/features/support-inbox/model/use-support-inbox";
import { createSupportReplyController } from "@/features/support-reply/model/use-support-reply";
import SupportReplyComposer from "@/features/support-reply/ui/SupportReplyComposer.vue";
import { supportAssignmentReleaseSource } from "@/features/support-case-assignment/api/support-assignment-release-source";
import { createSupportAssignmentReleaseController } from "@/features/support-case-assignment/model/use-support-assignment-release";
import { supportAvailabilitySource } from "@/features/support-availability/api/support-availability-source";
import { createSupportAvailabilityController } from "@/features/support-availability/model/use-support-availability";
import SupportAvailabilityStatus from "@/features/support-availability/ui/SupportAvailabilityStatus.vue";
import { supportInternalNotesSource } from "@/features/support-internal-notes/api/support-internal-notes-source";
import { createSupportInternalNotesController } from "@/features/support-internal-notes/model/use-support-internal-notes";
import SupportInternalNotesDialog from "@/features/support-internal-notes/ui/SupportInternalNotesDialog.vue";
import { supportRoutingOfferSource } from "@/features/support-routing-offers/api/support-routing-offer-source";
import { createSupportRoutingOffersController } from "@/features/support-routing-offers/model/use-support-routing-offers";
import SupportRoutingOffers from "@/features/support-routing-offers/ui/SupportRoutingOffers.vue";
import { supportWorkspaceSource } from "@/features/support-workspace/api/support-workspace-source";
import {
  canManageOwnSupportAvailability,
  canManageSupportConversationAiSuspension,
  canReceiveSupportRoutingOffers,
  canReadSupportConversationAiSuspension,
  canReadSupportInternalNoteHistory,
  canReadSupportInternalNotes,
  canReleaseSupportCaseAssignment,
} from "@/features/support-workspace/model/support-workspace-access";
import { supportUserProfileSource } from "@/features/support-workspace/api/support-user-profile-source";
import SupportConversationContext from "@/features/support-workspace/ui/SupportConversationContext.vue";
import { createSupportUserProfileController } from "@/features/support-user-profile/model/use-support-user-profile";
import { createSupportWorkspaceLiveController } from "@/features/support-workspace/model/use-support-workspace-live";
import { relativeTime } from "@/shared/lib/format";
import { repository } from "@/shared/api/repository";
import { cmsRealtimeClient } from "@/shared/realtime/cms-realtime-client";
import type { ConversationMessage } from "@/shared/types/domain";
import type {
  ExtendConversationAISuspensionDto,
  ResumeConversationAIDto,
  StartConversationAISuspensionDto,
} from "@/shared/api/generated/models";
import { conversationAISuspensionEnabled } from "@/shared/config/features";

const auth = useAuthStore();
const endUserCases = useEndUserCasesStore();
const aiSuspension = useConversationAISuspensionStore();
const route = useRoute();
const router = useRouter();
const inbox = createSupportInboxController(
  { projectId: () => auth.project?.id },
  supportWorkspaceSource,
);
const availabilityDialogVisible = ref(false);
const caseDialogs = ref<InstanceType<typeof EndUserCaseDialogs> | null>(null);
const workspaceFullscreen = ref(false);

const routeConversationId = computed(() => {
  const routeId = route.params.conversationId;
  return typeof routeId === "string" ? routeId : undefined;
});
const requestedConversationId = computed(
  () => routeConversationId.value ?? inbox.items.value[0]?.id,
);
const conversation = createSupportConversationController(
  {
    projectId: () => auth.project?.id,
    conversationId: () => requestedConversationId.value,
    onForbidden: handleConversationForbidden,
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
    recipientStatus: null,
    actions: {
      attachment: {
        visibility: "HIDDEN",
      },
      createTicket: {
        visibility: "HIDDEN",
      },
      templates: {
        visibility: "HIDDEN",
      },
      improveWithAI: {
        visibility: "HIDDEN",
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
  if (routeConversationId.value)
    return conversation.selection.value?.conversation ?? null;
  return (
    conversation.selection.value?.conversation ?? inbox.items.value[0] ?? null
  );
});
const selectedAssignmentAuthorityKey = computed(() => {
  const supportCase = conversation.selection.value?.case;
  const assignment = supportCase?.assignment;
  return [
    supportCase?.id ?? "",
    assignment?.id ?? "",
    assignment?.version ?? "",
    assignment?.actionEtag ?? "",
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
const canManageSelectedCase = computed(
  () =>
    Boolean(conversation.selection.value?.case) &&
    Boolean(conversation.selection.value?.capabilities.manageCase) &&
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      "project.cases.manage",
    ),
);
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
const assignmentReleaseAccessDenied = ref(false);
const canReleaseSelectedAssignment = computed(
  () =>
    !assignmentReleaseAccessDenied.value &&
    canReleaseSupportCaseAssignment(
      auth.project?.effectivePermissionCodes ?? [],
      auth.user?.id,
      conversation.selection.value?.case?.assignment?.operatorId,
    ),
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
const routingOffersAccessDenied = ref(false);
const canManageRoutingOffers = computed(
  () =>
    !routingOffersAccessDenied.value &&
    canReceiveSupportRoutingOffers(
      auth.project?.effectivePermissionCodes ?? [],
    ),
);
const routingOffers = createSupportRoutingOffersController(
  {
    projectId: () => auth.project?.id,
    canManage: () => canManageRoutingOffers.value,
    async onForbidden() {
      routingOffersAccessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // The private offer capabilities have already been purged.
      }
    },
    async onChanged() {
      await Promise.all([inbox.load(), conversation.reconcile()]);
    },
  },
  supportRoutingOfferSource,
);
const assignmentRelease = createSupportAssignmentReleaseController(
  {
    projectId: () => auth.project?.id,
    selection: () => conversation.selection.value,
    canRelease: () => canReleaseSelectedAssignment.value,
    async onForbidden() {
      assignmentReleaseAccessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // The action surface is already hidden until a new authoritative selection.
      }
    },
    async onChanged() {
      await Promise.all([inbox.load(), conversation.reconcile()]);
    },
  },
  supportAssignmentReleaseSource,
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

function messageAuthorName(message: ConversationMessage): string {
  return (
    message.authorSnapshot?.displayName ??
    {
      USER: "Пользователь",
      ASSISTANT: auth.project?.assistantName ?? "Lola",
      ADMIN: "Оператор",
      SCENARIO: "Сценарий",
      SYSTEM: "Система",
    }[message.author]
  );
}

function initials(value: string): string {
  return value
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

async function openConversation(conversationId: string): Promise<void> {
  if (conversationId === routeConversationId.value) return;
  await router.push({
    name: "support-inbox-conversation",
    params: { conversationId },
  });
}

async function classifySelectedCase(): Promise<void> {
  const caseId = conversation.selection.value?.case?.id;
  if (!caseId || !canManageSelectedCase.value) return;
  await endUserCases.open(caseId);
  await nextTick();
  caseDialogs.value?.requestClassification();
}

async function backToInbox(): Promise<void> {
  contextDrawerVisible.value = false;
  await router.push({ name: "support-inbox" });
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
  const currentId = selectedConversation.value?.id;
  const currentIndex = currentId
    ? items.findIndex((item) => item.id === currentId)
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
  if (next) void openConversation(next.id);
}

function handleWorkspaceKeydown(event: KeyboardEvent): void {
  if (workspaceFullscreen.value && event.key === "Escape") {
    event.preventDefault();
    workspaceFullscreen.value = false;
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
  assignmentReleaseAccessDenied.value = false;
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
    canManageRoutingOffers.value ? routingOffers.load() : Promise.resolve(),
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

function handleSupportComposerAction(
  action: ConversationSurfaceComposerAction,
): void {
  if (action === "SEND_WITHOUT_TRANSLATION") {
    setSendWithoutTranslationVisible(true);
  }
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
  translation.reset();
  profile.reset();
  internalNotes.reset();
  assignmentRelease.reset();
  try {
    await auth.refreshContext();
  } catch {
    // The revoked conversation was purged before authority recovery.
  }
  await inbox.load().catch(() => undefined);
  if (routeConversationId.value)
    await router.replace({ name: "support-inbox" });
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
  await inbox.load();
  if (canReadAvailability.value) {
    await availability.load();
    availability.startHeartbeat();
  }
  if (canManageRoutingOffers.value) await routingOffers.load();
});

watch(
  () => auth.project?.id,
  () => {
    contextDrawerVisible.value = false;
    profileAccessDenied.value = false;
    availabilityAccessDenied.value = false;
    routingOffersAccessDenied.value = false;
    assignmentReleaseAccessDenied.value = false;
    aiSuspensionAccessDenied.value = false;
    internalNotesAccessDenied.value = false;
    aiSuspensionDialogVisible.value = false;
    aiSuspensionHistoryVisible.value = false;
    internalNotesVisible.value = false;
    assignmentRelease.reset();
    availability.reset();
    routingOffers.reset();
    profile.reset();
    internalNotes.reset();
    reply.reset();
    replyTranslationRequested.value = false;
    translationSettingsVisible.value = false;
    setSendWithoutTranslationVisible(false);
    messageViewMode.value = "ORIGINAL";
    translation.reset();
    conversation.reset();
    inbox.reset();
    void (async () => {
      await inbox.load();
      if (canReadAvailability.value) {
        await availability.load();
        availability.startHeartbeat();
      }
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

watch(canManageRoutingOffers, (allowed) => {
  if (!allowed) routingOffers.reset();
});

watch(canReleaseSelectedAssignment, (allowed) => {
  if (!allowed) assignmentRelease.reset();
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
  () => conversation.selection.value?.capabilities.releaseAssignment,
  (allowed) => {
    if (!allowed) assignmentRelease.reset();
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
  if (authorityKey !== previousAuthorityKey) assignmentRelease.reset();
});

watch(
  requestedConversationId,
  () => {
    contextDrawerVisible.value = false;
    profileAccessDenied.value = false;
    assignmentReleaseAccessDenied.value = false;
    aiSuspensionAccessDenied.value = false;
    internalNotesAccessDenied.value = false;
    aiSuspensionDialogVisible.value = false;
    aiSuspensionHistoryVisible.value = false;
    internalNotesVisible.value = false;
    assignmentRelease.reset();
    profile.reset();
    internalNotes.reset();
    void conversation.load();
  },
  { immediate: true },
);

watch(
  [
    () => conversation.selection.value?.conversation?.id,
    () => conversation.selection.value?.endUser.id,
  ],
  () => {
    const selected = conversation.selection.value?.conversation;
    if (selected) inbox.upsert(selected);
    reply.syncSelection();
    replyTranslationRequested.value = false;
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
  window.removeEventListener("keydown", handleWorkspaceKeydown);
  stopInternalNotesReconciliation();
  profile.reset();
  internalNotes.reset();
  reply.reset();
  translation.reset();
  setSendWithoutTranslationVisible(false);
  workspaceLive.dispose();
  availability.reset();
  routingOffers.reset();
  assignmentRelease.reset();
  aiSuspensionDialogVisible.value = false;
  aiSuspensionHistoryVisible.value = false;
  inbox.reset();
  conversation.reset();
});
</script>

<template>
  <section
    class="page support-workspace-page"
    :class="{ 'support-workspace-page--fullscreen': workspaceFullscreen }"
  >
    <header class="page-header support-workspace-header">
      <div>
        <div class="eyebrow"><i class="pi pi-headphones" /> Поддержка</div>
        <h1>Поддержка</h1>
        <p class="subtitle">Единая очередь чатов с пользователями.</p>
      </div>
      <div class="header-actions">
        <Tag :value="workspaceLiveLabel" :severity="workspaceLiveSeverity" />
        <Button
          v-if="canReadAvailability"
          label="Моя доступность"
          icon="pi pi-user-clock"
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
          @click="workspaceFullscreen = !workspaceFullscreen"
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
            routingOffers.loading.value ||
            Boolean(routingOffers.changingOfferId.value)
          "
          @click="reload"
        />
      </div>
    </header>

    <div
      class="support-workspace card"
      :class="{
        'has-route-selection': Boolean(routeConversationId),
      }"
    >
      <aside class="inbox-pane" aria-label="Диалоги проекта">
        <div class="pane-heading">
          <div>
            <span class="eyebrow">Поддержка</span>
            <h2>Входящие</h2>
          </div>
          <span class="inbox-count">{{ inbox.items.value.length }}</span>
        </div>

        <div class="queue-summary">
          <span><i class="pi pi-inbox" aria-hidden="true" /> Все диалоги</span>
          <small>J / K для навигации</small>
        </div>

        <div
          v-if="inbox.loading.value && !inbox.items.value.length"
          class="inbox-skeletons"
        >
          <Skeleton v-for="index in 5" :key="index" height="76px" />
        </div>
        <Message
          v-else-if="inbox.error.value"
          severity="error"
          :closable="false"
        >
          {{ inbox.error.value }}
        </Message>
        <p v-else-if="!inbox.items.value.length" class="empty-pane">
          В этом проекте пока нет доступных диалогов.
        </p>
        <div v-else class="conversation-list">
          <button
            v-for="conversation in inbox.items.value"
            :key="conversation.id"
            type="button"
            class="conversation-row"
            :class="{ selected: conversation.id === selectedConversation?.id }"
            :aria-current="
              conversation.id === selectedConversation?.id ? 'true' : undefined
            "
            @click="openConversation(conversation.id)"
          >
            <div class="conversation-row__top">
              <span class="conversation-avatar">{{
                initials(conversation.title)
              }}</span>
              <strong>{{ conversation.title }}</strong>
              <time :datetime="conversation.updatedAt">{{
                relativeTime(conversation.updatedAt)
              }}</time>
            </div>
            <p>
              {{
                conversation.lastMessageAt
                  ? `Последняя активность ${relativeTime(conversation.lastMessageAt)}`
                  : "Сообщений пока нет"
              }}
            </p>
            <span class="conversation-row__meta">
              <span
                :class="[
                  'conversation-state',
                  conversation.status.toLowerCase(),
                ]"
              >
                {{ conversation.status === "OPEN" ? "Открыт" : "Закрыт" }}
              </span>
              {{ conversation.messageCount }} сообщений
            </span>
          </button>
          <Button
            v-if="inbox.nextCursor.value"
            label="Показать ещё"
            severity="secondary"
            text
            :loading="inbox.loading.value"
            @click="inbox.loadMore"
          />
        </div>
      </aside>

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
                selectedConversation.status === "OPEN"
                  ? "Активный диалог"
                  : "Архивный диалог"
              }}</span>
              <h2>{{ selectedConversation.title }}</h2>
              <p>Безопасный контекст доступен в панели диалога.</p>
            </div>
            <div class="conversation-header__actions">
              <template
                v-if="canReadSelectedAiSuspension && selectedAiSuspensionEntry"
              >
                <ConversationAISuspensionHeaderActions
                  :entry="selectedAiSuspensionEntry"
                  :can-manage="canManageSelectedAiSuspension"
                  :conversation-open="selectedConversation.status === 'OPEN'"
                  :show-history="canReadSelectedAiSuspension"
                  @start="openAiSuspensionDialog('START')"
                  @history="aiSuspensionHistoryVisible = true"
                  @retry="reloadSelectedAiSuspension"
                />
              </template>
              <div
                v-if="canManageTranslation"
                class="message-view-toggle"
                role="group"
                aria-label="Язык сообщений"
              >
                <Button
                  type="button"
                  label="Оригинал"
                  size="small"
                  severity="secondary"
                  :outlined="messageViewMode !== 'ORIGINAL'"
                  :aria-pressed="messageViewMode === 'ORIGINAL'"
                  @click="messageViewMode = 'ORIGINAL'"
                />
                <Button
                  type="button"
                  label="Перевод"
                  icon="pi pi-language"
                  size="small"
                  severity="secondary"
                  :outlined="messageViewMode !== 'TRANSLATED'"
                  :loading="translation.loading.value"
                  :aria-pressed="messageViewMode === 'TRANSLATED'"
                  @click="showTranslatedMessages"
                />
              </div>
              <Button
                class="mobile-context"
                label="Контекст"
                icon="pi pi-user"
                severity="secondary"
                text
                @click="contextDrawerVisible = true"
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
          <div
            v-else
            class="message-log"
            role="log"
            aria-live="polite"
            aria-label="История сообщений"
          >
            <Button
              v-if="conversation.nextMessageCursor.value"
              label="Загрузить более ранние сообщения"
              severity="secondary"
              outlined
              class="load-older"
              :loading="conversation.loadingOlder.value"
              @click="conversation.loadOlder"
            />
            <article
              v-for="message in conversation.messages.value"
              :key="message.id"
              class="message"
              :class="{
                'from-user': message.author === 'USER',
                'from-operator': message.author === 'ADMIN',
                'from-assistant': message.author === 'ASSISTANT',
                'from-system':
                  message.author !== 'USER' &&
                  message.author !== 'ADMIN' &&
                  message.author !== 'ASSISTANT',
              }"
            >
              <div class="message-meta">
                <span class="message-author">
                  <Avatar
                    :image="message.authorSnapshot?.avatarUrl ?? undefined"
                    :label="initials(messageAuthorName(message))"
                    shape="circle"
                    class="message-avatar"
                    :aria-label="`Автор: ${messageAuthorName(message)}`"
                  />
                  <strong>{{ messageAuthorName(message) }}</strong>
                </span>
                <time :datetime="message.createdAt">{{
                  relativeTime(message.createdAt)
                }}</time>
              </div>
              <TranslatedMessageBody
                :message="message"
                :requested="
                  translation.messageTranslations.value.get(message.id)
                "
                :view-mode="messageViewMode"
              />
              <SupportMessageDeliveryStatus
                v-if="message.author === 'ADMIN' && message.delivery"
                :status="message.delivery.status"
              />
            </article>
            <p v-if="!conversation.messages.value.length" class="empty-pane">
              В этом диалоге пока нет сообщений.
            </p>
          </div>
          <SupportReplyComposer
            v-if="conversation.selection.value"
            :composer="supportConversationComposer"
            :draft="reply.draft.value"
            :working-locale-label="supportComposerWorkingLocale"
            :error="reply.error.value"
            :delivery-status="reply.deliveryStatus.value"
            @update:draft="reply.draft.value = $event"
            @send-source="sendReply"
            @request-reply-translation="prepareReplyTranslation"
            @reconcile-reply-translation="translation.reconcileReplyPreview"
            @retry-reply-translation="translation.retryReplyPreview"
            @save-reply-translation="translation.editReplyTranslation"
            @send-reply-translation="sendTranslatedReply"
            @action="handleSupportComposerAction"
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
          v-else-if="inbox.loading.value || conversation.loading.value"
          class="empty-selection"
          aria-busy="true"
        >
          <Skeleton width="180px" height="24px" />
          <Skeleton width="240px" height="16px" />
        </div>
        <div v-else class="empty-selection">
          <i class="pi pi-comments" aria-hidden="true" />
          <template v-if="route.params.conversationId">
            <h2>Диалог недоступен</h2>
            <p>Диалог не найден или у вас больше нет прав на его просмотр.</p>
          </template>
          <template v-else>
            <h2>Выберите диалог</h2>
            <p>История и безопасный контекст появятся здесь.</p>
          </template>
        </div>
      </main>

      <aside
        v-if="selectedConversation && conversation.selection.value"
        class="context-pane"
        aria-label="Контекст диалога"
      >
        <SupportConversationContext
          :conversation="selectedConversation"
          :selection="conversation.selection.value"
          :can-manage-case="canManageSelectedCase"
          :can-release-assignment="canReleaseSelectedAssignment"
          :can-read-internal-notes="canReadSelectedInternalNotes"
          :can-read-profile="canReadProfile"
          :profile="profile.profile.value"
          :profile-loading="profile.loading.value"
          :profile-error="profile.error.value"
          :assignment-release="{
            releasing: assignmentRelease.releasing.value,
            error: assignmentRelease.error.value,
            unknownOutcome: assignmentRelease.unknownOutcome.value,
            completed: assignmentRelease.completed.value,
            canRetry: assignmentRelease.canRetry.value,
          }"
          @load-profile="profile.load"
          @release-assignment="assignmentRelease.release"
          @retry-assignment-release="assignmentRelease.retryUnknownOutcome"
          @open-internal-notes="openInternalNotes"
          @classify-case="classifySelectedCase"
        />
      </aside>
    </div>
    <SupportRoutingOffers
      v-if="canManageRoutingOffers"
      :offers="routingOffers.offers.value"
      :loading="routingOffers.loading.value"
      :changing-offer-id="routingOffers.changingOfferId.value"
      :error="routingOffers.error.value"
      :unknown-outcome="routingOffers.unknownOutcome.value"
      :last-outcome="routingOffers.lastOutcome.value"
      :can-retry="routingOffers.canRetry.value"
      @refresh="routingOffers.load"
      @action="routingOffers.act"
      @retry="routingOffers.retryUnknownOutcome"
    />
    <Drawer
      v-if="selectedConversation && conversation.selection.value"
      :visible="contextDrawerVisible"
      position="right"
      aria-label="Контекст диалога"
      :style="{ width: 'min(420px, 100vw)' }"
      @update:visible="contextDrawerVisible = $event"
    >
      <SupportConversationContext
        :conversation="selectedConversation"
        :selection="conversation.selection.value"
        :can-manage-case="canManageSelectedCase"
        :can-release-assignment="canReleaseSelectedAssignment"
        :can-read-internal-notes="canReadSelectedInternalNotes"
        :can-read-profile="canReadProfile"
        :profile="profile.profile.value"
        :profile-loading="profile.loading.value"
        :profile-error="profile.error.value"
        :assignment-release="{
          releasing: assignmentRelease.releasing.value,
          error: assignmentRelease.error.value,
          unknownOutcome: assignmentRelease.unknownOutcome.value,
          completed: assignmentRelease.completed.value,
          canRetry: assignmentRelease.canRetry.value,
        }"
        @load-profile="profile.load"
        @release-assignment="assignmentRelease.release"
        @retry-assignment-release="assignmentRelease.retryUnknownOutcome"
        @open-internal-notes="openInternalNotes"
        @classify-case="classifySelectedCase"
      />
    </Drawer>
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
    <EndUserCaseDialogs
      v-if="canManageSelectedCase"
      ref="caseDialogs"
      :classification-options="
        conversation.selection.value?.classificationOptions ?? []
      "
    />
    <SupportInternalNotesDialog
      v-if="canReadSelectedInternalNotes && conversation.selection.value?.case"
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
</template>

<style scoped>
.support-workspace-header,
.header-actions,
.pane-heading,
.conversation-row__top,
.conversation-header,
.conversation-header__actions,
.message-meta {
  display: flex;
  align-items: center;
}
.support-workspace-header,
.conversation-header,
.pane-heading,
.conversation-row__top,
.message-meta {
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
.message-view-toggle {
  display: inline-flex;
  gap: 4px;
}
.message-view-toggle :deep(.p-button) {
  min-height: 32px;
  padding-inline: 9px;
  font-size: 0.7rem;
}
.support-workspace-page {
  min-width: 0;
}
.support-workspace-header {
  margin-bottom: 14px;
}
.support-workspace-header h1 {
  margin-top: 4px;
  font-size: clamp(1.45rem, 2vw, 1.9rem);
}
.support-workspace-header .subtitle {
  margin-top: 4px;
}
.support-workspace-page--fullscreen {
  position: fixed;
  inset: 0;
  z-index: 1000;
  margin: 0;
  padding: 16px;
  overflow: auto;
  background: var(--surface-ground);
}
.support-workspace-page--fullscreen .support-workspace {
  height: calc(100dvh - 142px);
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
.inbox-pane,
.context-pane {
  min-height: 0;
  padding: 18px;
  background: var(--surface-card);
  overflow: auto;
}
.inbox-pane {
  padding: 20px 14px;
}
.context-pane {
  padding: 18px 18px 24px;
}
.inbox-pane {
  border-right: 1px solid var(--line);
}
.context-pane {
  border-left: 1px solid var(--line);
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
.conversation-header p,
.message-meta time {
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
.message-log {
  min-height: 0;
  flex: 1;
  padding: 24px 28px;
  display: grid;
  align-content: start;
  gap: 12px;
  overflow: auto;
}
.message-skeletons {
  padding: 22px;
}
.message {
  max-width: min(82%, 620px);
  padding: 12px 14px;
  border-radius: 16px;
  background: var(--surface-card);
  border: 1px solid var(--line);
}
.message.from-user {
  justify-self: start;
  border-top-left-radius: 6px;
}
.message.from-operator {
  justify-self: end;
  border-top-right-radius: 6px;
  background: var(--brand-soft);
  border-color: color-mix(in srgb, var(--brand) 38%, var(--line));
}
.message.from-assistant {
  justify-self: start;
  border-top-left-radius: 6px;
  border-color: color-mix(in srgb, var(--status-accent-text) 30%, var(--line));
  background: color-mix(
    in srgb,
    var(--status-accent-soft) 55%,
    var(--surface-card)
  );
}
.message.from-system {
  justify-self: start;
  background: var(--surface-muted);
}
.message-meta {
  gap: 14px;
  margin-bottom: 5px;
}
.message-author {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.message-avatar {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  font-size: 0.62rem;
}
.message p {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
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
@media (max-width: 1180px) {
  .support-workspace {
    grid-template-columns: minmax(230px, 300px) minmax(0, 1fr);
  }
  .context-pane {
    display: none;
  }
  .mobile-context {
    display: inline-flex;
  }
}
@media (max-width: 720px) {
  .support-workspace-page--fullscreen {
    padding: 10px;
  }
  .support-workspace-page--fullscreen .support-workspace {
    height: auto;
  }
  .support-workspace {
    display: block;
    height: auto;
  }
  .support-workspace:not(.has-route-selection) .conversation-pane,
  .support-workspace:not(.has-route-selection) .context-pane,
  .support-workspace.has-route-selection .inbox-pane {
    display: none;
  }
  .inbox-pane {
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .conversation-list {
    max-height: 260px;
    overflow: auto;
  }
  .conversation-header {
    align-items: flex-start;
    padding: 16px;
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
  .context-pane {
    display: none;
  }
  .message-log,
  .message-skeletons {
    padding: 16px;
  }
  .message {
    max-width: 92%;
  }
}
</style>
