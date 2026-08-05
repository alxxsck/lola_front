import {
  integrationEventIdentityPolicyCurrent,
  integrationEventIdentityPolicyPreview,
  integrationEventIdentityPolicyPublish,
} from "@/shared/api/generated/retenive-backend";
import type {
  PreviewCanonicalIdentityPolicyDto,
  PublishCanonicalIdentityPolicyDto,
} from "@/shared/api/generated/models";
import { integrationEventRoutesApi } from "@/features/integration-event-routes/integration-event-routes.api";

const commandOptions = (idempotencyKey: string) => ({
  headers: { "Idempotency-Key": idempotencyKey },
});

export const integrationCanonicalIdentityApi = {
  listDefinitions: integrationEventRoutesApi.listEventDefinitions,
  listRoutes: integrationEventRoutesApi.list,

  current(projectId: string, eventDefinitionKeyId: string) {
    return integrationEventIdentityPolicyCurrent(
      projectId,
      eventDefinitionKeyId,
    );
  },

  preview(
    projectId: string,
    eventDefinitionKeyId: string,
    input: PreviewCanonicalIdentityPolicyDto,
  ) {
    return integrationEventIdentityPolicyPreview(
      projectId,
      eventDefinitionKeyId,
      input,
    );
  },

  publish(
    projectId: string,
    eventDefinitionKeyId: string,
    input: PublishCanonicalIdentityPolicyDto,
    idempotencyKey: string,
  ) {
    return integrationEventIdentityPolicyPublish(
      projectId,
      eventDefinitionKeyId,
      input,
      commandOptions(idempotencyKey),
    );
  },
};
