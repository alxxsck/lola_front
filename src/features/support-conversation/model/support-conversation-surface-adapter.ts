import type { RequestedMessageTranslation } from "@/features/conversation-translation/model/translation-presentation";
import { adaptConversationSurfaceMessages } from "@/features/conversation-surface/model/conversation-surface-message-adapter";
import type { ConversationSurfaceMessage } from "@/features/conversation-surface/model/conversation-surface-contract";
import type { ConversationMessage } from "@/shared/types/domain";
import type { SupportMessageDeliveryAction } from "@/features/conversation-delivery/model/use-support-message-delivery";

interface SupportConversationSurfaceAdapterOptions {
  assistantLabel: string;
  deliveryActions?: ReadonlyMap<string, SupportMessageDeliveryAction>;
}

export function adaptSupportConversationMessages(
  messages: readonly ConversationMessage[],
  translations: ReadonlyMap<string, RequestedMessageTranslation>,
  options: SupportConversationSurfaceAdapterOptions,
): ConversationSurfaceMessage[] {
  const adapted = adaptConversationSurfaceMessages(messages, translations, {
    ASSISTANT: options.assistantLabel,
  });
  return adapted.map((message) => {
    const action = options.deliveryActions?.get(message.id);
    if (!action || !message.delivery) return message;
    return {
      ...message,
      delivery: {
        ...message.delivery,
        detail: action.error ?? "Сообщение точно не доставлено.",
        action: {
          label: "Повторить",
          busy: action.busy,
          disabled: action.visibility !== "ENABLED",
        },
      },
    };
  });
}
