import { describe, expect, it, vi } from "vitest";
import {
  createAccessTokenCoordinator,
  type AccessTokenChannel,
  type AccessTokenLock,
} from "./access-token-coordinator";

class ChannelHub {
  private readonly listeners = new Map<
    AccessTokenChannel,
    Set<(event: MessageEvent<unknown>) => void>
  >();

  create(): AccessTokenChannel {
    const channel: AccessTokenChannel = {
      postMessage: (message) => {
        for (const [peer, listeners] of this.listeners) {
          if (peer === channel) continue;
          for (const listener of listeners)
            listener({ data: message } as MessageEvent<unknown>);
        }
      },
      addEventListener: (_type, listener) => {
        const listeners = this.listeners.get(channel) ?? new Set();
        listeners.add(listener);
        this.listeners.set(channel, listeners);
      },
      removeEventListener: (_type, listener) => {
        this.listeners.get(channel)?.delete(listener);
      },
      close: () => {
        this.listeners.delete(channel);
      },
    };
    this.listeners.set(channel, new Set());
    return channel;
  }

  broadcast(message: unknown): void {
    for (const listeners of this.listeners.values()) {
      for (const listener of listeners)
        listener({ data: message } as MessageEvent<unknown>);
    }
  }
}

function serialLock(): AccessTokenLock {
  let tail = Promise.resolve();
  return {
    request: async (_name, callback) => {
      const previous = tail;
      let release = () => {};
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await callback();
      } finally {
        release();
      }
    },
  };
}

describe("access token coordination", () => {
  it("shares a memory-only access token with another tab", async () => {
    const hub = new ChannelHub();
    const lock = serialLock();
    const first = createAccessTokenCoordinator({
      channel: hub.create(),
      lock,
      responseTimeoutMs: 10,
    });
    const second = createAccessTokenCoordinator({
      channel: hub.create(),
      lock,
      responseTimeoutMs: 10,
    });

    first.store({ accessToken: "shared-access", expiresIn: 60 });

    await expect(second.adoptSharedToken()).resolves.toBe(true);
    expect(second.get()).toBe("shared-access");
  });

  it("performs one backend refresh when two tabs need a token together", async () => {
    const hub = new ChannelHub();
    const lock = serialLock();
    const first = createAccessTokenCoordinator({
      channel: hub.create(),
      lock,
      responseTimeoutMs: 10,
    });
    const second = createAccessTokenCoordinator({
      channel: hub.create(),
      lock,
      responseTimeoutMs: 10,
    });
    const backendRefresh = vi.fn(async (coordinator: typeof first) => {
      await Promise.resolve();
      coordinator.store({ accessToken: "rotated-access", expiresIn: 60 });
    });

    await Promise.all([
      first.refresh(() => backendRefresh(first)),
      second.refresh(() => backendRefresh(second)),
    ]);

    expect(backendRefresh).toHaveBeenCalledOnce();
    expect(first.get()).toBe("rotated-access");
    expect(second.get()).toBe("rotated-access");
  });

  it("clears every tab without persisting auth data", () => {
    const hub = new ChannelHub();
    const lock = serialLock();
    const first = createAccessTokenCoordinator({
      channel: hub.create(),
      lock,
      responseTimeoutMs: 10,
    });
    const second = createAccessTokenCoordinator({
      channel: hub.create(),
      lock,
      responseTimeoutMs: 10,
    });
    const cleared = vi.fn();
    second.onRemoteClear(cleared);
    first.store({ accessToken: "shared-access", expiresIn: 60 });

    first.clear();

    expect(first.get()).toBeNull();
    expect(second.get()).toBeNull();
    expect(cleared).toHaveBeenCalledOnce();
    expect(Object.values(localStorage)).toEqual([]);
    expect(Object.values(sessionStorage)).toEqual([]);
  });

  it("keeps other tabs authenticated when one tab clears only local state", () => {
    const hub = new ChannelHub();
    const lock = serialLock();
    const first = createAccessTokenCoordinator({
      channel: hub.create(),
      lock,
      responseTimeoutMs: 10,
    });
    const second = createAccessTokenCoordinator({
      channel: hub.create(),
      lock,
      responseTimeoutMs: 10,
    });
    first.store({ accessToken: "shared-access", expiresIn: 60 });

    first.clearLocal();

    expect(first.get()).toBeNull();
    expect(second.get()).toBe("shared-access");
  });

  it("does not replace a fresh token with a late stale-tab response", () => {
    const hub = new ChannelHub();
    const lock = serialLock();
    let now = 1_000;
    const first = createAccessTokenCoordinator({
      channel: hub.create(),
      lock,
      responseTimeoutMs: 10,
      now: () => now,
    });
    const second = createAccessTokenCoordinator({
      channel: hub.create(),
      lock,
      responseTimeoutMs: 10,
      now: () => now,
    });
    first.store({ accessToken: "stale-access", expiresIn: 60 });
    now = 2_000;
    second.store({ accessToken: "fresh-access", expiresIn: 60 });

    hub.broadcast({
      type: "ACCESS_TOKEN",
      accessToken: "stale-access",
      expiresAt: 61_000,
      issuedAt: 1_000,
    });

    expect(first.get()).toBe("fresh-access");
    expect(second.get()).toBe("fresh-access");
  });
});
