import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import IntegrationInboundActivityCard from "./IntegrationInboundActivityCard.vue";

const api = vi.hoisted(() => ({ list: vi.fn(), health: vi.fn() }));
vi.mock("./integration-inbound-activity.api", () => ({
  integrationInboundActivityApi: api,
}));

describe("IntegrationInboundActivityCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.health.mockResolvedValue({
      provider: "CUSTOMER_IO",
      direction: "INBOUND",
      health: "DEGRADED",
      reasons: ["BACKLOG_SLO_BREACHED"],
      observedAt: "2026-08-04T10:00:00.000Z",
      connections: {
        total: 1,
        active: 1,
        ingressEnabled: 1,
        compromisedCredentials: 0,
        unavailableCredentials: 0,
      },
      backlog: {
        count: 3,
        oldestReceivedAt: null,
        oldestAgeSeconds: null,
        byStatus: {},
      },
      processing: {
        attempts: 2,
        recentErrors: 0,
        activeLeases: 0,
        expiredLeases: 0,
        missingFences: 0,
      },
      retainedEvidence: {
        envelopes: 1,
        recordedBodyBytes: 10,
        recordedItems: 1,
        batches: 1,
        duplicates: 0,
        deliveryIdConflicts: 0,
      },
      retention: {
        envelopeContentOverdue: 0,
        payloadOverdue: 0,
        metadataOverdue: 0,
      },
      storage: { retainedItems: 1, retainedBytes: 10, usageUpdatedAt: null },
      canonical: {
        supported: false,
        duplicates: 0,
        conflicts: 0,
        recoveries: 0,
      },
    });
    api.list.mockResolvedValue({
      items: [
        {
          id: "item-1",
          connectionId: "connection-1",
          provider: "CUSTOMER_IO",
          providerCallType: "TRACK",
          providerEventName: "deposit",
          status: "ACCEPTED",
          routeId: "route-1",
          routeRevisionId: "revision-1",
          identityPolicyRevision: 1,
          acceptedEventId: "event-1",
          suppressedDispatchId: null,
          failureCode: null,
          attemptCount: 1,
          duplicateCount: 0,
          occurredAt: "2026-08-04T09:59:00.000Z",
          receivedAt: "2026-08-04T10:00:00.000Z",
          processedAt: "2026-08-04T10:00:01.000Z",
          nextAttemptAt: null,
          deliveryIdConflict: null,
        },
      ],
    });
  });

  it("renders provider-filtered safe health and activity without payloads or secrets", async () => {
    const wrapper = mount(IntegrationInboundActivityCard, {
      props: {
        projectId: "project-1",
        provider: "CUSTOMER_IO",
        canReadActivity: true,
      },
    });
    await flushPromises();

    expect(api.list).toHaveBeenCalledWith("project-1", "CUSTOMER_IO");
    expect(api.health).toHaveBeenCalledWith("project-1", "CUSTOMER_IO");
    expect(wrapper.text()).toContain("Требует внимания");
    expect(wrapper.text()).toContain("Очередь обрабатывается дольше нормы");
    expect(wrapper.text()).toContain("deposit");
    expect(wrapper.text()).toContain("Принято");
    expect(wrapper.html()).not.toContain("rawBody");
  });

  it("limits the visible inbound journal to ten rows per page", async () => {
    api.list.mockResolvedValue({
      items: Array.from({ length: 21 }, (_, index) => ({
        id: `item-${index + 1}`,
        providerEventName: `event_${index + 1}`,
        status: "ACCEPTED",
        failureCode: null,
        attemptCount: 1,
        duplicateCount: 0,
        receivedAt: "2026-08-04T10:00:00.000Z",
      })),
    });

    const wrapper = mount(IntegrationInboundActivityCard, {
      props: {
        projectId: "project-1",
        provider: "CUSTOMER_IO",
        canReadActivity: true,
      },
    });
    await flushPromises();

    expect(wrapper.findAll("[data-activity-row]")).toHaveLength(10);
    expect(wrapper.text()).toContain("1–10 из 21");
    await wrapper
      .get('button[aria-label="Следующая страница входящих событий"]')
      .trigger("click");
    expect(wrapper.text()).toContain("event_11");
  });
});
