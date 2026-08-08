import type {
  ReplyTranslationPreviewModel,
  RequestedMessageTranslation,
  TranslatedMessageContent,
} from "@/features/conversation-translation/model/translation-presentation";
import type { ConversationAISuspensionEntry } from "@/features/conversation-ai-suspension/model/conversation-ai-suspension.store";

export type ConversationSurfacePlacement = "INBOUND" | "OUTBOUND" | "NEUTRAL";
export type ConversationSurfaceTone =
  "DEFAULT" | "ASSISTANT" | "AUTOMATION" | "SYSTEM";

export interface ConversationSurfaceStatus {
  label: string;
  tone: "NEUTRAL" | "SUCCESS" | "WARNING" | "DANGER";
}

export interface ConversationSurfaceDeliveryStatus extends ConversationSurfaceStatus {
  detail?: string;
  action?: {
    label: string;
    busy: boolean;
    disabled: boolean;
  };
}

export interface ConversationSurfaceMessage {
  id: string;
  ordinal: number;
  revision?: string | number;
  placement: ConversationSurfacePlacement;
  tone?: ConversationSurfaceTone;
  author: {
    displayName: string;
    avatarUrl: string | null;
  };
  createdAt: string;
  content: TranslatedMessageContent;
  requestedTranslation?: RequestedMessageTranslation;
  status?: ConversationSurfaceStatus;
  delivery?: ConversationSurfaceDeliveryStatus;
  attachments?: Array<{
    id: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
  }>;
}

export interface ConversationSurfaceAttachments {
  draftKey: string;
  accept: string;
  loading: boolean;
  busy: boolean;
  error: string;
  canDownload: boolean;
  maxFiles: number;
  items: Array<{
    localId: string;
    id: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    state:
      | "QUEUED"
      | "UPLOADING"
      | "SCANNING"
      | "READY"
      | "REJECTED"
      | "FAILED"
      | "EXPIRED"
      | "REVOKED";
    canAttach: boolean;
    failureCode: string | null;
    canRetry: boolean;
  }>;
}

export interface ConversationSurfaceHistory {
  loading: boolean;
  loadingOlder: boolean;
  loadingNewer?: boolean;
  hasOlder: boolean;
  hasNewer?: boolean;
  firstUnreadOrdinal?: number | null;
  readError?: string;
  error?: string;
}

export interface ConversationSurfaceTranslation {
  available: boolean;
  mode: "ORIGINAL" | "TRANSLATED";
  changing: boolean;
  workingLocaleLabel: string;
  loading: boolean;
  progress: {
    completed: number;
    total: number;
    cancellable: boolean;
  } | null;
}

export interface ConversationSurfaceAISuspensionCapability {
  entry: ConversationAISuspensionEntry;
  canManage: boolean;
  conversationOpen: boolean;
  showHistory: boolean;
  hideActiveStatus?: boolean;
}

export interface ConversationSurfaceCollaborator {
  cmsUserId: string;
  displayName: string;
}

export interface ConversationSurfaceCollaboration {
  availability?: "READY" | "DEGRADED";
  viewers: ConversationSurfaceCollaborator[];
  typers: ConversationSurfaceCollaborator[];
  collision:
    | { state: "NOT_ARMED" | "CLEAR" }
    | {
        state: "OTHER_OPERATOR_REPLIED";
        observedMessageOrdinal: number;
        messageId: string;
        messageOrdinal: number;
        cmsUserId: string;
        createdAt: string;
      };
}

export interface ConversationSurfaceInternalNotes {
  loading: boolean;
  error: string;
  totalVisible: number;
  hasMore: boolean;
  items: Array<{
    id: string;
    body: string | null;
    lifecycle: "ACTIVE" | "TOMBSTONED" | "PURGED";
    creatorName: string;
    updatedAt: string;
  }>;
}

export interface ConversationSurfaceReplyPreview {
  draft: ReplyTranslationPreviewModel | null;
  targetLocale: string | null;
  busy: boolean;
  stale: boolean;
  disabled: boolean;
  showProviderDetails?: boolean;
}

export interface ConversationSurfaceActionCapability {
  visibility: "ENABLED" | "DISABLED" | "HIDDEN";
  reason?: string;
}

export interface ConversationSurfaceComposerActions {
  attachment: ConversationSurfaceActionCapability;
  createTicket: ConversationSurfaceActionCapability;
  classifyCase?: ConversationSurfaceActionCapability;
  internalNotes?: ConversationSurfaceActionCapability;
  templates: ConversationSurfaceActionCapability;
  improveWithAI: ConversationSurfaceActionCapability;
  sendWithoutTranslation: ConversationSurfaceActionCapability;
}

export type ConversationSurfaceComposerAction =
  | "ATTACHMENT"
  | "CREATE_TICKET"
  | "CLASSIFY_CASE"
  | "INTERNAL_NOTES"
  | "TEMPLATES"
  | "IMPROVE_WITH_AI"
  | "SEND_WITHOUT_TRANSLATION";

export interface ConversationSurfaceTranslationAssist {
  targetLocale: string | null;
  busy: boolean;
  disabled: boolean;
}

export interface ConversationSurfaceComposerOutcome {
  state: "CHECKING_OUTCOME" | "RETRYABLE" | "BLOCKED";
  label: string;
  action?: {
    kind: "CHECK" | "DISCARD";
    label: string;
  };
}

interface ConversationSurfaceComposerBase {
  visibility: "ENABLED" | "DISABLED" | "HIDDEN";
  scope: {
    projectId: string;
    actorId: string;
    conversationId: string;
  };
  initialDraft: string;
  draftRevision: string | number;
  /** Invalidates cached sensitive drafts after revoke or target disposal. */
  sensitiveDraftPurgeRevision?: string | number;
  sending: boolean;
  outcome?: ConversationSurfaceComposerOutcome;
  recipientStatus: {
    label: string;
    tone: "ONLINE" | "OFFLINE" | "NEUTRAL";
  } | null;
  actions: ConversationSurfaceComposerActions;
  attachments?: ConversationSurfaceAttachments;
  modeSwitch?: {
    publicReply: ConversationSurfaceActionCapability;
    internalNote: ConversationSurfaceActionCapability;
  };
}

type SourceSendCapability =
  { kind: "SOURCE" } | { kind: "BLOCKED"; reason: string };

export type ConversationSurfaceComposer =
  | (ConversationSurfaceComposerBase & {
      mode: "PUBLIC_REPLY";
      sendCapability: SourceSendCapability | { kind: "TRANSLATED_PREVIEW" };
      replyPreview: ConversationSurfaceReplyPreview | null;
      translationAssist: ConversationSurfaceTranslationAssist | null;
    })
  | (ConversationSurfaceComposerBase & {
      mode: "INTERNAL_NOTE";
      /** Exact Case-scoped target; never reuse the Conversation identity. */
      draftTargetId: string;
      sendCapability: SourceSendCapability;
      replyPreview: null;
      translationAssist: null;
    });

export type ConversationSurfaceReconcileIssue =
  | {
      kind: "MESSAGE_ID_CONFLICT";
      messageId: string;
    }
  | {
      kind: "ORDINAL_COLLISION";
      ordinal: number;
      messageIds: string[];
    }
  | {
      kind: "ORDINAL_GAP";
      afterOrdinal: number;
      beforeOrdinal: number;
    };

export interface ConversationSurfaceSendRequest {
  scopeKey: string;
  mode: ConversationSurfaceComposer["mode"];
  text: string;
  attachmentIds?: string[];
  attachmentDraftKey?: string;
}

export interface ConversationSurfaceAttachmentDownloadRequest {
  attachmentId: string;
  visibility: "PUBLIC_REPLY" | "INTERNAL_NOTE";
}

export function conversationSurfaceDraftKey(
  composer: ConversationSurfaceComposer,
): string {
  const { projectId, actorId, conversationId } = composer.scope;
  const targetId =
    composer.mode === "INTERNAL_NOTE" ? composer.draftTargetId : conversationId;
  return `${projectId}:${actorId}:${targetId}:${composer.mode}`;
}
