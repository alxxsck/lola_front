import { beforeEach, describe, expect, it, vi } from "vitest";

const generated = vi.hoisted(() => ({
  createAmplitude: vi.fn(),
  createCustomerIo: vi.fn(),
  setupAmplitude: vi.fn(),
  setupCustomerIo: vi.fn(),
  rotateAmplitude: vi.fn(),
  rotateCustomerIo: vi.fn(),
  list: vi.fn(),
  activate: vi.fn(),
}));

vi.mock("@/shared/api/generated/lola-backend", () => ({
  integrationConnectionCreateAmplitudeInbound: generated.createAmplitude,
  integrationConnectionCreateCustomerIoInbound: generated.createCustomerIo,
  integrationConnectionSetupAmplitudeInbound: generated.setupAmplitude,
  integrationConnectionSetupCustomerIoInbound: generated.setupCustomerIo,
  integrationConnectionRotateAmplitudeInbound: generated.rotateAmplitude,
  integrationConnectionRotateCustomerIoInbound: generated.rotateCustomerIo,
  integrationConnectionList: generated.list,
  integrationConnectionActivate: generated.activate,
}));

describe("integrationInboundConnectionsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a draft and configures Amplitude with separate idempotent commands", async () => {
    const { integrationInboundConnectionsApi: api } =
      await import("./integration-inbound-connections.api");

    await api.create(
      "AMPLITUDE",
      "project-1",
      { displayName: "Inbound", region: "EU" },
      "create-key",
    );
    await api.setup("AMPLITUDE", "project-1", "connection-1", 3, "setup-key");

    expect(generated.createAmplitude).toHaveBeenCalledWith(
      "project-1",
      { displayName: "Inbound", region: "EU" },
      { headers: { "Idempotency-Key": "create-key" } },
    );
    expect(generated.setupAmplitude).toHaveBeenCalledWith(
      "project-1",
      "connection-1",
      { expectedVersion: 3 },
      { headers: { "Idempotency-Key": "setup-key" } },
    );
  });

  it("uses the same draft/setup model for Customer.io and rotates with overlap", async () => {
    const { integrationInboundConnectionsApi: api } =
      await import("./integration-inbound-connections.api");

    await api.create(
      "CUSTOMER_IO",
      "project-1",
      { displayName: "CIO", region: "US" },
      "create-key",
    );
    await api.setup("CUSTOMER_IO", "project-1", "connection-2", 1, "setup-key");
    await api.rotate(
      "CUSTOMER_IO",
      "project-1",
      "connection-2",
      2,
      300,
      "rotate-key",
    );

    expect(generated.createCustomerIo).toHaveBeenCalled();
    expect(generated.setupCustomerIo).toHaveBeenCalled();
    expect(generated.rotateCustomerIo).toHaveBeenCalledWith(
      "project-1",
      "connection-2",
      { expectedVersion: 2, overlapSeconds: 300 },
      { headers: { "Idempotency-Key": "rotate-key" } },
    );
  });
});
