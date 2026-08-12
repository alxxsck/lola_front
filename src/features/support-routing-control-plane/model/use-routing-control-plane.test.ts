import { effectScope, nextTick, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import {
  mockRoutingControlPlaneSource,
  resetMockRoutingControlPlane,
} from "../api/routing-control-plane-source.mock";
import { useRoutingControlPlane } from "./use-routing-control-plane";

function authority() {
  return {
    projectId: ref<string | undefined>("project-a"),
    actorId: ref<string | undefined>("actor-a"),
    permissionRevision: ref("permissions-1"),
    canRead: ref(true),
    canReadRouting: ref(true),
    canReadTeams: ref(true),
    canReadAvailability: ref(true),
    canReadQueues: ref(true),
    canManageRouting: ref(true),
    canManageTeams: ref(true),
    canManageQueues: ref(true),
  };
}

describe("routing authority controller", () => {
  beforeEach(() => resetMockRoutingControlPlane());

  it("purges protected state synchronously when read authority is revoked", async () => {
    const access = authority();
    const scope = effectScope();
    const controller = scope.run(() =>
      useRoutingControlPlane(access, mockRoutingControlPlaneSource),
    )!;
    await vi.waitFor(() => expect(controller.snapshot.value).not.toBeNull());

    access.canRead.value = false;
    await nextTick();

    expect(controller.snapshot.value).toBeNull();
    expect(controller.decisions.value).toEqual([]);
    scope.stop();
  });

  it("keeps the same idempotency key across an ambiguous retry", async () => {
    const access = authority();
    const keys: string[] = [];
    let attempt = 0;
    const source = {
      ...mockRoutingControlPlaneSource,
      createTeam: vi.fn(async (_projectId, _data, context) => {
        keys.push(context.idempotencyKey);
        attempt += 1;
        if (attempt === 1)
          throw new ApiError(
            503,
            "Ответ сервера неизвестен",
            undefined,
            undefined,
            "DEPENDENCY_UNAVAILABLE",
          );
      }),
    };
    const scope = effectScope();
    const controller = scope.run(() => useRoutingControlPlane(access, source))!;
    await vi.waitFor(() => expect(controller.snapshot.value).not.toBeNull());

    await expect(controller.createTeam("second", "Вторая линия")).resolves.toBe(false);
    await expect(controller.createTeam("second", "Вторая линия")).resolves.toBe(true);

    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    scope.stop();
  });

  it("starts a new attempt after a definitive validation response", async () => {
    const access = authority();
    const keys: string[] = [];
    let attempt = 0;
    const source = {
      ...mockRoutingControlPlaneSource,
      createTeam: vi.fn(async (_projectId, _data, context) => {
        keys.push(context.idempotencyKey);
        attempt += 1;
        if (attempt === 1) {
          throw new ApiError(400, "Исправьте код команды", undefined, undefined, "VALIDATION_ERROR");
        }
      }),
    };
    const scope = effectScope();
    const controller = scope.run(() => useRoutingControlPlane(access, source))!;
    await vi.waitFor(() => expect(controller.snapshot.value).not.toBeNull());

    await expect(controller.createTeam("bad", "Команда")).resolves.toBe(false);
    await expect(controller.createTeam("fixed", "Команда")).resolves.toBe(true);

    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    scope.stop();
  });

  it("does not invoke a mutation when exact manage permission is absent", async () => {
    const access = authority();
    access.canManageQueues.value = false;
    const saveQueue = vi.fn(mockRoutingControlPlaneSource.saveQueue);
    const scope = effectScope();
    const controller = scope.run(() =>
      useRoutingControlPlane(access, {
        ...mockRoutingControlPlaneSource,
        saveQueue,
      }),
    )!;
    await vi.waitFor(() => expect(controller.snapshot.value).not.toBeNull());
    const queue = controller.snapshot.value!.queues[0]!;

    await expect(
      controller.saveQueue(queue.id, queue.draft?.configuration ?? {
        displayName: queue.name,
        description: null,
        visibility: { kind: "PROJECT", teamIds: [] },
        filter: {
          schemaVersion: 1,
          predicate: { kind: "AND", children: [] },
        },
        sort: [{ field: "EFFECTIVE_PRIORITY", direction: "DESC" }],
        routing: {
          mode: "MANUAL",
          primaryTeamIds: [],
          fallbackTeamIds: [],
        },
      }),
    ).resolves.toBe(false);
    expect(saveQueue).not.toHaveBeenCalled();
    scope.stop();
  });

  it("clears saving after a successful command reload", async () => {
    const scope = effectScope();
    const controller = scope.run(() =>
      useRoutingControlPlane(authority(), mockRoutingControlPlaneSource),
    )!;
    await vi.waitFor(() => expect(controller.snapshot.value).not.toBeNull());

    await expect(controller.createTeam("billing", "Расчёты")).resolves.toBe(true);
    expect(controller.saving.value).toBe(false);
    scope.stop();
  });

  it("uses the server Queue Slot catalog ETag for a first binding", async () => {
    const bind = vi.fn(mockRoutingControlPlaneSource.bind);
    const source = {
      ...mockRoutingControlPlaneSource,
      bind,
      async load(projectId: string, access: Parameters<typeof mockRoutingControlPlaneSource.load>[1], signal?: AbortSignal) {
        const value = await mockRoutingControlPlaneSource.load(projectId, access, signal);
        value.slots = [];
        value.slotActionEtag = '"slot-catalog-7"';
        return value;
      },
    };
    const scope = effectScope();
    const controller = scope.run(() => useRoutingControlPlane(authority(), source))!;
    await vi.waitFor(() => expect(controller.snapshot.value).not.toBeNull());

    await controller.bind("queue-urgent", "policy-balanced", 20);
    expect(bind).toHaveBeenCalledWith(
      "project-a",
      "queue-urgent",
      "policy-balanced",
      20,
      expect.objectContaining({ actionEtag: '"slot-catalog-7"' }),
    );
    scope.stop();
  });
});
