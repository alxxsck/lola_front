import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import {
  mockSupportExternalWorkSource,
  resetMockSupportExternalWork,
} from "../api/support-external-work-mock-source";
import { createSupportExternalSettingsController } from "./use-support-external-settings";

describe("Support External Work settings controller", () => {
  beforeEach(() => resetMockSupportExternalWork());

  it("loads Project-scoped connections, catalog and mapping evidence", async () => {
    const controller = createSupportExternalSettingsController(
      {
        actorId: () => "operator-1",
        projectId: () => "project-1",
        canManage: () => true,
      },
      mockSupportExternalWorkSource,
    );

    await controller.load();

    expect(controller.connections.value).toHaveLength(2);
    expect(controller.selectedConnection.value?.provider).toBe("JSM");
    expect(controller.catalog.value?.snapshot.stale).toBe(false);
    expect(controller.mappingDraft.value?.draft.status).toBe("DRAFT");
    expect(controller.revisions.value).toHaveLength(1);
  });

  it("fences a late connection read after the selected Project changes", async () => {
    let projectId = "project-1";
    let release!: () => void;
    const source = {
      ...mockSupportExternalWorkSource,
      listConnections: vi.fn(async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return mockSupportExternalWorkSource.listConnections("project-1");
      }),
    };
    const controller = createSupportExternalSettingsController(
      {
        actorId: () => "operator-1",
        projectId: () => projectId,
        canManage: () => true,
      },
      source,
    );

    const request = controller.load();
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    projectId = "project-2";
    controller.reset();
    release();
    await request;

    expect(controller.connections.value).toEqual([]);
    expect(controller.catalog.value).toBeNull();
  });

  it("suppresses duplicate tests and exact-replays the retained attempt after timeout", async () => {
    let attempts = 0;
    const keys: string[] = [];
    const source = {
      ...mockSupportExternalWorkSource,
      testConnection: vi.fn(async (...args: Parameters<typeof mockSupportExternalWorkSource.testConnection>) => {
        attempts += 1;
        keys.push(args[2]);
        if (attempts === 1) throw new ApiError(0, "timeout");
        return mockSupportExternalWorkSource.testConnection(...args);
      }),
    };
    const controller = createSupportExternalSettingsController(
      {
        actorId: () => "operator-1",
        projectId: () => "project-1",
        canManage: () => true,
        createIdempotencyKey: () => "stable-test-key",
      },
      source,
    );
    await controller.load();

    await Promise.all([
      controller.testSelectedConnection(),
      controller.testSelectedConnection(),
    ]);
    expect(attempts).toBe(1);
    expect(controller.recovery.value).toBe("UNKNOWN_OUTCOME");

    await controller.retryPending();

    expect(keys).toEqual(["stable-test-key", "stable-test-key"]);
    expect(controller.recovery.value).toBeNull();
    expect(controller.success.value).toContain("подтвержден");
  });

  it("rereads authoritative settings after a successful audited mutation", async () => {
    const source = {
      ...mockSupportExternalWorkSource,
      listConnections: vi.fn(mockSupportExternalWorkSource.listConnections),
    };
    const controller = createSupportExternalSettingsController(
      {
        actorId: () => "operator-reread",
        projectId: () => "project-reread",
        canManage: () => true,
      },
      source,
    );
    await controller.load();

    await controller.testSelectedConnection();

    expect(source.listConnections).toHaveBeenCalledTimes(2);
    expect(controller.success.value).toContain("подтвержден");
  });

  it("blocks a new intent when a receipt is known but authoritative reread fails", async () => {
    let reads = 0;
    const keys: string[] = [];
    const source = {
      ...mockSupportExternalWorkSource,
      listConnections: vi.fn(async (...args: Parameters<typeof mockSupportExternalWorkSource.listConnections>) => {
        reads += 1;
        if (reads === 2) throw new ApiError(503, "reread unavailable");
        return mockSupportExternalWorkSource.listConnections(...args);
      }),
      testConnection: vi.fn(async (...args: Parameters<typeof mockSupportExternalWorkSource.testConnection>) => {
        keys.push(args[2]);
        return mockSupportExternalWorkSource.testConnection(...args);
      }),
    };
    const controller = createSupportExternalSettingsController(
      {
        actorId: () => "operator-reconcile",
        projectId: () => "project-reconcile",
        canManage: () => true,
        createIdempotencyKey: () => "receipt-reconcile-key",
      },
      source,
    );
    await controller.load();

    await controller.testSelectedConnection();

    expect(controller.recovery.value).toBe("RETRYABLE_FAILURE");
    expect(controller.error.value).toContain("состояние на сервере не перечитано");
    await controller.testSelectedConnection();
    expect(source.testConnection).toHaveBeenCalledOnce();

    await controller.retryPending();
    expect(keys).toEqual(["receipt-reconcile-key"]);
    expect(controller.recovery.value).toBeNull();
  });

  it("retains an ambiguous in-flight attempt only for its captured actor and Project", async () => {
    let projectId = "project-a";
    let reject!: (cause: unknown) => void;
    const source = {
      ...mockSupportExternalWorkSource,
      testConnection: vi.fn(
        () =>
          new Promise<never>((_resolve, rejectPromise) => {
            reject = rejectPromise;
          }),
      ),
    };
    const context = {
      actorId: () => "operator-scope",
      projectId: () => projectId,
      canManage: () => true,
      createIdempotencyKey: () => "captured-scope-key",
    };
    const controller = createSupportExternalSettingsController(context, source);
    await controller.load();
    const request = controller.testSelectedConnection();
    await vi.waitFor(() => expect(source.testConnection).toHaveBeenCalledOnce());

    projectId = "project-b";
    controller.reset();
    reject(new ApiError(0, "timeout"));
    await request;
    await controller.load();
    expect(controller.recovery.value).toBeNull();

    projectId = "project-a";
    await controller.load();
    expect(controller.recovery.value).toBe("UNKNOWN_OUTCOME");
  });

  it.each([401, 428])(
    "forgets a terminal auth attempt after synchronous scope teardown (%s)",
    async (status) => {
      let actorId: string | undefined = "operator-auth";
      let reject!: (cause: unknown) => void;
      const source = {
        ...mockSupportExternalWorkSource,
        testConnection: vi.fn(
          () =>
            new Promise<never>((_resolve, rejectPromise) => {
              reject = rejectPromise;
            }),
        ),
      };
      const context = {
        actorId: () => actorId,
        projectId: () => "project-auth",
        canManage: () => actorId !== undefined,
      };
      const controller = createSupportExternalSettingsController(context, source);
      await controller.load();
      const request = controller.testSelectedConnection();
      await vi.waitFor(() => expect(source.testConnection).toHaveBeenCalledOnce());

      actorId = undefined;
      controller.reset();
      reject(new ApiError(status, "terminal auth"));
      await request;
      actorId = "operator-auth";
      await controller.load();

      expect(controller.recovery.value).toBeNull();
    },
  );

  it("keeps the draft on conflict and requires a fresh explicit publish", async () => {
    const source = {
      ...mockSupportExternalWorkSource,
      publishMapping: vi.fn().mockRejectedValue(
        new ApiError(409, "version conflict", undefined, undefined, "VERSION_CONFLICT"),
      ),
    };
    const controller = createSupportExternalSettingsController(
      {
        actorId: () => "operator-1",
        projectId: () => "project-1",
        canManage: () => true,
      },
      source,
    );
    await controller.load();
    const before = controller.mappingDraft.value?.draft.definition;

    await controller.publishMapping();

    expect(controller.mappingDraft.value?.draft.definition).toEqual(before);
    expect(controller.conflict.value).toBe(true);
    expect(controller.recovery.value).toBeNull();
  });

  it("reconciles a pending mutation receipt without issuing a fresh POST", async () => {
    const receiptId = "70000000-0000-4000-8000-000000000001";
    const testConnection = vi.fn().mockRejectedValue(
      new ApiError(
        409,
        "pending",
        { receiptId },
        undefined,
        "SUPPORT_EXTERNAL_MUTATION_OUTCOME_PENDING",
      ),
    );
    const readSettingsMutation = vi
      .fn()
      .mockResolvedValueOnce({
        receiptId,
        operation: "TEST_CONNECTION",
        status: "PENDING",
        response: null,
        createdAt: "2026-08-09T10:00:00.000Z",
        updatedAt: "2026-08-09T10:00:00.000Z",
      })
      .mockResolvedValueOnce({
        receiptId,
        operation: "TEST_CONNECTION",
        status: "SUCCEEDED",
        response: { status: "OK" },
        createdAt: "2026-08-09T10:00:00.000Z",
        updatedAt: "2026-08-09T10:01:00.000Z",
      });
    const controller = createSupportExternalSettingsController(
      {
        actorId: () => "operator-receipt",
        projectId: () => "project-receipt",
        canManage: () => true,
      },
      {
        ...mockSupportExternalWorkSource,
        testConnection,
        readSettingsMutation,
      },
    );
    await controller.load();

    await controller.testSelectedConnection();
    expect(controller.recovery.value).toBe("UNKNOWN_OUTCOME");
    expect(controller.error.value).toContain("ещё выполняется");

    await controller.retryPending();
    expect(testConnection).toHaveBeenCalledOnce();
    expect(readSettingsMutation).toHaveBeenCalledTimes(2);
    expect(controller.recovery.value).toBeNull();
  });

  it("discards late auxiliary evidence after Project scope changes", async () => {
    let projectId = "project-a";
    let release!: () => void;
    const authoritative = await mockSupportExternalWorkSource.validateMapping(
      "project-a",
      "30000000-0000-4000-8000-000000000001",
    );
    const validateMapping = vi.fn(
      () =>
        new Promise<typeof authoritative>((resolve) => {
          release = () => resolve(authoritative);
        }),
    );
    const controller = createSupportExternalSettingsController(
      {
        actorId: () => "operator-aux",
        projectId: () => projectId,
        canManage: () => true,
      },
      { ...mockSupportExternalWorkSource, validateMapping },
    );
    await controller.load();
    const request = controller.validateMapping();
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));

    projectId = "project-b";
    controller.reset();
    release();
    await request;

    expect(controller.validation.value).toBeNull();
    expect(controller.connections.value).toEqual([]);
  });

  it("reloads the target roots on conflict and preserves the operator mapping draft", async () => {
    let mappingReads = 0;
    const listMappings = vi.fn(async (...args: Parameters<typeof mockSupportExternalWorkSource.listMappings>) => {
      const page = await mockSupportExternalWorkSource.listMappings(...args);
      mappingReads += 1;
      return mappingReads === 1
        ? page
        : { ...page, items: page.items.map((item) => ({ ...item, version: 19 })) };
    });
    const replaceMappingDraft = vi.fn().mockRejectedValue(
      new ApiError(409, "version conflict", undefined, undefined, "VERSION_CONFLICT"),
    );
    const controller = createSupportExternalSettingsController(
      {
        actorId: () => "operator-conflict",
        projectId: () => "project-conflict",
        canManage: () => true,
      },
      { ...mockSupportExternalWorkSource, listMappings, replaceMappingDraft },
    );
    await controller.load();
    const draft = {
      catalogSnapshotId:
        controller.mappingDraft.value!.draft.catalogSnapshotId ?? "snapshot-fallback",
      formRevision: "operator-unsaved-revision",
      definition: controller.mappingDraft.value!.draft.definition,
    };

    await controller.saveMapping(draft);

    expect(controller.selectedMapping.value?.version).toBe(19);
    expect(controller.conflictDraft.value).toEqual({
      mappingId: controller.selectedMapping.value?.id,
      body: draft,
    });
    expect(controller.conflict.value).toBe(true);
  });

  it("reloads the authoritative connection version after a connection conflict", async () => {
    let connectionReads = 0;
    const listConnections = vi.fn(async (...args: Parameters<typeof mockSupportExternalWorkSource.listConnections>) => {
      const page = await mockSupportExternalWorkSource.listConnections(...args);
      connectionReads += 1;
      return connectionReads === 1
        ? page
        : { ...page, items: page.items.map((item) => ({ ...item, version: 23 })) };
    });
    const disableConnection = vi.fn().mockRejectedValue(
      new ApiError(409, "version conflict", undefined, undefined, "VERSION_CONFLICT"),
    );
    const controller = createSupportExternalSettingsController(
      {
        actorId: () => "operator-connection-conflict",
        projectId: () => "project-connection-conflict",
        canManage: () => true,
      },
      { ...mockSupportExternalWorkSource, listConnections, disableConnection },
    );
    await controller.load();

    await controller.disableSelectedConnection();

    expect(controller.selectedConnection.value?.version).toBe(23);
    expect(controller.conflict.value).toBe(true);
  });

  it("couples each mapping and catalog to its owning connection", async () => {
    const controller = createSupportExternalSettingsController(
      {
        actorId: () => "operator-sites",
        projectId: () => "project-sites",
        canManage: () => true,
      },
      mockSupportExternalWorkSource,
    );
    await controller.load();
    const helpdesk = controller.connections.value.find(
      (item) => item.provider === "HELPDESK",
    )!;

    await controller.selectConnection(helpdesk.id);

    expect(controller.selectedConnection.value?.provider).toBe("HELPDESK");
    expect(controller.connectionMappings.value).toEqual([]);
    expect(controller.selectedMapping.value).toBeNull();
    expect(controller.catalog.value?.catalog?.provider).toBe("HELPDESK");
  });

  it("consumes connection cursors and keeps two sites for the same provider selectable", async () => {
    const base = await mockSupportExternalWorkSource.listConnections("project-sites");
    const jsm = base.items.find((item) => item.provider === "JSM")!;
    const secondJsm = {
      ...jsm,
      id: "10000000-0000-4000-8000-000000000099",
      tenantIdentity: "support-emea",
      displayName: "JSM · EMEA",
    };
    const listConnections = vi.fn(async (_projectId: string, cursor?: string) =>
      cursor
        ? { items: [secondJsm], nextCursor: null }
        : { items: base.items, nextCursor: "opaque-site-cursor" },
    );
    const readCatalog = vi.fn(async (projectId: string, connectionId: string) =>
      mockSupportExternalWorkSource.readCatalog(
        projectId,
        connectionId === secondJsm.id ? jsm.id : connectionId,
      ),
    );
    const controller = createSupportExternalSettingsController(
      {
        actorId: () => "operator-multi-site",
        projectId: () => "project-sites",
        canManage: () => true,
      },
      { ...mockSupportExternalWorkSource, listConnections, readCatalog },
    );

    await controller.load();
    expect(listConnections).toHaveBeenNthCalledWith(
      2,
      "project-sites",
      "opaque-site-cursor",
      expect.any(AbortSignal),
    );
    expect(
      controller.connections.value.filter((item) => item.provider === "JSM"),
    ).toHaveLength(2);

    await controller.selectConnection(secondJsm.id);
    expect(controller.selectedConnection.value?.tenantIdentity).toBe("support-emea");
    expect(controller.selectedMapping.value).toBeNull();
  });

  it("restores a conflicted mapping by exact id and never applies its draft to a sibling", async () => {
    const mappingPage = await mockSupportExternalWorkSource.listMappings(
      "project-mapping-sites",
      { limit: 50 },
    );
    const mappingA = mappingPage.items[0]!;
    const mappingB = {
      ...mappingA,
      id: "30000000-0000-4000-8000-000000000099",
      displayName: "Support routing EMEA",
      version: 7,
    };
    let reads = 0;
    const listMappings = vi.fn(async () => {
      reads += 1;
      return {
        items: [
          mappingA,
          reads === 1 ? mappingB : { ...mappingB, version: 12 },
        ],
        nextCursor: null,
      };
    });
    const draftResponse = await mockSupportExternalWorkSource.readMappingDraft(
      "project-mapping-sites",
      mappingA.id,
    );
    const revisionPage = await mockSupportExternalWorkSource.listMappingRevisions(
      "project-mapping-sites",
      mappingA.id,
    );
    const controller = createSupportExternalSettingsController(
      {
        actorId: () => "operator-mapping-sites",
        projectId: () => "project-mapping-sites",
        canManage: () => true,
      },
      {
        ...mockSupportExternalWorkSource,
        listMappings,
        readMappingDraft: vi.fn(async () => draftResponse),
        listMappingRevisions: vi.fn(async () => revisionPage),
        replaceMappingDraft: vi.fn().mockRejectedValue(
          new ApiError(409, "version conflict", undefined, undefined, "VERSION_CONFLICT"),
        ),
      },
    );
    await controller.load();
    await controller.selectMapping(mappingB.id);
    const body = {
      catalogSnapshotId: draftResponse.draft.catalogSnapshotId ?? "snapshot",
      formRevision: "operator-b",
      definition: draftResponse.draft.definition,
    };

    await controller.saveMapping(body);

    expect(controller.selectedMapping.value).toMatchObject({
      id: mappingB.id,
      version: 12,
    });
    expect(controller.conflictDraft.value).toEqual({
      mappingId: mappingB.id,
      body,
    });
    await controller.selectMapping(mappingA.id);
    expect(controller.conflictDraft.value).toBeNull();
  });
});
