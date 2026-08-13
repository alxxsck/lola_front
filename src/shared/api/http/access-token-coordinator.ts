export interface AccessTokenChannel {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  close(): void;
}

export interface AccessTokenLock {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

interface AccessTokenMessage {
  type: 'ACCESS_TOKEN';
  accessToken: string;
  expiresAt: number;
  issuedAt: number;
}

interface AccessTokenRequestMessage {
  type: 'ACCESS_TOKEN_REQUEST';
}

interface AuthSessionClearedMessage {
  type: 'AUTH_SESSION_CLEARED';
}

type AuthSessionMessage =
  AccessTokenMessage | AccessTokenRequestMessage | AuthSessionClearedMessage;

interface AccessTokenCoordinatorOptions {
  channel?: AccessTokenChannel;
  lock?: AccessTokenLock;
  responseTimeoutMs?: number;
  now?: () => number;
  requireCrossContextLock?: boolean;
}

export class CrossContextAuthLockUnavailableError extends Error {
  constructor() {
    super('Браузер не поддерживает безопасную межвкладочную блокировку авторизации.');
    this.name = 'CrossContextAuthLockUnavailableError';
  }
}

export interface AccessTokenCoordinator {
  get(): string | null;
  sessionGeneration(): number;
  store(tokens: { accessToken: string; expiresIn: number }): void;
  clearLocal(): void;
  clear(): void;
  adoptSharedToken(): Promise<boolean>;
  refresh(refreshBackend: () => Promise<void>): Promise<void>;
  runExclusive<T>(operation: () => Promise<T>): Promise<T>;
  runSessionReplacement<T>(operation: () => Promise<T>): Promise<T>;
  onRemoteClear(listener: () => void): () => void;
  close(): void;
}

const REFRESH_LOCK_NAME = 'retenive-cms-access-token-refresh-v1';

export function createAccessTokenCoordinator({
  channel,
  lock,
  responseTimeoutMs = 250,
  now = () => Date.now(),
  requireCrossContextLock = false,
}: AccessTokenCoordinatorOptions = {}): AccessTokenCoordinator {
  let accessToken: string | null = null;
  let accessExpiresAt = 0;
  let accessIssuedAt = 0;
  let revision = 0;
  let authorityGeneration = 0;
  let exclusiveTail: Promise<void> = Promise.resolve();
  let acceptsRemoteTokens = true;
  const tokenWaiters = new Set<(available: boolean) => void>();
  const remoteClearListeners = new Set<() => void>();

  function get(): string | null {
    return accessToken && accessExpiresAt > now() ? accessToken : null;
  }

  function sessionGeneration(): number {
    return authorityGeneration;
  }

  function applyToken(message: AccessTokenMessage, remote = false): void {
    if (
      (remote && !acceptsRemoteTokens) ||
      message.expiresAt <= now() ||
      (accessToken !== null &&
        (message.issuedAt < accessIssuedAt ||
          (message.issuedAt === accessIssuedAt && message.accessToken !== accessToken))) ||
      (accessToken === message.accessToken &&
        accessExpiresAt === message.expiresAt &&
        accessIssuedAt === message.issuedAt)
    )
      return;
    accessToken = message.accessToken;
    accessExpiresAt = message.expiresAt;
    accessIssuedAt = message.issuedAt;
    revision += 1;
    for (const resolve of tokenWaiters) resolve(true);
    tokenWaiters.clear();
  }

  function store(tokens: { accessToken: string; expiresIn: number }): void {
    acceptsRemoteTokens = true;
    const issuedAt = Math.max(now(), accessIssuedAt + 1);
    const message: AccessTokenMessage = {
      type: 'ACCESS_TOKEN',
      accessToken: tokens.accessToken,
      expiresAt: issuedAt + tokens.expiresIn * 1_000,
      issuedAt,
    };
    applyToken(message);
    channel?.postMessage(message);
  }

  function clearLocal(): void {
    acceptsRemoteTokens = false;
    authorityGeneration += 1;
    accessToken = null;
    accessExpiresAt = 0;
    accessIssuedAt = 0;
    revision += 1;
    for (const resolve of tokenWaiters) resolve(false);
    tokenWaiters.clear();
  }

  function clear(): void {
    clearLocal();
    channel?.postMessage({ type: 'AUTH_SESSION_CLEARED' });
  }

  function isMessage(value: unknown): value is AuthSessionMessage {
    if (!value || typeof value !== 'object' || !('type' in value)) return false;
    if (value.type === 'ACCESS_TOKEN_REQUEST') return Object.keys(value).length === 1;
    if (value.type === 'AUTH_SESSION_CLEARED') return Object.keys(value).length === 1;
    return (
      value.type === 'ACCESS_TOKEN' &&
      'accessToken' in value &&
      typeof value.accessToken === 'string' &&
      'expiresAt' in value &&
      typeof value.expiresAt === 'number' &&
      'issuedAt' in value &&
      typeof value.issuedAt === 'number'
    );
  }

  function receive(event: MessageEvent<unknown>): void {
    if (!isMessage(event.data)) return;
    if (event.data.type === 'ACCESS_TOKEN_REQUEST') {
      const token = get();
      if (token)
        channel?.postMessage({
          type: 'ACCESS_TOKEN',
          accessToken: token,
          expiresAt: accessExpiresAt,
          issuedAt: accessIssuedAt,
        });
      return;
    }
    if (event.data.type === 'ACCESS_TOKEN') {
      applyToken(event.data, true);
      return;
    }
    clearLocal();
    for (const listener of remoteClearListeners) listener();
  }

  channel?.addEventListener('message', receive);

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
      channel.postMessage({ type: 'ACCESS_TOKEN_REQUEST' });
    });
  }

  async function runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = exclusiveTail;
    let release = () => {};
    exclusiveTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      if (lock) return await lock.request(REFRESH_LOCK_NAME, operation);
      return await operation();
    } finally {
      release();
    }
  }

  async function runSessionReplacement<T>(operation: () => Promise<T>): Promise<T> {
    if (requireCrossContextLock && !lock) throw new CrossContextAuthLockUnavailableError();
    return runExclusive(operation);
  }

  async function refresh(refreshBackend: () => Promise<void>): Promise<void> {
    const startingRevision = revision;
    const run = async () => {
      if (revision !== startingRevision && get()) return;
      await adoptSharedToken();
      if (revision !== startingRevision && get()) return;
      await refreshBackend();
    };
    await runExclusive(run);
  }

  function onRemoteClear(listener: () => void): () => void {
    remoteClearListeners.add(listener);
    return () => remoteClearListeners.delete(listener);
  }

  function close(): void {
    channel?.removeEventListener('message', receive);
    channel?.close();
    tokenWaiters.clear();
    remoteClearListeners.clear();
  }

  return {
    get,
    sessionGeneration,
    store,
    clearLocal,
    clear,
    adoptSharedToken,
    refresh,
    runExclusive,
    runSessionReplacement,
    onRemoteClear,
    close,
  };
}
