<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import "@/features/support-workspace/ui/support-loading-shimmer.css";
import { useRoute, useRouter, type LocationQuery } from "vue-router";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
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
import { hasConversationTranslationBoundary } from "@/features/conversation-translation/model/conversation-translation-visibility";
import ConversationTranslationBanner from "@/features/conversation-translation/ui/ConversationTranslationBanner.vue";
import type {
  ConversationSurfaceAttachmentDownloadRequest,
  ConversationSurfaceComposer,
  ConversationSurfaceComposerAction,
  ConversationSurfaceAISuspensionCapability,
  ConversationSurfaceCollaboration,
  ConversationSurfaceHistory,
  ConversationSurfaceInternalNotes,
  ConversationSurfaceSendRequest,
  ConversationSurfaceTranslation,
} from "@/features/conversation-surface/model/conversation-surface-contract";
import { clearConversationSurfaceProjectSession } from "@/features/conversation-surface/model/conversation-surface-session";
import ConversationTemplateGallery from "@/features/conversation-surface/ui/ConversationTemplateGallery.vue";
import { supportMacroSource } from "@/features/support-macros/api/support-macros-source";
import { createSupportMacroController } from "@/features/support-macros/model/use-support-macros";
import { createSupportConversationController } from "@/features/support-conversation/model/use-support-conversation";
import SupportConversationPane from "@/features/support-conversation/ui/SupportConversationPane.vue";
import { supportConversationCollaborationSource } from "@/features/support-conversation-collaboration/api/support-conversation-collaboration-source";
import { createSupportConversationCollaborationController } from "@/features/support-conversation-collaboration/model/use-support-conversation-collaboration";
import { createSupportInboxController } from "@/features/support-inbox/model/use-support-inbox";
import SupportInboxPane from "@/features/support-inbox/ui/SupportInboxPane.vue";
import {
  supportSearchSource,
  type SupportSearchResult,
} from "@/features/support-search/api/support-search-source";
import {
  hasSupportSearchCriteria,
  normalizeSupportSearchState,
  readSupportSearchRoute,
  writeSupportSearchRoute,
  type SupportSearchRouteState,
} from "@/features/support-search/model/support-search-route";
import { createSupportSearchController } from "@/features/support-search/model/use-support-search";
import {
  supportViewsSource,
  type SupportViewSelection,
} from "@/features/support-views/api/support-views-source";
import { createSavedViewCommand } from "@/features/support-views/model/support-view-draft";
import {
  isCustomSupportViewRoute,
  readSupportViewSelection,
  shouldLoadCustomSupportView,
  supportViewRouteKeys,
  writeSupportViewSelection,
} from "@/features/support-views/model/support-view-route";
import { createSupportViewsController } from "@/features/support-views/model/use-support-views";
import { createSupportReplyController } from "@/features/support-reply/model/use-support-reply";
import { ApiError } from "@/shared/api/http/api-error";
import { supportAttachmentsSource } from "@/features/support-attachments/api/support-attachments-source";
import { createSupportAttachmentsController } from "@/features/support-attachments/model/use-support-attachments";
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
import { supportInternalKnowledgeSource } from "@/features/support-internal-knowledge/api/support-internal-knowledge-source";
import { createSupportInternalKnowledgeController } from "@/features/support-internal-knowledge/model/use-support-internal-knowledge";
import { parseSupportInternalNoteChanged } from "@/features/support-internal-notes/model/support-internal-note-live";
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
} from "@/features/support-workspace/model/support-workspace-access";
import { supportInspectorSource } from "@/features/support-inspector/api/support-inspector-source";
import { createSupportInspectorController } from "@/features/support-inspector/model/use-support-inspector";
import { supportExternalWorkSource } from "@/features/support-external-work/api/support-external-work-source";
import { createSupportCaseExternalWorkController } from "@/features/support-external-work/model/use-support-case-external-work";
import SupportConversationContext from "@/features/support-workspace/ui/SupportConversationContext.vue";
import FullViewportWorkspaceShell from "@/shared/ui/workspace-presentation/FullViewportWorkspaceShell.vue";
import ResponsiveWorkspaceInspector from "@/features/support-workspace/presentation/ResponsiveWorkspaceInspector.vue";
import { createSupportWorkspaceLiveController } from "@/features/support-workspace/model/use-support-workspace-live";
import {
  reportSupportWorkspaceTelemetry,
  supportWorkspaceViewportBucket,
} from "@/features/support-workspace/model/support-workspace-telemetry";
import { repository } from "@/shared/api/repository";
import { cmsRealtimeClient } from "@/shared/realtime/cms-realtime-client";
import type { CmsRealtimeState } from "@/shared/realtime/cms-realtime-contract";
import type {
  ExtendConversationAISuspensionDto,
  ResumeConversationAIDto,
  StartConversationAISuspensionDto,
  SupportMacroResponseDto,
} from "@/shared/api/generated/models";
import { conversationAISuspensionEnabled } from "@/shared/config/features";

const conversationLoadingSkeletons = Array.from({ length: 16 }, (_, index) => {
  const outbound = index % 3 === 1;
  return {
    id: index,
    direction: outbound ? "outbound" : "inbound",
    compact: !outbound && index % 5 === 4,
    lineCount: index % 4 === 3 ? 2 : 3,
  } as const;
});

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
const canReadSavedViews = computed(
  () =>
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      "project.support.saved_views.read",
    ) ||
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      "project.support.saved_views.self_manage",
    ) ||
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      "project.support.saved_views.manage",
    ),
);
const canCreateSavedViews = computed(
  () =>
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      "project.support.saved_views.self_manage",
    ) ||
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      "project.support.saved_views.manage",
    ),
);
const canManageAllSavedViews = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    "project.support.saved_views.manage",
  ),
);
const canReadSlaContext = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    "project.support.sla.read",
  ),
);
const routingContextVisibility = computed<"FULL" | "OWN" | "NONE">(() => {
  const permissions = auth.project?.effectivePermissionCodes ?? [];
  if (
    (
      [
        "project.support.routing.read",
        "project.support.routing.manage",
        "project.support.lead_control.read",
      ] as const
    ).some((permission) => hasProjectPermission(permissions, permission))
  )
    return "FULL";
  return hasProjectPermission(permissions, "project.support.routing.receive")
    ? "OWN"
    : "NONE";
});
const canReadRoutingContext = computed(
  () => routingContextVisibility.value !== "NONE",
);
const operationsContextAuthorityKey = computed(() =>
  [
    auth.project?.id ?? "",
    canReadSlaContext.value ? "SLA" : "NO_SLA",
    routingContextVisibility.value,
  ].join("\u0000"),
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
function readWorkspaceSearchRoute(query: LocationQuery) {
  return readSupportSearchRoute(query);
}
const canUseSupportSearch = computed(() => canSearchSupport.value);
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
  readWorkspaceSearchRoute(route.query),
);
const searchOpen = ref(hasSupportSearchCriteria(searchState.value));
const searchActive = computed(
  () =>
    canUseSupportSearch.value &&
    (searchOpen.value || hasSupportSearchCriteria(searchState.value)),
);
const supportSearch = createSupportSearchController(
  {
    projectId: () => auth.project?.id,
    canSearch: () => canUseSupportSearch.value,
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
    canSearch: () => canUseSupportSearch.value,
    canReadSaved: () => canUseSupportSearch.value && canReadSavedViews.value,
    canMutate: () => canUseSupportSearch.value && canCreateSavedViews.value,
    phrase: () => searchState.value.phrase,
    beforeSelection() {
      searchState.value = readSupportSearchRoute({});
      searchOpen.value = false;
    },
    async onSelection(selection) {
      const query = Object.fromEntries(
        Object.entries(route.query).filter(
          ([key]) =>
            !supportViewRouteKeys.has(key) && !supportSearchRouteKeys.has(key),
        ),
      );
      await router.replace({
        query: { ...query, ...writeSupportViewSelection(selection) },
      });
    },
  },
  supportViewsSource,
);
const supportSearchVisibleError = computed(
  () => supportViews.error.value || supportSearch.error.value,
);
const supportViewIntentKeys = new Map<string, string>();
function supportViewIntentKey(signature: string): string {
  const current = supportViewIntentKeys.get(signature);
  if (current) return current;
  const key = globalThis.crypto.randomUUID();
  supportViewIntentKeys.set(signature, key);
  return key;
}
const viewActive = computed(
  () => canUseSupportSearch.value && Boolean(supportViews.selection.value),
);
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
const supportInboxPane = ref<InstanceType<typeof SupportInboxPane> | null>(
  null,
);
const supportContext = ref<InstanceType<
  typeof SupportConversationContext
> | null>(null);
const workspaceFullscreen = ref(false);
const workspacePresentedFullscreen = ref(false);
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
function recordCoreFeedback(
  payload: Record<string, string | number | boolean>,
): void {
  reportSupportWorkspaceTelemetry("support_workspace_core_feedback", {
    ...payload,
    viewport: supportWorkspaceViewportBucket(),
  });
}
const conversation = createSupportConversationController(
  {
    projectId: () => auth.project?.id,
    conversationId: () => routeConversationId.value,
    caseId: () => routeCaseId.value,
    onForbidden: handleConversationForbidden,
    onReadStateChange(conversationId, state) {
      inbox.applyConversationReadState(conversationId, state);
    },
    recordTelemetry: recordCoreFeedback,
  },
  supportWorkspaceSource,
);
const publicAttachmentsAccessDenied = ref(false);
const noteAttachmentsAccessDenied = ref(false);
function publicAttachmentCapabilities() {
  const value = conversation.selection.value?.capabilities.attachments;
  return {
    state: publicAttachmentsAccessDenied.value
      ? ("UNAVAILABLE" as const)
      : (value?.state ?? ("UNAVAILABLE" as const)),
    upload: Boolean(!publicAttachmentsAccessDenied.value && value?.upload),
    download: Boolean(!publicAttachmentsAccessDenied.value && value?.download),
    maxFiles: value?.maxFilesPerMessage ?? 10,
    maxFileBytes: value?.maxBytesPerFile ?? 20 * 1024 * 1024,
    maxTotalBytes: value?.maxBytesPerMessage ?? 50 * 1024 * 1024,
    contentTypes: value?.contentTypes ?? [],
  };
}
function noteAttachmentCapabilities() {
  const selection = conversation.selection.value;
  const common = selection?.capabilities.attachments;
  const note = selection?.capabilities.internalNotes;
  return {
    state:
      !noteAttachmentsAccessDenied.value &&
      common?.state === "AVAILABLE" &&
      note?.state === "AVAILABLE"
        ? ("AVAILABLE" as const)
        : ("UNAVAILABLE" as const),
    upload: Boolean(
      !noteAttachmentsAccessDenied.value &&
      common?.upload &&
      note?.attachmentUpload,
    ),
    download: Boolean(
      !noteAttachmentsAccessDenied.value &&
      common?.download &&
      note?.attachmentDownload,
    ),
    maxFiles: common?.maxFilesPerMessage ?? 10,
    maxFileBytes: common?.maxBytesPerFile ?? 20 * 1024 * 1024,
    maxTotalBytes: common?.maxBytesPerMessage ?? 50 * 1024 * 1024,
    contentTypes: common?.contentTypes ?? [],
  };
}
const publicAttachments = createSupportAttachmentsController(
  supportAttachmentsSource,
  {
    scope: () => {
      const selection = conversation.selection.value;
      const projectId = auth.project?.id;
      const actorId = auth.user?.id;
      if (!projectId || !actorId || !selection?.conversation) return null;
      return {
        visibility: "PUBLIC_REPLY",
        projectId,
        actorId,
        endUserId: selection.endUser.id,
        conversationId: selection.conversation.id,
      };
    },
    capabilities: publicAttachmentCapabilities,
    onForbidden: handlePublicAttachmentForbidden,
  },
);
const noteAttachments = createSupportAttachmentsController(
  supportAttachmentsSource,
  {
    scope: () => {
      const caseId = conversation.selection.value?.case?.id;
      const projectId = auth.project?.id;
      const actorId = auth.user?.id;
      if (!projectId || !actorId || !caseId) return null;
      return { visibility: "INTERNAL_NOTE", projectId, actorId, caseId };
    },
    capabilities: noteAttachmentCapabilities,
    onForbidden: handleNoteAttachmentForbidden,
  },
);

async function handlePublicAttachmentForbidden(): Promise<void> {
  publicAttachmentsAccessDenied.value = true;
  publicAttachments.dispose();
  conversation.messages.value = conversation.messages.value.map((message) => ({
    ...message,
    attachments: [],
  }));
  try {
    await auth.refreshContext();
  } catch {
    // Attachment metadata is already concealed while authority is refreshed.
  }
  await Promise.all([inbox.load(), conversation.reconcile()]).catch(
    () => undefined,
  );
}

async function handleNoteAttachmentForbidden(): Promise<void> {
  noteAttachmentsAccessDenied.value = true;
  noteAttachments.dispose();
  internalNotes.reset();
  try {
    await auth.refreshContext();
  } catch {
    // Private attachment metadata is already concealed while authority is refreshed.
  }
  await Promise.all([inbox.load(), conversation.reconcile()]).catch(
    () => undefined,
  );
}
const publicAttachmentAuthorityKey = computed(() => {
  const selection = conversation.selection.value;
  const capability = publicAttachmentCapabilities();
  return [
    auth.project?.id ?? "",
    auth.user?.id ?? "",
    selection?.endUser.id ?? "",
    selection?.conversation?.id ?? "",
    capability.state,
    capability.upload ? "upload" : "no-upload",
    capability.download ? "download" : "no-download",
  ].join("\u0000");
});
const noteAttachmentAuthorityKey = computed(() => {
  const capability = noteAttachmentCapabilities();
  return [
    auth.project?.id ?? "",
    auth.user?.id ?? "",
    conversation.selection.value?.case?.id ?? "",
    capability.state,
    capability.upload ? "upload" : "no-upload",
    capability.download ? "download" : "no-download",
  ].join("\u0000");
});
const knowledgeAccessDenied = ref(false);
const publicKnowledgeDraftPurgeRevision = ref(0);
const hasKnowledgeReadPermission = computed(
  () =>
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      "project.cases.read",
    ) &&
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      "project.support.knowledge.read",
    ),
);
const canReadSelectedKnowledge = computed(
  () =>
    !knowledgeAccessDenied.value &&
    Boolean(conversation.selection.value?.case) &&
    hasKnowledgeReadPermission.value,
);
const reply = createSupportReplyController(
  {
    projectId: () => auth.project?.id,
    actorId: () => auth.user?.id,
    selection: () => conversation.selection.value,
    async reconcile() {
      await Promise.all([inbox.load(), conversation.reconcile()]);
    },
    onAccepted(attempt) {
      if (attempt.attachmentIds?.length) publicAttachments.consumeDraft();
      knowledge.accepted();
    },
    onMacroDraftRejected: handleSupportMacroRejected,
    onKnowledgeCitationRejected: handleSupportKnowledgeRejected,
    recordTelemetry: recordCoreFeedback,
  },
  repository,
);
const knowledge = createSupportInternalKnowledgeController(
  {
    scope: () => {
      const selection = conversation.selection.value;
      const projectId = auth.project?.id;
      if (!projectId || !selection?.case || !selection.conversation)
        return null;
      return {
        projectId,
        caseId: selection.case.id,
        conversationId: selection.conversation.id,
        ...(selection.endUser.locale
          ? { locale: selection.endUser.locale }
          : {}),
      };
    },
    allowed: () => canReadSelectedKnowledge.value,
    canInsert: () =>
      Boolean(
        canReadSelectedKnowledge.value &&
        reply.canReply.value &&
        supportComposerMode.value === "PUBLIC_REPLY",
      ),
    onInsert(text) {
      reply.draft.value = [reply.draft.value.trim(), text]
        .filter(Boolean)
        .join("\n\n");
      void workspaceLive.setDraftActive(true);
    },
    onForbidden: handleSupportKnowledgeForbidden,
  },
  supportInternalKnowledgeSource,
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
const supportComposerMode = ref<"PUBLIC_REPLY" | "INTERNAL_NOTE">(
  "PUBLIC_REPLY",
);
const internalNoteDraft = ref("");
const internalNoteDraftPurgeRevision = ref(0);
const supportMacrosAccessDenied = ref(false);
const hasSupportMacrosReadPermission = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    "project.support.macros.read",
  ),
);
const hasSupportMacrosUsePermission = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    "project.support.macros.use",
  ),
);
const canReadSupportMacros = computed(
  () =>
    !supportMacrosAccessDenied.value && hasSupportMacrosReadPermission.value,
);
const canUseSupportMacros = computed(
  () => canReadSupportMacros.value && hasSupportMacrosUsePermission.value,
);
const supportMacros = createSupportMacroController(
  {
    projectId: () => auth.project?.id,
    actorId: () => auth.user?.id,
    canRead: () => canReadSupportMacros.value,
    canUse: () => canUseSupportMacros.value,
    catalogContext: () => {
      const locale =
        translation.state.value?.preference.workingLocale ??
        conversation.selection.value?.endUser.locale ??
        undefined;
      return {
        ...(conversation.selection.value?.case?.groupCode
          ? { topicCode: conversation.selection.value.case.groupCode }
          : {}),
        ...(locale ? { locale } : {}),
      };
    },
    target: () => {
      const selection = conversation.selection.value;
      if (!selection) return null;
      if (supportComposerMode.value === "INTERNAL_NOTE") {
        return selection.case
          ? { kind: "INTERNAL_NOTE" as const, caseId: selection.case.id }
          : null;
      }
      return selection.conversation
        ? {
            kind: "PUBLIC_REPLY" as const,
            endUserId: selection.endUser.id,
            conversationId: selection.conversation.id,
            locale:
              translation.state.value?.preference.workingLocale ??
              selection.endUser.locale ??
              "ru",
            ...(selection.case ? { caseId: selection.case.id } : {}),
          }
        : null;
    },
    async onForbidden() {
      supportMacrosAccessDenied.value = true;
      replyTemplateGalleryVisible.value = false;
      try {
        await auth.refreshContext();
      } catch {
        // Macro catalog and draft are already purged before context recovery.
      }
      await conversation.reconcile().catch(() => undefined);
    },
  },
  supportMacroSource,
);

async function handleSupportMacroRejected(): Promise<void> {
  supportMacros.reset({ keepQuery: true });
  supportMacros.requireRecovery();
  replyTemplateGalleryVisible.value = false;
  try {
    await auth.refreshContext();
  } catch {
    // The rejected Macro draft is already purged; the typed text stays local.
  }
  supportMacrosAccessDenied.value =
    !hasSupportMacrosReadPermission.value ||
    !hasSupportMacrosUsePermission.value;
  if (!supportMacrosAccessDenied.value) await supportMacros.load();
}

async function handleSupportKnowledgeForbidden(): Promise<void> {
  const hadDerivedKnowledgeText = Boolean(
    knowledge.activeCitation.value || knowledge.recoveryRequired.value,
  );
  knowledgeAccessDenied.value = true;
  knowledge.purge({ keepQuery: true });
  if (hadDerivedKnowledgeText) {
    reply.draft.value = "";
    publicKnowledgeDraftPurgeRevision.value += 1;
  }
  try {
    await auth.refreshContext();
  } catch {
    // Protected Knowledge text and citation identity are already purged.
  }
  await conversation.reconcile().catch(() => undefined);
  if (hasKnowledgeReadPermission.value && conversation.selection.value?.case)
    knowledgeAccessDenied.value = false;
}

async function handleSupportKnowledgeRejected(cause: ApiError): Promise<void> {
  if (cause.status === 403 || cause.status === 404) {
    await handleSupportKnowledgeForbidden();
    return;
  }
  knowledge.requireRecovery();
  await conversation.reconcile().catch(() => undefined);
}
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
  macroReplyDraft: () => {
    const active = supportMacros.activeDraft.value;
    return active?.target.kind === "PUBLIC_REPLY"
      ? {
          id: active.receipt.id,
          sourceHash: active.receipt.renderedHash,
          version: active.receipt.version,
        }
      : null;
  },
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
const replyHasText = computed(() => Boolean(reply.draft.value.trim()));
const hasSupportTranslationBoundary = computed(() =>
  hasConversationTranslationBoundary({
    workingLocale: translation.state.value?.preference.workingLocale,
    conversationLocale: translation.targetLocale.value,
  }),
);
const translationPolicyRequiresReviewedReply = computed(() => {
  const preference = translation.state.value?.preference;
  return Boolean(
    preference?.enabled &&
    (!translation.targetLocale.value || hasSupportTranslationBoundary.value),
  );
});
const replyPolicyChecking = computed(
  () => canManageTranslation.value && !translation.state.value,
);
const canSubmitPublicReply = computed(() => {
  if (
    !reply.canReply.value ||
    supportMacros.recoveryRequired.value ||
    knowledge.recoveryRequired.value ||
    knowledge.inserting.value ||
    knowledge.preparing.value ||
    (replyHasText.value && replyPolicyChecking.value)
  )
    return false;
  if (
    replyHasText.value &&
    (replyTranslationRequested.value ||
      translationPolicyRequiresReviewedReply.value)
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
  if (supportMacros.recoveryRequired.value) return supportMacros.error.value;
  if (knowledge.recoveryRequired.value) return knowledge.error.value;
  if (knowledge.inserting.value || knowledge.preparing.value)
    return "Закрепляем внутренний источник…";
  if (replyHasText.value && replyPolicyChecking.value)
    return translation.error.value || "Проверяем правила перевода…";
  if (
    replyHasText.value &&
    (replyTranslationRequested.value ||
      translationPolicyRequiresReviewedReply.value)
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
const supportConversationComposer = computed<ConversationSurfaceComposer>(
  () => {
    const selection = conversation.selection.value;
    const noteCapabilities = selection?.capabilities.internalNotes;
    const noteAvailable = noteCapabilities?.state === "AVAILABLE";
    const modeSwitch = {
      publicReply: {
        visibility:
          reply.canReply.value &&
          !supportMacros.recoveryRequired.value &&
          !knowledge.recoveryRequired.value
            ? ("ENABLED" as const)
            : ("DISABLED" as const),
        reason:
          reply.canReply.value &&
          !supportMacros.recoveryRequired.value &&
          !knowledge.recoveryRequired.value
            ? undefined
            : supportMacros.recoveryRequired.value
              ? supportMacros.error.value
              : knowledge.recoveryRequired.value
                ? knowledge.error.value
                : "Ответ пользователю в этом диалоге недоступен.",
      },
      internalNote: {
        visibility:
          noteAvailable &&
          noteCapabilities.create &&
          !supportMacros.recoveryRequired.value &&
          !knowledge.recoveryRequired.value
            ? ("ENABLED" as const)
            : ("DISABLED" as const),
        reason:
          supportMacros.recoveryRequired.value ||
          knowledge.recoveryRequired.value
            ? supportMacros.recoveryRequired.value
              ? supportMacros.error.value
              : knowledge.error.value
            : noteAvailable
              ? "Для этого обращения доступен только просмотр заметок."
              : "Внутренние заметки недоступны для текущего обращения.",
      },
    };
    if (supportComposerMode.value === "INTERNAL_NOTE") {
      const enabled = Boolean(noteAvailable && noteCapabilities?.create);
      return {
        visibility: enabled ? "ENABLED" : "DISABLED",
        mode: "INTERNAL_NOTE",
        scope: {
          projectId: auth.project?.id ?? "unselected-project",
          actorId: auth.user?.id ?? "current-operator",
          conversationId:
            selection?.conversation?.id ?? "unselected-conversation",
        },
        draftTargetId: selection?.case?.id ?? "unselected-case",
        initialDraft: internalNoteDraft.value,
        draftRevision: `${selection?.capabilitiesRevision ?? "unselected"}:internal-note`,
        sensitiveDraftPurgeRevision: internalNoteDraftPurgeRevision.value,
        sending: internalNotes.creating.value,
        attachments: {
          draftKey: noteAttachments.draftKey.value,
          accept: noteAttachmentCapabilities().contentTypes.join(","),
          loading: noteAttachments.loading.value,
          busy: noteAttachments.busy.value,
          error: noteAttachments.error.value,
          canDownload: noteAttachmentCapabilities().download,
          maxFiles: noteAttachmentCapabilities().maxFiles,
          items: noteAttachments.items.value,
        },
        recipientStatus: null,
        actions: {
          attachment: {
            visibility: noteAttachmentCapabilities().upload
              ? "ENABLED"
              : "DISABLED",
            reason: noteAttachmentCapabilities().upload
              ? undefined
              : "Загрузка файлов во внутреннюю заметку недоступна.",
          },
          createTicket: { visibility: "HIDDEN" },
          classifyCase: { visibility: "HIDDEN" },
          internalNotes: {
            visibility: noteCapabilities?.read ? "ENABLED" : "HIDDEN",
          },
          knowledge: {
            visibility: canReadSelectedKnowledge.value ? "ENABLED" : "HIDDEN",
          },
          templates: {
            visibility: canUseSupportMacros.value ? "ENABLED" : "HIDDEN",
          },
          improveWithAI: { visibility: "HIDDEN" },
          sendWithoutTranslation: { visibility: "HIDDEN" },
        },
        modeSwitch,
        sendCapability:
          enabled && !supportMacros.recoveryRequired.value
            ? { kind: "SOURCE" }
            : {
                kind: "BLOCKED",
                reason: supportMacros.recoveryRequired.value
                  ? supportMacros.error.value
                  : "Добавление заметки больше недоступно. Черновик очищен.",
              },
        replyPreview: null,
        translationAssist: null,
      };
    }
    const hasReplyText = replyHasText.value;
    const translatedMode =
      hasReplyText &&
      (replyTranslationRequested.value ||
        translationPolicyRequiresReviewedReply.value);
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
    const sendCapability =
      hasReplyText && replyPolicyChecking.value
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
        conversationId:
          selection?.conversation?.id ?? "unselected-conversation",
      },
      initialDraft: reply.draft.value,
      publicDraftPurgeRevision: publicKnowledgeDraftPurgeRevision.value,
      ...(knowledge.activeCitation.value
        ? {
            knowledgeSource: {
              title:
                knowledge.selected.value?.title ??
                knowledge.items.value.find(
                  (item) =>
                    item.documentId ===
                    knowledge.activeCitation.value?.documentId,
                )?.title ??
                "Внутренний материал",
              revisionNumber: knowledge.activeCitation.value.revisionNumber,
              mode: knowledge.activeCitation.value.mode,
              edited: knowledge.activeCitation.value.text !== reply.draft.value,
            },
          }
        : {}),
      sensitiveDraftPurgeRevision: internalNoteDraftPurgeRevision.value,
      draftRevision:
        translation.draft.value?.id ??
        selection?.actionRevisions.conversationUpdatedAt ??
        selection?.conversation?.updatedAt ??
        "unselected",
      sending: reply.sending.value,
      attachments: {
        draftKey: publicAttachments.draftKey.value,
        accept: publicAttachmentCapabilities().contentTypes.join(","),
        loading: publicAttachments.loading.value,
        busy: publicAttachments.busy.value,
        error: publicAttachments.error.value,
        canDownload: publicAttachmentCapabilities().download,
        maxFiles: publicAttachmentCapabilities().maxFiles,
        items: publicAttachments.items.value,
      },
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
          visibility: publicAttachmentCapabilities().upload
            ? "ENABLED"
            : "DISABLED",
          reason: publicAttachmentCapabilities().upload
            ? undefined
            : "Загрузка файлов в ответ недоступна.",
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
        knowledge: {
          visibility: canReadSelectedKnowledge.value ? "ENABLED" : "HIDDEN",
        },
        templates: {
          visibility: canUseSupportMacros.value
            ? busy
              ? "DISABLED"
              : "ENABLED"
            : "HIDDEN",
          reason: busy ? "Дождитесь завершения текущего действия." : undefined,
        },
        improveWithAI: {
          visibility: "DISABLED",
          reason:
            "Серверная команда улучшения ответа с AI ещё не опубликована.",
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
      modeSwitch,
      sendCapability,
      replyPreview,
      translationAssist:
        canManageTranslation.value && hasSupportTranslationBoundary.value
          ? {
              targetLocale: translation.targetLocale.value,
              busy,
              disabled: !reply.canReply.value || busy,
            }
          : null,
    };
  },
);
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
    available:
      canManageTranslation.value && hasSupportTranslationBoundary.value,
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
const collaboration = createSupportConversationCollaborationController(
  supportConversationCollaborationSource,
  {
    actorId: () => auth.user?.id,
    onAccessRevoked: handleCollaborationAccessRevoked,
  },
);
const currentMessageOrdinal = (): number =>
  conversation.messages.value.reduce(
    (highest, message) => Math.max(highest, message.ordinal ?? 0),
    0,
  );
const workspaceLive = createSupportWorkspaceLiveController(
  {
    async reconcile() {
      await Promise.all([inbox.load(), conversation.reconcile()]);
    },
    collaboration,
    currentMessageOrdinal,
    hasDraft: () => Boolean(reply.draft.value.trim()),
    onAccessRevoked: handleCollaborationAccessRevoked,
    recordTelemetry: recordCoreFeedback,
  },
  cmsRealtimeClient,
);
const workspaceLivePresentationByState: Record<
  CmsRealtimeState,
  {
    label: string;
    compactLabel: string;
    severity: "success" | "warn" | "info";
  }
> = {
  DISCONNECTED: {
    label: "Снимок сервера",
    compactLabel: "Снимок",
    severity: "info",
  },
  CONNECTING: {
    label: "Подключаем обновления",
    compactLabel: "Подключение…",
    severity: "info",
  },
  CONNECTED: {
    label: "Обновления подключены",
    compactLabel: "Подключено",
    severity: "success",
  },
  DEGRADED: {
    label: "Обновления восстанавливаются",
    compactLabel: "Восстановление…",
    severity: "warn",
  },
};
const workspaceLivePresentation = computed(
  () => workspaceLivePresentationByState[workspaceLive.state.value],
);
const selectedConversation = computed(() => {
  return conversation.selection.value?.conversation ?? null;
});
const selectedCase = computed(() => conversation.selection.value?.case ?? null);
const supportConversationCollaboration =
  computed<ConversationSurfaceCollaboration>(() => ({
    availability: collaboration.error.value ? "DEGRADED" : "READY",
    viewers: collaboration.viewers.value,
    typers: collaboration.typers.value,
    collision: collaboration.collision.value,
  }));
const reservationReconcileProgress = ref<{
  key: string;
  attempts: number;
} | null>(null);
const operationsReconcileInFlightKey = ref<string | null>(null);
let operationsReconcileGeneration = 0;
const selectedReservationKey = computed(() => {
  const caseId = selectedCase.value?.id;
  const routing = conversation.selection.value?.routing;
  const expiresAt =
    routing?.state === "AVAILABLE" ? routing.reservation?.expiresAt : null;
  return caseId && expiresAt ? `${caseId}\u0000${expiresAt}` : null;
});
const reservationReconcileAttempt = computed(() =>
  reservationReconcileProgress.value?.key === selectedReservationKey.value
    ? reservationReconcileProgress.value.attempts
    : 0,
);
const reservationReconcileInFlight = computed(
  () => operationsReconcileInFlightKey.value === selectedReservationKey.value,
);
const lastInboxSelectionKey = ref("");
const selectionIntentKey = ref("");
const inboxModeIntent = ref<SupportInboxMode | null>(null);
const selectedInboxKey = computed(
  () =>
    selectionIntentKey.value ||
    requestedSelectionKey.value ||
    lastInboxSelectionKey.value ||
    undefined,
);
const presentedInboxMode = computed(
  () => inboxModeIntent.value ?? inboxMode.value,
);
const presentedInboxItems = computed(() =>
  inboxModeIntent.value ? [] : inbox.items.value,
);
const inboxPresentationLoading = computed(
  () => Boolean(inboxModeIntent.value) || inbox.loading.value,
);
const committedSelectionKey = computed(() => {
  const selection = conversation.selection.value;
  if (selection?.case?.id) return `CASE:${selection.case.id}`;
  return selection?.conversation?.id
    ? `CONVERSATION:${selection.conversation.id}`
    : "";
});
const selectionTransitioning = computed(
  () =>
    Boolean(selectionIntentKey.value) ||
    (Boolean(requestedSelectionKey.value) && conversation.loading.value),
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
    conversation.selection.value?.capabilities.internalNotes?.state ===
      "AVAILABLE" &&
    Boolean(conversation.selection.value.capabilities.internalNotes.read),
);
const canReadSelectedInternalNoteHistory = computed(
  () =>
    canReadSelectedInternalNotes.value &&
    Boolean(
      conversation.selection.value?.capabilities.internalNotes?.historyRead,
    ),
);
const canWriteSelectedInternalNotes = computed(
  () =>
    canReadSelectedInternalNotes.value &&
    Boolean(conversation.selection.value?.capabilities.internalNotes?.create),
);
const canCorrectSelectedInternalNotes = computed(
  () =>
    canReadSelectedInternalNotes.value &&
    Boolean(conversation.selection.value?.capabilities.internalNotes?.correct),
);
const canRedactSelectedInternalNotes = computed(
  () =>
    canReadSelectedInternalNotes.value &&
    Boolean(
      conversation.selection.value?.capabilities.internalNotes?.tombstone,
    ),
);
const selectedInternalNotesAuthorityKey = computed(() => {
  return [auth.project?.id ?? "", requestedSelectionKey.value].join("\u0000");
});
const internalNotesVisible = ref(false);
const internalNotes = createSupportInternalNotesController(
  {
    projectId: () => auth.project?.id,
    caseId: () => conversation.selection.value?.case?.id,
    canRead: () => canReadSelectedInternalNotes.value,
    canReadHistory: () => canReadSelectedInternalNoteHistory.value,
    canWrite: () => canWriteSelectedInternalNotes.value,
    canCorrect: () => canCorrectSelectedInternalNotes.value,
    canRedact: () => canRedactSelectedInternalNotes.value,
    async onReconcileRequired() {
      await Promise.all([inbox.load(), conversation.reconcile()]);
    },
    onMacroDraftRejected: handleSupportMacroRejected,
    async onForbidden() {
      internalNotesAccessDenied.value = true;
      purgeInternalNoteDraft();
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

function purgeInternalNoteDraft(): void {
  internalNotesVisible.value = false;
  internalNoteDraft.value = "";
  internalNoteDraftPurgeRevision.value += 1;
  supportComposerMode.value = "PUBLIC_REPLY";
}
const supportConversationInternalNotes =
  computed<ConversationSurfaceInternalNotes>(() => ({
    loading: internalNotes.loading.value,
    error: internalNotes.error.value,
    totalVisible: internalNotes.notes.value.length,
    hasMore: Boolean(internalNotes.nextCursor.value),
    items: internalNotes.notes.value.slice(0, 1).map((note) => ({
      id: note.id,
      body: note.body,
      lifecycle: note.lifecycle,
      creatorName: note.creatorName,
      updatedAt: note.updatedAt,
    })),
  }));
const stopInternalNoteRealtime = cmsRealtimeClient.subscribe(
  ["support.internal_note.changed.v1"],
  (value) => {
    const hint = parseSupportInternalNoteChanged(value);
    const selection = conversation.selection.value;
    if (
      !hint ||
      hint.projectId !== auth.project?.id ||
      hint.caseId !== selection?.case?.id ||
      !selection.capabilities.internalNotes?.realtimeWatch ||
      !canReadSelectedInternalNotes.value
    )
      return;
    void internalNotes.reconcile();
  },
);
const stopInternalNoteWatchTermination =
  cmsRealtimeClient.onSupportInternalNoteWatchTerminated(async (caseId) => {
    if (caseId !== conversation.selection.value?.case?.id) return;
    internalNotesAccessDenied.value = true;
    purgeInternalNoteDraft();
    internalNotes.reset();
    try {
      await auth.refreshContext();
    } catch {
      // The private projection is already purged; remain fail-closed offline.
    }
    await Promise.all([inbox.load(), conversation.reconcile()]).catch(
      () => undefined,
    );
  });
const selectedInternalNoteWatchKey = computed(() => {
  const selection = conversation.selection.value;
  return [
    auth.project?.id ?? "",
    selection?.case?.id ?? "",
    selection?.capabilities.internalNotes?.realtimeWatch ? "watch" : "off",
    canReadSelectedInternalNotes.value ? "read" : "denied",
  ].join("\u0000");
});
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
    canOverrideSupportAssignments(auth.project?.effectivePermissionCodes ?? []),
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
const assignment = createSupportAssignmentController(supportAssignmentSource, {
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
});
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
  if (!snapshot)
    return availability.loading.value ? "Загружается…" : "Не загружена";
  const state =
    {
      AVAILABLE: "Доступен для новых обращений",
      BUSY: "Занят",
      AWAY: "Отошёл",
      DRAINING: "Завершает текущую работу",
      OFFLINE: "Офлайн",
    }[snapshot.effectiveState] ?? "Состояние доступности не распознано";
  return snapshot.acceptsNewWork
    ? state
    : `${state} · новую работу не принимает`;
});
const availabilityButtonLabel = computed(
  () => `Моя доступность: ${assignmentAvailabilityLabel.value}`,
);
const availabilityCompactLabel = computed(() => {
  const state = availability.availability.value?.effectiveState;
  const labels: Record<string, string> = {
    AVAILABLE: "Я доступен",
    BUSY: "Я занят",
    AWAY: "Я отошёл",
    DRAINING: "Завершаю работу",
    OFFLINE: "Я офлайн",
  };
  return (
    labels[state ?? ""] ??
    (availability.loading.value ? "Загрузка статуса" : "Статус не загружен")
  );
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
const inspectorEventsAccessDenied = ref(false);
const inspectorActivityAccessDenied = ref(false);
const externalWorkAccessDenied = ref(false);
const externalWorkPermissions = computed(() => {
  const permissions = auth.project?.effectivePermissionCodes ?? [];
  const allowed = (permission: Parameters<typeof hasProjectPermission>[1]) =>
    !externalWorkAccessDenied.value &&
    hasProjectPermission(permissions, permission);
  const read = allowed("project.support.external_work.read_linked");
  return {
    read,
    // A 202 receipt can only be reconciled through read_linked on the pinned
    // backend. Keep create fail-closed when that recovery authority is absent.
    create: read && allowed("project.support.external_work.create"),
    commentInternal: allowed("project.support.external_work.comment_internal"),
    commentPublic: allowed("project.support.external_work.comment_public"),
    readInternal: allowed("project.support.external_work.read_internal"),
    retry: allowed("project.support.external_work.retry"),
    resolveUnknown: allowed("project.support.external_work.resolve_unknown"),
    inboxRead: allowed("project.support.external_work.inbox_read"),
  };
});
const canUseSelectedExternalWork = computed(
  () =>
    Boolean(conversation.selection.value?.case) &&
    (externalWorkPermissions.value.read ||
      externalWorkPermissions.value.create),
);
const externalWork = createSupportCaseExternalWorkController(
  {
    projectId: () => auth.project?.id,
    actorId: () => auth.user?.id,
    caseId: () => conversation.selection.value?.case?.id,
    caseTitle: () => conversation.selection.value?.case?.title ?? "",
    caseSummary: () => {
      const supportCase = conversation.selection.value?.case;
      return supportCase
        ? `${supportCase.groupCode} · ${supportCase.title}`
        : "";
    },
    permissions: () => externalWorkPermissions.value,
    async onForbidden() {
      externalWorkAccessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // Protected links and remote text are already purged by the controller.
      }
    },
    async onAuthenticationRequired() {
      try {
        await auth.logout();
      } catch {
        // Local authority is cleared before remote logout; navigation is mandatory.
      } finally {
        await router.replace({
          path: "/login",
          query: { redirect: route.fullPath },
        });
      }
    },
  },
  supportExternalWorkSource,
);
externalWork.setDraftCopyHandler((text) => {
  supportComposerMode.value = "PUBLIC_REPLY";
  reply.draft.value = [reply.draft.value.trim(), text.trim()]
    .filter(Boolean)
    .join("\n\n");
  workspaceLive.setDraftActive(true);
  if (isMobileWorkspace.value) void closeMobileInspector();
});
const canReadInspectorProfile = computed(
  () =>
    !profileAccessDenied.value &&
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      "project.profiles.read",
    ),
);
const canReadInspectorEvents = computed(
  () =>
    !inspectorEventsAccessDenied.value &&
    Boolean(conversation.selection.value?.case) &&
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      "project.cases.read",
    ) &&
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      "project.support.inspector_events.read",
    ),
);
const canReadInspectorActivity = computed(
  () =>
    !inspectorActivityAccessDenied.value &&
    Boolean(conversation.selection.value?.case) &&
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      "project.support.activity.read",
    ),
);
const inspector = createSupportInspectorController(
  {
    projectId: () => auth.project?.id,
    endUserId: () => conversation.selection.value?.endUser.id,
    caseId: () => conversation.selection.value?.case?.id,
    operatorId: () => auth.user?.id,
    permissions: () => ({
      profile: canReadInspectorProfile.value,
      events: canReadInspectorEvents.value,
      activity: canReadInspectorActivity.value,
      knowledge: canReadSelectedKnowledge.value,
      externalWork: canUseSelectedExternalWork.value,
    }),
    async onForbidden(tab) {
      if (tab === "DATA") profileAccessDenied.value = true;
      if (tab === "EVENTS") inspectorEventsAccessDenied.value = true;
      if (tab === "ACTIVITY") inspectorActivityAccessDenied.value = true;
      if (tab === "KNOWLEDGE") await handleSupportKnowledgeForbidden();
      if (tab === "INTEGRATIONS") externalWorkAccessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // The protected projection is already purged; route guards own recovery.
      }
    },
  },
  supportInspectorSource,
);

async function openInboxItem(item: SupportInboxItem): Promise<void> {
  const selectionKey = `${item.kind}:${item.id}`;
  lastInboxSelectionKey.value = selectionKey;
  if (
    selectionKey === requestedSelectionKey.value &&
    (!selectionIntentKey.value || selectionIntentKey.value === selectionKey)
  ) {
    selectionIntentKey.value = "";
    return;
  }
  selectionIntentKey.value = selectionKey;
  const query = { ...route.query };
  delete query.panel;
  try {
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
    if (selectionIntentKey.value === selectionKey) {
      const alreadyPresented =
        requestedSelectionKey.value === selectionKey &&
        committedSelectionKey.value === selectionKey &&
        !conversation.loading.value;
      if (requestedSelectionKey.value !== selectionKey || alreadyPresented)
        selectionIntentKey.value = "";
    }
  } catch (error) {
    if (selectionIntentKey.value === selectionKey)
      selectionIntentKey.value = "";
    throw error;
  }
}

async function changeInboxMode(mode: SupportInboxMode): Promise<void> {
  if (mode === presentedInboxMode.value) return;
  inboxModeIntent.value = mode;
  const query = { ...route.query };
  delete query.panel;
  if (mode === "ALL_CONVERSATIONS") delete query.mode;
  else query.mode = "cases";
  try {
    await router.push({ name: "support-inbox", query });
    if (inboxMode.value !== mode && inboxModeIntent.value === mode)
      inboxModeIntent.value = null;
  } catch (error) {
    if (inboxModeIntent.value === mode) inboxModeIntent.value = null;
    throw error;
  }
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
  await router.replace({
    query: { ...query, ...writeSupportSearchRoute(state) },
  });
}

function runSupportSearch(state: SupportSearchRouteState): void {
  if (!canUseSupportSearch.value) return;
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
  if (!canUseSupportSearch.value) return;
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

async function selectSupportView(
  selection: SupportViewSelection,
): Promise<void> {
  if (!canUseSupportSearch.value) return;
  clearSupportSearchTimer();
  searchOpen.value = false;
  supportSearch.reset();
  await supportViews.select(selection);
}

async function startCustomSupportSearch(): Promise<void> {
  if (!canUseSupportSearch.value) return;
  clearSupportSearchTimer();
  supportSearch.reset();
  searchState.value = readSupportSearchRoute({});
  searchOpen.value = true;
  await supportViews.clearSelection();
  await syncSupportSearchRoute(searchState.value);
  supportInboxPane.value?.openSearchTools({ focusSearch: true });
}

async function createSupportView(value: {
  name: string;
  code: string;
  scope: "PERSONAL" | "TEAM" | "PROJECT";
  teamId: string;
}): Promise<void> {
  if (!canUseSupportSearch.value) return;
  const command = createSavedViewCommand(
    value.name,
    value.code,
    value.scope,
    value.teamId,
    searchState.value,
  );
  if (!command) return;
  const signature = `create:${JSON.stringify(command)}`;
  if (await supportViews.create(command, supportViewIntentKey(signature)))
    supportViewIntentKeys.delete(signature);
}

async function replaceSupportView(value: {
  view: import("@/shared/api/generated/models").SavedSupportViewResponseDto;
  displayName: string;
}): Promise<void> {
  if (!canUseSupportSearch.value) return;
  const { view } = value;
  const displayName = value.displayName.trim();
  if (
    !view.permissions.replaceDraft ||
    displayName.length < 2 ||
    displayName.length > 120
  )
    return;
  const command = { draft: { ...view.draft, displayName } };
  const signature = `replace:${view.id}:${view.etag}:${JSON.stringify(command)}`;
  if (
    await supportViews.replace(view, command, supportViewIntentKey(signature))
  )
    supportViewIntentKeys.delete(signature);
}

async function setDefaultSupportView(
  selection: SupportViewSelection,
): Promise<void> {
  if (!canUseSupportSearch.value) return;
  const command =
    selection.kind === "SYSTEM"
      ? { kind: "SYSTEM" as const, presetCode: selection.code }
      : { kind: "SAVED" as const, savedViewId: selection.id };
  const signature = `default:${JSON.stringify(command)}:${supportViews.defaultView.value?.etag ?? "none"}`;
  if (await supportViews.setDefault(command, supportViewIntentKey(signature)))
    supportViewIntentKeys.delete(signature);
}

async function publishSupportView(
  view: import("@/shared/api/generated/models").SavedSupportViewResponseDto,
): Promise<void> {
  if (!canUseSupportSearch.value) return;
  if (!view.permissions.publish) return;
  const signature = `publish:${view.id}:${view.etag}`;
  if (await supportViews.publish(view, supportViewIntentKey(signature)))
    supportViewIntentKeys.delete(signature);
}

async function archiveSupportView(
  view: import("@/shared/api/generated/models").SavedSupportViewResponseDto,
): Promise<void> {
  if (!canUseSupportSearch.value) return;
  if (!view.permissions.archive) return;
  const signature = `archive:${view.id}:${view.etag}`;
  if (await supportViews.archive(view, supportViewIntentKey(signature)))
    supportViewIntentKeys.delete(signature);
}

async function closeSupportSearch(): Promise<void> {
  if (!canUseSupportSearch.value) return;
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

async function openSupportSearchResult(
  item: SupportSearchResult,
): Promise<void> {
  if (!canUseSupportSearch.value) return;
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
  await router.push({
    name: "users",
    params: { endUserId: item.selection.id },
  });
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

async function openSupportKnowledge(): Promise<void> {
  if (!canReadSelectedKnowledge.value) return;
  await inspector.open("KNOWLEDGE");
  if (isMobileWorkspace.value) {
    await router.push({ query: { ...route.query, panel: "inspector" } });
  } else if (isCompactWorkspace.value) {
    contextDrawerVisible.value = true;
  }
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
    (!internalNotesVisible.value &&
      supportComposerMode.value !== "INTERNAL_NOTE") ||
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
    canUseSupportSearch.value &&
    !event.altKey &&
    !event.shiftKey &&
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === "k" &&
    !document.querySelector("[role='dialog'][aria-modal='true']")
  ) {
    event.preventDefault();
    searchOpen.value = true;
    supportInboxPane.value?.openSearchTools({ focusSearch: true });
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
    canManageRoutingOffers.value ? assignment.loadOffers() : Promise.resolve(),
  ]);
  reply.syncSelection();
  reloadSelectedAiSuspension();
}

async function reconcileCaseOperations(expiresAt: string): Promise<void> {
  const projectId = auth.project?.id;
  const caseId = selectedCase.value?.id;
  if (!projectId || !caseId) return;
  const reservationKey = `${caseId}\u0000${expiresAt}`;
  const previousAttempts =
    reservationReconcileProgress.value?.key === reservationKey
      ? reservationReconcileProgress.value.attempts
      : 0;
  if (
    operationsReconcileInFlightKey.value === reservationKey ||
    previousAttempts >= 3
  )
    return;
  const generation = ++operationsReconcileGeneration;
  operationsReconcileInFlightKey.value = reservationKey;
  try {
    await Promise.all([inbox.load(), conversation.reconcile()]);
    if (
      generation !== operationsReconcileGeneration ||
      auth.project?.id !== projectId ||
      selectedCase.value?.id !== caseId
    )
      return;
    if (canManageOwnAssignments.value || canOverrideAssignments.value) {
      await assignment.loadCase();
    }
  } finally {
    if (generation === operationsReconcileGeneration) {
      reservationReconcileProgress.value = {
        key: reservationKey,
        attempts: previousAttempts + 1,
      };
      operationsReconcileInFlightKey.value = null;
    }
  }
}

async function sendReply(attachments?: {
  attachmentIds: string[];
  attachmentDraftKey: string;
}): Promise<void> {
  if (
    supportMacros.recoveryRequired.value ||
    knowledge.recoveryRequired.value ||
    knowledge.inserting.value ||
    knowledge.preparing.value
  )
    return;
  const activeMacro = supportMacros.activeDraft.value;
  const macroReplyDraftId =
    activeMacro?.target.kind === "PUBLIC_REPLY"
      ? await supportMacros.prepareForSend(reply.draft.value)
      : undefined;
  if (activeMacro?.target.kind === "PUBLIC_REPLY" && !macroReplyDraftId) return;
  const hadKnowledgeCitation = Boolean(knowledge.activeCitation.value);
  const supportKnowledgeCitationDraftId = hadKnowledgeCitation
    ? await knowledge.prepareForSend(reply.draft.value)
    : undefined;
  if (hadKnowledgeCitation && !supportKnowledgeCitationDraftId) return;
  if (!replyHasText.value) {
    await reply.send(attachments);
    return;
  }
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
      await sendTranslatedReply(undefined, attachments);
      return;
    }
    await prepareReplyTranslation();
    return;
  }
  await reply.send({
    ...attachments,
    ...(macroReplyDraftId ? { macroReplyDraftId } : {}),
    ...(supportKnowledgeCitationDraftId
      ? { supportKnowledgeCitationDraftId }
      : {}),
  });
}

function setSendWithoutTranslationVisible(visible: boolean): void {
  sendWithoutTranslationVisible.value = visible;
  if (!visible) sendWithoutTranslationReason.value = "";
}

async function sendReplyWithoutTranslation(): Promise<void> {
  if (
    supportMacros.recoveryRequired.value ||
    knowledge.recoveryRequired.value ||
    knowledge.inserting.value ||
    knowledge.preparing.value
  )
    return;
  const reason = sendWithoutTranslationReason.value.trim();
  if (!reason || !reply.canSendWithoutTranslation.value) return;
  const activeMacro = supportMacros.activeDraft.value;
  const macroReplyDraftId =
    activeMacro?.target.kind === "PUBLIC_REPLY"
      ? await supportMacros.prepareForSend(reply.draft.value)
      : undefined;
  if (activeMacro?.target.kind === "PUBLIC_REPLY" && !macroReplyDraftId) return;
  const hadKnowledgeCitation = Boolean(knowledge.activeCitation.value);
  const supportKnowledgeCitationDraftId = hadKnowledgeCitation
    ? await knowledge.prepareForSend(reply.draft.value)
    : undefined;
  if (hadKnowledgeCitation && !supportKnowledgeCitationDraftId) return;
  await reply.sendWithoutTranslation(
    reason,
    publicAttachments.readyIds.value.length && publicAttachments.draftKey.value
      ? {
          attachmentIds: publicAttachments.readyIds.value,
          attachmentDraftKey: publicAttachments.draftKey.value,
        }
      : undefined,
    macroReplyDraftId ?? undefined,
    supportKnowledgeCitationDraftId,
  );
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
  if (!hasSupportTranslationBoundary.value) messageViewMode.value = "ORIGINAL";
}

async function openTranslationSettings(): Promise<void> {
  translationSettingsVisible.value = true;
  await ensureReplyTranslationLoaded();
}

async function showTranslatedMessages(): Promise<void> {
  if (!(await ensureReplyTranslationLoaded())) return;
  if (!hasSupportTranslationBoundary.value) return;
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
  if (request.mode === "INTERNAL_NOTE") {
    internalNoteDraft.value = request.text;
    return;
  }
  reply.draft.value = request.text;
  void workspaceLive.recordTypingActivity(Boolean(request.text.trim()));
}

async function sendSupportComposer(
  request: ConversationSurfaceSendRequest,
): Promise<void> {
  if (supportMacros.recoveryRequired.value) return;
  if (request.mode === "INTERNAL_NOTE") {
    if (!canWriteSelectedInternalNotes.value) return;
    internalNoteDraft.value = request.text;
    const conversationId = conversation.selection.value?.conversation?.id;
    const attachmentDraft =
      request.attachmentIds?.length && request.attachmentDraftKey
        ? { ids: request.attachmentIds, draftKey: request.attachmentDraftKey }
        : undefined;
    const activeMacro = supportMacros.activeDraft.value;
    const macroDraftId =
      activeMacro?.target.kind === "INTERNAL_NOTE"
        ? await supportMacros.prepareForSend(request.text)
        : undefined;
    if (activeMacro?.target.kind === "INTERNAL_NOTE" && !macroDraftId) return;
    if (
      await internalNotes.create(
        request.text,
        conversationId,
        attachmentDraft,
        macroDraftId ?? undefined,
      )
    ) {
      internalNoteDraft.value = "";
      supportMacros.detachIfChanged("");
      if (attachmentDraft) noteAttachments.consumeDraft();
      await internalNotes.reconcile();
    }
    return;
  }
  reply.draft.value = request.text;
  await sendReply(
    request.attachmentIds?.length && request.attachmentDraftKey
      ? {
          attachmentIds: request.attachmentIds,
          attachmentDraftKey: request.attachmentDraftKey,
        }
      : undefined,
  );
  if (!reply.draft.value.trim()) void workspaceLive.setDraftActive(false);
}

function changeSupportComposerMode(
  mode: "PUBLIC_REPLY" | "INTERNAL_NOTE",
): void {
  if (mode === supportComposerMode.value) return;
  if (supportMacros.recoveryRequired.value || knowledge.recoveryRequired.value)
    return;
  supportMacros.reset({ keepQuery: true });
  replyTemplateGalleryVisible.value = false;
  if (mode === "INTERNAL_NOTE") {
    if (!canWriteSelectedInternalNotes.value) return;
    supportComposerMode.value = mode;
    void internalNotes.load(undefined, { retainNotesUntilResponse: true });
    return;
  }
  if (!reply.canReply.value) return;
  supportComposerMode.value = mode;
}

async function sendSupportTranslatedReply(
  request: ConversationSurfaceSendRequest,
): Promise<void> {
  await sendTranslatedReply(
    request.text,
    request.attachmentIds?.length && request.attachmentDraftKey
      ? {
          attachmentIds: request.attachmentIds,
          attachmentDraftKey: request.attachmentDraftKey,
        }
      : undefined,
  );
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
      void supportMacros.load();
      break;
    case "CLASSIFY_CASE":
      void classifySelectedCase();
      break;
    case "INTERNAL_NOTES":
      if (canWriteSelectedInternalNotes.value)
        changeSupportComposerMode("INTERNAL_NOTE");
      else openInternalNotes();
      break;
    case "KNOWLEDGE":
      void openSupportKnowledge();
      break;
    case "REMOVE_KNOWLEDGE":
      knowledge.accepted();
      reply.draft.value = "";
      publicKnowledgeDraftPurgeRevision.value += 1;
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

async function addSupportAttachments(files: File[]): Promise<void> {
  await (supportComposerMode.value === "INTERNAL_NOTE"
    ? noteAttachments.addFiles(files)
    : publicAttachments.addFiles(files));
  if (
    supportComposerMode.value === "PUBLIC_REPLY" &&
    publicAttachments.items.value.length
  )
    void workspaceLive.setDraftActive(true);
}

function removeSupportAttachment(localId: string): void {
  const operation =
    supportComposerMode.value === "INTERNAL_NOTE"
      ? noteAttachments.remove(localId)
      : publicAttachments.remove(localId);
  void operation.then(() => {
    if (
      supportComposerMode.value === "PUBLIC_REPLY" &&
      !reply.draft.value.trim() &&
      !publicAttachments.items.value.length
    )
      void workspaceLive.setDraftActive(false);
  });
}

function retrySupportAttachment(localId: string): void {
  void (supportComposerMode.value === "INTERNAL_NOTE"
    ? noteAttachments.retry(localId)
    : publicAttachments.retry(localId));
}

function downloadSupportAttachment(
  request: ConversationSurfaceAttachmentDownloadRequest,
): void {
  void (request.visibility === "INTERNAL_NOTE"
    ? noteAttachments.download(request.attachmentId)
    : publicAttachments.download(request.attachmentId));
}

async function applySupportReplyTemplate(
  macro: SupportMacroResponseDto,
): Promise<void> {
  const text = await supportMacros.apply(macro);
  if (!text) return;
  if (supportComposerMode.value === "INTERNAL_NOTE")
    internalNoteDraft.value = text;
  else reply.draft.value = text;
  replyTemplateGalleryVisible.value = false;
}

function searchSupportMacros(query: string): void {
  supportMacros.query.value = query;
  void supportMacros.load();
}

async function prepareReplyTranslation(): Promise<void> {
  if (supportMacros.recoveryRequired.value) return;
  const activeMacro = supportMacros.activeDraft.value;
  if (
    activeMacro?.target.kind === "PUBLIC_REPLY" &&
    !(await supportMacros.prepareForSend(reply.draft.value))
  )
    return;
  if (!(await ensureReplyTranslationLoaded())) return;
  if (!hasSupportTranslationBoundary.value) {
    await openTranslationSettings();
    return;
  }
  replyTranslationRequested.value = true;
  await translation.createReplyPreview();
}

async function sendTranslatedReply(
  editedText?: string,
  attachments?: { attachmentIds: string[]; attachmentDraftKey: string },
): Promise<void> {
  if (
    translation.savingPreference.value ||
    translation.previewStale.value ||
    knowledge.inserting.value ||
    knowledge.preparing.value ||
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
  const macroReplyDraftId =
    supportMacros.activeDraft.value?.target.kind === "PUBLIC_REPLY"
      ? supportMacros.activeDraft.value.receipt.id
      : undefined;
  const hadKnowledgeCitation = Boolean(knowledge.activeCitation.value);
  const supportKnowledgeCitationDraftId = hadKnowledgeCitation
    ? await knowledge.prepareForSend(reply.draft.value)
    : undefined;
  if (hadKnowledgeCitation && !supportKnowledgeCitationDraftId) return;
  await reply.sendTranslatedReply(
    ready.id,
    attachments,
    macroReplyDraftId,
    supportKnowledgeCitationDraftId,
  );
  if (!reply.draft.value.trim()) {
    translation.clearReplyDraft();
    replyTranslationRequested.value = false;
  }
}

function reloadSelectedAiSuspension(): void {
  const selection = conversation.selection.value;
  if (!canReadSelectedAiSuspension.value || !selection?.conversation) return;
  aiSuspension.restoreConversation(selection.conversation.id);
  // A null action revision authoritatively means that no suspension row exists,
  // so the workspace response is already complete. Active states still load the
  // actor/note detail, with parallel reads coalesced by the store.
  void aiSuspension.ensureDetail(
    selection.endUser.id,
    selection.conversation.id,
    selection.actionRevisions.aiSuspensionVersion,
  );
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
  inspector.reset();
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

async function handleCollaborationAccessRevoked(): Promise<void> {
  await workspaceLive.setSelection(undefined, undefined);
  conversation.reset();
  collaboration.reset();
  await handleConversationForbidden();
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
  const initialCustomSearch = shouldLoadCustomSupportView(
    route.query,
    hasSupportSearchCriteria(searchState.value),
  );
  if (initialCustomSearch) {
    searchOpen.value = true;
    await supportViews.loadCustom();
    if (!isCustomSupportViewRoute(route.query)) {
      await router.replace({
        query: { ...route.query, ...writeSupportViewSelection(null) },
      });
    }
  } else await supportViews.load(readSupportViewSelection(route.query));
  if (
    !supportViews.selection.value &&
    hasSupportSearchCriteria(searchState.value)
  )
    await supportSearch.search();
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
    inspectorEventsAccessDenied.value = false;
    inspectorActivityAccessDenied.value = false;
    externalWorkAccessDenied.value = false;
    availabilityAccessDenied.value = false;
    assignmentAccessDenied.value = false;
    aiSuspensionAccessDenied.value = false;
    internalNotesAccessDenied.value = false;
    supportMacrosAccessDenied.value = false;
    knowledgeAccessDenied.value = false;
    publicAttachmentsAccessDenied.value = false;
    noteAttachmentsAccessDenied.value = false;
    aiSuspensionDialogVisible.value = false;
    aiSuspensionHistoryVisible.value = false;
    internalNotesVisible.value = false;
    assignment.reset();
    leadAssignment.reset();
    availability.reset();
    inspector.reset();
    externalWork.reset();
    internalNotes.reset();
    caseDesk.reset();
    reply.reset();
    supportMacros.reset();
    knowledge.purge();
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
      const resumeCustomSearch =
        !projectChanged &&
        shouldLoadCustomSupportView(
          route.query,
          hasSupportSearchCriteria(searchState.value),
        );
      if (resumeCustomSearch) {
        searchOpen.value = true;
        await supportViews.loadCustom();
      } else {
        await supportViews.load(
          projectChanged ? null : readSupportViewSelection(route.query),
        );
      }
      if (
        !supportViews.selection.value &&
        !projectChanged &&
        hasSupportSearchCriteria(searchState.value)
      )
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

watch(canUseSupportSearch, (allowed) => {
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
  if (!canUseSupportSearch.value) return;
  const custom = shouldLoadCustomSupportView(
    route.query,
    hasSupportSearchCriteria(searchState.value),
  );
  void (custom
    ? supportViews.loadCustom()
    : supportViews.load(readSupportViewSelection(route.query)));
});
watch(canCreateSavedViews, (allowed) => {
  if (!allowed) supportViewIntentKeys.clear();
});

watch(operationsContextAuthorityKey, (authorityKey, previousAuthorityKey) => {
  if (authorityKey === previousAuthorityKey) return;
  operationsReconcileGeneration += 1;
  operationsReconcileInFlightKey.value = null;
  reservationReconcileProgress.value = null;
  conversation.purgeOperationsContext({ sla: true, routing: true });
  if (!routeCaseId.value && !routeConversationId.value) return;
  void (conversation.selection.value
    ? conversation.reconcile()
    : conversation.load());
});

watch(canManageRoutingOffers, (allowed) => {
  if (!allowed) {
    assignment.resetOffers();
    return;
  }
  void assignment.loadOffers();
});

watch(
  [canManageOwnAssignments, canOverrideAssignments],
  ([canOwn, canOverride]) => {
    if (!canOwn && !canOverride) {
      assignment.resetCase();
      leadAssignment.reset();
      return;
    }
    if (!canOverride) leadAssignment.reset();
    void assignment.loadCase();
  },
);

watch(canReadSelectedAiSuspension, (allowed) => {
  if (allowed) {
    reloadSelectedAiSuspension();
    return;
  }
  aiSuspensionDialogVisible.value = false;
  aiSuspensionHistoryVisible.value = false;
});

watch(
  [canReadSelectedInternalNotes, conversation.loading],
  ([allowed, loading]) => {
    if (allowed || loading) return;
    purgeInternalNoteDraft();
    internalNotes.reset();
  },
);

watch(
  [publicAttachmentAuthorityKey, conversation.loading],
  ([, loading]) => {
    if (loading) return;
    const capability = publicAttachmentCapabilities();
    if (capability.state !== "AVAILABLE" || !capability.upload) {
      publicAttachments.purge();
      return;
    }
    void publicAttachments.select();
  },
  { immediate: true },
);

watch(
  [noteAttachmentAuthorityKey, conversation.loading],
  ([, loading]) => {
    if (loading) return;
    const capability = noteAttachmentCapabilities();
    if (capability.state !== "AVAILABLE" || !capability.upload) {
      noteAttachments.purge();
      return;
    }
    void noteAttachments.select();
  },
  { immediate: true },
);

watch(
  [canWriteSelectedInternalNotes, conversation.loading],
  ([allowed, loading]) => {
    if (allowed || loading || supportComposerMode.value !== "INTERNAL_NOTE")
      return;
    purgeInternalNoteDraft();
  },
);

watch(
  [canReadSelectedInternalNoteHistory, conversation.loading],
  ([allowed, loading]) => {
    if (!allowed && !loading) internalNotes.closeHistory();
  },
);

watch(hasKnowledgeReadPermission, (allowed, previousAllowed) => {
  if (allowed || !previousAllowed) return;
  void handleSupportKnowledgeForbidden();
});

watch(
  [
    internalNotesVisible,
    supportComposerMode,
    canReadSelectedInternalNotes,
    selectedInternalNotesAuthorityKey,
  ],
  syncInternalNotesReconciliation,
);

watch(
  [
    () => auth.user?.id,
    hasSupportMacrosReadPermission,
    hasSupportMacrosUsePermission,
  ],
  ([actorId, canRead, canUse], [previousActorId]) => {
    if (actorId === previousActorId && canRead && canUse) return;
    if (knowledge.activeCitation.value) {
      reply.draft.value = "";
      publicKnowledgeDraftPurgeRevision.value += 1;
    }
    supportMacros.reset({ keepQuery: actorId === previousActorId });
    knowledge.purge({ keepQuery: actorId === previousActorId });
    replyTemplateGalleryVisible.value = false;
  },
  { flush: "sync" },
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
    publicAttachmentsAccessDenied.value = false;
    noteAttachmentsAccessDenied.value = false;
    purgeInternalNoteDraft();
    internalNotes.reset();
  },
);

watch(
  selectedInternalNoteWatchKey,
  async (key, previousKey) => {
    const [, previousCaseId] = previousKey?.split("\u0000") ?? [];
    if (previousCaseId)
      cmsRealtimeClient.unwatchSupportInternalNotes(previousCaseId);
    const [, caseId, watch, read] = key.split("\u0000");
    if (!caseId || watch !== "watch" || read !== "read") return;
    const joined = await cmsRealtimeClient.watchSupportInternalNotes(caseId);
    if (joined && canReadSelectedInternalNotes.value)
      await internalNotes.reconcile();
  },
  { immediate: true },
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
    if (canReadSelectedCaseDesk.value)
      await caseDesk.load().catch(() => undefined);
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

watch(inboxMode, async (mode) => {
  inbox.reset();
  await inbox.load();
  if (inboxModeIntent.value === mode) inboxModeIntent.value = null;
});

watch(
  () => route.query,
  (query) => {
    const next = readWorkspaceSearchRoute(query);
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
    if (!canUseSupportSearch.value) {
      supportViews.reset();
      return;
    }
    const custom = shouldLoadCustomSupportView(
      route.query,
      hasSupportSearchCriteria(readWorkspaceSearchRoute(route.query)),
    );
    if (custom) {
      searchOpen.value = true;
      if (supportViews.selection.value) void supportViews.loadCustom();
      return;
    }
    const requested = readSupportViewSelection(route.query);
    const current = supportViews.selection.value;
    const same =
      requested?.kind === current?.kind &&
      (requested?.kind === "SYSTEM"
        ? requested.code ===
          (current?.kind === "SYSTEM" ? current.code : undefined)
        : requested?.id ===
          (current?.kind === "SAVED" ? current.id : undefined));
    if (!same) void supportViews.load(requested);
  },
);

watch(
  requestedSelectionKey,
  (selectionKey, previousSelectionKey) => {
    if (!selectionKey && selectionIntentKey.value) {
      selectionIntentKey.value = "";
    }
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
    inspectorEventsAccessDenied.value = false;
    inspectorActivityAccessDenied.value = false;
    externalWorkAccessDenied.value = false;
    assignmentAccessDenied.value = false;
    aiSuspensionAccessDenied.value = false;
    internalNotesAccessDenied.value = false;
    aiSuspensionDialogVisible.value = false;
    aiSuspensionHistoryVisible.value = false;
    internalNotesVisible.value = false;
    internalNoteDraft.value = "";
    if (knowledge.activeCitation.value) {
      reply.draft.value = "";
      publicKnowledgeDraftPurgeRevision.value += 1;
    }
    supportComposerMode.value = "PUBLIC_REPLY";
    assignment.resetCase();
    inspector.reset();
    externalWork.reset();
    internalNotes.reset();
    knowledge.purge({ keepQuery: true });
    messageDelivery.reset();
    void conversation.load();
  },
  { immediate: true },
);

watch(
  [
    requestedSelectionKey,
    committedSelectionKey,
    () => conversation.loading.value,
    () => conversation.error.value,
  ],
  ([requested, committed, loading, error]) => {
    const intent = selectionIntentKey.value;
    if (!intent || requested !== intent || loading) return;
    if (committed === intent || error) selectionIntentKey.value = "";
  },
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
    () => conversation.selection.value?.case?.id,
  ],
  () => {
    reply.syncSelection();
    supportMacros.reset({ keepQuery: true });
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
    supportMacros.detachIfChanged(draft);
    const active = Boolean(draft.trim());
    void workspaceLive.setDraftActive(active);
    if (!active) {
      void workspaceLive.recordTypingActivity(false);
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

onBeforeUnmount(() => {
  clearSupportSearchTimer();
  window.removeEventListener("keydown", handleWorkspaceKeydown);
  mobileWorkspaceMedia?.removeEventListener("change", syncMobileWorkspace);
  compactWorkspaceMedia?.removeEventListener("change", syncCompactWorkspace);
  mobileWorkspaceMedia = null;
  compactWorkspaceMedia = null;
  stopInternalNotesReconciliation();
  stopInternalNoteRealtime();
  stopInternalNoteWatchTermination();
  cmsRealtimeClient.unwatchSupportInternalNotes();
  inspector.reset();
  internalNotes.reset();
  publicAttachments.dispose();
  noteAttachments.dispose();
  reply.reset();
  supportMacros.reset();
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
          <Tag
            :value="
              isMobileWorkspace
                ? workspaceLivePresentation.compactLabel
                : workspaceLivePresentation.label
            "
            :aria-label="workspaceLivePresentation.label"
            :severity="workspaceLivePresentation.severity"
          />
          <Button
            v-if="canReadAvailability"
            class="availability-button"
            :label="availabilityCompactLabel"
            :aria-label="availabilityButtonLabel"
            :title="availabilityButtonLabel"
            icon="pi pi-user"
            :data-availability-state="
              availability.availability.value?.effectiveState ?? 'UNKNOWN'
            "
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
          'has-route-selection': Boolean(
            requestedSelectionKey || selectionIntentKey,
          ),
          'has-mobile-inspector': mobileInspectorVisible,
        }"
      >
        <SupportInboxPane
          ref="supportInboxPane"
          :mode="presentedInboxMode"
          :items="presentedInboxItems"
          :selected-key="selectedInboxKey"
          :loading="inboxPresentationLoading"
          :error="inbox.error.value"
          :failure="inbox.failure.value"
          :has-more="Boolean(inbox.nextCursor.value)"
          :can-read-cases="canReadInbox"
          :can-read-conversations="canReadInbox"
          :can-search="canUseSupportSearch"
          :search-state="searchState"
          :search-active="searchActive"
          :search-items="
            viewActive ? supportViews.items.value : supportSearch.items.value
          "
          :search-loading="
            viewActive
              ? supportViews.loading.value
              : supportSearch.loading.value
          "
          :search-error="
            viewActive ? supportViews.error.value : supportSearchVisibleError
          "
          :search-failure="supportSearch.failure.value"
          :search-freshness="
            viewActive
              ? supportViews.freshness.value
              : supportSearch.freshness.value
          "
          :search-has-more="
            Boolean(
              viewActive
                ? supportViews.nextCursor.value
                : supportSearch.nextCursor.value,
            )
          "
          :view-system="supportViews.system.value"
          :view-saved="supportViews.saved.value"
          :view-selection="supportViews.selection.value"
          :view-can-create="canUseSupportSearch && canCreateSavedViews"
          :view-can-manage-all="canUseSupportSearch && canManageAllSavedViews"
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
          @load-more-search="
            viewActive ? supportViews.loadMore() : supportSearch.loadMore()
          "
          @select-view="selectSupportView"
          @create-view="createSupportView"
          @replace-view="replaceSupportView"
          @publish-view="publishSupportView"
          @archive-view="archiveSupportView"
          @default-view="setDefaultSupportView"
          @custom-search="startCustomSupportSearch"
        />

        <main class="conversation-pane" aria-label="Выбранный диалог">
          <Transition name="conversation-loading">
            <section
              v-if="selectionTransitioning"
              class="conversation-loading-overlay"
              aria-busy="true"
              aria-live="polite"
            >
              <span class="sr-only">Загружаем выбранный диалог</span>
              <header class="conversation-loading-header" aria-hidden="true">
                <span class="support-loading-shimmer" />
                <span class="support-loading-shimmer" />
                <span class="support-loading-shimmer" />
              </header>
              <div class="conversation-loading-messages" aria-hidden="true">
                <article
                  v-for="skeleton in conversationLoadingSkeletons"
                  :key="skeleton.id"
                  :class="[
                    'conversation-loading-message',
                    `is-${skeleton.direction}`,
                    { 'is-compact': skeleton.compact },
                  ]"
                >
                  <span
                    v-if="skeleton.direction === 'inbound'"
                    class="conversation-loading-avatar support-loading-shimmer"
                  />
                  <span class="conversation-loading-bubble">
                    <i
                      v-for="line in skeleton.lineCount"
                      :key="line"
                      class="support-loading-shimmer"
                    />
                  </span>
                </article>
              </div>
            </section>
          </Transition>
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

            <Message
              v-if="conversation.error.value"
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
              :collaboration="supportConversationCollaboration"
              :internal-notes="supportConversationInternalNotes"
              :can-download-public-attachments="
                publicAttachmentCapabilities().download
              "
              :delivery-actions="messageDelivery.deliveryActions.value"
              @load-older="conversation.loadOlder"
              @load-newer="conversation.loadNewer"
              @visible-high-water="conversation.markVisible"
              @cancel-translation="translation.cancelMessageTranslations"
              @change-translation-mode="changeSupportTranslationMode"
              @reconcile-required="reconcileSupportSurface"
              @draft-change="changeSupportDraft"
              @send="sendSupportComposer"
              @change-composer-mode="changeSupportComposerMode"
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
              @open-internal-notes="openInternalNotes"
              @add-attachments="addSupportAttachments"
              @remove-attachment="removeSupportAttachment"
              @retry-attachment="retrySupportAttachment"
              @download-attachment="downloadSupportAttachment"
            />
            <p v-else class="empty-pane support-conversation-unavailable">
              Выбранный диалог недоступен.
            </p>
            <Message
              v-if="supportMacros.recoveryRequired.value"
              severity="warn"
              :closable="false"
              class="support-reply-error"
              role="alert"
            >
              {{ supportMacros.error.value }}
            </Message>
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
              :macros="supportMacros.items.value"
              :query="supportMacros.query.value"
              :loading="
                supportMacros.loading.value || supportMacros.loadingMore.value
              "
              :applying-id="supportMacros.applyingId.value"
              :error="supportMacros.error.value"
              :has-more="Boolean(supportMacros.nextCursor.value)"
              :freshness="supportMacros.freshness.value"
              @close="replyTemplateGalleryVisible = false"
              @select="applySupportReplyTemplate"
              @search="searchSupportMacros"
              @load-more="
                supportMacros.load(supportMacros.nextCursor.value ?? undefined)
              "
            />
            <Message
              v-if="canManageTranslation && translation.error.value"
              severity="error"
              :closable="false"
              class="reply-translation-error"
            >
              {{ translation.error.value }}
            </Message>
            <Dialog
              v-if="canManageTranslation"
              v-model:visible="translationSettingsVisible"
              modal
              header="Язык диалога и перевод"
              :style="{ width: 'min(760px, calc(100vw - 32px))' }"
            >
              <ConversationTranslationBanner
                class="reply-translation-settings"
                :state="translation.state.value"
                :loading="translation.loading.value"
                :saving="translation.savingPreference.value"
                :can-manage="canManageTranslation"
                :eligible-count="0"
                @reload="ensureReplyTranslationLoaded"
                @update-enabled="setTranslationEnabled($event)"
                @update-target-locale="setTranslationTargetLocale($event)"
              />
            </Dialog>
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
            v-else-if="inboxPresentationLoading"
            class="empty-selection"
            aria-busy="true"
          >
            <i class="pi pi-inbox" aria-hidden="true" />
            <h2>Загружаем входящие</h2>
            <p>Список появится здесь без перестройки рабочего места.</p>
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
            :can-read-sla-context="canReadSlaContext"
            :can-read-routing-context="canReadRoutingContext"
            :reservation-reconcile-attempt="reservationReconcileAttempt"
            :reservation-reconcile-in-flight="reservationReconcileInFlight"
            :assignment-controller="assignmentSurfaceController"
            :lead-assignment-controller="leadAssignmentSurfaceController"
            :availability-label="assignmentAvailabilityLabel"
            :can-read-internal-notes="canReadSelectedInternalNotes"
            :inspector="inspector"
            :knowledge-controller="knowledge"
            :external-work-controller="externalWork"
            :external-work-permissions="externalWorkPermissions"
            :can-manage-translation="canManageTranslation"
            :translation-locale="translation.conversationLocale.value"
            @open-internal-notes="openInternalNotes"
            @classify-case="classifySelectedCase"
            @manage-translation="openTranslationSettings"
            @reconcile-operations="reconcileCaseOperations"
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
        :can-correct="canCorrectSelectedInternalNotes"
        :can-redact="canRedactSelectedInternalNotes"
        :can-download-attachments="noteAttachmentCapabilities().download"
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
        @correct="correctInternalNote"
        @tombstone="tombstoneInternalNote"
        @download-attachment="noteAttachments.download"
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
.header-actions :deep(.p-tag-success) {
  color: var(--status-success-text);
}
.header-actions :deep(.p-button-secondary.p-button-outlined) {
  color: var(--text-primary);
}
.availability-button[data-availability-state="AVAILABLE"]
  :deep(.p-button-icon) {
  color: var(--status-success-text);
}
.availability-button[data-availability-state="OFFLINE"] :deep(.p-button-icon) {
  color: var(--text-muted);
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
  background: var(--surface-subtle);
  color: var(--text-primary);
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
.inbox-skeletons {
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
  position: relative;
  isolation: isolate;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface-card);
}
.conversation-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 12;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-card);
}
.conversation-loading-header {
  min-height: 81px;
  padding: 16px 20px;
  display: grid;
  align-content: center;
  gap: 8px;
  border-bottom: 1px solid var(--line);
}
.conversation-loading-header span,
.conversation-loading-bubble i,
.conversation-loading-avatar {
  display: block;
}
.conversation-loading-header span {
  height: 8px;
  border-radius: 4px;
}
.conversation-loading-header span:first-child {
  width: 84px;
  height: 8px;
}
.conversation-loading-header span:nth-child(2) {
  width: min(260px, 58%);
  height: 16px;
}
.conversation-loading-header span:last-child {
  width: min(340px, 72%);
}
.conversation-loading-messages {
  min-height: 0;
  padding: 28px 24px;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 24px;
}
.conversation-loading-message {
  width: min(64%, 520px);
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.conversation-loading-message.is-outbound {
  width: min(54%, 440px);
  align-self: flex-end;
}
.conversation-loading-message.is-compact {
  width: min(46%, 360px);
}
.conversation-loading-avatar {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  border-radius: 50%;
}
.conversation-loading-bubble {
  min-width: 0;
  padding: 12px;
  display: grid;
  flex: 1;
  gap: 8px;
  border: 1px solid var(--line);
  border-radius: 16px 16px 16px 5px;
  background: var(--surface-card);
}
.is-outbound .conversation-loading-bubble {
  border-radius: 16px 16px 5px 16px;
  background: color-mix(
    in srgb,
    var(--status-accent-soft) 38%,
    var(--surface-card)
  );
}
.conversation-loading-bubble i {
  width: 100%;
  height: 8px;
  border-radius: 4px;
}
.conversation-loading-bubble i:nth-child(2) {
  width: 88%;
}
.conversation-loading-bubble i:last-child {
  width: 58%;
}
.conversation-loading-enter-active,
.conversation-loading-leave-active {
  transition:
    opacity 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 180ms cubic-bezier(0.23, 1, 0.32, 1);
}
.conversation-loading-enter-from,
.conversation-loading-leave-to {
  opacity: 0;
  transform: translateY(3px);
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
.sr-only {
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
@media (max-width: 1279px) {
  .support-workspace {
    grid-template-columns: minmax(230px, 300px) minmax(0, 1fr);
  }
  .mobile-context {
    display: inline-flex;
  }
}
@media (min-width: 768px) and (max-height: 760px) {
  .conversation-header {
    gap: 12px;
    padding: 8px 14px;
  }
  .conversation-header p {
    margin-top: 2px;
    font-size: 0.75rem;
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
    min-width: 0;
    max-width: 112px;
    margin-right: auto;
    overflow: hidden;
  }
  .support-workspace-page--full-tab .header-actions :deep(.p-tag-label) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  .support-workspace-page--full-tab .header-actions .availability-button {
    width: auto;
    max-width: 128px;
    padding: 0 8px;
  }
  .support-workspace-page--full-tab
    .header-actions
    .availability-button
    :deep(.p-button-label) {
    position: static;
    width: auto;
    height: auto;
    margin: 0;
    overflow: hidden;
    clip: auto;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  .conversation-loading-header {
    min-height: 49px;
    padding: 8px 12px;
  }
  .conversation-loading-messages {
    padding: 20px 12px;
  }
  .conversation-loading-message {
    width: 82%;
  }
  .conversation-loading-message.is-outbound {
    width: 72%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .conversation-loading-enter-active,
  .conversation-loading-leave-active {
    transition: none;
  }
}
</style>
