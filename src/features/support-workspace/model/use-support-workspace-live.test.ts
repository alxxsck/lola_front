import { afterEach, describe, expect, it, vi } from "vitest";
import { createSupportWorkspaceLiveController } from "./use-support-workspace-live";

function fakeRealtimeClient() {
  const subscriptions = new Map<string, (value: unknown) => void>();
  let reconnect: (() => void) | undefined;
  return {
    activateProject: vi.fn().mockResolvedValue(undefined),
    watchConversation: vi.fn().mockResolvedValue(true),
    unwatchConversation: vi.fn(),
    subscribe: vi.fn((events: string[], handler: (value: unknown) => void) => {
      events.forEach((event) => subscriptions.set(event, handler));
      return vi.fn(() =>
        events.forEach((event) => subscriptions.delete(event)),
      );
    }),
    reconcile: vi.fn((handler: () => void) => {
      reconnect = handler;
      return vi.fn();
    }),
    onState: vi.fn(() => vi.fn()),
    setConversationTyping: vi.fn().mockResolvedValue(true),
    revokeConversationWatch: vi.fn().mockReturnValue(true),
    emit(event: string, value: unknown) {
      subscriptions.get(event)?.(value);
    },
    reconnect() {
      reconnect?.();
    },
  };
}

describe("support workspace live controller", () => {
  afterEach(() => vi.useRealTimers());

  it("reconciles only the currently selected conversation after a live hint", async () => {
    vi.useFakeTimers();
    const client = fakeRealtimeClient();
    const reconcile = vi.fn().mockResolvedValue(undefined);
    const controller = createSupportWorkspaceLiveController(
      { reconcile },
      client,
    );

    await controller.setSelection("project-1", "conversation-1");
    client.emit("conversation.message.upserted.v1", {
      projectId: "project-1",
      conversationId: "conversation-other",
    });
    await vi.runAllTimersAsync();

    expect(reconcile).not.toHaveBeenCalled();

    client.emit("conversation.message.upserted.v1", {
      projectId: "project-1",
      conversationId: "conversation-1",
    });
    await vi.runAllTimersAsync();

    expect(client.activateProject).toHaveBeenCalledWith("project-1");
    expect(client.watchConversation).toHaveBeenCalledWith("conversation-1");
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it("reconciles the selected conversation when its delivery receipt changes", async () => {
    vi.useFakeTimers();
    const client = fakeRealtimeClient();
    const reconcile = vi.fn().mockResolvedValue(undefined);
    const controller = createSupportWorkspaceLiveController(
      { reconcile },
      client,
    );

    await controller.setSelection("project-1", "conversation-1");
    client.emit("conversation.message.delivery.upserted.v1", {
      projectId: "project-1",
      conversationId: "conversation-1",
    });
    await vi.runAllTimersAsync();

    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it("treats delivery revoke and a sequence gap as authoritative REST recovery hints", async () => {
    vi.useFakeTimers();
    const client = fakeRealtimeClient();
    const reconcile = vi.fn().mockResolvedValue(undefined);
    const controller = createSupportWorkspaceLiveController(
      { reconcile },
      client,
    );

    await controller.setSelection("project-1", "conversation-1");
    client.emit("conversation.message.delivery.upserted.v1", {
      projectId: "project-1",
      conversationId: "conversation-1",
      eventSequence: "41",
    });
    client.emit("conversation.message.delivery.revoked.v1", {
      projectId: "project-1",
      conversationId: "conversation-1",
      eventSequence: "43",
    });
    await vi.runAllTimersAsync();

    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenLastCalledWith("GAP");

    client.reconnect();
    await vi.runAllTimersAsync();
    expect(reconcile).toHaveBeenLastCalledWith("RECONNECT");
  });

  it("unwatches and rejects a queued reconcile after selection changes", async () => {
    vi.useFakeTimers();
    const client = fakeRealtimeClient();
    const reconcile = vi.fn().mockResolvedValue(undefined);
    const controller = createSupportWorkspaceLiveController(
      { reconcile },
      client,
    );

    await controller.setSelection("project-1", "conversation-1");
    client.emit("conversation.message.upserted.v1", {
      projectId: "project-1",
      conversationId: "conversation-1",
    });
    await controller.setSelection("project-1", "conversation-2");
    await vi.runAllTimersAsync();

    expect(client.unwatchConversation).toHaveBeenCalledWith("conversation-1");
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("does not let the previous selection debounce swallow a current delivery gap", async () => {
    vi.useFakeTimers();
    const client = fakeRealtimeClient();
    const reconcile = vi.fn().mockResolvedValue(undefined);
    const controller = createSupportWorkspaceLiveController(
      { reconcile },
      client,
    );

    await controller.setSelection("project-1", "conversation-1");
    client.emit("conversation.message.upserted.v1", {
      projectId: "project-1",
      conversationId: "conversation-1",
    });
    await controller.setSelection("project-1", "conversation-2");
    client.emit("conversation.message.delivery.upserted.v1", {
      projectId: "project-1",
      conversationId: "conversation-2",
      eventSequence: "41",
    });
    client.emit("conversation.message.delivery.upserted.v1", {
      projectId: "project-1",
      conversationId: "conversation-2",
      eventSequence: "43",
    });
    await vi.runAllTimersAsync();

    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenLastCalledWith("GAP");
  });

  it("scopes collaboration hints, sends only typing state, and purges on revoke", async () => {
    const client = fakeRealtimeClient();
    const collaboration = {
      select: vi.fn().mockResolvedValue(undefined),
      reconcile: vi.fn().mockResolvedValue(undefined),
      setDraftActive: vi.fn(),
      applyTypingHint: vi.fn(),
      applyViewers: vi.fn(),
      revoke: vi.fn(),
      reset: vi.fn(),
    };
    const onAccessRevoked = vi.fn();
    const controller = createSupportWorkspaceLiveController(
      {
        reconcile: vi.fn(),
        collaboration,
        currentMessageOrdinal: () => 14,
        onAccessRevoked,
      },
      client,
    );
    await controller.setSelection("project-1", "conversation-1");
    await controller.setDraftActive(true);
    await controller.setDraftActive(true);
    await controller.recordTypingActivity(true);
    client.emit("conversation.typing.hint.v1", {
      projectId: "project-1",
      conversationId: "conversation-1",
      generation: "2",
      watchGeneration: "7",
      isTyping: true,
      expiresAt: "2026-08-08T10:00:05.000Z",
      actor: {
        cmsUserId: "operator-2",
        displayName: "Анна",
        generation: "7",
        expiresAt: "2026-08-08T10:01:00.000Z",
      },
    });
    client.emit("conversation.watch.revoked.v1", {
      projectId: "project-1",
      conversationId: "conversation-1",
      generation: "7",
      reason: "AUTHORIZATION_REVOKED",
    });

    expect(collaboration.setDraftActive).toHaveBeenCalledWith(true, 14);
    expect(client.setConversationTyping).toHaveBeenCalledWith(true);
    expect(client.setConversationTyping).toHaveBeenCalledTimes(1);
    expect(collaboration.reconcile).toHaveBeenCalledTimes(1);
    expect(collaboration.applyTypingHint).toHaveBeenCalledTimes(1);
    expect(collaboration.revoke).toHaveBeenCalledWith(
      "project-1",
      "conversation-1",
    );
    expect(onAccessRevoked).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(client.setConversationTyping.mock.calls)).not.toContain(
      "draft",
    );
  });

  it("stops typing after idle time without clearing the collision baseline", async () => {
    vi.useFakeTimers();
    const client = fakeRealtimeClient();
    const collaboration = {
      select: vi.fn().mockResolvedValue(undefined),
      reconcile: vi.fn().mockResolvedValue(undefined),
      setDraftActive: vi.fn(),
      applyTypingHint: vi.fn(),
      applyViewers: vi.fn(),
      revoke: vi.fn(),
      reset: vi.fn(),
    };
    const controller = createSupportWorkspaceLiveController(
      {
        reconcile: vi.fn(),
        collaboration,
        currentMessageOrdinal: () => 14,
      },
      client,
    );
    await controller.setSelection("project-1", "conversation-1");
    await controller.setDraftActive(true);
    await controller.recordTypingActivity(true);

    await vi.advanceTimersByTimeAsync(4_001);

    expect(client.setConversationTyping.mock.calls).toEqual([[true], [false]]);
    expect(collaboration.setDraftActive.mock.calls).toEqual([[true, 14]]);
    controller.dispose();
  });

  it("does not let an older idle timer stop typing after newer input", async () => {
    vi.useFakeTimers();
    const client = fakeRealtimeClient();
    let releaseStart!: (accepted: boolean) => void;
    client.setConversationTyping.mockImplementation((active: boolean) =>
      active
        ? new Promise<boolean>((resolve) => (releaseStart = resolve))
        : Promise.resolve(true),
    );
    const controller = createSupportWorkspaceLiveController(
      { reconcile: vi.fn() },
      client,
    );
    await controller.setSelection("project-1", "conversation-1");

    const firstActivity = controller.recordTypingActivity(true);
    await vi.advanceTimersByTimeAsync(100);
    await controller.recordTypingActivity(true);
    await vi.advanceTimersByTimeAsync(2_900);
    releaseStart(true);
    await firstActivity;
    await vi.advanceTimersByTimeAsync(100);
    await controller.recordTypingActivity(true);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(client.setConversationTyping.mock.calls).toEqual([[true]]);
    await vi.advanceTimersByTimeAsync(3_001);
    expect(client.setConversationTyping.mock.calls).toEqual([[true], [false]]);
    controller.dispose();
  });

  it("re-arms collision protection for a restored draft after watch startup", async () => {
    const client = fakeRealtimeClient();
    const collaboration = {
      select: vi.fn().mockResolvedValue(undefined),
      reconcile: vi.fn().mockResolvedValue(undefined),
      setDraftActive: vi.fn(),
      applyTypingHint: vi.fn(),
      applyViewers: vi.fn(),
      revoke: vi.fn(),
      reset: vi.fn(),
    };
    const controller = createSupportWorkspaceLiveController(
      {
        reconcile: vi.fn(),
        collaboration,
        currentMessageOrdinal: () => 19,
        hasDraft: () => true,
      },
      client,
    );

    await controller.setSelection("project-1", "conversation-1");

    expect(collaboration.select).toHaveBeenCalledWith(
      "project-1",
      "conversation-1",
      19,
    );
    expect(collaboration.setDraftActive).toHaveBeenCalledWith(true, 19);
    expect(collaboration.reconcile).toHaveBeenCalledTimes(1);
    expect(client.setConversationTyping).not.toHaveBeenCalled();
    controller.dispose();
  });
});
