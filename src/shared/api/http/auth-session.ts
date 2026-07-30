import {
  createAccessTokenCoordinator,
  type AccessTokenChannel,
  type AccessTokenLock,
} from "./access-token-coordinator";

const PROJECT_KEY = "lola-cms-selected-project-v1";
const TRANSLATION_JOB_PREFIX = "lola:translation-jobs:";
const REPLY_TRANSLATION_DRAFT_PREFIX = "lola:reply-translation-draft:";
const AUTH_CHANNEL_NAME = "lola-cms-auth-session-v1";

function browserChannel(): AccessTokenChannel | undefined {
  if (typeof BroadcastChannel === "undefined") return undefined;
  return new BroadcastChannel(AUTH_CHANNEL_NAME);
}

function browserLock(): AccessTokenLock | undefined {
  if (typeof navigator === "undefined" || !navigator.locks) return undefined;
  return {
    request: async <T>(
      name: string,
      callback: () => Promise<T>,
    ): Promise<T> => {
      let result: T | undefined;
      await navigator.locks.request(name, async () => {
        result = await callback();
      });
      return result as T;
    },
  };
}

const accessTokens = createAccessTokenCoordinator({
  channel: browserChannel(),
  lock: browserLock(),
});

export function getAccessToken(): string | null {
  return accessTokens.get();
}

export function getSelectedProjectId(): string | undefined {
  return sessionStorage.getItem(PROJECT_KEY) ?? undefined;
}

export function storeAccessToken(tokens: {
  accessToken: string;
  expiresIn: number;
}): void {
  accessTokens.store(tokens);
}

export function storeSelectedProjectId(projectId: string): void {
  sessionStorage.setItem(PROJECT_KEY, projectId);
}

export function openProjectInNewTab(
  projectId: string,
  path = "/overview",
): boolean {
  if (typeof window === "undefined") return false;
  const tab = window.open("", "_blank");
  if (!tab) return false;
  tab.sessionStorage.setItem(PROJECT_KEY, projectId);
  tab.opener = null;
  tab.location.replace(new URL(path, window.location.origin).toString());
  return true;
}

function clearTabSessionStorage(): void {
  sessionStorage.removeItem(PROJECT_KEY);
  for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = sessionStorage.key(index);
    if (
      key?.startsWith(TRANSLATION_JOB_PREFIX) ||
      key?.startsWith(REPLY_TRANSLATION_DRAFT_PREFIX)
    ) {
      sessionStorage.removeItem(key);
    }
  }
}

accessTokens.onRemoteClear(clearTabSessionStorage);

export function clearLocalAuthSession(): void {
  accessTokens.clearLocal();
  clearTabSessionStorage();
}

export function clearAuthSession(): void {
  accessTokens.clear();
  clearTabSessionStorage();
}

export function coordinateAccessTokenRefresh(
  refreshBackend: () => Promise<void>,
): Promise<void> {
  return accessTokens.refresh(refreshBackend);
}

export function registerRemoteAuthSessionClearHandler(
  handler: () => void,
): () => void {
  return accessTokens.onRemoteClear(handler);
}
