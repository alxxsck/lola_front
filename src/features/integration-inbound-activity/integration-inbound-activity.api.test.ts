import { beforeEach, describe, expect, it, vi } from "vitest";

const generated = vi.hoisted(() => ({ activity: vi.fn(), health: vi.fn() }));
vi.mock("@/shared/api/generated/lola-backend", () => ({
  integrationEventRouteInboundActivityList: generated.activity,
  integrationEventRouteInboundHealthRead: generated.health,
}));

describe("integrationInboundActivityApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("always applies the provider filter before backend pagination", async () => {
    const { integrationInboundActivityApi: api } =
      await import("./integration-inbound-activity.api");
    await api.list("project-1", "CUSTOMER_IO");
    await api.health("project-1", "CUSTOMER_IO");

    expect(generated.activity).toHaveBeenCalledWith("project-1", {
      provider: "CUSTOMER_IO",
    });
    expect(generated.health).toHaveBeenCalledWith("project-1", {
      provider: "CUSTOMER_IO",
    });
  });
});
