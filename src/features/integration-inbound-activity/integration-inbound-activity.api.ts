import {
  integrationEventRouteInboundActivityList,
  integrationEventRouteInboundHealthRead,
} from "@/shared/api/generated/retenive-backend";
import type { InboundIntegrationProvider } from "@/features/integration-inbound-connections/integration-inbound-connections.api";

export const integrationInboundActivityApi = {
  list(projectId: string, provider: InboundIntegrationProvider) {
    return integrationEventRouteInboundActivityList(projectId, { provider });
  },
  health(projectId: string, provider: InboundIntegrationProvider) {
    return integrationEventRouteInboundHealthRead(projectId, { provider });
  },
};
