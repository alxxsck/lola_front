import { beforeEach, describe, expect, it, vi } from "vitest";
import { integrationCanonicalIdentityApi } from "./integration-canonical-identity.api";

const generated = vi.hoisted(() => ({
  current: vi.fn(),
  preview: vi.fn(),
  publish: vi.fn(),
}));

vi.mock("@/shared/api/generated/lola-backend", () => ({
  integrationEventIdentityPolicyCurrent: generated.current,
  integrationEventIdentityPolicyPreview: generated.preview,
  integrationEventIdentityPolicyPublish: generated.publish,
}));

describe("integrationCanonicalIdentityApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads and previews a Project-scoped canonical policy", async () => {
    const input = {
      canonicalKeyName: "transaction_id",
      participants: [
        { routeId: "route-a", routeRevisionId: "revision-a" },
        { routeId: "route-b", routeRevisionId: "revision-b" },
      ],
    };

    await integrationCanonicalIdentityApi.current("project-1", "event-1");
    await integrationCanonicalIdentityApi.preview(
      "project-1",
      "event-1",
      input,
    );

    expect(generated.current).toHaveBeenCalledWith("project-1", "event-1");
    expect(generated.preview).toHaveBeenCalledWith(
      "project-1",
      "event-1",
      input,
    );
  });

  it("publishes with the preview OCC version and a stable idempotency key", async () => {
    const input = {
      canonicalKeyName: "transaction_id",
      expectedVersion: 4,
      participants: [
        { routeId: "route-a", routeRevisionId: "revision-a" },
        { routeId: "route-b", routeRevisionId: "revision-b" },
      ],
      reason: "Публикация canonical policy через CMS",
    };

    await integrationCanonicalIdentityApi.publish(
      "project-1",
      "event-1",
      input,
      "canonical-command-key",
    );

    expect(generated.publish).toHaveBeenCalledWith(
      "project-1",
      "event-1",
      input,
      { headers: { "Idempotency-Key": "canonical-command-key" } },
    );
  });
});
