import { beforeEach, describe, expect, it, vi } from "vitest";
import { integrationConnectionsApi } from "./integration-connections.api";

const generated = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  rotate: vi.fn(),
  requestTest: vi.fn(),
  getTest: vi.fn(),
  activate: vi.fn(),
  disable: vi.fn(),
}));

vi.mock("@/shared/api/generated/lola-backend", () => ({
  integrationConnectionList: generated.list,
  integrationConnectionCreateAmplitude: generated.create,
  integrationConnectionUpdateAmplitude: generated.update,
  integrationConnectionRotate: generated.rotate,
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
    await integrationConnectionsApi.rotate(
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
    expect(generated.rotate.mock.calls[0]?.[3]).toEqual({
      headers: { "Idempotency-Key": "rotate-key" },
    });
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
