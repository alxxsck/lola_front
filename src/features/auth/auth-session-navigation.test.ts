import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installAuthSessionNavigation, notifyAuthSessionEnded } from './auth-session-navigation';

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

async function routerAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/login',
        name: 'login',
        component: { template: '<div>Login</div>' },
      },
      {
        path: '/protected',
        name: 'protected',
        component: { template: '<div>Protected</div>' },
      },
    ],
  });
  await router.push(path);
  await router.isReady();
  cleanups.push(installAuthSessionNavigation(router));
  return router;
}

describe('authentication session navigation', () => {
  it('leaves protected content immediately after logout', async () => {
    const router = await routerAt('/protected');

    notifyAuthSessionEnded('LOGOUT');
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'));

    expect(router.currentRoute.value.query).toEqual({});
  });

  it('keeps the interrupted route after an expired session', async () => {
    const router = await routerAt('/protected?tab=queues');

    notifyAuthSessionEnded('SESSION_EXPIRED');
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'));

    expect(router.currentRoute.value.query.redirect).toBe('/protected?tab=queues');
  });
});
