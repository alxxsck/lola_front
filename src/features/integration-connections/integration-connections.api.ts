import {
  integrationConnectionActivate,
  integrationConnectionCreateAmplitude,
  integrationConnectionDisable,
  integrationConnectionGetTest,
  integrationConnectionList,
  integrationConnectionRotate,
  integrationConnectionTest,
  integrationConnectionUpdateAmplitude,
} from "@/shared/api/generated/lola-backend";
import type {
  CreateAmplitudeConnectionDto,
  IntegrationConnectionVersionDto,
  RotateAmplitudeCredentialDto,
  UpdateAmplitudeConnectionDto,
} from "@/shared/api/generated/models";

const commandOptions = (idempotencyKey: string) => ({
  headers: { "Idempotency-Key": idempotencyKey },
});

export const integrationConnectionsApi = {
  list(projectId: string) {
    return integrationConnectionList(projectId);
  },

  createAmplitude(
    projectId: string,
    input: CreateAmplitudeConnectionDto,
    idempotencyKey: string,
  ) {
    return integrationConnectionCreateAmplitude(
      projectId,
      input,
      commandOptions(idempotencyKey),
    );
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

  rotate(
    projectId: string,
    connectionId: string,
    input: RotateAmplitudeCredentialDto,
    idempotencyKey: string,
  ) {
    return integrationConnectionRotate(
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
