import { beforeEach, describe, expect, it, vi } from "vitest";
import { integrationConnectionsApi } from "./integration-connections.api";

const generated = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  createCustomerIo: vi.fn(),
  update: vi.fn(),
  updateCustomerIo: vi.fn(),
  rotate: vi.fn(),
  rotateCustomerIo: vi.fn(),
  requestTest: vi.fn(),
  getTest: vi.fn(),
  activate: vi.fn(),
  disable: vi.fn(),
}));

vi.mock("@/shared/api/generated/retenive-backend", () => ({
  integrationConnectionList: generated.list,
  integrationConnectionCreateAmplitude: generated.create,
  integrationConnectionCreateCustomerIo: generated.createCustomerIo,
  integrationConnectionUpdateAmplitude: generated.update,
  integrationConnectionUpdateCustomerIo: generated.updateCustomerIo,
  integrationConnectionRotateAmplitude: generated.rotate,
  integrationConnectionRotateCustomerIo: generated.rotateCustomerIo,
  integrationConnectionTest: generated.requestTest,
  integrationConnectionGetTest: generated.getTest,
  integrationConnectionActivate: generated.activate,
  integrationConnectionDisable: generated.disable,
}));

describe("integrationConnectionsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes caller-owned idempotency keys to every mutation", async () => {
    const version = { expectedVersion: 3 };
    const create = {
      displayName: "Amplitude",
      region: "EU" as const,
      projectApiKey: "a".repeat(32),
    };
    await integrationConnectionsApi.createAmplitude(
      "project-1",
      create,
      "create-key",
    );
    await integrationConnectionsApi.updateAmplitude(
      "project-1",
      "connection-1",
      { expectedVersion: 3, displayName: "Analytics" },
      "update-key",
    );
    await integrationConnectionsApi.rotateAmplitude(
      "project-1",
      "connection-1",
      { expectedVersion: 3, projectApiKey: "b".repeat(32) },
      "rotate-key",
    );
    await integrationConnectionsApi.requestTest(
      "project-1",
      "connection-1",
      version,
      "test-key",
    );
    await integrationConnectionsApi.activate(
      "project-1",
      "connection-1",
      version,
      "activate-key",
    );
    await integrationConnectionsApi.disable(
      "project-1",
      "connection-1",
      version,
      "disable-key",
    );

    expect(generated.create).toHaveBeenCalledWith("project-1", create, {
      headers: { "Idempotency-Key": "create-key" },
    });
    expect(generated.update.mock.calls[0]?.[3]).toEqual({
      headers: { "Idempotency-Key": "update-key" },
    });
    expect(generated.rotate).toHaveBeenCalledWith(
      "project-1",
      "connection-1",
      { expectedVersion: 3, projectApiKey: "b".repeat(32) },
      { headers: { "Idempotency-Key": "rotate-key" } },
    );
    expect(generated.requestTest.mock.calls[0]?.[3]).toEqual({
      headers: { "Idempotency-Key": "test-key" },
    });
    expect(generated.activate.mock.calls[0]?.[3]).toEqual({
      headers: { "Idempotency-Key": "activate-key" },
    });
    expect(generated.disable.mock.calls[0]?.[3]).toEqual({
      headers: { "Idempotency-Key": "disable-key" },
    });
  });

  it("uses provider-specific Customer.io and credential rotation endpoints", async () => {
    await integrationConnectionsApi.createCustomerIo(
      "project-1",
      {
        displayName: "Customer journeys",
        region: "EU",
        sourceApiKey: "customer-source-key",
      },
      "create-cio-key",
    );
    await integrationConnectionsApi.updateCustomerIo(
      "project-1",
      "connection-1",
      { expectedVersion: 2, displayName: "Customer.io EU" },
      "update-cio-key",
    );
    await integrationConnectionsApi.rotateAmplitude(
      "project-1",
      "connection-2",
      { expectedVersion: 3, projectApiKey: "b".repeat(32) },
      "rotate-amplitude-key",
    );
    await integrationConnectionsApi.rotateCustomerIo(
      "project-1",
      "connection-1",
      { expectedVersion: 4, sourceApiKey: "rotated-source-key" },
      "rotate-cio-key",
    );

    expect(generated.createCustomerIo.mock.calls[0]?.[2]).toEqual({
      headers: { "Idempotency-Key": "create-cio-key" },
    });
    expect(generated.updateCustomerIo.mock.calls[0]?.[3]).toEqual({
      headers: { "Idempotency-Key": "update-cio-key" },
    });
    expect(generated.rotate.mock.calls[0]?.[3]).toEqual({
      headers: { "Idempotency-Key": "rotate-amplitude-key" },
    });
    expect(generated.rotateCustomerIo.mock.calls[0]?.[3]).toEqual({
      headers: { "Idempotency-Key": "rotate-cio-key" },
    });
  });

  it("uses GET for list and durable test polling without command options", async () => {
    await integrationConnectionsApi.list("project-1");
    await integrationConnectionsApi.getTest(
      "project-1",
      "connection-1",
      "test-1",
    );

    expect(generated.list).toHaveBeenCalledWith("project-1");
    expect(generated.getTest).toHaveBeenCalledWith(
      "project-1",
      "connection-1",
      "test-1",
    );
  });
});
