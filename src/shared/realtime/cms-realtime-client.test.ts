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
  return {
    connected: true,
    on: vi.fn((event: string, callback: (...args: never[]) => void) => {
      listeners.set(event, callback);
    }),
    emit: vi.fn(),
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
});
