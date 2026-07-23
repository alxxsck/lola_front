import { beforeEach, describe, expect, it, vi } from "vitest";

const generated = vi.hoisted(() => ({
  health: vi.fn(),
  deliveries: vi.fn(),
  integrations: vi.fn(),
  replay: vi.fn(),
  quarantine: vi.fn(),
}));

vi.mock("@/shared/api/generated/lola-backend", () => ({
  notificationOperationsHealth: generated.health,
  notificationOperationsDeliveries: generated.deliveries,
  notificationOperationsIntegrations: generated.integrations,
  notificationOperationsReplay: generated.replay,
  notificationOperationsQuarantine: generated.quarantine,
}));

import { notificationOperationsApi } from "./notification-operations.api";

const filters = {
  projectId: "00000000-0000-4000-8000-000000000010",
  channel: "SLACK_WEBHOOK" as const,
  status: "DEAD_LETTER" as const,
  integrationKind: "SLACK_DESTINATION" as const,
  integrationStatus: "ACTIVE",
};

describe("notification operations generated adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generated.health.mockResolvedValue({
      observedAt: "2026-07-23T10:00:00.000Z",
      queues: [
        {
          queueKind: "OPERATIONAL_NOTIFICATION",
          channel: "SLACK_WEBHOOK",
          status: "DEAD_LETTER",
          count: 2,
          oldestAgeSeconds: 40,
          attemptsInWindow: 5,
          rawProviderSecret: "must-not-survive",
        },
        {
          queueKind: "PRIVATE_SECRET_KIND",
          channel: "PRIVATE_SECRET_CHANNEL",
          status: "PRIVATE_SECRET_STATUS",
          count: 1,
          oldestAgeSeconds: 1,
          attemptsInWindow: 1,
        },
      ],
      permanentCount: 1,
      ambiguousCount: 2,
      suppressedCount: 3,
      deadLetterCount: 4,
      providers: [{ channel: "SLACK_WEBHOOK", state: "DEGRADED" }],
      telegramProductAdmission: [
        {
          scope: "INSTALLATION",
          exhaustedBucketCount: 1,
          maximumRetryDelaySeconds: 3,
        },
      ],
      retention: {
        notificationPayloadBacklog: 1,
        personalContentBacklog: 2,
        broadcastContentBacklog: 3,
        linkSecretBacklog: 4,
        operationalEvidenceBacklog: 5,
        lastSuccessfulBatchAt: null,
      },
      webhookUrl: "https://secret.example",
    });
    generated.deliveries.mockResolvedValue({
      items: [
        {
          id: "delivery-1",
          projectId: filters.projectId,
          channel: "SLACK_WEBHOOK",
          status: "DEAD_LETTER",
          errorCategory: "RATE_LIMITED",
          attemptCount: 3,
          operationsVersion: 2,
          replayEligibility: "ELIGIBLE_KNOWN_NOT_ACCEPTED",
          contentAvailable: false,
          createdAt: "2026-07-23T09:00:00.000Z",
          updatedAt: "2026-07-23T10:00:00.000Z",
          payload: "must-not-survive",
          providerRef: "must-not-survive",
        },
      ],
      nextCursor: "delivery-cursor",
    });
    generated.integrations.mockResolvedValue({
      items: [
        {
          integrationId: "integration-1",
          kind: "SLACK_DESTINATION",
          projectId: filters.projectId,
          status: "ACTIVE",
          version: 4,
          maskedIdentity: "Slack •••• ation-1",
          quarantineAllowed: true,
          webhookUrl: "must-not-survive",
        },
      ],
      nextCursor: "integration-cursor",
    });
  });

  it("maps health and pages through a strict runtime privacy allowlist", async () => {
    const signal = new AbortController().signal;
    const [health, deliveries, integrations] = await Promise.all([
      notificationOperationsApi.health({ signal }),
      notificationOperationsApi.deliveries(filters, "deliveries-next", {
        signal,
      }),
      notificationOperationsApi.integrations(filters, "integrations-next", {
        signal,
      }),
    ]);

    expect(health.queues[1]).toMatchObject({
      queueKind: "OTHER",
      channel: "OTHER",
      status: "OTHER",
    });
    expect(deliveries.items[0]).toEqual({
      id: "delivery-1",
      projectId: filters.projectId,
      channel: "SLACK_WEBHOOK",
      status: "DEAD_LETTER",
      errorCategory: "RATE_LIMITED",
      attemptCount: 3,
      operationsVersion: 2,
      replayEligibility: "ELIGIBLE_KNOWN_NOT_ACCEPTED",
      contentAvailable: false,
      createdAt: "2026-07-23T09:00:00.000Z",
      updatedAt: "2026-07-23T10:00:00.000Z",
    });
    expect(integrations.items[0]).toEqual({
      integrationId: "integration-1",
      kind: "SLACK_DESTINATION",
      projectId: filters.projectId,
      status: "ACTIVE",
      version: 4,
      maskedIdentity: "Slack •••• ation-1",
      quarantineAllowed: true,
    });
    expect(JSON.stringify({ health, deliveries, integrations })).not.toMatch(
      /must-not-survive|webhookUrl|providerRef|"payload":/i,
    );
    expect(generated.deliveries).toHaveBeenCalledWith(
      {
        limit: 50,
        cursor: "deliveries-next",
        projectId: filters.projectId,
        channel: "SLACK_WEBHOOK",
        status: "DEAD_LETTER",
      },
      { signal },
    );
    expect(generated.integrations).toHaveBeenCalledWith(
      {
        limit: 50,
        cursor: "integrations-next",
        projectId: filters.projectId,
        kind: "SLACK_DESTINATION",
        status: "ACTIVE",
      },
      { signal },
    );
  });

  it("sends canonical OCC and idempotency headers through generated commands", async () => {
    const signal = new AbortController().signal;
    generated.replay.mockResolvedValue({
      id: "delivery-1",
      projectId: filters.projectId,
      channel: "SLACK_WEBHOOK",
      status: "PENDING",
      operationsVersion: 3,
      attemptCount: 3,
      contentAvailable: false,
      replayed: false,
    });
    generated.quarantine.mockResolvedValue({
      integrationId: "integration-1",
      kind: "SLACK_DESTINATION",
      projectId: filters.projectId,
      status: "INVALID",
      version: 5,
      maskedIdentity: "Slack •••• ation-1",
      suppressedQueuedCount: 2,
      replayed: false,
    });

    await notificationOperationsApi.replay(
      { id: "delivery-1", operationsVersion: 2 },
      { signal, idempotencyKey: "replay-intent-1" },
    );
    await notificationOperationsApi.quarantine(
      {
        kind: "SLACK_DESTINATION",
        integrationId: "integration-1",
        version: 4,
      },
      {
        reason: "CREDENTIAL_COMPROMISED",
        confirmation: "Slack •••• ation-1",
      },
      { signal, idempotencyKey: "quarantine-intent-1" },
    );

    expect(generated.replay).toHaveBeenCalledWith("delivery-1", {
      signal,
      headers: {
        "Expected-Version": "2",
        "Idempotency-Key": "replay-intent-1",
      },
    });
    expect(generated.quarantine).toHaveBeenCalledWith(
      "SLACK_DESTINATION",
      "integration-1",
      {
        reason: "CREDENTIAL_COMPROMISED",
        confirmation: "Slack •••• ation-1",
      },
      {
        signal,
        headers: {
          "Expected-Version": "4",
          "Idempotency-Key": "quarantine-intent-1",
        },
      },
    );
  });
});
