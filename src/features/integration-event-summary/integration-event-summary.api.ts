import { integrationEventRouteEventDefinitionSummary } from "@/shared/api/generated/retenive-backend";

export const integrationEventSummaryApi = {
  get(projectId: string, eventDefinitionKeyId: string) {
    return integrationEventRouteEventDefinitionSummary(
      projectId,
      eventDefinitionKeyId,
    );
  },
};
