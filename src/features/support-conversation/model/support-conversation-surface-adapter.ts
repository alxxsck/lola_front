import type { RequestedMessageTranslation } from "@/features/conversation-translation/model/translation-presentation";
import { adaptConversationSurfaceMessages } from "@/features/conversation-surface/model/conversation-surface-message-adapter";
import type { ConversationSurfaceMessage } from "@/features/conversation-surface/model/conversation-surface-contract";
import type { ConversationMessage } from "@/shared/types/domain";

interface SupportConversationSurfaceAdapterOptions {
  assistantLabel: string;
}

export function adaptSupportConversationMessages(
  messages: readonly ConversationMessage[],
  translations: ReadonlyMap<string, RequestedMessageTranslation>,
  options: SupportConversationSurfaceAdapterOptions,
): ConversationSurfaceMessage[] {
  return adaptConversationSurfaceMessages(messages, translations, {
    ASSISTANT: options.assistantLabel,
  });
}
