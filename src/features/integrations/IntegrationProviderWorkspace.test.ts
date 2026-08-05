import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import IntegrationProviderWorkspace from "./IntegrationProviderWorkspace.vue";

vi.mock(
  "@/features/integration-connections/IntegrationConnectionsCard.vue",
  () => ({
    default: { template: '<section data-testid="outbound-connections" />' },
  }),
);
vi.mock(
  "@/features/integration-event-routes/IntegrationEventRoutesCard.vue",
  () => ({
    default: { template: '<section data-testid="outbound-routes" />' },
  }),
);
vi.mock(
  "@/features/integration-inbound-connections/IntegrationInboundConnectionsCard.vue",
  () => ({
    default: { template: '<section data-testid="inbound-connections" />' },
  }),
);
vi.mock(
  "@/features/integration-inbound-routes/IntegrationInboundRoutesCard.vue",
  () => ({
    default: { template: '<section data-testid="inbound-routes" />' },
  }),
);
vi.mock(
  "@/features/integration-inbound-activity/IntegrationInboundActivityCard.vue",
  () => ({
    default: { template: '<section data-testid="inbound-activity" />' },
  }),
);

describe("IntegrationProviderWorkspace", () => {
  it("keeps inbound activity inside the inbound flow after its rules", () => {
    const wrapper = mount(IntegrationProviderWorkspace, {
      props: {
        projectId: "project-1",
        provider: "CUSTOMER_IO",
        canRead: true,
        canManage: true,
        canReadActivity: true,
      },
    });
    const sections = wrapper
      .findAll("[data-testid]")
      .map((item) => item.attributes("data-testid"));

    expect(sections).toEqual([
      "outbound-connections",
      "outbound-routes",
      "inbound-connections",
      "inbound-routes",
      "inbound-activity",
    ]);
  });
});
