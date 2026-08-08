import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  io: vi.fn(),
  getAccessToken: vi.fn(),
  refreshAccessToken: vi.fn(),
  acknowledge: vi.fn(),
}));

vi.mock("socket.io-client", () => ({ io: mocks.io }));
vi.mock("@/shared/config/data-mode", () => ({ isMockMode: false }));
vi.mock("@/shared/api/http/auth-session", () => ({
  getAccessToken: mocks.getAccessToken,
}));
vi.mock("@/shared/api/http/axios-instance", () => ({
  refreshAccessToken: mocks.refreshAccessToken,
}));
import { CmsRealtimeClient } from "./cms-realtime-client";

function fakeSocket() {
  const listeners = new Map<string, (...args: never[]) => void>();
  const emitWithAck = vi
    .fn()
    .mockImplementation(
      async (
        _event: string,
        request: { conversationId?: string; caseId?: string } = {},
      ) => ({
        ok: true,
        conversationId: request.conversationId,
        caseId: request.caseId,
        generation: "1",
        expiresAt: "2026-08-08T10:01:00.000Z",
        typingRevision: "1",
      }),
    );
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("CmsRealtimeClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessToken.mockReturnValue("access-token");
  });

  it("сохраняет одно соединение для независимых подписок возможностей", async () => {
    const socket = fakeSocket();
    mocks.io.mockReturnValue(socket);
    const client = new CmsRealtimeClient();
    const cases = vi.fn();
    const suspensions = vi.fn();

    client.subscribe(["end_user_case.summary"], cases);
    client.subscribe(["conversation.ai_suspension.started.v1"], suspensions);
    await client.activateProject("project-1");

    socket.trigger("end_user_case.summary", { eventId: "case-summary-1" });
    socket.trigger("conversation.ai_suspension.started.v1", {
      eventId: "suspension-1",
    });
    await vi.waitFor(() => expect(suspensions).toHaveBeenCalled());

    expect(mocks.io).toHaveBeenCalledTimes(1);
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(cases).toHaveBeenCalledWith({ eventId: "case-summary-1" });
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
      expect.objectContaining({
        path: "/socket.io/cms",
        auth: expect.any(Function),
      }),
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
      "refreshToken",
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

    expect(mocks.refreshAccessToken).toHaveBeenCalledWith();
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
        "end_user_case.updated": async (value) => {
          applied.push("applied");
          return (value as { eventId: string }).eventId;
        },
      },
      acknowledgement: {
        socketEvent: "end_user_case.received",
        rest: mocks.acknowledge,
      },
      onConnect: vi.fn(),
      onStateChange: vi.fn(),
    });
    socket.trigger("end_user_case.updated", {
      type: "end_user_case.updated",
      contractVersion: 1,
      eventId: "event-1",
      projectSequence: "4",
      occurredAt: "2026-07-19T18:00:00.000Z",
      data: {
        case: { id: "case-1" },
      },
    });
    await vi.waitFor(() => expect(socket.emit).toHaveBeenCalled());

    expect(applied).toEqual(["applied"]);
    expect(socket.emit).toHaveBeenCalledWith("end_user_case.received", {
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

    expect(
      socket.emitWithAck.mock.calls.filter(
        ([event]) => event === "conversation.watch.v1",
      ),
    ).toEqual([
      ["conversation.watch.v1", { conversationId: "conversation-1" }],
      ["conversation.watch.v1", { conversationId: "conversation-2" }],
      ["conversation.watch.v1", { conversationId: "conversation-2" }],
    ]);
    client.unwatchConversation("conversation-2");
    expect(socket.emitWithAck).toHaveBeenLastCalledWith(
      "conversation.unwatch.v1",
      {
        conversationId: "conversation-2",
        generation: "1",
      },
    );
  });

  it("marks realtime degraded when the server rejects a conversation watch", async () => {
    vi.useFakeTimers();
    const socket = fakeSocket();
    socket.emitWithAck
      .mockResolvedValueOnce({ ok: false, error: "COLLABORATION_UNAVAILABLE" })
      .mockResolvedValueOnce({
        ok: true,
        conversationId: "conversation-1",
        generation: "1",
        expiresAt: "2099-08-08T10:01:00.000Z",
      });
    mocks.io.mockReturnValue(socket);
    const states: string[] = [];
    const client = new CmsRealtimeClient();
    client.onState((state) => states.push(state));
    await client.activateProject("project-1");

    await client.watchConversation("conversation-1");

    expect(states.at(-1)).toBe("DEGRADED");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(socket.emitWithAck).toHaveBeenCalledTimes(2);
    client.unwatchConversation("conversation-1");
    vi.useRealTimers();
  });

  it("does not retry a terminal conversation watch rejection", async () => {
    vi.useFakeTimers();
    const socket = fakeSocket();
    socket.emitWithAck.mockResolvedValue({ ok: false, error: "UNAUTHORIZED" });
    mocks.io.mockReturnValue(socket);
    const client = new CmsRealtimeClient();
    await client.activateProject("project-1");

    await client.watchConversation("conversation-1");
    await vi.advanceTimersByTimeAsync(2_000);

    expect(
      socket.emitWithAck.mock.calls.filter(
        ([event]) => event === "conversation.watch.v1",
      ),
    ).toHaveLength(1);
    client.deactivateProject();
    vi.useRealTimers();
  });

  it("joins the conversation room before REST reconciliation and connected state", async () => {
    const socket = fakeSocket();
    const order: string[] = [];
    socket.emitWithAck.mockImplementation(async () => {
      order.push("watch-ack");
      return {
        ok: true,
        conversationId: "conversation-1",
        generation: "1",
        expiresAt: "2026-08-08T10:01:00.000Z",
      };
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
    await vi.waitFor(() =>
      expect(
        socket.emitWithAck.mock.calls.filter(
          ([event]) => event === "conversation.watch.v1",
        ),
      ).toHaveLength(2),
    );
    releaseFirst();
    await Promise.all([first, second]);

    expect(reconciled).toEqual(["conversation-1", "conversation-2"]);
  });

  it("retries a rejected watch without waiting for a socket reconnect", async () => {
    vi.useFakeTimers();
    const socket = fakeSocket();
    socket.emitWithAck
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({
        ok: true,
        conversationId: "conversation-1",
        generation: "1",
        expiresAt: "2026-08-08T10:01:00.000Z",
      });
    mocks.io.mockReturnValue(socket);
    const client = new CmsRealtimeClient();
    await client.activateProject("project-1");

    await client.watchConversation("conversation-1");
    await vi.advanceTimersByTimeAsync(2_000);

    expect(socket.emitWithAck).toHaveBeenCalledTimes(2);
    client.unwatchConversation("conversation-1");
    vi.useRealTimers();
  });

  it("renews the exact watch generation and sends only a typing boolean", async () => {
    vi.useFakeTimers();
    const socket = fakeSocket();
    socket.emitWithAck.mockImplementation(
      async (event: string, request: { conversationId: string }) => {
        if (event === "conversation.watch.v1")
          return {
            ok: true,
            conversationId: request.conversationId,
            generation: "17",
            expiresAt: "2026-08-08T10:01:00.000Z",
          };
        if (event === "conversation.watch.renew.v1")
          return {
            ok: true,
            conversationId: request.conversationId,
            generation: "17",
            expiresAt: "2026-08-08T10:02:00.000Z",
          };
        return {
          ok: true,
          conversationId: request.conversationId,
          generation: "17",
          typingRevision: "3",
          expiresAt: "2026-08-08T10:00:05.000Z",
        };
      },
    );
    mocks.io.mockReturnValue(socket);
    const client = new CmsRealtimeClient();
    await client.activateProject("project-1");
    await client.watchConversation("conversation-1");

    await client.setConversationTyping(true);
    await vi.advanceTimersByTimeAsync(40_000);

    expect(socket.emitWithAck).toHaveBeenCalledWith("conversation.typing.v1", {
      conversationId: "conversation-1",
      generation: "17",
      isTyping: true,
    });
    expect(socket.emitWithAck).toHaveBeenCalledWith(
      "conversation.watch.renew.v1",
      { conversationId: "conversation-1", generation: "17" },
    );
    expect(JSON.stringify(socket.emitWithAck.mock.calls)).not.toContain(
      "draft",
    );
    client.deactivateProject();
  });

  it("closes a stale lease when its watch ack arrives after a route switch", async () => {
    const socket = fakeSocket();
    let releaseFirst!: (value: unknown) => void;
    socket.emitWithAck
      .mockReturnValueOnce(new Promise((resolve) => (releaseFirst = resolve)))
      .mockResolvedValueOnce({
        ok: true,
        conversationId: "conversation-2",
        generation: "2",
        expiresAt: "2099-08-08T10:01:00.000Z",
      });
    mocks.io.mockReturnValue(socket);
    const client = new CmsRealtimeClient();
    await client.activateProject("project-1");
    const first = client.watchConversation("conversation-1");
    const second = client.watchConversation("conversation-2");
    await second;
    releaseFirst({
      ok: true,
      conversationId: "conversation-1",
      generation: "1",
      expiresAt: "2099-08-08T10:01:00.000Z",
    });
    await first;
    await vi.waitFor(() =>
      expect(socket.emitWithAck).toHaveBeenCalledWith(
        "conversation.unwatch.v1",
        { conversationId: "conversation-1", generation: "1" },
      ),
    );
    client.deactivateProject();
  });

  it("reissues requested typing after reconnect under the new watch generation", async () => {
    const socket = fakeSocket();
    let watchGeneration = 0;
    socket.emitWithAck.mockImplementation(
      async (
        event: string,
        request: { conversationId: string; generation?: string },
      ) => {
        if (event === "conversation.watch.v1") {
          watchGeneration += 1;
          return {
            ok: true,
            conversationId: request.conversationId,
            generation: String(watchGeneration),
            expiresAt: "2099-08-08T10:01:00.000Z",
          };
        }
        return {
          ok: true,
          conversationId: request.conversationId,
          generation: request.generation,
          typingRevision: String(watchGeneration),
          expiresAt: "2099-08-08T10:00:05.000Z",
        };
      },
    );
    mocks.io.mockReturnValue(socket);
    const client = new CmsRealtimeClient();
    await client.activateProject("project-1");
    await client.watchConversation("conversation-1");
    await client.setConversationTyping(true);

    socket.trigger("disconnect", "transport close");
    socket.trigger("connect");
    await vi.waitFor(() =>
      expect(
        socket.emitWithAck.mock.calls.filter(
          ([event]) => event === "conversation.typing.v1",
        ),
      ).toHaveLength(2),
    );
    expect(socket.emitWithAck).toHaveBeenLastCalledWith(
      "conversation.typing.v1",
      { conversationId: "conversation-1", generation: "2", isTyping: true },
    );
    client.deactivateProject();
  });

  it("converges to stop when typing start acknowledgement is delayed", async () => {
    const socket = fakeSocket();
    mocks.io.mockReturnValue(socket);
    const client = new CmsRealtimeClient();
    await client.activateProject("project-1");
    await client.watchConversation("conversation-1");
    let releaseStart!: (value: unknown) => void;
    socket.emitWithAck.mockImplementation(
      async (event: string, request: { isTyping?: boolean }) => {
        if (event === "conversation.typing.v1" && request.isTyping)
          return new Promise((resolve) => (releaseStart = resolve));
        return {
          ok: true,
          conversationId: "conversation-1",
          generation: "1",
          typingRevision: "2",
          expiresAt: "2099-08-08T10:00:05.000Z",
        };
      },
    );

    const starting = client.setConversationTyping(true);
    await vi.waitFor(() => expect(releaseStart).toBeTypeOf("function"));
    const stopping = client.setConversationTyping(false);
    releaseStart({
      ok: true,
      conversationId: "conversation-1",
      generation: "1",
      typingRevision: "1",
      expiresAt: "2099-08-08T10:00:05.000Z",
    });
    await Promise.all([starting, stopping]);

    expect(socket.emitWithAck).toHaveBeenCalledWith("conversation.typing.v1", {
      conversationId: "conversation-1",
      generation: "1",
      isTyping: false,
    });
    client.deactivateProject();
  });

  it("retries a transient typing start while the draft stays active", async () => {
    vi.useFakeTimers();
    const socket = fakeSocket();
    mocks.io.mockReturnValue(socket);
    const client = new CmsRealtimeClient();
    await client.activateProject("project-1");
    await client.watchConversation("conversation-1");
    socket.emitWithAck
      .mockResolvedValueOnce({ ok: false, error: "COLLABORATION_UNAVAILABLE" })
      .mockResolvedValueOnce({
        ok: true,
        conversationId: "conversation-1",
        generation: "1",
        typingRevision: "2",
        expiresAt: "2099-08-08T10:00:05.000Z",
      });

    expect(await client.setConversationTyping(true)).toBe(false);
    await vi.advanceTimersByTimeAsync(3_000);

    expect(
      socket.emitWithAck.mock.calls.filter(
        ([event]) => event === "conversation.typing.v1",
      ),
    ).toHaveLength(2);
    client.deactivateProject();
    vi.useRealTimers();
  });

  it("does not poll typing after a terminal authorization rejection", async () => {
    vi.useFakeTimers();
    const socket = fakeSocket();
    mocks.io.mockReturnValue(socket);
    const client = new CmsRealtimeClient();
    await client.activateProject("project-1");
    await client.watchConversation("conversation-1");
    socket.emitWithAck.mockResolvedValue({ ok: false, error: "UNAUTHORIZED" });

    expect(await client.setConversationTyping(true)).toBe(false);
    await vi.advanceTimersByTimeAsync(3_000);

    expect(
      socket.emitWithAck.mock.calls.filter(
        ([event]) => event === "conversation.typing.v1",
      ),
    ).toHaveLength(1);
    client.deactivateProject();
    vi.useRealTimers();
  });

  it("rewatches immediately when the typing lease generation is stale", async () => {
    vi.useFakeTimers();
    const socket = fakeSocket();
    mocks.io.mockReturnValue(socket);
    const client = new CmsRealtimeClient();
    await client.activateProject("project-1");
    await client.watchConversation("conversation-1");
    socket.emitWithAck.mockImplementation(
      async (event: string, request: { generation?: string }) => {
        if (event === "conversation.typing.v1" && request.generation === "1")
          return { ok: false, error: "WATCH_GENERATION_STALE" };
        if (event === "conversation.watch.v1")
          return {
            ok: true,
            conversationId: "conversation-1",
            generation: "2",
            expiresAt: "2099-08-08T10:01:00.000Z",
          };
        return {
          ok: true,
          conversationId: "conversation-1",
          generation: "2",
          typingRevision: "2",
          expiresAt: "2099-08-08T10:00:05.000Z",
        };
      },
    );

    expect(await client.setConversationTyping(true)).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() =>
      expect(
        socket.emitWithAck.mock.calls.filter(
          ([event]) => event === "conversation.watch.v1",
        ),
      ).toHaveLength(2),
    );

    expect(socket.emitWithAck).toHaveBeenCalledWith("conversation.typing.v1", {
      conversationId: "conversation-1",
      generation: "2",
      isTyping: true,
    });
    client.deactivateProject();
    vi.useRealTimers();
  });

  it("owns an exact renewable internal-note Case watch and closes it on route change", async () => {
    vi.useFakeTimers();
    const socket = fakeSocket();
    mocks.io.mockReturnValue(socket);
    const client = new CmsRealtimeClient();
    await client.activateProject("project-1");

    await expect(client.watchSupportInternalNotes("case-1")).resolves.toBe(
      true,
    );
    await vi.advanceTimersByTimeAsync(40_000);
    client.unwatchSupportInternalNotes("case-1");

    expect(socket.emitWithAck).toHaveBeenCalledWith(
      "support.internal_note.watch.v1",
      { caseId: "case-1" },
    );
    expect(socket.emitWithAck).toHaveBeenCalledWith(
      "support.internal_note.renew.v1",
      { caseId: "case-1" },
    );
    expect(socket.emitWithAck).toHaveBeenCalledWith(
      "support.internal_note.unwatch.v1",
      { caseId: "case-1" },
    );
    client.deactivateProject();
    vi.useRealTimers();
  });

  it("does not let a late Case A renew replace the active Case B renew timer", async () => {
    vi.useFakeTimers();
    const socket = fakeSocket();
    const lateCaseARenew = deferred<{
      ok: boolean;
      caseId: string;
      expiresAt: string;
    }>();
    socket.emitWithAck.mockImplementation(
      async (event: string, request: { caseId?: string } = {}) => {
        if (
          event === "support.internal_note.renew.v1" &&
          request.caseId === "case-1"
        )
          return lateCaseARenew.promise;
        return {
          ok: true,
          caseId: request.caseId,
          expiresAt: "2026-08-08T10:01:00.000Z",
        };
      },
    );
    mocks.io.mockReturnValue(socket);
    const client = new CmsRealtimeClient();
    await client.activateProject("project-1");
    await client.watchSupportInternalNotes("case-1");

    vi.advanceTimersByTime(40_000);
    await Promise.resolve();
    await client.watchSupportInternalNotes("case-2");
    lateCaseARenew.resolve({
      ok: true,
      caseId: "case-1",
      expiresAt: "2026-08-08T10:01:00.000Z",
    });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(40_000);

    expect(socket.emitWithAck).toHaveBeenCalledWith(
      "support.internal_note.renew.v1",
      { caseId: "case-2" },
    );
    client.deactivateProject();
    vi.useRealTimers();
  });

  it("purges a terminal internal-note watch without retrying it", async () => {
    vi.useFakeTimers();
    const socket = fakeSocket();
    socket.emitWithAck.mockImplementation(
      async (event: string, request: { caseId?: string } = {}) => {
        if (event === "support.internal_note.renew.v1")
          return { ok: false, error: "UNAUTHORIZED" };
        return {
          ok: true,
          caseId: request.caseId,
          expiresAt: "2026-08-08T10:01:00.000Z",
        };
      },
    );
    mocks.io.mockReturnValue(socket);
    const client = new CmsRealtimeClient();
    const terminated = vi.fn();
    client.onSupportInternalNoteWatchTerminated(terminated);
    await client.activateProject("project-1");
    await client.watchSupportInternalNotes("case-1");

    await vi.advanceTimersByTimeAsync(40_000);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(terminated).toHaveBeenCalledOnce();
    expect(terminated).toHaveBeenCalledWith("case-1");
    expect(
      socket.emitWithAck.mock.calls.filter(
        ([event]) => event === "support.internal_note.watch.v1",
      ),
    ).toHaveLength(1);
    expect(
      socket.emitWithAck.mock.calls.filter(
        ([event]) => event === "support.internal_note.renew.v1",
      ),
    ).toHaveLength(1);
    client.deactivateProject();
    vi.useRealTimers();
  });

  it("degrades a capacity-limited note watch without revoking REST note authority", async () => {
    vi.useFakeTimers();
    const socket = fakeSocket();
    socket.emitWithAck.mockImplementation(
      async (event: string, request: { caseId?: string } = {}) => {
        if (event === "support.internal_note.watch.v1")
          return { ok: false, error: "CASE_SOCKET_LIMIT_EXCEEDED" };
        return { ok: true, caseId: request.caseId };
      },
    );
    mocks.io.mockReturnValue(socket);
    const client = new CmsRealtimeClient();
    const terminated = vi.fn();
    const reconciled = vi.fn();
    client.onSupportInternalNoteWatchTerminated(terminated);
    client.reconcile(reconciled);
    await client.activateProject("project-1");

    await expect(client.watchSupportInternalNotes("case-1")).resolves.toBe(
      false,
    );
    await vi.advanceTimersByTimeAsync(10_000);

    expect(terminated).not.toHaveBeenCalled();
    expect(reconciled).toHaveBeenCalled();
    expect(
      socket.emitWithAck.mock.calls.filter(
        ([event]) => event === "support.internal_note.watch.v1",
      ),
    ).toHaveLength(1);
    client.deactivateProject();
    vi.useRealTimers();
  });
});
