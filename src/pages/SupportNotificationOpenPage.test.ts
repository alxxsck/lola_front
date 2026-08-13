import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '@/features/auth/auth.store';
import { supportNotificationsSource } from '@/features/support-notifications/api/support-notifications-source';
import {
  captureSupportNotificationCapability,
  clearSupportNotificationCapability,
  readSupportNotificationCapability,
} from '@/features/support-notifications/model/support-notification-capability';
import { ApiError } from '@/shared/api/http/api-error';
import SupportNotificationOpenPage from './SupportNotificationOpenPage.vue';

const router = vi.hoisted(() => ({ replace: vi.fn() }));
let pinia: ReturnType<typeof createPinia>;

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: () => router,
}));

vi.mock('@/features/support-notifications/api/support-notifications-source', () => ({
  supportNotificationsSource: { resolveDeepLink: vi.fn() },
}));

function mountPage() {
  return mount(SupportNotificationOpenPage, {
    global: {
      plugins: [pinia],
      stubs: {
        Button: { template: '<button>{{ label }}</button>', props: ['label'] },
      },
    },
  });
}

describe('SupportNotificationOpenPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSupportNotificationCapability();
    pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    const project = {
      id: 'project-1',
      name: 'Lucky Stars',
      effectivePermissionCodes: ['project.support.assignments.self_manage'],
    };
    auth.$patch({
      phase: 'AUTHENTICATED',
      user: { id: 'operator-1', email: 'operator@example.test' },
      project,
      projects: [project],
    });
  });

  it('keeps a scrubbed capability through a 401 login redirect and consumes it on retry', async () => {
    const capability = 'R'.repeat(43);
    captureSupportNotificationCapability(`#capability=${capability}`);
    vi.mocked(supportNotificationsSource.resolveDeepLink)
      .mockRejectedValueOnce(new ApiError(401, 'expired session'))
      .mockResolvedValueOnce({
        target: 'SUPPORT_OPERATOR_WORKSPACE',
        projectId: 'project-1',
        selection: { kind: 'CASE', caseId: 'case-27' },
      });

    const expired = mountPage();
    await vi.waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        name: 'login',
        query: { redirect: '/support/notifications/open' },
      }),
    );
    expect(readSupportNotificationCapability()).toBe(capability);
    expired.unmount();

    router.replace.mockClear();
    const retried = mountPage();
    await vi.waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        name: 'support-inbox-case',
        params: { caseId: 'case-27' },
        query: { projectId: 'project-1' },
      }),
    );
    expect(readSupportNotificationCapability()).toBeNull();
    retried.unmount();
  });
});
