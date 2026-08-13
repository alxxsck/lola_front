import {
  integrationConnectionActivate,
  integrationConnectionCreateAmplitudeInbound,
  integrationConnectionCreateCustomerIoInbound,
  integrationConnectionList,
  integrationConnectionRotateAmplitudeInbound,
  integrationConnectionRotateCustomerIoInbound,
  integrationConnectionSetupAmplitudeInbound,
  integrationConnectionSetupCustomerIoInbound,
} from '@/shared/api/generated/retenive-backend';
import type {
  AmplitudeInboundSetupReplayResponseDto,
  AmplitudeInboundSetupResponseDto,
  CreateAmplitudeInboundConnectionDto,
  CustomerIoInboundSetupReplayResponseDto,
  CustomerIoInboundSetupResponseDto,
  IntegrationConnectionResponseDto,
} from '@/shared/api/generated/models';

export type InboundIntegrationProvider = 'AMPLITUDE' | 'CUSTOMER_IO';
export type InboundSetupReceipt =
  | AmplitudeInboundSetupResponseDto
  | AmplitudeInboundSetupReplayResponseDto
  | CustomerIoInboundSetupResponseDto
  | CustomerIoInboundSetupReplayResponseDto;

const commandOptions = (idempotencyKey: string) => ({
  headers: { 'Idempotency-Key': idempotencyKey },
});

export const integrationInboundConnectionsApi = {
  list(projectId: string) {
    return integrationConnectionList(projectId);
  },

  create(
    provider: InboundIntegrationProvider,
    projectId: string,
    input: CreateAmplitudeInboundConnectionDto,
    idempotencyKey: string,
  ): Promise<IntegrationConnectionResponseDto> {
    return provider === 'AMPLITUDE'
      ? integrationConnectionCreateAmplitudeInbound(
          projectId,
          input,
          commandOptions(idempotencyKey),
        )
      : integrationConnectionCreateCustomerIoInbound(
          projectId,
          input,
          commandOptions(idempotencyKey),
        );
  },

  setup(
    provider: InboundIntegrationProvider,
    projectId: string,
    connectionId: string,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<InboundSetupReceipt> {
    return provider === 'AMPLITUDE'
      ? integrationConnectionSetupAmplitudeInbound(
          projectId,
          connectionId,
          { expectedVersion },
          commandOptions(idempotencyKey),
        )
      : integrationConnectionSetupCustomerIoInbound(
          projectId,
          connectionId,
          { expectedVersion },
          commandOptions(idempotencyKey),
        );
  },

  rotate(
    provider: InboundIntegrationProvider,
    projectId: string,
    connectionId: string,
    expectedVersion: number,
    overlapSeconds: number,
    idempotencyKey: string,
  ): Promise<InboundSetupReceipt> {
    return provider === 'AMPLITUDE'
      ? integrationConnectionRotateAmplitudeInbound(
          projectId,
          connectionId,
          { expectedVersion, overlapSeconds },
          commandOptions(idempotencyKey),
        )
      : integrationConnectionRotateCustomerIoInbound(
          projectId,
          connectionId,
          { expectedVersion, overlapSeconds },
          commandOptions(idempotencyKey),
        );
  },

  activate(
    projectId: string,
    connectionId: string,
    expectedVersion: number,
    idempotencyKey: string,
  ) {
    return integrationConnectionActivate(
      projectId,
      connectionId,
      { expectedVersion },
      commandOptions(idempotencyKey),
    );
  },
};
