import {
  integrationEventRouteCreateAmplitudeInbound,
  integrationEventRouteCreateCustomerIoInbound,
} from '@/shared/api/generated/retenive-backend';
import type { CreateAmplitudeInboundRouteDto } from '@/shared/api/generated/models';
import type { InboundIntegrationProvider } from '@/features/integration-inbound-connections/integration-inbound-connections.api';

const commandOptions = (idempotencyKey: string) => ({
  headers: { 'Idempotency-Key': idempotencyKey },
});

export const integrationInboundRoutesApi = {
  create(
    provider: InboundIntegrationProvider,
    projectId: string,
    input: CreateAmplitudeInboundRouteDto,
    idempotencyKey: string,
  ) {
    const request =
      provider === 'AMPLITUDE'
        ? integrationEventRouteCreateAmplitudeInbound
        : integrationEventRouteCreateCustomerIoInbound;
    return request(projectId, input, commandOptions(idempotencyKey));
  },
};
