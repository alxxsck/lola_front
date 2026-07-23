import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTelegramBroadcastsController,
  type TelegramBroadcastDelivery,
  type TelegramBroadcastsApi,
} from "./use-telegram-broadcasts";
import type {
  TelegramBroadcast,
  TelegramBroadcastDraft,
  TelegramBroadcastPermissions,
  TelegramBroadcastPreview,
} from "./telegram-broadcast";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const permissions: TelegramBroadcastPermissions = {
  read: true,
  draft: true,
  approve: true,
  operate: true,
};

const draft: TelegramBroadcastDraft = {
  title: "Июльское обновление",
  content: { text: "Новое обновление уже доступно." },
  audience: { kind: "ALL_EXPLICITLY_OPTED_IN" },
};

function record(overrides: Partial<TelegramBroadcast> = {}): TelegramBroadcast {
  return {
    id: "broadcast-1",
    projectId: "project-1",
    title: draft.title,
    status: "DRAFT",
    version: 1,
    revision: {
      id: "revision-1",
      revisionNumber: 1,
      contentHash: "content-hash-1",
      text: draft.content.text,
      contentAvailable: true,
      createdAt: "2026-07-23T10:00:00.000Z",
    },
    content: draft.content,
    audience: draft.audience,
    approval: null,
    latestTest: null,
    recipientCount: 0,
    scheduledAt: null,
    progress: null,
    allowedActions: ["EDIT", "PREVIEW", "TEST_SEND", "APPROVE", "CANCEL"],
    createdAt: "2026-07-23T10:00:00.000Z",
    updatedAt: "2026-07-23T10:00:00.000Z",
    ...overrides,
  };
}

function preview(
  overrides: Partial<TelegramBroadcastPreview> = {},
): TelegramBroadcastPreview {
  return {
    broadcastId: "broadcast-1",
    version: 1,
    revisionId: "revision-1",
    contentHash:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    renderedText: draft.content.text,
    eligibleRecipientCount: 12,
    totalEvaluated: 15,
    exclusions: [
      { reason: "CONSENT_NOT_ACTIVE", count: 2 },
      { reason: "NO_ACTIVE_LINK", count: 1 },
    ],
    ...overrides,
  };
}

function api(): TelegramBroadcastsApi {
  return {
    list: vi.fn().mockResolvedValue({
      items: [record()],
      nextCursor: null,
      total: 1,
    }),
    get: vi.fn().mockResolvedValue(record()),
    create: vi.fn().mockResolvedValue(record()),
    updateDraft: vi.fn().mockResolvedValue(record({ version: 2 })),
    preview: vi.fn().mockResolvedValue(preview()),
    testSend: vi.fn().mockResolvedValue({
      id: "test-1",
      status: "SENT",
      label: "Анна Смирнова",
      revisionId: "revision-1",
      currentRevision: true,
      sentAt: "2026-07-23T10:02:00.000Z",
      version: 1,
    }),
    approve: vi.fn().mockResolvedValue(
      record({
        status: "APPROVED",
        version: 2,
        approval: {
          id: "approval-1",
          revisionId: "revision-1",
          contentHash:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          recipientCount: 12,
          successfulTestId: "test-1",
          audiencePolicy: "ALL_EXPLICITLY_OPTED_IN",
          approvedAt: "2026-07-23T10:03:00.000Z",
          approvedByActorType: "CMS_USER",
        },
        allowedActions: ["START", "SCHEDULE", "CANCEL"],
      }),
    ),
    start: vi.fn().mockResolvedValue(
      record({
        status: "RUNNING",
        version: 3,
        allowedActions: ["PAUSE", "CANCEL"],
      }),
    ),
    schedule: vi.fn().mockResolvedValue(
      record({
        status: "SCHEDULED",
        version: 3,
        scheduledAt: "2026-07-25T12:00:00.000Z",
        allowedActions: ["START", "CANCEL"],
      }),
    ),
    pause: vi.fn().mockResolvedValue(
      record({
        status: "PAUSED",
        version: 4,
        allowedActions: ["RESUME", "CANCEL"],
      }),
    ),
    resume: vi.fn().mockResolvedValue(
      record({
        status: "RUNNING",
        version: 5,
        allowedActions: ["PAUSE", "CANCEL"],
      }),
    ),
    cancel: vi.fn().mockResolvedValue(
      record({
        status: "CANCELLED",
        version: 6,
        allowedActions: [],
      }),
    ),
    listDeliveries: vi.fn().mockResolvedValue({
      items: [],
      nextCursor: null,
      total: 0,
    }),
  };
}

function activate(
  controller: ReturnType<typeof createTelegramBroadcastsController>,
  nextPermissions = permissions,
) {
  controller.setContext({
    visible: true,
    projectId: "project-1",
    permissions: nextPermissions,
  });
}

describe("telegram broadcasts controller", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("loads server-paginated list and detail through the narrow API", async () => {
    const repository = api();
    const controller = createTelegramBroadcastsController({ api: repository });
    activate(controller);

    await controller.loadList();
    await controller.open("broadcast-1");

    expect(repository.list).toHaveBeenCalledWith(
      "project-1",
      { limit: 25 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(repository.get).toHaveBeenCalledWith(
      "project-1",
      "broadcast-1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(controller.items.value).toHaveLength(1);
    expect(controller.selected.value?.id).toBe("broadcast-1");
  });

  it("creates one durable draft with an idempotency key", async () => {
    const repository = api();
    const controller = createTelegramBroadcastsController({
      api: repository,
      idempotencyKey: () => "create-key",
    });
    activate(controller);

    await controller.create(draft);

    expect(repository.create).toHaveBeenCalledWith(
      "project-1",
      draft,
      expect.objectContaining({
        idempotencyKey: "create-key",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(controller.selected.value?.id).toBe("broadcast-1");
  });

  it("invalidates local preview after a persisted draft change and adopts returned OCC version", async () => {
    const repository = api();
    const controller = createTelegramBroadcastsController({ api: repository });
    activate(controller);
    await controller.open("broadcast-1");
    await controller.generatePreview();
    expect(controller.currentPreview.value?.revisionId).toBe("revision-1");

    await controller.saveDraft({
      ...draft,
      content: { text: "Исправленное сообщение" },
    });

    expect(repository.updateDraft).toHaveBeenCalledWith(
      "project-1",
      "broadcast-1",
      expect.objectContaining({
        expectedVersion: 1,
        draft: expect.objectContaining({
          content: { text: "Исправленное сообщение" },
        }),
      }),
      expect.objectContaining({
        idempotencyKey: expect.any(String),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(controller.currentPreview.value).toBeNull();
    expect(controller.selected.value?.version).toBe(2);
  });

  it("rejects invalid draft bounds before create or update transport", async () => {
    const repository = api();
    const controller = createTelegramBroadcastsController({ api: repository });
    activate(controller);

    await expect(
      controller.create({
        ...draft,
        title: "A".repeat(121),
      }),
    ).resolves.toBe(false);
    await controller.open("broadcast-1");
    await expect(
      controller.saveDraft({
        ...draft,
        content: { text: " " },
      }),
    ).resolves.toBe(false);

    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.updateDraft).not.toHaveBeenCalled();
  });

  it("requires the current preview for test-send and approval and sends a bounded external ID", async () => {
    const repository = api();
    const controller = createTelegramBroadcastsController({ api: repository });
    activate(controller);
    await controller.open("broadcast-1");

    await expect(
      controller.testSend("customer-anna", "Проверка Анны"),
    ).resolves.toBe(false);
    await expect(controller.approve()).resolves.toBe(false);
    expect(repository.testSend).not.toHaveBeenCalled();
    expect(repository.approve).not.toHaveBeenCalled();

    await controller.generatePreview();
    await expect(
      controller.testSend("customer-anna", "Проверка Анны"),
    ).resolves.toBe(true);
    await expect(controller.approve()).resolves.toBe(true);

    expect(repository.testSend).toHaveBeenCalledWith(
      "project-1",
      "broadcast-1",
      {
        endUserExternalId: "customer-anna",
        expectedVersion: 1,
        label: "Проверка Анны",
      },
      expect.objectContaining({
        idempotencyKey: expect.any(String),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(repository.approve).toHaveBeenCalledWith(
      "project-1",
      "broadcast-1",
      {
        expectedVersion: 1,
        expectedContentHash:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        expectedRecipientCount: 12,
        successfulTestId: "test-1",
      },
      expect.objectContaining({
        idempotencyKey: expect.any(String),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("blocks approval before transport when the preview exceeds the 10k audience cap", async () => {
    const repository = api();
    vi.mocked(repository.preview).mockResolvedValue(
      preview({ eligibleRecipientCount: 10_001, totalEvaluated: 10_001 }),
    );
    const controller = createTelegramBroadcastsController({ api: repository });
    activate(controller);
    await controller.open("broadcast-1");
    await controller.generatePreview();
    await controller.testSend("customer-anna", "Проверка Анны");

    await expect(controller.approve()).resolves.toBe(false);
    expect(repository.approve).not.toHaveBeenCalled();
  });

  it("rejects blank or oversized test target fields before transport", async () => {
    const repository = api();
    const controller = createTelegramBroadcastsController({ api: repository });
    activate(controller);
    await controller.open("broadcast-1");
    await controller.generatePreview();

    await expect(controller.testSend(" ", "Проверка")).resolves.toBe(false);
    await expect(
      controller.testSend("A".repeat(256), "Проверка"),
    ).resolves.toBe(false);
    await expect(
      controller.testSend("customer-anna", "A".repeat(81)),
    ).resolves.toBe(false);

    expect(repository.testSend).not.toHaveBeenCalled();
  });

  it("can pause a scheduled broadcast when the server exposes that action", async () => {
    const repository = api();
    vi.mocked(repository.get).mockResolvedValue(
      record({
        status: "SCHEDULED",
        version: 3,
        allowedActions: ["PAUSE", "CANCEL"],
      }),
    );
    const controller = createTelegramBroadcastsController({ api: repository });
    activate(controller);
    await controller.open("broadcast-1");

    await expect(controller.pause()).resolves.toBe(true);

    expect(repository.pause).toHaveBeenCalledWith(
      "project-1",
      "broadcast-1",
      { expectedVersion: 3 },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    expect(controller.selected.value?.status).toBe("PAUSED");
  });

  it("supports separate start, schedule, pause, resume and cancel commands with OCC", async () => {
    const repository = api();
    vi.mocked(repository.get).mockResolvedValue(
      record({
        status: "APPROVED",
        version: 2,
        allowedActions: ["START", "SCHEDULE", "CANCEL"],
      }),
    );
    const controller = createTelegramBroadcastsController({ api: repository });
    activate(controller);
    await controller.open("broadcast-1");

    await controller.schedule("2026-07-25T12:00:00.000Z");
    expect(repository.schedule).toHaveBeenCalledWith(
      "project-1",
      "broadcast-1",
      {
        expectedVersion: 2,
        scheduledAt: "2026-07-25T12:00:00.000Z",
      },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );

    await controller.start();
    await controller.pause();
    await controller.resume();
    await controller.cancel();

    expect(repository.start).toHaveBeenCalledWith(
      "project-1",
      "broadcast-1",
      { expectedVersion: 3 },
      expect.any(Object),
    );
    expect(repository.pause).toHaveBeenCalledWith(
      "project-1",
      "broadcast-1",
      { expectedVersion: 3 },
      expect.any(Object),
    );
    expect(repository.resume).toHaveBeenCalledWith(
      "project-1",
      "broadcast-1",
      { expectedVersion: 4 },
      expect.any(Object),
    );
    expect(repository.cancel).toHaveBeenCalledWith(
      "project-1",
      "broadcast-1",
      { expectedVersion: 5 },
      expect.any(Object),
    );
  });

  it("reuses an idempotency intent after an ambiguous transport outcome", async () => {
    const repository = api();
    vi.mocked(repository.create)
      .mockRejectedValueOnce({ code: "NETWORK_ERROR" })
      .mockResolvedValueOnce(record());
    const keys = ["stable-key", "must-not-be-used"];
    const controller = createTelegramBroadcastsController({
      api: repository,
      idempotencyKey: () => keys.shift() ?? "unexpected",
    });
    activate(controller);

    await expect(controller.create(draft)).resolves.toBe(false);
    expect(controller.transportRetryAvailable.value).toBe(true);
    await expect(controller.retryLastMutation()).resolves.toBe(true);

    expect(vi.mocked(repository.create).mock.calls[0]?.[2].idempotencyKey).toBe(
      "stable-key",
    );
    expect(vi.mocked(repository.create).mock.calls[1]?.[2].idempotencyKey).toBe(
      "stable-key",
    );
  });

  it("reuses the exact create intent when normalized transport failure has status zero", async () => {
    const repository = api();
    vi.mocked(repository.create)
      .mockRejectedValueOnce({ status: 0 })
      .mockResolvedValueOnce(record());
    const controller = createTelegramBroadcastsController({
      api: repository,
      idempotencyKey: () => "status-zero-key",
    });
    activate(controller);

    await expect(controller.create(draft)).resolves.toBe(false);
    expect(controller.error.value?.kind).toBe("AMBIGUOUS");
    await expect(controller.retryLastMutation()).resolves.toBe(true);

    expect(
      vi
        .mocked(repository.create)
        .mock.calls.map((call) => call[2].idempotencyKey),
    ).toEqual(["status-zero-key", "status-zero-key"]);
  });

  it.each([
    [{ status: 429 }, "RATE_LIMITED"],
    [{ status: 500 }, "UNKNOWN"],
  ])(
    "does not expose an inert transport retry for %j",
    async (failure, expectedKind) => {
      const repository = api();
      vi.mocked(repository.get).mockResolvedValue(
        record({
          status: "APPROVED",
          allowedActions: ["START"],
        }),
      );
      vi.mocked(repository.start).mockRejectedValue(failure);
      const controller = createTelegramBroadcastsController({
        api: repository,
      });
      activate(controller);
      await controller.open("broadcast-1");

      await expect(controller.start()).resolves.toBe(false);
      expect(controller.error.value?.kind).toBe(expectedKind);
      expect(controller.transportRetryAvailable.value).toBe(false);
      await expect(controller.retryLastMutation()).resolves.toBe(false);
      expect(repository.start).toHaveBeenCalledOnce();
    },
  );

  it("maps fresh-auth denial explicitly and never replays the lifecycle command", async () => {
    const repository = api();
    vi.mocked(repository.get).mockResolvedValue(
      record({
        status: "APPROVED",
        allowedActions: ["START"],
      }),
    );
    vi.mocked(repository.start).mockRejectedValue({
      status: 428,
      code: "MFA_REQUIRED",
    });
    const controller = createTelegramBroadcastsController({ api: repository });
    activate(controller);
    await controller.open("broadcast-1");

    await expect(controller.start()).resolves.toBe(false);

    expect(controller.error.value).toMatchObject({
      kind: "FRESH_AUTH",
      retryable: false,
    });
    expect(controller.transportRetryAvailable.value).toBe(false);
    expect(repository.start).toHaveBeenCalledOnce();
  });

  it("keeps the newer mutation busy when an old project mutation settles", async () => {
    const repository = api();
    const oldMutation = deferred<ReturnType<typeof record>>();
    const newMutation = deferred<ReturnType<typeof record>>();
    vi.mocked(repository.create)
      .mockReturnValueOnce(oldMutation.promise)
      .mockReturnValueOnce(newMutation.promise);
    const controller = createTelegramBroadcastsController({ api: repository });
    activate(controller);

    const oldResult = controller.create(draft);
    controller.setContext({
      visible: true,
      projectId: "project-2",
      permissions,
    });
    const newResult = controller.create(draft);
    oldMutation.resolve(record({ projectId: "project-1" }));
    await oldResult;

    expect(controller.mutating.value).toBe(true);

    newMutation.resolve(record({ projectId: "project-2" }));
    await newResult;
    expect(controller.mutating.value).toBe(false);
  });

  it("does not let a pre-mutation detail response overwrite the newer version", async () => {
    const repository = api();
    const approved = record({
      status: "APPROVED",
      version: 2,
      allowedActions: ["START"],
    });
    const staleRefresh = deferred<ReturnType<typeof record>>();
    vi.mocked(repository.get)
      .mockResolvedValueOnce(approved)
      .mockReturnValueOnce(staleRefresh.promise);
    vi.mocked(repository.start).mockResolvedValue(
      record({
        status: "RUNNING",
        version: 3,
        allowedActions: ["PAUSE"],
      }),
    );
    const controller = createTelegramBroadcastsController({ api: repository });
    activate(controller);
    await controller.open("broadcast-1");

    const refreshing = controller.refresh();
    await controller.start();
    staleRefresh.resolve(approved);
    await refreshing;

    expect(controller.selected.value).toMatchObject({
      status: "RUNNING",
      version: 3,
    });
  });

  it("does not let an older same-epoch detail read overwrite a newer refresh", async () => {
    const repository = api();
    const older = deferred<ReturnType<typeof record>>();
    const newer = deferred<ReturnType<typeof record>>();
    vi.mocked(repository.get)
      .mockResolvedValueOnce(record({ status: "APPROVED", version: 1 }))
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const controller = createTelegramBroadcastsController({ api: repository });
    activate(controller);
    await controller.open("broadcast-1");

    const olderRefresh = controller.refresh();
    const newerRefresh = controller.refresh();
    newer.resolve(
      record({
        status: "RUNNING",
        version: 3,
        allowedActions: ["PAUSE"],
      }),
    );
    await newerRefresh;
    older.resolve(
      record({
        status: "APPROVED",
        version: 2,
        allowedActions: ["START"],
      }),
    );
    await olderRefresh;

    expect(controller.selected.value).toMatchObject({
      status: "RUNNING",
      version: 3,
    });
  });

  it("releases foreground loading when a newer poll supersedes a manual refresh", async () => {
    vi.useFakeTimers();
    const repository = api();
    const manualRefresh = deferred<ReturnType<typeof record>>();
    const newerPoll = deferred<ReturnType<typeof record>>();
    vi.mocked(repository.get)
      .mockResolvedValueOnce(
        record({
          status: "RUNNING",
          version: 1,
          allowedActions: ["PAUSE"],
        }),
      )
      .mockReturnValueOnce(manualRefresh.promise)
      .mockReturnValueOnce(newerPoll.promise);
    const controller = createTelegramBroadcastsController({
      api: repository,
      pollDelays: [100],
    });
    activate(controller);
    await controller.open("broadcast-1");

    const refreshing = controller.refresh();
    expect(controller.detailLoading.value).toBe(true);
    vi.advanceTimersByTime(100);
    expect(repository.get).toHaveBeenCalledTimes(3);

    newerPoll.resolve(
      record({
        status: "RUNNING",
        version: 3,
        allowedActions: ["PAUSE"],
      }),
    );
    await Promise.resolve();
    expect(controller.selected.value).toMatchObject({
      status: "RUNNING",
      version: 3,
    });
    manualRefresh.resolve(
      record({
        status: "APPROVED",
        version: 2,
        allowedActions: ["START"],
      }),
    );
    await refreshing;

    expect(controller.detailLoading.value).toBe(false);
    expect(controller.selected.value).toMatchObject({
      status: "RUNNING",
      version: 3,
    });
    expect(controller.actionAvailability.value.pause).toBe(true);
  });

  it("reloads authoritative detail on OCC conflict without applying optimistic state", async () => {
    const repository = api();
    vi.mocked(repository.get)
      .mockResolvedValueOnce(
        record({
          status: "APPROVED",
          version: 4,
          allowedActions: ["START"],
        }),
      )
      .mockResolvedValueOnce(
        record({
          status: "RUNNING",
          version: 5,
          allowedActions: ["PAUSE", "CANCEL"],
        }),
      );
    vi.mocked(repository.start).mockRejectedValue({
      status: 409,
      code: "TELEGRAM_BROADCAST_VERSION_CONFLICT",
    });
    const controller = createTelegramBroadcastsController({ api: repository });
    activate(controller);
    await controller.open("broadcast-1");

    await expect(controller.start()).resolves.toBe(false);

    expect(repository.get).toHaveBeenCalledTimes(2);
    expect(controller.selected.value?.status).toBe("RUNNING");
    expect(controller.error.value?.kind).toBe("CONFLICT");
  });

  it("drops stale responses after project switch and permission loss", async () => {
    const repository = api();
    const pending = deferred<ReturnType<typeof record>>();
    vi.mocked(repository.get).mockReturnValueOnce(pending.promise);
    const controller = createTelegramBroadcastsController({ api: repository });
    activate(controller);
    const opening = controller.open("broadcast-1");

    controller.setContext({
      visible: true,
      projectId: "project-2",
      permissions,
    });
    pending.resolve(record());
    await opening;
    expect(controller.selected.value).toBeNull();

    controller.setContext({
      visible: true,
      projectId: "project-2",
      permissions: { ...permissions, read: false },
    });
    expect(controller.items.value).toEqual([]);
    expect(controller.selected.value).toBeNull();
  });

  it("pauses work without discarding draft state when document visibility changes", async () => {
    const repository = api();
    const controller = createTelegramBroadcastsController({ api: repository });
    activate(controller);
    await controller.open("broadcast-1");
    await controller.generatePreview();
    const selected = controller.selected.value;
    const generated = controller.currentPreview.value;

    controller.setContext({
      visible: false,
      projectId: "project-1",
      permissions,
    });

    expect(controller.selected.value).toBe(selected);
    expect(controller.currentPreview.value).toBe(generated);
    expect(controller.polling.value).toBe(false);

    controller.setContext({
      visible: true,
      projectId: "project-1",
      permissions,
    });
    expect(controller.selected.value).toBe(selected);
    expect(controller.currentPreview.value).toBe(generated);
  });

  it("ignores a response that resolves while hidden without aborting the request", async () => {
    const repository = api();
    const pending = deferred<ReturnType<typeof record>>();
    vi.mocked(repository.get).mockReturnValueOnce(pending.promise);
    const controller = createTelegramBroadcastsController({ api: repository });
    activate(controller);
    const opening = controller.open("broadcast-1");
    const signal = vi.mocked(repository.get).mock.calls[0]?.[2].signal;

    controller.setContext({
      visible: false,
      projectId: "project-1",
      permissions,
    });
    expect(signal?.aborted).toBe(false);
    pending.resolve(record());
    await opening;

    expect(controller.selected.value).toBeNull();
  });

  it("scrubs protected broadcast state when the server reports permission loss", async () => {
    const repository = api();
    const controller = createTelegramBroadcastsController({ api: repository });
    activate(controller);
    await controller.loadList();
    expect(controller.items.value).toHaveLength(1);
    vi.mocked(repository.list).mockRejectedValueOnce({ status: 403 });

    await controller.loadList();

    expect(controller.items.value).toEqual([]);
    expect(controller.selected.value).toBeNull();
    expect(controller.error.value?.kind).toBe("FORBIDDEN");
  });

  it("keeps delivery rows opaque and preserves explicit suppression and unknown states", async () => {
    const repository = api();
    const deliveryRows: TelegramBroadcastDelivery[] = [
      {
        id: "delivery-opaque-1",
        status: "OUTCOME_UNKNOWN",
        safeFailureCategory: "AMBIGUOUS_PROVIDER_RESULT",
        createdAt: "2026-07-23T10:10:00.000Z",
        finishedAt: null,
      },
      {
        id: "delivery-opaque-2",
        status: "SUPPRESSED_CONSENT",
        safeFailureCategory: "CONSENT_REVOKED",
        createdAt: "2026-07-23T10:11:00.000Z",
        finishedAt: "2026-07-23T10:11:00.000Z",
      },
      {
        id: "delivery-opaque-3",
        status: "SUPPRESSED_LINK",
        safeFailureCategory: "LINK_NOT_ACTIVE",
        createdAt: "2026-07-23T10:12:00.000Z",
        finishedAt: "2026-07-23T10:12:00.000Z",
      },
      {
        id: "delivery-opaque-4",
        status: "SUPPRESSED_INSTALLATION",
        safeFailureCategory: "INSTALLATION_UNAVAILABLE",
        createdAt: "2026-07-23T10:13:00.000Z",
        finishedAt: "2026-07-23T10:13:00.000Z",
      },
    ];
    vi.mocked(repository.listDeliveries).mockResolvedValue({
      items: deliveryRows,
      nextCursor: null,
      total: deliveryRows.length,
    });
    const controller = createTelegramBroadcastsController({ api: repository });
    activate(controller);
    await controller.open("broadcast-1");

    await controller.loadDeliveries();

    expect(controller.deliveries.value).toEqual(deliveryRows);
    expect(JSON.stringify(controller.deliveries.value)).not.toMatch(
      /endUser|displayName|telegramUser|chatId/i,
    );
  });

  it("polls active lifecycle sequentially and stops after a terminal record", async () => {
    vi.useFakeTimers();
    const repository = api();
    vi.mocked(repository.get)
      .mockResolvedValueOnce(
        record({
          status: "RUNNING",
          version: 2,
          allowedActions: ["PAUSE", "CANCEL"],
        }),
      )
      .mockResolvedValueOnce(
        record({
          status: "COMPLETED",
          version: 3,
          allowedActions: [],
        }),
      );
    const controller = createTelegramBroadcastsController({
      api: repository,
      pollDelays: [100],
    });
    activate(controller);

    await controller.open("broadcast-1");
    expect(controller.polling.value).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(controller.selected.value?.status).toBe("COMPLETED");
    expect(controller.polling.value).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(repository.get).toHaveBeenCalledTimes(2);
  });

  it("scrubs all protected detail state and stops polling when a poll loses permission", async () => {
    vi.useFakeTimers();
    const repository = api();
    vi.mocked(repository.get)
      .mockResolvedValueOnce(
        record({
          status: "RUNNING",
          version: 2,
          allowedActions: ["PAUSE", "CANCEL"],
        }),
      )
      .mockRejectedValueOnce({ status: 403 });
    vi.mocked(repository.listDeliveries).mockResolvedValue({
      items: [
        {
          id: "opaque-delivery",
          status: "PENDING",
          safeFailureCategory: null,
          createdAt: "2026-07-23T10:10:00.000Z",
          finishedAt: null,
        },
      ],
      nextCursor: null,
      total: 1,
    });
    const controller = createTelegramBroadcastsController({
      api: repository,
      pollDelays: [100],
    });
    activate(controller);
    await controller.open("broadcast-1");
    await controller.loadDeliveries();
    controller.currentPreview.value = preview();

    expect(controller.selected.value).not.toBeNull();
    expect(controller.items.value).toHaveLength(1);
    expect(controller.currentPreview.value).not.toBeNull();
    expect(controller.deliveries.value).toHaveLength(1);
    expect(controller.polling.value).toBe(true);

    await vi.advanceTimersByTimeAsync(100);

    expect(controller.error.value?.kind).toBe("FORBIDDEN");
    expect(controller.selected.value).toBeNull();
    expect(controller.items.value).toEqual([]);
    expect(controller.currentPreview.value).toBeNull();
    expect(controller.deliveries.value).toEqual([]);
    expect(controller.polling.value).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(repository.get).toHaveBeenCalledTimes(2);
  });
});
