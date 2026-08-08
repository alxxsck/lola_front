import type { ConversationMessage } from "@/shared/types/domain";

type DeliveryReceipt = NonNullable<ConversationMessage["delivery"]>;

function compareDeliveryReceipt(
  left: DeliveryReceipt,
  right: DeliveryReceipt,
): number {
  if (left.generation !== right.generation)
    return left.generation - right.generation;
  return left.version - right.version;
}

/**
 * Merges two REST message projections without allowing an out-of-order page or
 * reconnect response to move the authoritative delivery receipt backwards.
 */
export function mergeConversationMessageDelivery(
  current: ConversationMessage,
  incoming: ConversationMessage,
): ConversationMessage {
  if (!current.delivery || !incoming.delivery) return incoming;
  return compareDeliveryReceipt(current.delivery, incoming.delivery) > 0
    ? { ...incoming, delivery: current.delivery }
    : incoming;
}
