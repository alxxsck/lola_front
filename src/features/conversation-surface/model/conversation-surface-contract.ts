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
  delivery?: ConversationSurfaceStatus;
}

export interface ConversationSurfaceHistory {
  loading: boolean;
  loadingOlder: boolean;
  hasOlder: boolean;
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

interface ConversationSurfaceComposerBase {
  visibility: "ENABLED" | "DISABLED" | "HIDDEN";
  scope: {
    projectId: string;
    actorId: string;
    conversationId: string;
  };
  initialDraft: string;
  draftRevision: string | number;
  sending: boolean;
  recipientStatus: {
    label: string;
    tone: "ONLINE" | "OFFLINE" | "NEUTRAL";
  } | null;
  actions: ConversationSurfaceComposerActions;
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
}

export function conversationSurfaceDraftKey(
  composer: Pick<ConversationSurfaceComposer, "scope" | "mode">,
): string {
  const { projectId, actorId, conversationId } = composer.scope;
  return `${projectId}:${actorId}:${conversationId}:${composer.mode}`;
}
