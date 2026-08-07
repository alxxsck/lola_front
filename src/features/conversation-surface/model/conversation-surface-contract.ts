import type {
  ReplyTranslationPreviewModel,
  RequestedMessageTranslation,
  TranslatedMessageContent,
} from "@/features/conversation-translation/model/translation-presentation";

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

export interface ConversationSurfaceReplyPreview {
  draft: ReplyTranslationPreviewModel | null;
  targetLocale: string | null;
  busy: boolean;
  stale: boolean;
  disabled: boolean;
  showProviderDetails?: boolean;
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
}

type SourceSendCapability =
  { kind: "SOURCE" } | { kind: "BLOCKED"; reason: string };

export type ConversationSurfaceComposer =
  | (ConversationSurfaceComposerBase & {
      mode: "PUBLIC_REPLY";
      sendCapability: SourceSendCapability | { kind: "TRANSLATED_PREVIEW" };
      replyPreview: ConversationSurfaceReplyPreview | null;
    })
  | (ConversationSurfaceComposerBase & {
      mode: "INTERNAL_NOTE";
      sendCapability: SourceSendCapability;
      replyPreview: null;
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
