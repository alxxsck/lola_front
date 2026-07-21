import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  io: vi.fn(),
  getAccessToken: vi.fn(),
  getRefreshToken: vi.fn(),
  refreshAccessToken: vi.fn(),
  acknowledge: vi.fn(),
}));

vi.mock("socket.io-client", () => ({ io: mocks.io }));
vi.mock("@/shared/config/data-mode", () => ({ isMockMode: false }));
vi.mock("@/shared/api/http/auth-session", () => ({
  getAccessToken: mocks.getAccessToken,
  getRefreshToken: mocks.getRefreshToken,
}));
vi.mock("@/shared/api/http/axios-instance", () => ({
  refreshAccessToken: mocks.refreshAccessToken,
}));
vi.mock("@/features/ai-proposals/api/ai-proposals-repository", () => ({
  aiProposalsRepository: { acknowledge: mocks.acknowledge },
}));

import { CmsRealtimeClient } from "./cms-realtime-client";

function fakeSocket() {
  const listeners = new Map<string, (...args: never[]) => void>();
  const emitWithAck = vi.fn().mockResolvedValue({ ok: true });
  return {
    connected: true,
    on: vi.fn((event: string, callback: (...args: never[]) => void) => {
      listeners.set(event, callback);
    }),
    emit: vi.fn(),
    emitWithAck,
    timeout: vi.fn(() => ({ emitWithAck })),
    disconnect: vi.fn(),
    connect: vi.fn(),
    trigger(event: string, value?: unknown) {
      listeners.get(event)?.(value as never);
    },
  };
}

describe("CmsRealtimeClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessToken.mockReturnValue("access-token");
    mocks.getRefreshToken.mockReturnValue("refresh-token");
  });

  it("сохраняет одно соединение для независимых подписок возможностей", async () => {
    const socket = fakeSocket();
    mocks.io.mockReturnValue(socket);
    const client = new CmsRealtimeClient();
    const proposals = vi.fn();
    const suspensions = vi.fn();

    client.subscribe(["ai_proposal.summary"], proposals);
    client.subscribe(["conversation.ai_suspension.started.v1"], suspensions);
    await client.activateProject("project-1");

    socket.trigger("ai_proposal.summary", { eventId: "proposal-1" });
    socket.trigger("conversation.ai_suspension.started.v1", {
      eventId: "suspension-1",
    });
    await vi.waitFor(() => expect(suspensions).toHaveBeenCalled());

    expect(mocks.io).toHaveBeenCalledTimes(1);
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(proposals).toHaveBeenCalledWith({ eventId: "proposal-1" });
    expect(suspensions).toHaveBeenCalledWith({ eventId: "suspension-1" });
  });

  it("uses only the access token and project in the Socket.IO handshake", async () => {
    const socket = fakeSocket();
    mocks.io.mockReturnValue(socket);
    const client = new CmsRealtimeClient();
    await client.connect("project-1", {
      subscriptions: {},
      acknowledgement: {
        socketEvent: "received",
        rest: mocks.acknowledge,
      },
      onConnect: vi.fn(),
      onStateChange: vi.fn(),
    });

    expect(mocks.io).toHaveBeenCalledWith(
      "http://localhost:3000/cms",
      expect.objectContaining({ auth: expect.any(Function) }),
    );
    const auth = mocks.io.mock.calls[0]?.[1]?.auth as (
      callback: (value: Record<string, string>) => void,
    ) => Promise<void>;
    const callback = vi.fn();
    await auth(callback);
    expect(callback).toHaveBeenCalledWith({
      token: "access-token",
      projectId: "project-1",
    });
    expect(JSON.stringify(mocks.io.mock.calls[0])).not.toContain(
      "refresh-token",
    );
  });

  it("refreshes an expired access token before a reconnect handshake", async () => {
    const socket = fakeSocket();
    mocks.io.mockReturnValue(socket);
    mocks.getAccessToken
      .mockReturnValueOnce(null)
      .mockReturnValueOnce("fresh-access-token");
    const client = new CmsRealtimeClient();
    await client.connect("project-1", {
      subscriptions: {},
      acknowledgement: {
        socketEvent: "received",
        rest: mocks.acknowledge,
      },
      onConnect: vi.fn(),
      onStateChange: vi.fn(),
    });
    const auth = mocks.io.mock.calls[0]?.[1]?.auth as (
      callback: (value: Record<string, string>) => void,
    ) => Promise<void>;
    const callback = vi.fn();
    await auth(callback);

    expect(mocks.refreshAccessToken).toHaveBeenCalledWith("refresh-token");
    expect(callback).toHaveBeenCalledWith({
      token: "fresh-access-token",
      projectId: "project-1",
    });
  });

  it("applies a supported event before acknowledging it", async () => {
    const socket = fakeSocket();
    mocks.io.mockReturnValue(socket);
    const applied: string[] = [];
    const client = new CmsRealtimeClient();
    await client.connect("project-1", {
      subscriptions: {
        "ai_proposal.summary": async (value) => {
          applied.push("applied");
          return (value as { eventId: string }).eventId;
        },
      },
      acknowledgement: {
        socketEvent: "ai_proposal.received",
        rest: mocks.acknowledge,
      },
      onConnect: vi.fn(),
      onStateChange: vi.fn(),
    });
    socket.trigger("ai_proposal.summary", {
      type: "ai_proposal.summary",
      contractVersion: 1,
      eventId: "event-1",
      projectSequence: "4",
      occurredAt: "2026-07-19T18:00:00.000Z",
      data: {
        openCount: 1,
        unreadCount: 1,
        highPriorityUnreadCount: 0,
        lastSequence: "4",
        calculatedAt: "2026-07-19T18:00:00.000Z",
      },
    });
    await vi.waitFor(() => expect(socket.emit).toHaveBeenCalled());

    expect(applied).toEqual(["applied"]);
    expect(socket.emit).toHaveBeenCalledWith("ai_proposal.received", {
      eventId: "event-1",
    });
  });

  it("watches only the selected Conversation and restores it before reconciliation on reconnect", async () => {
    const socket = fakeSocket();
    mocks.io.mockReturnValue(socket);
    const reconciled = vi.fn();
    const client = new CmsRealtimeClient();
    client.reconcile(reconciled);
    await client.activateProject("project-1");

    client.watchConversation("conversation-1");
    client.watchConversation("conversation-2");
    client.unwatchConversation("conversation-1");
    socket.trigger("connect");
    await vi.waitFor(() => expect(reconciled).toHaveBeenCalled());

    expect(socket.emitWithAck.mock.calls).toEqual([
      ["conversation.watch.v1", { conversationId: "conversation-1" }],
      ["conversation.watch.v1", { conversationId: "conversation-2" }],
      ["conversation.watch.v1", { conversationId: "conversation-2" }],
    ]);
    client.unwatchConversation("conversation-2");
    expect(socket.emit).toHaveBeenLastCalledWith("conversation.unwatch.v1", {
      conversationId: "conversation-2",
    });
  });

  it("marks realtime degraded when the server rejects a conversation watch", async () => {
    const socket = fakeSocket();
    socket.emitWithAck.mockResolvedValue({ ok: false });
    mocks.io.mockReturnValue(socket);
    const states: string[] = [];
    const client = new CmsRealtimeClient();
    client.onState((state) => states.push(state));
    await client.activateProject("project-1");

    client.watchConversation("conversation-1");

    await vi.waitFor(() => expect(states.at(-1)).toBe("DEGRADED"));
    client.unwatchConversation("conversation-1");
  });

  it("joins the conversation room before REST reconciliation and connected state", async () => {
    const socket = fakeSocket();
    const order: string[] = [];
    socket.emitWithAck.mockImplementation(async () => {
      order.push("watch-ack");
      return { ok: true };
    });
    mocks.io.mockReturnValue(socket);
    const client = new CmsRealtimeClient();
    client.reconcile(() => {
      order.push("reconcile");
    });
    client.onState((state) => {
      if (state === "CONNECTED") order.push("connected");
    });
    await client.activateProject("project-1");

    await client.watchConversation("conversation-1");

    expect(order).toEqual(["watch-ack", "reconcile", "connected"]);
  });

  it("queues a trailing reconciliation when selection changes during an active pass", async () => {
    const socket = fakeSocket();
    mocks.io.mockReturnValue(socket);
    const client = new CmsRealtimeClient();
    let selected = "conversation-1";
    let releaseFirst!: () => void;
    const firstPass = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const reconciled: string[] = [];
    client.reconcile(async () => {
      reconciled.push(selected);
      if (reconciled.length === 1) await firstPass;
    });
    await client.activateProject("project-1");
    const first = client.watchConversation("conversation-1");
    await vi.waitFor(() => expect(reconciled).toEqual(["conversation-1"]));

    selected = "conversation-2";
    const second = client.watchConversation("conversation-2");
    await vi.waitFor(() => expect(socket.emitWithAck).toHaveBeenCalledTimes(2));
    releaseFirst();
    await Promise.all([first, second]);

    expect(reconciled).toEqual(["conversation-1", "conversation-2"]);
  });

  it("retries a rejected watch without waiting for a socket reconnect", async () => {
    vi.useFakeTimers();
    const socket = fakeSocket();
    socket.emitWithAck
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ ok: true });
    mocks.io.mockReturnValue(socket);
    const client = new CmsRealtimeClient();
    await client.activateProject("project-1");

    await client.watchConversation("conversation-1");
    await vi.advanceTimersByTimeAsync(2_000);

    expect(socket.emitWithAck).toHaveBeenCalledTimes(2);
    client.unwatchConversation("conversation-1");
    vi.useRealTimers();
  });
});
