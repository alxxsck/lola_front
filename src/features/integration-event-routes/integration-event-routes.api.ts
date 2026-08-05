import {
  eventCatalogList,
  integrationEventRouteActivityList,
  integrationEventRouteCreateAmplitude,
  integrationEventRouteCreateCustomerIo,
  integrationEventRouteDisable,
  integrationEventRouteEnable,
  integrationEventRouteList,
  integrationEventRoutePublish,
} from "@/shared/api/generated/retenive-backend";
import type {
  CreateAmplitudeOutboundRouteDto,
  CreateCustomerIoOutboundRouteDto,
  IntegrationEventRouteVersionDto,
  PublishIntegrationEventRouteDto,
} from "@/shared/api/generated/models";

export type { CreateCustomerIoOutboundRouteDto };

const commandOptions = (idempotencyKey: string) => ({
  headers: { "Idempotency-Key": idempotencyKey },
});

export const integrationEventRoutesApi = {
  list(projectId: string) {
    return integrationEventRouteList(projectId);
  },

  listEventDefinitions(projectId: string) {
    return eventCatalogList(projectId, { lifecycle: "ACTIVE" });
  },

  listActivity(projectId: string, provider: "AMPLITUDE" | "CUSTOMER_IO") {
    return integrationEventRouteActivityList(projectId, { provider });
  },

  createAmplitude(
    projectId: string,
    input: CreateAmplitudeOutboundRouteDto,
    idempotencyKey: string,
  ) {
    return integrationEventRouteCreateAmplitude(
      projectId,
      input,
      commandOptions(idempotencyKey),
    );
  },

  createCustomerIo(
    projectId: string,
    input: CreateCustomerIoOutboundRouteDto,
    idempotencyKey: string,
  ) {
    return integrationEventRouteCreateCustomerIo(
      projectId,
      input,
      commandOptions(idempotencyKey),
    );
  },

  publish(
    projectId: string,
    routeId: string,
    input: PublishIntegrationEventRouteDto,
    idempotencyKey: string,
  ) {
    return integrationEventRoutePublish(
      projectId,
      routeId,
      input,
      commandOptions(idempotencyKey),
    );
  },

  enable(
    projectId: string,
    routeId: string,
    input: IntegrationEventRouteVersionDto,
    idempotencyKey: string,
  ) {
    return integrationEventRouteEnable(
      projectId,
      routeId,
      input,
      commandOptions(idempotencyKey),
    );
  },

  disable(
    projectId: string,
    routeId: string,
    input: IntegrationEventRouteVersionDto,
    idempotencyKey: string,
  ) {
    return integrationEventRouteDisable(
      projectId,
      routeId,
      input,
      commandOptions(idempotencyKey),
    );
  },
};
