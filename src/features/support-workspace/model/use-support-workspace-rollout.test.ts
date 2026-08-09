import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import type {
  SupportWorkspaceRolloutCommand,
  SupportWorkspaceRolloutSource,
} from "@/features/support-workspace/api/support-workspace-rollout-source";
import { createSupportWorkspaceRolloutController } from "./use-support-workspace-rollout";
import { clearRetainedSupportWorkspaceRolloutAttempts } from "./support-workspace-rollout-attempts";

const etag = (letter: string) => `"swr1.${letter.repeat(43)}"`;
const root = (overrides = {}) => ({
  enabled: true,
  shellEnabled: false,
  hardOff: false,
  version: 1,
  actionEtag: etag("a"),
  ...overrides,
});
const admission = {
  rolloutState: "DISABLED" as const,
  rolloutVersion: 1,
  entryPointMode: "LEGACY_LAUNCHER" as const,
  legacyAdapterMode: "LAUNCHER_ONLY" as const,
  evaluatedAt: "2026-08-09T10:00:00.000Z",
  admissionRevision: "a".repeat(64),
  capabilities: {
    supportWorkspaceShell: "UNAVAILABLE" as const,
    cases: "UNAVAILABLE" as const,
    conversations: "UNAVAILABLE" as const,
  },
};

function source(
  overrides: Partial<SupportWorkspaceRolloutSource> = {},
): SupportWorkspaceRolloutSource {
  return {
    read: vi.fn().mockResolvedValue(root()),
    update: vi.fn().mockResolvedValue(root({
      shellEnabled: true,
      version: 2,
      actionEtag: etag("b"),
    })),
    ...overrides,
  };
}

function context(overrides: Record<string, unknown> = {}) {
  return {
    actorId: () => "operator-1",
    projectId: () => "project-1",
    effectivePermissionCodes: () => [
      "project.support.workspace.rollout.manage",
      "project.conversations.read",
    ],
    canManage: () => true,
    canReadAdmission: () => true,
    refreshAdmission: vi.fn().mockResolvedValue(admission),
    createIdempotencyKey: () => "rollout-command-1",
    ...overrides,
  };
}

describe("Support Workspace rollout controller", () => {
  beforeEach(clearRetainedSupportWorkspaceRolloutAttempts);

  it("applies only a safe preset, validates its receipt, rereads root and admission", async () => {
    const api = source();
    vi.mocked(api.read)
      .mockResolvedValueOnce(root())
      .mockResolvedValueOnce(root({
        shellEnabled: true,
        version: 2,
        actionEtag: etag("b"),
      }));
    const ctx = context();
    const controller = createSupportWorkspaceRolloutController(ctx, api);
    await controller.load();

    await controller.submit("ENABLE_PILOT", "Enable pilot safely");

    expect(api.update).toHaveBeenCalledWith(
      "project-1",
      {
        actionEtag: etag("a"),
        idempotencyKey: "rollout-command-1",
        body: {
          enabled: true,
          shellEnabled: true,
          hardOff: false,
          reason: "Enable pilot safely",
        },
      },
      expect.any(AbortSignal),
    );
    expect(controller.rollout.value?.version).toBe(2);
    expect(ctx.refreshAdmission).toHaveBeenCalledTimes(2);
    expect(controller.success.value).toContain("подтверждено сервером");
  });

  it("retries an unknown outcome with the exact same key, ETag and body", async () => {
    const update = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(0, "connection lost"))
      .mockResolvedValueOnce(root({ shellEnabled: true, version: 2, actionEtag: etag("b") }));
    const api = source({ update });
    vi.mocked(api.read)
      .mockResolvedValueOnce(root())
      .mockResolvedValueOnce(
        root({ shellEnabled: true, version: 2, actionEtag: etag("b") }),
      );
    const controller = createSupportWorkspaceRolloutController(context(), api);
    await controller.load();

    await controller.submit("ENABLE_PILOT", "Enable pilot safely");
    expect(controller.recovery.value).toBe("UNKNOWN_OUTCOME");
    await controller.retryPending();

    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1]?.[1]).toEqual(update.mock.calls[0]?.[1]);
    expect(controller.recovery.value).toBeNull();
  });

  it.each([
    {
      preset: "ROLLBACK_SHELL" as const,
      current: root({ shellEnabled: true }),
      expected: { enabled: true, shellEnabled: false, hardOff: false },
    },
    {
      preset: "EMERGENCY_HARD_OFF" as const,
      current: root({ shellEnabled: true }),
      expected: { enabled: true, shellEnabled: false, hardOff: true },
    },
    {
      preset: "CLEAR_HARD_OFF" as const,
      current: root({ hardOff: true }),
      expected: { enabled: true, shellEnabled: false, hardOff: false },
    },
  ])("builds the safe $preset preset without rewriting enabled", async ({
    preset,
    current,
    expected,
  }) => {
    const next = {
      ...expected,
      version: 2,
      actionEtag: etag("b"),
    };
    const api = source({
      read: vi.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(next),
      update: vi.fn().mockResolvedValue(next),
    });
    const controller = createSupportWorkspaceRolloutController(context(), api);
    await controller.load();

    await controller.submit(preset, "Safe rollout rehearsal");

    expect(vi.mocked(api.update).mock.calls[0]?.[1].body).toEqual({
      ...expected,
      reason: "Safe rollout rehearsal",
    });
  });

  it("rereads a version conflict, preserves the reason and requires fresh confirmation", async () => {
    const api = source({
      update: vi.fn().mockRejectedValue(
        new ApiError(
          409,
          "backend text must stay hidden",
          undefined,
          undefined,
          "SUPPORT_WORKSPACE_VERSION_CONFLICT",
        ),
      ),
    });
    vi.mocked(api.read)
      .mockResolvedValueOnce(root())
      .mockResolvedValueOnce(root({ version: 2, actionEtag: etag("b") }));
    const controller = createSupportWorkspaceRolloutController(context(), api);
    await controller.load();

    await controller.submit("ENABLE_PILOT", "Enable pilot safely");

    expect(controller.conflict.value).toBe(true);
    expect(controller.draftReason.value).toBe("Enable pilot safely");
    expect(controller.error.value).not.toContain("backend text");
    expect(controller.rollout.value?.version).toBe(2);
    expect(controller.recovery.value).toBeNull();
  });

  it("purges protected state and aborts stale work on scope change", async () => {
    let resolve!: (value: ReturnType<typeof root>) => void;
    const read = vi.fn((_: string, signal?: AbortSignal) =>
      new Promise<ReturnType<typeof root>>((done, reject) => {
        resolve = done;
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
    );
    let projectId = "project-1";
    const controller = createSupportWorkspaceRolloutController(
      context({ projectId: () => projectId }),
      source({ read }),
    );
    const pending = controller.load();
    projectId = "project-2";
    controller.reset();
    resolve(root());
    await pending;

    expect(controller.rollout.value).toBeNull();
    expect(controller.loading.value).toBe(false);
  });

  it("does not read admission for a rollout-manager without Cases or Conversations read", async () => {
    const ctx = context({
      canReadAdmission: () => false,
      effectivePermissionCodes: () => [
        "project.support.workspace.rollout.manage",
      ],
    });
    const controller = createSupportWorkspaceRolloutController(ctx, source());

    await controller.load();

    expect(ctx.refreshAdmission).not.toHaveBeenCalled();
    expect(controller.admission.value).toBeNull();
  });

  it("fails closed and hides protected state after concealed access loss", async () => {
    const onForbidden = vi.fn();
    const controller = createSupportWorkspaceRolloutController(
      context({ onForbidden }),
      source({ read: vi.fn().mockRejectedValue(new ApiError(404, "secret")) }),
    );

    await controller.load();

    expect(controller.rollout.value).toBeNull();
    expect(controller.error.value).not.toContain("secret");
    expect(onForbidden).toHaveBeenCalledOnce();
  });

  it("suppresses duplicate submit while one serialized command is in flight", async () => {
    let release!: (value: ReturnType<typeof root>) => void;
    const update = vi.fn(
      () => new Promise<ReturnType<typeof root>>((resolve) => { release = resolve; }),
    );
    const controller = createSupportWorkspaceRolloutController(
      context(),
      source({ update }),
    );
    await controller.load();

    const first = controller.submit("ENABLE_PILOT", "Enable pilot safely");
    await controller.submit("ENABLE_PILOT", "Enable pilot safely");
    expect(update).toHaveBeenCalledOnce();
    release(root({ shellEnabled: true, version: 2, actionEtag: etag("b") }));
    await first;
  });

  it("does not claim success while the authoritative reread lags the receipt", async () => {
    const api = source();
    const controller = createSupportWorkspaceRolloutController(context(), api);
    await controller.load();

    await controller.submit("ENABLE_PILOT", "Enable pilot safely");

    expect(controller.success.value).toBe("");
    expect(controller.recovery.value).toBe("RETRYABLE_FAILURE");
    expect(controller.error.value).toContain("authoritative root");
  });

  it("blocks a fresh intent when a valid receipt cannot be authoritatively reread", async () => {
    const update = vi.fn().mockResolvedValue(
      root({ shellEnabled: true, version: 2, actionEtag: etag("b") }),
    );
    const api = source({
      read: vi
        .fn()
        .mockResolvedValueOnce(root())
        .mockRejectedValueOnce(new ApiError(503, "read unavailable")),
      update,
    });
    const controller = createSupportWorkspaceRolloutController(context(), api);
    await controller.load();

    await controller.submit("ENABLE_PILOT", "Enable pilot safely");
    await controller.submit("EMERGENCY_HARD_OFF", "Try competing intent");

    expect(controller.recovery.value).toBe("RETRYABLE_FAILURE");
    expect(update).toHaveBeenCalledOnce();
    expect(controller.error.value).toContain("authoritative root");
  });

  it.each(["resolve", "reject"] as const)(
    "refuses Refresh during a mutation and remains recoverable when update %s",
    async (outcome) => {
      let resolve!: (value: ReturnType<typeof root>) => void;
      let reject!: (cause: unknown) => void;
      const update = vi.fn(
        () =>
          new Promise<ReturnType<typeof root>>((done, fail) => {
            resolve = done;
            reject = fail;
          }),
      );
      const read = vi.fn().mockResolvedValue(root());
      const controller = createSupportWorkspaceRolloutController(
        context(),
        source({ read, update }),
      );
      await controller.load();

      const pending = controller.submit("ENABLE_PILOT", "Enable pilot safely");
      await controller.load();
      expect(read).toHaveBeenCalledOnce();
      if (outcome === "resolve")
        resolve(root({ shellEnabled: true, version: 2, actionEtag: etag("b") }));
      else reject(new ApiError(0, "lost response"));
      await pending;

      expect(controller.mutating.value).toBe(false);
      if (outcome === "reject")
        expect(controller.recovery.value).toBe("UNKNOWN_OUTCOME");
      else expect(read).toHaveBeenCalledTimes(2);
    },
  );

  it("retains an in-flight exact attempt across Project switch and unmount", async () => {
    let release!: (value: ReturnType<typeof root>) => void;
    const update = vi.fn(
      (projectId: string, command: SupportWorkspaceRolloutCommand) => {
        void projectId;
        void command;
        return new Promise<ReturnType<typeof root>>((resolve) => {
          release = resolve;
        });
      },
    );
    let projectId = "project-1";
    const first = createSupportWorkspaceRolloutController(
      context({ projectId: () => projectId }),
      source({ update }),
    );
    await first.load();
    const pending = first.submit("ENABLE_PILOT", "Enable pilot safely");
    projectId = "project-2";
    first.reset();
    release(root({ shellEnabled: true, version: 2, actionEtag: etag("b") }));
    await pending;

    projectId = "project-1";
    const returningApi = source({
      read: vi
        .fn()
        .mockResolvedValueOnce(root())
        .mockResolvedValueOnce(
          root({ shellEnabled: true, version: 2, actionEtag: etag("b") }),
        ),
      update: vi.fn().mockResolvedValue(
        root({ shellEnabled: true, version: 2, actionEtag: etag("b") }),
      ),
    });
    const returning = createSupportWorkspaceRolloutController(
      context({ projectId: () => projectId }),
      returningApi,
    );
    await returning.load();
    expect(returning.recovery.value).toBe("UNKNOWN_OUTCOME");

    await returning.retryPending();
    expect(vi.mocked(returningApi.update).mock.calls[0]?.[1]).toEqual(
      update.mock.calls[0]?.[1],
    );
  });

  it("requires a separate clear-hard-off command before enabling pilot", async () => {
    const api = source({ read: vi.fn().mockResolvedValue(root({ hardOff: true })) });
    const controller = createSupportWorkspaceRolloutController(context(), api);
    await controller.load();

    await controller.submit("ENABLE_PILOT", "Enable pilot safely");

    expect(api.update).not.toHaveBeenCalled();
    expect(controller.error.value).toContain("Сначала снимите hard-off");
  });

  it("quarantines a typed replay failure without exposing backend text", async () => {
    const api = source({
      update: vi.fn().mockRejectedValue(
        new ApiError(
          409,
          "sensitive backend detail",
          undefined,
          undefined,
          "SUPPORT_WORKSPACE_REPLAY_OUTCOME_UNAVAILABLE",
        ),
      ),
    });
    const controller = createSupportWorkspaceRolloutController(context(), api);
    await controller.load();

    await controller.submit("ENABLE_PILOT", "Enable pilot safely");

    expect(controller.quarantined.value).toBe(true);
    expect(controller.error.value).not.toContain("sensitive backend detail");
    expect(controller.success.value).toBe("");
  });

  it("purges state and never retains an MFA-blocked command", async () => {
    const onMfaRequired = vi.fn();
    const api = source({
      update: vi.fn().mockRejectedValue(
        new ApiError(428, "step up", undefined, undefined, "MFA_REQUIRED"),
      ),
    });
    const controller = createSupportWorkspaceRolloutController(
      context({ onMfaRequired }),
      api,
    );
    await controller.load();

    await controller.submit("ENABLE_PILOT", "Enable pilot safely");

    expect(controller.rollout.value).toBeNull();
    expect(controller.recovery.value).toBeNull();
    expect(onMfaRequired).toHaveBeenCalledOnce();
  });

  it.each([
    { status: 401, code: undefined },
    { status: 428, code: "MFA_REQUIRED" },
  ])(
    "forgets a definite $status attempt even when auth teardown resets first",
    async ({ status, code }) => {
      let rejectUpdate!: (cause: unknown) => void;
      let actorId: string | undefined = "operator-1";
      const api = source({
        update: vi.fn(
          () =>
            new Promise<ReturnType<typeof root>>((_, reject) => {
              rejectUpdate = reject;
            }),
        ),
      });
      const first = createSupportWorkspaceRolloutController(
        context({ actorId: () => actorId }),
        api,
      );
      await first.load();
      const pending = first.submit("ENABLE_PILOT", "Enable pilot safely");

      actorId = undefined;
      first.reset();
      rejectUpdate(
        new ApiError(status, "auth rejected", undefined, undefined, code),
      );
      await pending;

      actorId = "operator-1";
      const returning = createSupportWorkspaceRolloutController(
        context({ actorId: () => actorId }),
        source(),
      );
      await returning.load();
      expect(returning.recovery.value).toBeNull();
      expect(returning.quarantined.value).toBe(false);
    },
  );
});
