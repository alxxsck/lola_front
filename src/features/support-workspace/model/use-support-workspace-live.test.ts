import { afterEach, describe, expect, it, vi } from "vitest";
import { createSupportWorkspaceLiveController } from "./use-support-workspace-live";

function fakeRealtimeClient() {
  const subscriptions = new Map<string, (value: unknown) => void>();
  return {
    activateProject: vi.fn().mockResolvedValue(undefined),
    watchConversation: vi.fn().mockResolvedValue(true),
    unwatchConversation: vi.fn(),
    subscribe: vi.fn((events: string[], handler: (value: unknown) => void) => {
      events.forEach((event) => subscriptions.set(event, handler));
      return vi.fn(() => events.forEach((event) => subscriptions.delete(event)));
    }),
    reconcile: vi.fn(() => vi.fn()),
    onState: vi.fn(() => vi.fn()),
    emit(event: string, value: unknown) {
      subscriptions.get(event)?.(value);
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
});
