import type { RequestedMessageTranslation } from "@/features/conversation-translation/model/translation-presentation";
import type {
  ConversationSurfaceMessage,
  ConversationSurfaceStatus,
} from "./conversation-surface-contract";
import {
  isConversationMessageOrdinal,
  type ConversationMessage,
} from "@/shared/types/domain";

export type ConversationSurfaceAuthorLabels = Partial<
  Record<ConversationMessage["author"], string>
>;

const defaultAuthorLabels: Record<ConversationMessage["author"], string> = {
  USER: "Пользователь",
  ADMIN: "Оператор",
  ASSISTANT: "Retenive · AI",
  SCENARIO: "Сценарий · CMS",
  SYSTEM: "Система",
};

function messageStatus(
  message: ConversationMessage,
): ConversationSurfaceStatus | undefined {
  if (message.status === "PENDING")
    return { label: "Отправляется…", tone: "WARNING" };
  if (message.status === "WRITING")
    return {
      label: message.text ? "Обновляется…" : "Пользователь печатает",
      tone: "WARNING",
    };
  if (message.status === "FAILED")
    return { label: "Не доставлено", tone: "DANGER" };
  if (message.status === "CANCELLED")
    return { label: "Ответ остановлен оператором", tone: "WARNING" };
  return undefined;
}

function deliveryStatus(
  message: ConversationMessage,
): ConversationSurfaceStatus | undefined {
  if (message.author === "USER" || message.author === "SYSTEM")
    return undefined;
  const status = message.delivery?.status;
  if (!status) return undefined;
  if (status === "READ") return { label: "Прочитано", tone: "SUCCESS" };
  if (status === "DELIVERED") return { label: "Доставлено", tone: "SUCCESS" };
  if (status === "FAILED") return { label: "Ошибка доставки", tone: "DANGER" };
  if (status === "CANCELLED")
    return { label: "Доставка отменена", tone: "DANGER" };
  if (status === "NOT_REDELIVERED")
    return { label: "Повторная доставка не подтверждена", tone: "WARNING" };
  return {
    label: status === "DELIVERING" ? "Доставляется…" : "Принято",
    tone: "WARNING",
  };
}

export function adaptConversationSurfaceMessages(
  messages: readonly ConversationMessage[],
  translations: ReadonlyMap<string, RequestedMessageTranslation>,
  authorLabels: ConversationSurfaceAuthorLabels = {},
): ConversationSurfaceMessage[] {
  const labels = { ...defaultAuthorLabels, ...authorLabels };
  return messages.flatMap((message) => {
    if (!isConversationMessageOrdinal(message.ordinal)) return [];
    return [
      {
        id: message.id,
        ordinal: message.ordinal,
        revision: message.updatedAt ?? message.createdAt,
        placement:
          message.author === "USER"
            ? "INBOUND"
            : message.author === "SYSTEM"
              ? "NEUTRAL"
              : "OUTBOUND",
        tone:
          message.author === "ASSISTANT"
            ? "ASSISTANT"
            : message.author === "SCENARIO"
              ? "AUTOMATION"
              : message.author === "SYSTEM"
                ? "SYSTEM"
                : "DEFAULT",
        author: {
          displayName:
            message.authorSnapshot?.displayName ?? labels[message.author],
          avatarUrl: message.authorSnapshot?.avatarUrl ?? null,
        },
        createdAt: message.createdAt,
        content: message,
        requestedTranslation: translations.get(message.id),
        status: messageStatus(message),
        delivery: deliveryStatus(message),
        attachments: message.attachments,
        ...(message.macroProvenance
          ? {
              macroProvenance: {
                revisionNumber: message.macroProvenance.revisionNumber,
                edited: message.macroProvenance.edited,
              },
            }
          : {}),
      },
    ];
  });
}
