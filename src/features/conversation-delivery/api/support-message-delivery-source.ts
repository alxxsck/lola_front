import { adminMessagingRetryFailedDelivery } from '@/shared/api/generated/retenive-backend';
import { isMockMode } from '@/shared/config/data-mode';
import { retryMockAdminMessageDelivery } from '@/shared/api/repository/mock-repository';
import type { SupportMessageDeliverySource } from '../model/use-support-message-delivery';

const apiSupportMessageDeliverySource: SupportMessageDeliverySource = {
  async retryFailedDelivery(projectId, endUserId, messageId, command) {
    const response = await adminMessagingRetryFailedDelivery(
      projectId,
      endUserId,
      messageId,
      {
        expectedGeneration: command.expectedGeneration,
        expectedVersion: command.expectedVersion,
        intent: 'RETRY_FAILED_DELIVERY',
      },
      { headers: { 'Idempotency-Key': command.idempotencyKey } },
    );
    return response.delivery;
  },
};

const mockSupportMessageDeliverySource: SupportMessageDeliverySource = {
  async retryFailedDelivery(projectId, endUserId, messageId, command) {
    return retryMockAdminMessageDelivery(projectId, endUserId, messageId, command);
  },
};

export const supportMessageDeliverySource = isMockMode
  ? mockSupportMessageDeliverySource
  : apiSupportMessageDeliverySource;
