import { computed, ref } from 'vue';
import type { ConversationMessage } from '@/shared/types/domain';
import { ApiError } from '@/shared/api/http/api-error';
import type { SupportWorkspaceSelection } from '@/features/support-workspace/api/support-workspace-source';

export type SupportMessageDeliveryReceipt = NonNullable<ConversationMessage['delivery']>;

export interface SupportMessageDeliveryRetryCommand {
  expectedGeneration: number;
  expectedVersion: number;
  idempotencyKey: string;
}

export interface SupportMessageDeliverySource {
  retryFailedDelivery(
    projectId: string,
    endUserId: string,
    messageId: string,
    command: SupportMessageDeliveryRetryCommand,
  ): Promise<SupportMessageDeliveryReceipt>;
}

export interface SupportMessageDeliveryContext {
  projectId(): string | undefined;
  selection(): SupportWorkspaceSelection | null;
  messages(): readonly ConversationMessage[];
  applyDeliveryReceipt(messageId: string, delivery: SupportMessageDeliveryReceipt): void;
  reconcile(): Promise<void>;
}

export interface SupportMessageDeliveryAction {
  visibility: 'ENABLED' | 'DISABLED';
  busy: boolean;
  error?: string;
}

function retryFence(message: ConversationMessage): string | undefined {
  const delivery = message.delivery;
  if (!delivery) return undefined;
  return `${message.id}:${delivery.generation}:${delivery.version}`;
}

const deliveryStatuses = new Set<SupportMessageDeliveryReceipt['status']>([
  'PENDING',
  'DELIVERING',
  'DELIVERED',
  'READ',
  'FAILED',
  'CANCELLED',
  'NOT_REDELIVERED',
]);

function errorDeliveryReceipt(cause: unknown): SupportMessageDeliveryReceipt | undefined {
  if (!(cause instanceof ApiError) || !cause.details) return undefined;
  const details = cause.details as { currentDelivery?: unknown };
  const value = details.currentDelivery;
  if (!value || typeof value !== 'object') return undefined;
  const delivery = value as Record<string, unknown>;
  if (
    typeof delivery.status !== 'string' ||
    !deliveryStatuses.has(delivery.status as SupportMessageDeliveryReceipt['status']) ||
    typeof delivery.generation !== 'number' ||
    !Number.isSafeInteger(delivery.generation) ||
    delivery.generation < 1 ||
    typeof delivery.version !== 'number' ||
    !Number.isSafeInteger(delivery.version) ||
    delivery.version < 0 ||
    typeof delivery.retryEligible !== 'boolean' ||
    !Array.isArray(delivery.allowedActions) ||
    !delivery.allowedActions.every((action) => action === 'RETRY_FAILED_DELIVERY') ||
    !Array.isArray(delivery.commandIds) ||
    !delivery.commandIds.every((commandId) => typeof commandId === 'string') ||
    (delivery.errorCode !== null && typeof delivery.errorCode !== 'string')
  )
    return undefined;
  return value as SupportMessageDeliveryReceipt;
}

function isRetryable(
  message: ConversationMessage,
  selection: SupportWorkspaceSelection | null,
): boolean {
  return Boolean(
    selection?.capabilities.reply &&
    selection.conversation?.id === message.conversationId &&
    message.author !== 'USER' &&
    message.author !== 'SYSTEM' &&
    message.delivery?.retryEligible &&
    message.delivery.allowedActions.includes('RETRY_FAILED_DELIVERY'),
  );
}

/** Owns safe retry state while REST remains the authority for the receipt. */
export function createSupportMessageDeliveryController(
  context: SupportMessageDeliveryContext,
  source: SupportMessageDeliverySource,
) {
  const pendingMessageId = ref<string>();
  const errors = ref(new Map<string, string>());
  const retryKeys = new Map<string, string>();
  let operationGeneration = 0;

  const deliveryActions = computed<ReadonlyMap<string, SupportMessageDeliveryAction>>(() => {
    const selection = context.selection();
    const result = new Map<string, SupportMessageDeliveryAction>();
    for (const message of context.messages()) {
      if (!isRetryable(message, selection)) continue;
      result.set(message.id, {
        visibility:
          pendingMessageId.value && pendingMessageId.value !== message.id ? 'DISABLED' : 'ENABLED',
        busy: pendingMessageId.value === message.id,
        error: errors.value.get(message.id),
      });
    }
    return result;
  });

  async function retry(messageId: string): Promise<void> {
    if (pendingMessageId.value) return;
    const operation = ++operationGeneration;
    const projectId = context.projectId();
    const selection = context.selection();
    const message = context.messages().find((item) => item.id === messageId);
    const fence = message ? retryFence(message) : undefined;
    if (!projectId || !selection || !message || !fence || !isRetryable(message, selection)) return;
    const delivery = message.delivery!;
    const idempotencyKey = retryKeys.get(fence) ?? globalThis.crypto.randomUUID();
    retryKeys.set(fence, idempotencyKey);
    pendingMessageId.value = messageId;
    const nextErrors = new Map(errors.value);
    nextErrors.delete(messageId);
    errors.value = nextErrors;
    try {
      const authoritativeDelivery = await source.retryFailedDelivery(
        projectId,
        selection.endUser.id,
        messageId,
        {
          expectedGeneration: delivery.generation,
          expectedVersion: delivery.version,
          idempotencyKey,
        },
      );
      const current = context.messages().find((item) => item.id === messageId);
      if (
        operation === operationGeneration &&
        context.projectId() === projectId &&
        context.selection()?.conversation?.id === selection.conversation?.id &&
        current &&
        retryFence(current) === fence
      ) {
        context.applyDeliveryReceipt(messageId, authoritativeDelivery);
        await context.reconcile();
      }
    } catch (cause) {
      const current = context.messages().find((item) => item.id === messageId);
      if (
        operation === operationGeneration &&
        context.projectId() === projectId &&
        current &&
        retryFence(current) === fence
      ) {
        const authoritativeDelivery = errorDeliveryReceipt(cause);
        if (authoritativeDelivery) {
          context.applyDeliveryReceipt(messageId, authoritativeDelivery);
        } else {
          const failedErrors = new Map(errors.value);
          failedErrors.set(
            messageId,
            'Не удалось подтвердить повтор. Обновите состояние доставки.',
          );
          errors.value = failedErrors;
        }
        try {
          await context.reconcile();
        } catch {
          // The inline error remains attached to the exact message.
        }
      }
    } finally {
      if (operation === operationGeneration && pendingMessageId.value === messageId)
        pendingMessageId.value = undefined;
    }
  }

  function reset(): void {
    operationGeneration += 1;
    pendingMessageId.value = undefined;
    errors.value = new Map();
    retryKeys.clear();
  }

  return { deliveryActions, retry, reset };
}
