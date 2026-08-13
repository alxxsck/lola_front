import type { Router } from 'vue-router';

export type AuthSessionEndReason = 'LOGOUT' | 'SESSION_EXPIRED';

type AuthSessionEndHandler = (reason: AuthSessionEndReason) => void;

let sessionEndHandler: AuthSessionEndHandler | undefined;

export function notifyAuthSessionEnded(reason: AuthSessionEndReason): void {
  sessionEndHandler?.(reason);
}

export function installAuthSessionNavigation(router: Router): () => void {
  const handler: AuthSessionEndHandler = (reason) => {
    if (router.currentRoute.value.name === 'login') return;
    const redirect = reason === 'SESSION_EXPIRED' ? router.currentRoute.value.fullPath : undefined;
    void router.replace({
      name: 'login',
      ...(redirect ? { query: { redirect } } : {}),
    });
  };
  sessionEndHandler = handler;
  return () => {
    if (sessionEndHandler === handler) sessionEndHandler = undefined;
  };
}
