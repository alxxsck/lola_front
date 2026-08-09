import { nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import type { SupportExternalWorkSource } from "../api/support-external-work-source";
import {
  createSupportCaseExternalWorkController,
  type SupportCaseExternalWorkPermissions,
} from "./use-support-case-external-work";

const option = {
  optionId: "10000000-0000-4000-8000-000000000001",
  connectionId: "10000000-0000-4000-8000-000000000002",
  mappingRootId: "10000000-0000-4000-8000-000000000003",
  mappingRevisionId: "10000000-0000-4000-8000-000000000004",
  formRevision: "form-8",
  destinationId: "support",
  destinationLabel: "Support Operations",
  formId: "incident",
  formLabel: "Incident",
  matchedBy: "RULE" as const,
  allowedActions: ["CREATE" as const],
  fields: [],
};

const link = {
  linkId: "20000000-0000-4000-8000-000000000001",
  connectionId: option.connectionId,
  itemId: "20000000-0000-4000-8000-000000000002",
  status: "ACTIVE" as const,
  linkedAt: "2026-08-09T10:00:00.000Z",
  version: 4,
  item: {
    itemId: "20000000-0000-4000-8000-000000000002",
    connectionId: option.connectionId,
    provider: "JSM" as const,
    remoteItemId: "SUP-731",
    remoteKey: "SUP-731",
    remoteUrl: "https://jsm.example/SUP-731",
    summary: "Проверить provider timeout",
    status: "IN_PROGRESS",
    priority: "HIGH",
    team: { id: "support", label: "Support Operations" },
    assignee: null,
    requester: null,
    tags: [],
    latestMessageAt: null,
    freshness: "FRESH",
    remoteUpdatedAt: null,
    lastRefreshedAt: null,
    version: 9,
    linked: true,
    link: {
      linkId: "20000000-0000-4000-8000-000000000001",
      caseId: "case-1",
      linkedAt: "2026-08-09T10:00:00.000Z",
      version: 4,
    },
    allowedActions: [
      "OPEN_REMOTE",
      "VIEW_TIMELINE",
      "COMMENT_INTERNAL",
      "COMMENT_PUBLIC",
      "UNLINK",
      "REFRESH",
    ],
  },
};

function source(overrides: Partial<SupportExternalWorkSource> = {}) {
  return {
    readCaseCreateOptions: vi.fn().mockResolvedValue({ items: [option] }),
    listCaseLinks: vi
      .fn()
      .mockResolvedValue({ items: [link], nextCursor: null }),
    readCaseLink: vi.fn().mockResolvedValue(link),
    readCommand: vi.fn().mockResolvedValue({
      commandId: "command-1",
      intent: "CREATE",
      status: "QUEUED",
      errorCode: null,
      errorCategory: null,
      nextAttemptAt: null,
      version: 1,
      createdAt: "2026-08-09T10:00:00.000Z",
      resolvedAt: null,
      allowedActions: [],
    }),
    listCaseCommands: vi
      .fn()
      .mockResolvedValue({ items: [], nextCursor: null }),
    readLinkedTimeline: vi
      .fn()
      .mockResolvedValue({ items: [], nextCursor: null }),
    listInbox: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    submitCaseCommand: vi.fn().mockResolvedValue({
      commandId: "command-1",
      status: "QUEUED",
      replayed: false,
    }),
    retryCommand: vi.fn(),
    refreshCommandEvidence: vi.fn(),
    resolveCommand: vi.fn(),
    linkInboxItemToCase: vi.fn(),
    ...overrides,
  } as unknown as SupportExternalWorkSource;
}

let actorSequence = 0;

function setup(
  permissions: Partial<SupportCaseExternalWorkPermissions> = {},
  overrides: Partial<SupportExternalWorkSource> = {},
) {
  const projectId = ref("project-1");
  const actorId = ref(`actor-${++actorSequence}`);
  const caseId = ref("case-1");
  const currentPermissions = ref<SupportCaseExternalWorkPermissions>({
    read: true,
    create: true,
    commentInternal: true,
    commentPublic: true,
    readInternal: true,
    retry: true,
    resolveUnknown: true,
    inboxRead: true,
    ...permissions,
  });
  const adapter = source(overrides);
  const forbidden = vi.fn();
  const authenticationRequired = vi.fn();
  const controller = createSupportCaseExternalWorkController(
    {
      projectId: () => projectId.value,
      actorId: () => actorId.value,
      caseId: () => caseId.value,
      caseTitle: () => "Не проходит возврат",
      caseSummary: () => "Клиент видит ошибку при возврате",
      permissions: () => currentPermissions.value,
      onForbidden: forbidden,
      onAuthenticationRequired: authenticationRequired,
    },
    adapter,
    { idempotencyKey: () => "stable-command-key" },
  );
  return {
    controller,
    adapter,
    projectId,
    actorId,
    caseId,
    currentPermissions,
    forbidden,
    authenticationRequired,
  };
}

describe("Support Case External Work controller", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("loads Case authority and keeps 202 as pending rather than success", async () => {
    const { controller, adapter } = setup();
    await controller.load();

    expect(controller.links.value).toHaveLength(1);
    expect(controller.createOptions.value).toHaveLength(1);

    controller.createDraft.value = {
      optionId: option.optionId,
      title: "Provider incident",
      body: "Проверить синхронизацию",
      audience: "INTERNAL",
      includeCaseTitle: true,
      includeCaseSummary: false,
      requesterEmail: "",
      requesterName: "",
      fieldValues: {},
    };
    await controller.create();

    expect(adapter.submitCaseCommand).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      expect.objectContaining({
        intent: "CREATE",
        title: "Provider incident",
        body: "Обращение: Не проходит возврат\n\nПроверить синхронизацию",
      }),
      undefined,
      "stable-command-key",
      expect.any(AbortSignal),
    );
    expect(controller.feedback.value).toMatchObject({
      status: "QUEUED",
      terminal: false,
    });
    expect(controller.newIntentBlocked.value).toBe(true);
    await controller.create();
    expect(adapter.submitCaseCommand).toHaveBeenCalledOnce();
  });

  it("keeps create fail-closed without receipt recovery authority", async () => {
    const { controller, adapter } = setup({ read: false, create: true });

    await controller.load();
    expect(adapter.readCaseCreateOptions).not.toHaveBeenCalled();
    expect(controller.createOptions.value).toEqual([]);

    controller.createDraft.value = {
      optionId: option.optionId,
      title: "Provider incident",
      body: "Safe body",
      audience: "INTERNAL",
      includeCaseTitle: false,
      includeCaseSummary: false,
      requesterEmail: "",
      requesterName: "",
      fieldValues: {},
    };
    await controller.create();

    expect(adapter.submitCaseCommand).not.toHaveBeenCalled();
  });

  it("does not block a new intent on another actor's queued Case command", async () => {
    const foreignCommand = {
      commandId: "foreign-command",
      intent: "COMMENT" as const,
      status: "QUEUED" as const,
      errorCode: null,
      errorCategory: null,
      nextAttemptAt: null,
      version: 2,
      createdAt: "2026-08-09T10:00:00.000Z",
      resolvedAt: null,
      allowedActions: [],
    };
    const { controller } = setup(
      {},
      {
        listCaseCommands: vi.fn().mockResolvedValue({
          items: [foreignCommand],
          nextCursor: null,
        }),
      },
    );

    await controller.load();

    expect(controller.commands.value).toEqual([foreignCommand]);
    expect(controller.hasPendingCommand.value).toBe(false);
    expect(controller.newIntentBlocked.value).toBe(false);
  });

  it("persists only the actor-scoped accepted receipt for reload recovery", async () => {
    const { controller } = setup();
    await controller.load();
    controller.createDraft.value = {
      optionId: option.optionId,
      title: "Provider incident",
      body: "Safe body",
      audience: "INTERNAL",
      includeCaseTitle: false,
      includeCaseSummary: false,
      requesterEmail: "",
      requesterName: "",
      fieldValues: {},
    };

    await controller.create();

    expect(sessionStorage.length).toBe(1);
    expect(sessionStorage.key(0)).toContain("case-receipt:v1:");
    expect(sessionStorage.getItem(sessionStorage.key(0) ?? "")).toBe(
      JSON.stringify({ commandId: "command-1", status: "QUEUED" }),
    );
  });

  it("keeps an accepted receipt locked when browser storage rejects writes", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });
    const { controller, adapter } = setup();
    await controller.load();
    controller.createDraft.value = {
      optionId: option.optionId,
      title: "Provider incident",
      body: "Safe body",
      audience: "INTERNAL",
      includeCaseTitle: false,
      includeCaseSummary: false,
      requesterEmail: "",
      requesterName: "",
      fieldValues: {},
    };

    await controller.create();

    expect(controller.acceptedReceipt.value).toEqual({
      commandId: "command-1",
      status: "QUEUED",
    });
    expect(controller.newIntentBlocked.value).toBe(true);
    await controller.create();
    expect(adapter.submitCaseCommand).toHaveBeenCalledOnce();
  });

  it("completes terminal receipt cleanup when browser storage rejects removal", async () => {
    const { controller, adapter } = setup();
    await controller.load();
    controller.createDraft.value = {
      optionId: option.optionId,
      title: "Provider incident",
      body: "Safe body",
      audience: "INTERNAL",
      includeCaseTitle: false,
      includeCaseSummary: false,
      requesterEmail: "",
      requesterName: "",
      fieldValues: {},
    };
    await controller.create();
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });
    vi.mocked(adapter.readCommand).mockResolvedValue({
      commandId: "command-1",
      intent: "CREATE",
      status: "SUCCEEDED",
      errorCode: null,
      errorCategory: null,
      nextAttemptAt: null,
      version: 2,
      createdAt: "2026-08-09T10:00:00.000Z",
      resolvedAt: "2026-08-09T10:01:00.000Z",
      allowedActions: [],
    });

    await controller.reconcileCommand("command-1");

    expect(controller.acceptedReceipt.value).toBeNull();
    expect(controller.newIntentBlocked.value).toBe(false);
  });

  it("suppresses duplicate submit and preserves the exact attempt after an unknown transport outcome", async () => {
    let reject!: (error: unknown) => void;
    const pending = new Promise<never>(
      (_resolve, rejectPromise) => (reject = rejectPromise),
    );
    const { controller, adapter } = setup(
      {},
      { submitCaseCommand: vi.fn().mockReturnValue(pending) },
    );
    await controller.load();
    controller.createDraft.value = {
      optionId: option.optionId,
      title: "Incident",
      body: "Safe body",
      audience: "INTERNAL",
      includeCaseTitle: false,
      includeCaseSummary: false,
      requesterEmail: "",
      requesterName: "",
      fieldValues: {},
    };

    const first = controller.create();
    const second = controller.create();
    expect(adapter.submitCaseCommand).toHaveBeenCalledOnce();
    reject(new ApiError(0, "Network error"));
    await Promise.all([first, second]);

    expect(controller.unknownAttempt.value).toBe(true);
    vi.mocked(adapter.submitCaseCommand).mockResolvedValue({
      commandId: "command-1",
      status: "QUEUED",
      replayed: true,
    });
    await controller.replayUnknownAttempt();
    expect(adapter.submitCaseCommand).toHaveBeenLastCalledWith(
      "project-1",
      "case-1",
      expect.objectContaining({ intent: "CREATE", body: "Safe body" }),
      undefined,
      "stable-command-key",
      expect.any(AbortSignal),
    );
  });

  it("retains retry OCC and idempotency data for the only allowed exact replay", async () => {
    const failedCommand = {
      commandId: "command-retry",
      intent: "CREATE" as const,
      status: "FAILED" as const,
      errorCode: "PROVIDER_TIMEOUT",
      errorCategory: "TRANSIENT" as const,
      nextAttemptAt: null,
      version: 7,
      createdAt: "2026-08-09T10:00:00.000Z",
      resolvedAt: null,
      allowedActions: ["RETRY" as const],
    };
    const retry = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(0, "Network error"))
      .mockResolvedValue({
        commandId: failedCommand.commandId,
        status: "RETRYING",
        replayed: true,
      });
    const { controller } = setup(
      {},
      {
        listCaseCommands: vi.fn().mockResolvedValue({
          items: [failedCommand],
          nextCursor: null,
        }),
        retryCommand: retry,
      },
    );
    await controller.load();

    await controller.retryCommand(failedCommand.commandId);
    expect(controller.unknownAttempt.value).toBe(true);
    await controller.replayUnknownAttempt();

    expect(retry).toHaveBeenCalledTimes(2);
    for (const call of retry.mock.calls) {
      expect(call.slice(0, 5)).toEqual([
        "project-1",
        "case-1",
        failedCommand.commandId,
        7,
        "stable-command-key",
      ]);
    }
  });

  it("keeps an accepted receipt read-only when authoritative lookup fails", async () => {
    const readCommand = vi
      .fn()
      .mockRejectedValue(new ApiError(503, "Lookup unavailable"));
    const { controller, adapter } = setup({}, { readCommand });
    await controller.load();
    controller.createDraft.value = {
      optionId: option.optionId,
      title: "Incident",
      body: "Safe body",
      audience: "INTERNAL",
      includeCaseTitle: false,
      includeCaseSummary: false,
      requesterEmail: "",
      requesterName: "",
      fieldValues: {},
    };

    await controller.create();

    expect(controller.acceptedReceipt.value).toEqual({
      commandId: "command-1",
      status: "QUEUED",
    });
    expect(controller.unknownAttempt.value).toBe(false);
    expect(controller.newIntentBlocked.value).toBe(true);
    await controller.create();
    expect(adapter.submitCaseCommand).toHaveBeenCalledOnce();
    await controller.reconcileCommand("command-1");
    expect(readCommand).toHaveBeenLastCalledWith(
      "project-1",
      "case-1",
      "command-1",
    );
  });

  it("requires separate public-comment permission and explicit confirmation", async () => {
    const { controller, adapter } = setup({ commentPublic: false });
    await controller.load();
    controller.commentDraft.value = {
      body: "Visible to requester",
      audience: "PUBLIC",
      publicConfirmed: false,
    };

    await controller.comment(link.linkId);
    expect(adapter.submitCaseCommand).not.toHaveBeenCalled();
    expect(controller.validationError.value.toLowerCase()).toContain(
      "публичный",
    );

    controller.commentDraft.value.publicConfirmed = true;
    await controller.comment(link.linkId);
    expect(adapter.submitCaseCommand).not.toHaveBeenCalled();
  });

  it("validates server-required requester and dynamic fields before CREATE", async () => {
    const requiredOption = {
      ...option,
      requester: { emailRequired: true, nameRequired: true },
      fields: [
        {
          id: "environment",
          valueType: "TEXT" as const,
          required: true,
          options: [],
          editable: true,
        },
      ],
    };
    const { controller, adapter } = setup(
      {},
      {
        readCaseCreateOptions: vi
          .fn()
          .mockResolvedValue({ items: [requiredOption] }),
      },
    );
    await controller.load();
    controller.createDraft.value = {
      optionId: requiredOption.optionId,
      title: "Provider incident",
      body: "Safe body",
      audience: "INTERNAL",
      includeCaseTitle: false,
      includeCaseSummary: false,
      requesterEmail: "",
      requesterName: "",
      fieldValues: {},
    };

    await controller.create();
    expect(controller.validationError.value).toContain("email requester");
    controller.createDraft.value.requesterEmail = "ops@example.test";
    await controller.create();
    expect(controller.validationError.value).toContain("имя requester");
    controller.createDraft.value.requesterName = "Support Ops";
    await controller.create();
    expect(controller.validationError.value).toContain("environment");
    controller.createDraft.value.fieldValues.environment = {
      type: "TEXT",
      value: "production",
    };
    await controller.create();

    expect(adapter.submitCaseCommand).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      expect.objectContaining({
        requester: { email: "ops@example.test", name: "Support Ops" },
        fieldValues: {
          environment: { type: "TEXT", value: "production" },
        },
      }),
      undefined,
      "stable-command-key",
      expect.any(AbortSignal),
    );
  });

  it("purges protected state synchronously on permission revoke and ignores a late response", async () => {
    let resolve!: (value: { items: (typeof link)[]; nextCursor: null }) => void;
    const delayed = new Promise<{ items: (typeof link)[]; nextCursor: null }>(
      (done) => (resolve = done),
    );
    const { controller, currentPermissions } = setup(
      {},
      { listCaseLinks: vi.fn().mockReturnValue(delayed) },
    );
    const loading = controller.load();
    currentPermissions.value = { ...currentPermissions.value, read: false };
    await nextTick();
    expect(controller.links.value).toEqual([]);
    resolve({ items: [link], nextCursor: null });
    await loading;
    expect(controller.links.value).toEqual([]);
  });

  it("purges private timeline text when READ_INTERNAL is revoked", async () => {
    const { controller, currentPermissions } = setup(
      {},
      {
        readLinkedTimeline: vi.fn().mockResolvedValue({
          items: [
            {
              messageId: "private-message",
              remoteMessageId: "remote-private",
              remoteCreatedAt: "2026-08-09T10:00:00.000Z",
              remoteUpdatedAt: null,
              audience: "INTERNAL",
              tombstonedAt: null,
              body: "Private provider note",
            },
          ],
          nextCursor: null,
        }),
      },
    );
    await controller.load();
    await controller.selectLink(link.linkId);
    expect(controller.timeline.value).toHaveLength(1);

    currentPermissions.value = {
      ...currentPermissions.value,
      readInternal: false,
    };
    await nextTick();

    expect(controller.timeline.value).toEqual([]);
    expect(controller.selectedLinkId.value).toBeNull();
  });

  it("fences a late old-Project load from the new Project scope", async () => {
    let resolveOld!: (value: {
      items: (typeof link)[];
      nextCursor: null;
    }) => void;
    const delayed = new Promise<{ items: (typeof link)[]; nextCursor: null }>(
      (done) => (resolveOld = done),
    );
    const { controller, projectId, adapter } = setup(
      {},
      {
        listCaseLinks: vi
          .fn()
          .mockReturnValueOnce(delayed)
          .mockResolvedValue({ items: [link], nextCursor: null }),
      },
    );
    projectId.value = "project-2";
    await nextTick();
    resolveOld({ items: [link], nextCursor: null });
    await vi.waitFor(() =>
      expect(adapter.listCaseLinks).toHaveBeenCalledWith(
        "project-2",
        "case-1",
        undefined,
        expect.any(AbortSignal),
      ),
    );
    await vi.waitFor(() => expect(controller.links.value).toEqual([link]));
  });

  it.each([401, 428])(
    "forgets an audited attempt and requests fresh authentication on %s",
    async (status) => {
      const { controller, authenticationRequired } = setup(
        {},
        {
          submitCaseCommand: vi
            .fn()
            .mockRejectedValue(new ApiError(status, "Authentication required")),
        },
      );
      await controller.load();
      controller.createDraft.value = {
        optionId: option.optionId,
        title: "Incident",
        body: "Safe body",
        audience: "INTERNAL",
        includeCaseTitle: false,
        includeCaseSummary: false,
        requesterEmail: "",
        requesterName: "",
        fieldValues: {},
      };

      await controller.create();

      expect(authenticationRequired).toHaveBeenCalledOnce();
      expect(controller.unknownAttempt.value).toBe(false);
      expect(controller.links.value).toEqual([]);
    },
  );

  it("fails closed on an intent-invalid UNKNOWN resolution", async () => {
    const unknownCreate = {
      commandId: "command-unknown",
      intent: "CREATE" as const,
      status: "UNKNOWN" as const,
      errorCode: null,
      errorCategory: "UNKNOWN" as const,
      nextAttemptAt: null,
      version: 4,
      createdAt: "2026-08-09T10:00:00.000Z",
      resolvedAt: null,
      allowedActions: ["RESOLVE_UNKNOWN" as const],
    };
    const resolve = vi.fn().mockResolvedValue({
      commandId: unknownCreate.commandId,
      status: "SUCCEEDED",
      replayed: false,
    });
    const { controller } = setup(
      {},
      {
        listCaseCommands: vi.fn().mockResolvedValue({
          items: [unknownCreate],
          nextCursor: null,
        }),
        resolveCommand: resolve,
      },
    );
    await controller.load();

    await controller.resolveCommand(unknownCreate.commandId, {
      decision: "CONFIRM_DELIVERED",
      providerCorrelation: "provider-1",
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(controller.validationError.value).toContain("недоступно");

    await controller.resolveCommand(unknownCreate.commandId, {
      decision: "LINK_EXISTING",
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(controller.validationError.value).toContain("Remote item ID");

    await controller.resolveCommand(unknownCreate.commandId, {
      decision: "LINK_EXISTING",
      remoteItemId: "SUP-731",
    });
    expect(resolve).toHaveBeenCalledOnce();
  });

  it("copies only the governed remote body into an editable draft callback", async () => {
    const copy = vi.fn();
    const { controller } = setup(
      {},
      {
        readLinkedTimeline: vi.fn().mockResolvedValue({
          items: [
            {
              messageId: "message-1",
              remoteMessageId: "remote-1",
              remoteCreatedAt: "2026-08-09T10:00:00.000Z",
              remoteUpdatedAt: null,
              audience: "INTERNAL",
              tombstonedAt: null,
              body: "Проверенный remote текст",
            },
          ],
          nextCursor: null,
        }),
      },
    );
    controller.setDraftCopyHandler(copy);
    await controller.load();
    await controller.selectLink(link.linkId);
    controller.copyTimelineMessage("message-1");

    expect(copy).toHaveBeenCalledWith("Проверенный remote текст");
  });
});
