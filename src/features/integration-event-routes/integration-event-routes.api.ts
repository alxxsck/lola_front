import {
  eventCatalogList,
  integrationEventRouteActivityList,
  integrationEventRouteCreateAmplitude,
  integrationEventRouteDisable,
  integrationEventRouteEnable,
  integrationEventRouteList,
  integrationEventRoutePublish,
} from "@/shared/api/generated/lola-backend";
import type {
  CreateAmplitudeOutboundRouteDto,
  IntegrationEventRouteVersionDto,
  PublishIntegrationEventRouteDto,
} from "@/shared/api/generated/models";

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

  listActivity(projectId: string) {
    return integrationEventRouteActivityList(projectId);
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
