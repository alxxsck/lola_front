import { beforeEach, describe, expect, it, vi } from "vitest";
import { integrationEventRoutesApi } from "./integration-event-routes.api";

const generated = vi.hoisted(() => ({ createCustomerIo: vi.fn() }));

vi.mock("@/shared/api/generated/lola-backend", () => ({
  eventCatalogList: vi.fn(),
  integrationEventRouteActivityList: vi.fn(),
  integrationEventRouteCreateAmplitude: vi.fn(),
  integrationEventRouteCreateCustomerIo: generated.createCustomerIo,
  integrationEventRouteDisable: vi.fn(),
  integrationEventRouteEnable: vi.fn(),
  integrationEventRouteList: vi.fn(),
  integrationEventRoutePublish: vi.fn(),
}));

describe("integrationEventRoutesApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates Customer.io routes through the provider-specific endpoint", async () => {
    const input = {
      connectionId: "connection-1",
      name: "Deposit",
      eventDefinitionKeyId: "event-key-1",
      eventDefinitionRevisionId: "event-revision-1",
      providerEventName: "deposit_completed",
      propertyBindings: [],
    };

    await integrationEventRoutesApi.createCustomerIo(
      "project-1",
      input,
      "create-cio-route-key",
    );

    expect(generated.createCustomerIo).toHaveBeenCalledWith(
      "project-1",
      input,
      { headers: { "Idempotency-Key": "create-cio-route-key" } },
    );
  });
});
