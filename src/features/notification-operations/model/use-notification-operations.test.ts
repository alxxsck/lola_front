import { describe, expect, it, vi } from "vitest";
import type { NotificationOperationsApi } from "../api/notification-operations.api";
import type {
  NotificationOperationsDelivery,
  NotificationOperationsHealth,
  NotificationOperationsIntegration,
} from "./notification-operations";
import { createNotificationOperationsController } from "./use-notification-operations";

const health: NotificationOperationsHealth = {
  observedAt: "2026-07-23T10:00:00.000Z",
  queues: [],
  permanentCount: 1,
  ambiguousCount: 2,
  suppressedCount: 3,
  deadLetterCount: 4,
  providers: [{ channel: "SLACK_WEBHOOK", state: "DEGRADED" }],
  telegramProductAdmission: [],
  retention: {
    notificationPayloadBacklog: 1,
    personalContentBacklog: 2,
    broadcastContentBacklog: 3,
    linkSecretBacklog: 4,
    operationalEvidenceBacklog: 5,
    lastSuccessfulBatchAt: null,
  },
};

function delivery(
  overrides: Partial<NotificationOperationsDelivery> = {},
): NotificationOperationsDelivery {
  return {
    id: "delivery-1",
    projectId: "00000000-0000-4000-8000-000000000010",
    channel: "SLACK_WEBHOOK",
    status: "DEAD_LETTER",
    errorCategory: "TRANSIENT",
    attemptCount: 3,
    operationsVersion: 2,
    replayEligibility: "ELIGIBLE_KNOWN_NOT_ACCEPTED",
    contentAvailable: false,
    createdAt: "2026-07-23T09:00:00.000Z",
    updatedAt: "2026-07-23T10:00:00.000Z",
    ...overrides,
  };
}

function integration(
  overrides: Partial<NotificationOperationsIntegration> = {},
): NotificationOperationsIntegration {
  return {
    integrationId: "integration-1",
    kind: "SLACK_DESTINATION",
    projectId: "00000000-0000-4000-8000-000000000010",
    status: "ACTIVE",
    version: 4,
    maskedIdentity: "Slack •••• ation-1",
    quarantineAllowed: true,
    ...overrides,
  };
}

function api(): NotificationOperationsApi {
  return {
    health: vi.fn().mockResolvedValue(health),
    deliveries: vi
      .fn()
      .mockResolvedValue({ items: [delivery()], nextCursor: null }),
    integrations: vi
      .fn()
      .mockResolvedValue({ items: [integration()], nextCursor: null }),
    replay: vi.fn().mockResolvedValue(
      delivery({
        status: "PENDING",
        operationsVersion: 3,
        replayEligibility: "INELIGIBLE_STATE",
      }),
    ),
    quarantine: vi.fn().mockResolvedValue({
      ...integration({
        status: "INVALID",
        version: 5,
        quarantineAllowed: false,
      }),
      suppressedQueuedCount: 2,
    }),
  };
}

function activate(
  controller: ReturnType<typeof createNotificationOperationsController>,
  operate = true,
) {
  controller.setContext({
    authorityKey: `operator-1:project-1:${operate}`,
    permissions: { read: true, operate },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("notification operations controller", () => {
  it("keeps only the latest same-authority response and loading owner for every read resource", async () => {
    const client = api();
    const oldHealth = deferred<NotificationOperationsHealth>();
    const newHealth = deferred<NotificationOperationsHealth>();
    const oldDeliveries =
      deferred<Awaited<ReturnType<NotificationOperationsApi["deliveries"]>>>();
    const newDeliveries =
      deferred<Awaited<ReturnType<NotificationOperationsApi["deliveries"]>>>();
    const oldIntegrations =
      deferred<
        Awaited<ReturnType<NotificationOperationsApi["integrations"]>>
      >();
    const newIntegrations =
      deferred<
        Awaited<ReturnType<NotificationOperationsApi["integrations"]>>
      >();
    vi.mocked(client.health)
      .mockReturnValueOnce(oldHealth.promise)
      .mockReturnValueOnce(newHealth.promise);
    vi.mocked(client.deliveries)
      .mockReturnValueOnce(oldDeliveries.promise)
      .mockReturnValueOnce(newDeliveries.promise);
    vi.mocked(client.integrations)
      .mockReturnValueOnce(oldIntegrations.promise)
      .mockReturnValueOnce(newIntegrations.promise);
    const controller = createNotificationOperationsController({ api: client });
    activate(controller);

    const oldReads = [
      controller.loadHealth(),
      controller.loadDeliveries(),
      controller.loadIntegrations(),
    ];
    const newReads = [
      controller.loadHealth(),
      controller.loadDeliveries(),
      controller.loadIntegrations(),
    ];
    oldHealth.resolve({ ...health, observedAt: "2026-07-23T09:00:00.000Z" });
    oldDeliveries.resolve({
      items: [delivery({ id: "old-delivery" })],
      nextCursor: "old-delivery-cursor",
    });
    oldIntegrations.resolve({
      items: [integration({ integrationId: "old-integration" })],
      nextCursor: "old-integration-cursor",
    });
    await Promise.all(oldReads);

    expect(controller.health.value).toBeNull();
    expect(controller.deliveries.value).toEqual([]);
    expect(controller.integrations.value).toEqual([]);
    expect(controller.healthLoading.value).toBe(true);
    expect(controller.deliveriesLoading.value).toBe(true);
    expect(controller.integrationsLoading.value).toBe(true);

    newHealth.resolve({ ...health, observedAt: "2026-07-23T11:00:00.000Z" });
    newDeliveries.resolve({
      items: [delivery({ id: "new-delivery" })],
      nextCursor: "new-delivery-cursor",
    });
    newIntegrations.resolve({
      items: [integration({ integrationId: "new-integration" })],
      nextCursor: "new-integration-cursor",
    });
    await Promise.all(newReads);

    expect(controller.health.value?.observedAt).toBe(
      "2026-07-23T11:00:00.000Z",
    );
    expect(controller.deliveries.value.map(({ id }) => id)).toEqual([
      "new-delivery",
    ]);
    expect(
      controller.integrations.value.map(({ integrationId }) => integrationId),
    ).toEqual(["new-integration"]);
    expect(controller.nextDeliveryCursor.value).toBe("new-delivery-cursor");
    expect(controller.nextIntegrationCursor.value).toBe(
      "new-integration-cursor",
    );
    expect(controller.healthLoading.value).toBe(false);
    expect(controller.deliveriesLoading.value).toBe(false);
    expect(controller.integrationsLoading.value).toBe(false);
  });

  it("does not append an older cursor page over a newer replacement page", async () => {
    const client = api();
    vi.mocked(client.deliveries).mockResolvedValueOnce({
      items: [delivery()],
      nextCursor: "delivery-next",
    });
    vi.mocked(client.integrations).mockResolvedValueOnce({
      items: [integration()],
      nextCursor: "integration-next",
    });
    const lateDeliveryAppend =
      deferred<Awaited<ReturnType<NotificationOperationsApi["deliveries"]>>>();
    const newDeliveryPage =
      deferred<Awaited<ReturnType<NotificationOperationsApi["deliveries"]>>>();
    const lateIntegrationAppend =
      deferred<
        Awaited<ReturnType<NotificationOperationsApi["integrations"]>>
      >();
    const newIntegrationPage =
      deferred<
        Awaited<ReturnType<NotificationOperationsApi["integrations"]>>
      >();
    vi.mocked(client.deliveries)
      .mockReturnValueOnce(lateDeliveryAppend.promise)
      .mockReturnValueOnce(newDeliveryPage.promise);
    vi.mocked(client.integrations)
      .mockReturnValueOnce(lateIntegrationAppend.promise)
      .mockReturnValueOnce(newIntegrationPage.promise);
    const controller = createNotificationOperationsController({ api: client });
    activate(controller);
    await Promise.all([
      controller.loadDeliveries(),
      controller.loadIntegrations(),
    ]);

    const oldAppends = [
      controller.loadMoreDeliveries(),
      controller.loadMoreIntegrations(),
    ];
    const replacements = [
      controller.loadDeliveries(),
      controller.loadIntegrations(),
    ];
    newDeliveryPage.resolve({
      items: [delivery({ id: "replacement-delivery" })],
      nextCursor: "replacement-delivery-cursor",
    });
    newIntegrationPage.resolve({
      items: [integration({ integrationId: "replacement-integration" })],
      nextCursor: "replacement-integration-cursor",
    });
    await Promise.all(replacements);
    lateDeliveryAppend.resolve({
      items: [delivery({ id: "stale-appended-delivery" })],
      nextCursor: null,
    });
    lateIntegrationAppend.resolve({
      items: [integration({ integrationId: "stale-appended-integration" })],
      nextCursor: null,
    });
    await Promise.all(oldAppends);

    expect(controller.deliveries.value.map(({ id }) => id)).toEqual([
      "replacement-delivery",
    ]);
    expect(
      controller.integrations.value.map(({ integrationId }) => integrationId),
    ).toEqual(["replacement-integration"]);
    expect(controller.nextDeliveryCursor.value).toBe(
      "replacement-delivery-cursor",
    );
    expect(controller.nextIntegrationCursor.value).toBe(
      "replacement-integration-cursor",
    );
  });

  it("loads safe health and independent cursor pages under one authority", async () => {
    const client = api();
    vi.mocked(client.deliveries)
      .mockResolvedValueOnce({
        items: [delivery()],
        nextCursor: "delivery-next",
      })
      .mockResolvedValueOnce({
        items: [delivery({ id: "delivery-2" })],
        nextCursor: null,
      });
    vi.mocked(client.integrations)
      .mockResolvedValueOnce({
        items: [integration()],
        nextCursor: "integration-next",
      })
      .mockResolvedValueOnce({
        items: [integration({ integrationId: "integration-2" })],
        nextCursor: null,
      });
    const controller = createNotificationOperationsController({ api: client });
    activate(controller);

    await controller.refresh();
    await controller.loadMoreDeliveries();
    await controller.loadMoreIntegrations();

    expect(controller.health.value).toEqual(health);
    expect(controller.deliveries.value.map(({ id }) => id)).toEqual([
      "delivery-1",
      "delivery-2",
    ]);
    expect(
      controller.integrations.value.map(({ integrationId }) => integrationId),
    ).toEqual(["integration-1", "integration-2"]);
    expect(client.deliveries).toHaveBeenLastCalledWith(
      controller.filters.value,
      "delivery-next",
      expect.any(Object),
    );
    expect(client.integrations).toHaveBeenLastCalledWith(
      controller.filters.value,
      "integration-next",
      expect.any(Object),
    );
  });

  it("clears protected state and rejects late responses after authority changes", async () => {
    const client = api();
    const late =
      deferred<Awaited<ReturnType<NotificationOperationsApi["deliveries"]>>>();
    vi.mocked(client.deliveries).mockReturnValueOnce(late.promise);
    const controller = createNotificationOperationsController({ api: client });
    activate(controller);
    const loading = controller.loadDeliveries();

    controller.setContext({
      authorityKey: "operator-1:project-2:false",
      permissions: { read: true, operate: false },
    });
    late.resolve({ items: [delivery()], nextCursor: null });
    await loading;

    expect(controller.deliveries.value).toEqual([]);
    expect(controller.integrations.value).toEqual([]);
    expect(controller.health.value).toBeNull();
    expect(controller.retryAvailable.value).toBe(false);
  });

  it("resolves replay by the current server row and rejects fabricated or unknown caller data", async () => {
    const client = api();
    vi.mocked(client.replay)
      .mockRejectedValueOnce({ status: 0, message: "unsafe network text" })
      .mockResolvedValueOnce(
        delivery({
          status: "PENDING",
          operationsVersion: 3,
          replayEligibility: "INELIGIBLE_STATE",
        }),
      );
    const keys = ["stable-replay-key"];
    const controller = createNotificationOperationsController({
      api: client,
      idempotencyKey: () => keys[0]!,
    });
    activate(controller);
    await controller.refresh();

    expect(
      await controller.replayDelivery({
        ...delivery(),
        id: "delivery-1",
        operationsVersion: 999,
        replayEligibility: "INELIGIBLE_AMBIGUOUS",
      } as never),
    ).toBe(false);
    expect(client.replay).not.toHaveBeenCalled();
    expect(await controller.replayDelivery("unknown-delivery")).toBe(false);
    expect(client.replay).not.toHaveBeenCalled();

    expect(await controller.replayDelivery("delivery-1")).toBe(false);
    expect(controller.error.value).toMatchObject({
      kind: "AMBIGUOUS",
      retryable: true,
    });
    expect(controller.retryAvailable.value).toBe(true);
    expect(await controller.retryLastMutation()).toBe(true);
    expect(client.replay).toHaveBeenCalledTimes(2);
    expect(vi.mocked(client.replay).mock.calls[0]?.[1].idempotencyKey).toBe(
      "stable-replay-key",
    );
    expect(vi.mocked(client.replay).mock.calls[1]?.[1].idempotencyKey).toBe(
      "stable-replay-key",
    );
    expect(controller.deliveries.value).toEqual([]);
  });

  it("reloads authoritative rows after OCC conflict and never repeats the command", async () => {
    const client = api();
    vi.mocked(client.replay).mockRejectedValue({
      status: 409,
      code: "NOTIFICATION_OPERATIONS_VERSION_CONFLICT",
      message: "unsafe backend text",
    });
    const controller = createNotificationOperationsController({ api: client });
    activate(controller);
    await controller.refresh();

    await controller.replayDelivery("delivery-1");

    expect(client.replay).toHaveBeenCalledOnce();
    expect(client.deliveries).toHaveBeenCalledTimes(2);
    expect(controller.error.value?.kind).toBe("CONFLICT");
    expect(controller.error.value?.message).not.toContain("unsafe");
    expect(controller.retryAvailable.value).toBe(false);
  });

  it("keeps an in-flight mutation and its stable intent isolated from filter changes", async () => {
    const client = api();
    const pendingReplay = deferred<NotificationOperationsDelivery>();
    vi.mocked(client.replay).mockReturnValueOnce(pendingReplay.promise);
    const controller = createNotificationOperationsController({ api: client });
    activate(controller);
    await controller.refresh();

    const replaying = controller.replayDelivery("delivery-1");
    await controller.setFilters({
      projectId: "00000000-0000-4000-8000-000000000099",
      channel: "TELEGRAM_OPERATIONAL",
      status: "DEAD_LETTER",
      integrationKind: "TELEGRAM_PRODUCT_INSTALLATION",
      integrationStatus: "ACTIVE",
    });

    expect(controller.filters.value).toEqual({
      projectId: "",
      channel: "",
      status: "",
      integrationKind: "",
      integrationStatus: "",
    });
    expect(controller.mutating.value).toBe(true);
    pendingReplay.resolve(
      delivery({
        status: "PENDING",
        operationsVersion: 3,
        replayEligibility: "INELIGIBLE_STATE",
      }),
    );
    expect(await replaying).toBe(true);
    expect(controller.mutating.value).toBe(false);
    expect(client.replay).toHaveBeenCalledOnce();
  });

  it("quarantines only a server candidate after exact identity confirmation", async () => {
    const client = api();
    const controller = createNotificationOperationsController({
      api: client,
      idempotencyKey: () => "quarantine-key",
    });
    activate(controller);
    await controller.refresh();
    const target = integration();

    expect(
      await controller.quarantineIntegration(
        {
          ...target,
          integrationId: "integration-1",
          version: 999,
          maskedIdentity: "forged",
        } as never,
        "CREDENTIAL_COMPROMISED",
        target.maskedIdentity,
      ),
    ).toBe(false);
    expect(client.quarantine).not.toHaveBeenCalled();
    expect(
      await controller.quarantineIntegration(
        "unknown-integration",
        "CREDENTIAL_COMPROMISED",
        "Slack wrong",
      ),
    ).toBe(false);
    expect(client.quarantine).not.toHaveBeenCalled();

    expect(
      await controller.quarantineIntegration(
        target.integrationId,
        "CREDENTIAL_COMPROMISED",
        target.maskedIdentity,
      ),
    ).toBe(true);
    expect(client.quarantine).toHaveBeenCalledWith(
      target,
      {
        reason: "CREDENTIAL_COMPROMISED",
        confirmation: target.maskedIdentity,
      },
      expect.objectContaining({ idempotencyKey: "quarantine-key" }),
    );
    expect(controller.integrations.value[0]).toMatchObject({
      status: "INVALID",
      quarantineAllowed: false,
      version: 5,
    });
    expect(controller.notice.value).toContain("2");
  });

  it("scrubs all rows and intents when the server reports permission loss", async () => {
    const client = api();
    const controller = createNotificationOperationsController({ api: client });
    activate(controller);
    await controller.refresh();
    vi.mocked(client.deliveries).mockRejectedValueOnce({ status: 403 });

    await controller.loadDeliveries();

    expect(controller.health.value).toBeNull();
    expect(controller.deliveries.value).toEqual([]);
    expect(controller.integrations.value).toEqual([]);
    expect(controller.error.value?.kind).toBe("FORBIDDEN");
    expect(controller.retryAvailable.value).toBe(false);
  });
});
