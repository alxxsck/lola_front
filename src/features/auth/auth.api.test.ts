import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cmsSecuritySettingsLogout,
  cmsSecuritySettingsLogoutAll,
  cmsSessionContextMe,
  initialAccessLogin,
  initialAccessRefresh,
  initialAccessSetupPassword,
} from '@/shared/api/generated/retenive-backend';
import type {
  CmsAuthenticatedResponseDto,
  CmsSessionContextResponseDto,
  CmsSessionProjectContextDto,
  PasswordEstablishedResponseDto,
  PasswordSetupRequiredResponseDto,
} from '@/shared/api/generated/models';
import {
  clearAuthSession,
  coordinateAccessTokenRefresh,
  getAccessToken,
  storeAccessToken,
} from '@/shared/api/http/auth-session';
import { refreshAccessToken } from '@/shared/api/http/axios-instance';
import {
  clearInteractiveLoginRequirement,
  requireInteractiveLogin,
} from './interactive-login-requirement';
import { authApi } from './auth.api';

vi.mock('@/shared/api/generated/retenive-backend', () => ({
  cmsSecuritySettingsLogout: vi.fn(),
  cmsSecuritySettingsLogoutAll: vi.fn(),
  cmsSessionContextMe: vi.fn(),
  initialAccessLogin: vi.fn(),
  initialAccessRefresh: vi.fn(),
  initialAccessSetupPassword: vi.fn(),
}));

const authenticatedResponse = {
  kind: 'AUTHENTICATED',
  accessToken: 'access',
  expiresIn: 60,
  refreshExpiresIn: 120,
  tokenType: 'Bearer',
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'viewer@example.com',
    displayName: 'Viewer',
  },
} satisfies CmsAuthenticatedResponseDto;

function project(
  id: string,
  name: string,
  roleKeys = ['PROJECT_VIEWER'],
  effectivePermissionCodes = ['project.read'],
): CmsSessionProjectContextDto {
  return {
    id,
    version: 1,
    name,
    slug: id,
    status: 'ACTIVE',
    publicKey: `public-${id}`,
    serverKeyPrefix: `server-${id}`,
    organizationId: 'organization-1',
    defaultLocale: 'ru',
    supportedLocales: ['ru'],
    assistantName: 'Retenive',
    systemPrompt: '',
    voiceInstructions: '',
    settings: {},
    createdAt: '2026-07-21T10:00:00.000Z',
    updatedAt: '2026-07-21T10:00:00.000Z',
    membershipId: `membership-${id}`,
    membershipStatus: 'ACTIVE',
    membershipVersion: 1,
    roleKeys,
    effectivePermissionCodes,
  };
}

function sessionContext(
  projects: CmsSessionProjectContextDto[],
  platformPermissionCodes: string[] = [],
): CmsSessionContextResponseDto & {
  capabilities: { supportEnabled: boolean };
} {
  return {
    user: {
      ...authenticatedResponse.user,
      emailVerifiedAt: null,
      pendingEmail: null,
      emailVerificationRetryAfterSeconds: 0,
    },
    platformPermissionCodes,
    projects,
    capabilities: { supportEnabled: true },
  };
}

describe('target CMS User auth API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthSession();
    sessionStorage.clear();
    localStorage.clear();
    clearInteractiveLoginRequirement();
  });

  it('keeps a Password Setup capability out of browser storage', async () => {
    const response = {
      kind: 'PASSWORD_SETUP_REQUIRED',
      setupToken: 'lps_setup-capability',
      expiresAt: '2026-07-21T10:10:00.000Z',
    } satisfies PasswordSetupRequiredResponseDto;
    vi.mocked(initialAccessLogin).mockResolvedValue(response);

    await expect(authApi.login('operator@example.com', 'lia_initial-secret')).resolves.toEqual(
      response,
    );

    expect(initialAccessLogin).toHaveBeenCalledWith({
      identifier: 'operator@example.com',
      secret: 'lia_initial-secret',
    });
    expect(cmsSessionContextMe).not.toHaveBeenCalled();
    expect(JSON.stringify(Object.values(sessionStorage))).not.toContain(response.setupToken);
  });

  it('waits for an in-flight refresh before clearing authority for explicit login', async () => {
    storeAccessToken({ accessToken: 'old-session', expiresIn: 900 });
    let releaseRefresh!: () => void;
    const refresh = coordinateAccessTokenRefresh(async () => {
      await new Promise<void>((resolve) => {
        releaseRefresh = resolve;
      });
      storeAccessToken({
        accessToken: 'refreshed-old-session',
        expiresIn: 900,
      });
    });
    await vi.waitFor(() => expect(releaseRefresh).toBeTypeOf('function'));
    vi.mocked(initialAccessLogin).mockResolvedValue({
      kind: 'MFA_REQUIRED',
      ceremonyToken: 'lmf_new_login',
      expiresAt: '2099-07-21T21:10:00.000Z',
      publicKey: { challenge: 'challenge' },
      recoveryAvailable: false,
    });

    const login = authApi.login('operator@example.com', 'a long permanent passphrase');

    expect(initialAccessLogin).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe('old-session');
    releaseRefresh();
    await refresh;
    await login;

    expect(initialAccessLogin).toHaveBeenCalledOnce();
    expect(getAccessToken()).toBeNull();
  });

  it('loads target memberships and effective permissions from the self context', async () => {
    vi.mocked(cmsSessionContextMe).mockResolvedValue(
      sessionContext([
        project(
          'project-member',
          'Member Project',
          ['PROJECT_ADMIN'],
          ['project.read', 'scenario.write'],
        ),
      ]),
    );

    await expect(authApi.refreshContext()).resolves.toEqual({
      user: {
        id: authenticatedResponse.user.id,
        email: authenticatedResponse.user.email,
        name: authenticatedResponse.user.displayName,
        emailVerifiedAt: null,
        pendingEmail: null,
        emailVerificationRetryAfterSeconds: 0,
        platformPermissionCodes: [],
      },
      projects: [
        expect.objectContaining({
          id: 'project-member',
          roleKeys: ['PROJECT_ADMIN'],
          effectivePermissionCodes: ['project.read', 'scenario.write'],
        }),
      ],
      capabilities: { supportEnabled: true },
      selectedProjectId: 'project-member',
    });
    expect(cmsSessionContextMe).toHaveBeenCalledOnce();
  });

  it('preserves a permission-projected Project context without fabricating settings defaults', async () => {
    vi.mocked(cmsSessionContextMe).mockResolvedValue(
      sessionContext([
        {
          id: 'usage-project',
          name: 'Usage Project',
          slug: 'usage-project',
          status: 'ACTIVE',
          supportedLocales: ['ru'],
          membershipId: 'membership-usage',
          membershipStatus: 'ACTIVE',
          membershipVersion: 1,
          roleKeys: ['AI_USAGE_READER'],
          effectivePermissionCodes: ['project.ai_usage.read'],
        },
      ]),
    );

    const result = await authApi.refreshContext();
    const [mapped] = result.projects;

    expect(mapped).toMatchObject({
      id: 'usage-project',
      supportedLocales: ['ru'],
      effectivePermissionCodes: ['project.ai_usage.read'],
    });
    expect(mapped).not.toHaveProperty('settings');
    expect(mapped).not.toHaveProperty('assistantName');
    expect(mapped).not.toHaveProperty('defaultLocale');
    expect(mapped).not.toHaveProperty('version');
  });

  it('rejects a session context that omits deployment-wide Support availability', async () => {
    const contextWithoutCapabilities = {
      ...sessionContext([]),
    } as Record<string, unknown>;
    Reflect.deleteProperty(contextWithoutCapabilities, 'capabilities');
    vi.mocked(cmsSessionContextMe).mockResolvedValue(
      contextWithoutCapabilities as unknown as CmsSessionContextResponseDto,
    );

    await expect(authApi.refreshContext()).rejects.toThrow(
      'Session context does not declare Support availability',
    );
  });

  it('maps canonical email verification state from the self context', async () => {
    vi.mocked(cmsSessionContextMe).mockResolvedValue({
      ...sessionContext([]),
      user: {
        ...authenticatedResponse.user,
        emailVerifiedAt: null,
        pendingEmail: 'pending@example.com',
        emailVerificationRetryAfterSeconds: 37,
      },
    } as CmsSessionContextResponseDto);

    const result = await authApi.refreshContext();

    expect(result).toMatchObject({
      user: {
        email: 'viewer@example.com',
        emailVerifiedAt: null,
        pendingEmail: 'pending@example.com',
        emailVerificationRetryAfterSeconds: 37,
      },
    });
  });

  it('authenticates a projectless Platform Operator without fabricating VIEWER access', async () => {
    vi.mocked(cmsSessionContextMe).mockResolvedValue(
      sessionContext([], ['platform.projects.manage']),
    );

    const result = await authApi.refreshContext();

    expect(result).toEqual({
      user: {
        id: authenticatedResponse.user.id,
        email: authenticatedResponse.user.email,
        name: authenticatedResponse.user.displayName,
        emailVerifiedAt: null,
        pendingEmail: null,
        emailVerificationRetryAfterSeconds: 0,
        platformPermissionCodes: ['platform.projects.manage'],
      },
      projects: [],
      capabilities: { supportEnabled: true },
      selectedProjectId: undefined,
    });
  });

  it('maps the generated password setup result to the frontend state contract', async () => {
    const response = {
      kind: 'PASSWORD_ESTABLISHED',
      cmsUserId: authenticatedResponse.user.id,
      status: 'ACTIVE',
      next: 'LOGIN',
    } satisfies PasswordEstablishedResponseDto;
    vi.mocked(initialAccessSetupPassword).mockResolvedValue(response);

    await expect(
      authApi.completePasswordSetup(
        'lps_setup-capability',
        'a long permanent passphrase',
        'a long permanent passphrase',
      ),
    ).resolves.toEqual({
      kind: 'PASSWORD_ESTABLISHED',
      status: 'ACTIVE',
      nextAction: 'LOGIN',
    });
    expect(initialAccessSetupPassword).toHaveBeenCalledWith({
      setupToken: 'lps_setup-capability',
      newPassword: 'a long permanent passphrase',
      passwordConfirmation: 'a long permanent passphrase',
    });
  });

  it('refreshes through the cookie before revoking the current server session', async () => {
    storeAccessToken({ accessToken: 'expired', expiresIn: -1 });
    vi.mocked(initialAccessRefresh).mockResolvedValue({
      ...authenticatedResponse,
      accessToken: 'fresh',
    });
    vi.mocked(cmsSecuritySettingsLogout).mockResolvedValue({ success: true });

    await authApi.logout();

    expect(initialAccessRefresh).toHaveBeenCalledWith();
    expect(cmsSecuritySettingsLogout).toHaveBeenCalledWith({
      _authTeardownAccessToken: 'fresh',
    });
    expect(getAccessToken()).toBeNull();
  });

  it('clears local credentials even when refresh cannot reach the server', async () => {
    storeAccessToken({ accessToken: 'expired', expiresIn: -1 });
    sessionStorage.setItem('retenive:translation-jobs:project-1:scenario-1', '[]');
    vi.mocked(initialAccessRefresh).mockRejectedValue(new Error('network'));

    await expect(authApi.logout()).resolves.toBeUndefined();
    expect(cmsSecuritySettingsLogout).not.toHaveBeenCalled();
    expect(getAccessToken()).toBeNull();
    expect(sessionStorage.getItem('retenive:translation-jobs:project-1:scenario-1')).toBeNull();
  });

  it('revokes the current server session with a valid access token when the refresh cookie is unavailable', async () => {
    storeAccessToken({ accessToken: 'still-valid', expiresIn: 900 });
    vi.mocked(initialAccessRefresh).mockRejectedValue(new Error('refresh cookie unavailable'));
    vi.mocked(cmsSecuritySettingsLogout).mockResolvedValue({ success: true });

    await expect(authApi.logout()).resolves.toBeUndefined();

    expect(initialAccessRefresh).toHaveBeenCalledOnce();
    expect(cmsSecuritySettingsLogout).toHaveBeenCalledWith({
      _authTeardownAccessToken: 'still-valid',
    });
    expect(getAccessToken()).toBeNull();
  });

  it('restores from an unreadable HttpOnly cookie without browser token state', async () => {
    vi.mocked(initialAccessRefresh).mockResolvedValue(authenticatedResponse);
    vi.mocked(cmsSessionContextMe).mockResolvedValue(sessionContext([]));

    await expect(authApi.restore()).resolves.toMatchObject({
      user: { id: authenticatedResponse.user.id },
    });

    expect(initialAccessRefresh).toHaveBeenCalledWith();
    expect(getAccessToken()).toBe('access');
    expect(JSON.stringify(Object.values(sessionStorage))).not.toContain('access');
  });

  it('does not publish a refresh response that arrives after logout', async () => {
    let resolveRefresh!: (value: CmsAuthenticatedResponseDto) => void;
    vi.mocked(initialAccessRefresh).mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    const refresh = refreshAccessToken();

    requireInteractiveLogin();
    clearAuthSession();
    resolveRefresh(authenticatedResponse);

    await expect(refresh).rejects.toMatchObject({
      name: 'AuthenticationOperationCancelledError',
    });
    expect(getAccessToken()).toBeNull();
  });

  it('uses the cookie refresh before revoking every server session', async () => {
    vi.mocked(initialAccessRefresh).mockResolvedValue(authenticatedResponse);
    vi.mocked(cmsSecuritySettingsLogoutAll).mockResolvedValue({
      success: true,
    });

    await authApi.logoutAll();

    expect(initialAccessRefresh).toHaveBeenCalledWith();
    expect(cmsSecuritySettingsLogoutAll).toHaveBeenCalledWith({
      _authTeardownAccessToken: 'access',
    });
    expect(getAccessToken()).toBeNull();
  });

  it('revokes every server session with a valid access token when the refresh cookie is unavailable', async () => {
    storeAccessToken({ accessToken: 'still-valid', expiresIn: 900 });
    vi.mocked(initialAccessRefresh).mockRejectedValue(new Error('refresh cookie unavailable'));
    vi.mocked(cmsSecuritySettingsLogoutAll).mockResolvedValue({
      success: true,
    });

    await expect(authApi.logoutAll()).resolves.toBeUndefined();

    expect(initialAccessRefresh).toHaveBeenCalledOnce();
    expect(cmsSecuritySettingsLogoutAll).toHaveBeenCalledWith({
      _authTeardownAccessToken: 'still-valid',
    });
    expect(getAccessToken()).toBeNull();
  });
});
