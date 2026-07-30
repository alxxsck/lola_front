export interface AccessTokenChannel {
  postMessage(message: unknown): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  close(): void;
}

export interface AccessTokenLock {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

interface AccessTokenMessage {
  type: "ACCESS_TOKEN";
  accessToken: string;
  expiresAt: number;
}

interface AccessTokenRequestMessage {
  type: "ACCESS_TOKEN_REQUEST";
}

interface AuthSessionClearedMessage {
  type: "AUTH_SESSION_CLEARED";
}

type AuthSessionMessage =
  | AccessTokenMessage
  | AccessTokenRequestMessage
  | AuthSessionClearedMessage;

interface AccessTokenCoordinatorOptions {
  channel?: AccessTokenChannel;
  lock?: AccessTokenLock;
  responseTimeoutMs?: number;
  now?: () => number;
}

export interface AccessTokenCoordinator {
  get(): string | null;
  store(tokens: { accessToken: string; expiresIn: number }): void;
  clearLocal(): void;
  clear(): void;
  adoptSharedToken(): Promise<boolean>;
  refresh(refreshBackend: () => Promise<void>): Promise<void>;
  onRemoteClear(listener: () => void): () => void;
  close(): void;
}

const REFRESH_LOCK_NAME = "lola-cms-access-token-refresh-v1";

export function createAccessTokenCoordinator({
  channel,
  lock,
  responseTimeoutMs = 250,
  now = () => Date.now(),
}: AccessTokenCoordinatorOptions = {}): AccessTokenCoordinator {
  let accessToken: string | null = null;
  let accessExpiresAt = 0;
  let revision = 0;
  const tokenWaiters = new Set<(available: boolean) => void>();
  const remoteClearListeners = new Set<() => void>();

  function get(): string | null {
    return accessToken && accessExpiresAt > now() ? accessToken : null;
  }

  function applyToken(message: AccessTokenMessage): void {
    if (
      message.expiresAt <= now() ||
      (accessToken === message.accessToken &&
        accessExpiresAt === message.expiresAt)
    )
      return;
    accessToken = message.accessToken;
    accessExpiresAt = message.expiresAt;
    revision += 1;
    for (const resolve of tokenWaiters) resolve(true);
    tokenWaiters.clear();
  }

  function store(tokens: {
    accessToken: string;
    expiresIn: number;
  }): void {
    const message: AccessTokenMessage = {
      type: "ACCESS_TOKEN",
      accessToken: tokens.accessToken,
      expiresAt: now() + tokens.expiresIn * 1_000,
    };
    applyToken(message);
    channel?.postMessage(message);
  }

  function clearLocal(): void {
    accessToken = null;
    accessExpiresAt = 0;
    revision += 1;
    for (const resolve of tokenWaiters) resolve(false);
    tokenWaiters.clear();
  }

  function clear(): void {
    clearLocal();
    channel?.postMessage({ type: "AUTH_SESSION_CLEARED" });
  }

  function isMessage(value: unknown): value is AuthSessionMessage {
    if (!value || typeof value !== "object" || !("type" in value))
      return false;
    if (value.type === "ACCESS_TOKEN_REQUEST")
      return Object.keys(value).length === 1;
    if (value.type === "AUTH_SESSION_CLEARED")
      return Object.keys(value).length === 1;
    return (
      value.type === "ACCESS_TOKEN" &&
      "accessToken" in value &&
      typeof value.accessToken === "string" &&
      "expiresAt" in value &&
      typeof value.expiresAt === "number"
    );
  }

  function receive(event: MessageEvent<unknown>): void {
    if (!isMessage(event.data)) return;
    if (event.data.type === "ACCESS_TOKEN_REQUEST") {
      const token = get();
      if (token)
        channel?.postMessage({
          type: "ACCESS_TOKEN",
          accessToken: token,
          expiresAt: accessExpiresAt,
        });
      return;
    }
    if (event.data.type === "ACCESS_TOKEN") {
      applyToken(event.data);
      return;
    }
    clearLocal();
    for (const listener of remoteClearListeners) listener();
  }

  channel?.addEventListener("message", receive);

  async function adoptSharedToken(): Promise<boolean> {
    if (get()) return true;
    if (!channel) return false;
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (available: boolean) => {
        if (settled) return;
        settled = true;
        tokenWaiters.delete(finish);
        resolve(available);
      };
      tokenWaiters.add(finish);
      setTimeout(() => finish(Boolean(get())), responseTimeoutMs);
      channel.postMessage({ type: "ACCESS_TOKEN_REQUEST" });
    });
  }

  async function refresh(refreshBackend: () => Promise<void>): Promise<void> {
    const startingRevision = revision;
    const run = async () => {
      if (revision !== startingRevision && get()) return;
      await adoptSharedToken();
      if (revision !== startingRevision && get()) return;
      await refreshBackend();
    };
    if (lock) await lock.request(REFRESH_LOCK_NAME, run);
    else await run();
  }

  function onRemoteClear(listener: () => void): () => void {
    remoteClearListeners.add(listener);
    return () => remoteClearListeners.delete(listener);
  }

  function close(): void {
    channel?.removeEventListener("message", receive);
    channel?.close();
    tokenWaiters.clear();
    remoteClearListeners.clear();
  }

  return {
    get,
    store,
    clearLocal,
    clear,
    adoptSharedToken,
    refresh,
    onRemoteClear,
    close,
  };
}
