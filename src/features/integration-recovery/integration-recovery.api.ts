import {
  integrationConnectionList,
  integrationRecoveryOperationsCancelDispatch,
  integrationRecoveryOperationsDetail,
  integrationRecoveryOperationsList,
  integrationRecoveryOperationsPauseDirection,
  integrationRecoveryOperationsQuarantineIngress,
  integrationRecoveryOperationsReplayDispatch,
  integrationRecoveryOperationsReplayIngress,
  integrationRecoveryOperationsResumeDirection,
} from "@/shared/api/generated/retenive-backend";
import type {
  CancelIntegrationDispatchDto,
  ChangeIntegrationDirectionPauseDto,
  IntegrationRecoveryOperationListItemDto,
  IntegrationRecoveryOperationsListParams,
  QuarantineIntegrationIngressDto,
  ReplayIntegrationDispatchDto,
  ReplayIntegrationIngressDto,
} from "@/shared/api/generated/models";

export type RecoveryOperationKind =
  IntegrationRecoveryOperationListItemDto["operationKind"];
export type IntegrationDirection = "INBOUND" | "OUTBOUND";

const commandOptions = (idempotencyKey: string) => ({
  headers: { "Idempotency-Key": idempotencyKey },
});

export const integrationRecoveryApi = {
  list(projectId: string, params?: IntegrationRecoveryOperationsListParams) {
    return integrationRecoveryOperationsList(projectId, params);
  },

  detail(
    projectId: string,
    operationKind: RecoveryOperationKind,
    operationId: string,
  ) {
    return integrationRecoveryOperationsDetail(
      projectId,
      operationKind,
      operationId,
    );
  },

  listConnections(projectId: string) {
    return integrationConnectionList(projectId);
  },

  cancelDispatch(
    projectId: string,
    operationId: string,
    input: CancelIntegrationDispatchDto,
    idempotencyKey: string,
  ) {
    return integrationRecoveryOperationsCancelDispatch(
      projectId,
      operationId,
      input,
      commandOptions(idempotencyKey),
    );
  },

  replayDispatch(
    projectId: string,
    operationId: string,
    input: ReplayIntegrationDispatchDto,
    idempotencyKey: string,
  ) {
    return integrationRecoveryOperationsReplayDispatch(
      projectId,
      operationId,
      input,
      commandOptions(idempotencyKey),
    );
  },

  replayIngress(
    projectId: string,
    operationId: string,
    input: ReplayIntegrationIngressDto,
    idempotencyKey: string,
  ) {
    return integrationRecoveryOperationsReplayIngress(
      projectId,
      operationId,
      input,
      commandOptions(idempotencyKey),
    );
  },

  quarantineIngress(
    projectId: string,
    operationId: string,
    input: QuarantineIntegrationIngressDto,
    idempotencyKey: string,
  ) {
    return integrationRecoveryOperationsQuarantineIngress(
      projectId,
      operationId,
      input,
      commandOptions(idempotencyKey),
    );
  },

  changeDirectionPause(
    projectId: string,
    connectionId: string,
    direction: IntegrationDirection,
    paused: boolean,
    input: ChangeIntegrationDirectionPauseDto,
    idempotencyKey: string,
  ) {
    const command = paused
      ? integrationRecoveryOperationsPauseDirection
      : integrationRecoveryOperationsResumeDirection;
    return command(
      projectId,
      connectionId,
      direction,
      input,
      commandOptions(idempotencyKey),
    );
  },
};
