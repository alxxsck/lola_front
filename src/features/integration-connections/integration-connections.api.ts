import {
  integrationConnectionActivate,
  integrationConnectionCreateAmplitude,
  integrationConnectionCreateCustomerIo,
  integrationConnectionDisable,
  integrationConnectionGetTest,
  integrationConnectionList,
  integrationConnectionRotateAmplitude,
  integrationConnectionRotateCustomerIo,
  integrationConnectionTest,
  integrationConnectionUpdateAmplitude,
  integrationConnectionUpdateCustomerIo,
} from '@/shared/api/generated/retenive-backend';
import type {
  CreateAmplitudeConnectionDto,
  CreateCustomerIoConnectionDto,
  IntegrationConnectionVersionDto,
  RotateAmplitudeCredentialDto,
  RotateCustomerIoCredentialDto,
  UpdateAmplitudeConnectionDto,
  UpdateCustomerIoConnectionDto,
} from '@/shared/api/generated/models';

export type {
  CreateCustomerIoConnectionDto,
  RotateCustomerIoCredentialDto,
  UpdateCustomerIoConnectionDto,
};

const commandOptions = (idempotencyKey: string) => ({
  headers: { 'Idempotency-Key': idempotencyKey },
});

export const integrationConnectionsApi = {
  list(projectId: string) {
    return integrationConnectionList(projectId);
  },

  createAmplitude(projectId: string, input: CreateAmplitudeConnectionDto, idempotencyKey: string) {
    return integrationConnectionCreateAmplitude(projectId, input, commandOptions(idempotencyKey));
  },

  updateAmplitude(
    projectId: string,
    connectionId: string,
    input: UpdateAmplitudeConnectionDto,
    idempotencyKey: string,
  ) {
    return integrationConnectionUpdateAmplitude(
      projectId,
      connectionId,
      input,
      commandOptions(idempotencyKey),
    );
  },

  createCustomerIo(
    projectId: string,
    input: CreateCustomerIoConnectionDto,
    idempotencyKey: string,
  ) {
    return integrationConnectionCreateCustomerIo(projectId, input, commandOptions(idempotencyKey));
  },

  updateCustomerIo(
    projectId: string,
    connectionId: string,
    input: UpdateCustomerIoConnectionDto,
    idempotencyKey: string,
  ) {
    return integrationConnectionUpdateCustomerIo(
      projectId,
      connectionId,
      input,
      commandOptions(idempotencyKey),
    );
  },

  rotateAmplitude(
    projectId: string,
    connectionId: string,
    input: RotateAmplitudeCredentialDto,
    idempotencyKey: string,
  ) {
    return integrationConnectionRotateAmplitude(
      projectId,
      connectionId,
      input,
      commandOptions(idempotencyKey),
    );
  },

  rotateCustomerIo(
    projectId: string,
    connectionId: string,
    input: RotateCustomerIoCredentialDto,
    idempotencyKey: string,
  ) {
    return integrationConnectionRotateCustomerIo(
      projectId,
      connectionId,
      input,
      commandOptions(idempotencyKey),
    );
  },

  requestTest(
    projectId: string,
    connectionId: string,
    input: IntegrationConnectionVersionDto,
    idempotencyKey: string,
  ) {
    return integrationConnectionTest(
      projectId,
      connectionId,
      input,
      commandOptions(idempotencyKey),
    );
  },

  getTest(projectId: string, connectionId: string, testId: string) {
    return integrationConnectionGetTest(projectId, connectionId, testId);
  },

  activate(
    projectId: string,
    connectionId: string,
    input: IntegrationConnectionVersionDto,
    idempotencyKey: string,
  ) {
    return integrationConnectionActivate(
      projectId,
      connectionId,
      input,
      commandOptions(idempotencyKey),
    );
  },

  disable(
    projectId: string,
    connectionId: string,
    input: IntegrationConnectionVersionDto,
    idempotencyKey: string,
  ) {
    return integrationConnectionDisable(
      projectId,
      connectionId,
      input,
      commandOptions(idempotencyKey),
    );
  },
};
