import { expect, test, type Page, type Route } from '@playwright/test'

test.skip(
  process.env.VITE_DATA_MODE !== 'api',
  'IAM network fixtures require the API-mode frontend adapter',
)

const projectId = '00000000-0000-4000-8000-000000000410'

type FixtureOptions = {
  permissions: string[]
  stepUpOnUpdate?: boolean
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

function projectContext(permissions: string[]) {
  return {
    id: projectId,
    organizationId: '00000000-0000-4000-8000-000000000400',
    name: 'Security Project',
    slug: 'security-project',
    status: 'ACTIVE',
    publicKey: 'public-key',
    serverKeyPrefix: 'server-prefix',
    defaultLocale: 'ru',
    supportedLocales: ['ru'],
    assistantName: 'Lola',
    systemPrompt: 'Помогай пользователям продукта.',
    voiceInstructions: '',
    settings: {},
    createdAt: '2026-07-20T10:00:00.000Z',
    updatedAt: '2026-07-21T10:00:00.000Z',
    membershipId: '00000000-0000-4000-8000-000000000411',
    membershipStatus: 'ACTIVE',
    membershipVersion: 1,
    roleKeys: ['PROJECT_ADMIN'],
    effectivePermissionCodes: permissions,
  }
}

function projectSettings() {
  const settings: Record<string, unknown> = { ...projectContext([]) }
  for (const membershipField of [
    'membershipId',
    'membershipStatus',
    'membershipVersion',
    'roleKeys',
    'effectivePermissionCodes',
  ]) {
    delete settings[membershipField]
  }
  return settings
}

async function installFixtures(page: Page, options: FixtureOptions) {
  const policyUpdates: unknown[] = []
  const unhandledRequests: string[] = []
  let policy = {
    projectId,
    mode: 'OPTIONAL',
    version: 7,
    updatedAt: '2026-07-21T10:00:00.000Z',
  }
  let policyReads = 0
  let logoutCalls = 0

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()

    if (method === 'POST' && path === '/api/v1/auth/login') {
      return json(route, {
        kind: 'AUTHENTICATED',
        tokenType: 'Bearer',
        accessToken: 'cms_access_project_security',
        expiresIn: 900,
        refreshExpiresIn: 3600,
        user: {
          id: '00000000-0000-4000-8000-000000000401',
          email: 'security@example.com',
          displayName: 'Security operator',
        },
      })
    }
    if (method === 'POST' && path === '/api/v1/auth/refresh') {
      return json(
        route,
        {
          error: {
            code: 'AUTHENTICATION_FAILED',
            message: 'Authentication failed',
          },
        },
        401,
      )
    }
    if (method === 'GET' && path === '/api/v1/auth/me') {
      return json(route, {
        user: {
          id: '00000000-0000-4000-8000-000000000401',
          email: 'security@example.com',
          displayName: 'Security operator',
        },
        platformPermissionCodes: [],
        projects: [projectContext(options.permissions)],
      })
    }
    if (method === 'POST' && path === '/api/v1/auth/logout') {
      logoutCalls += 1
      return json(route, { success: true })
    }
    if (
      method === 'GET'
      && path === `/api/v1/admin/projects/${projectId}/settings`
    ) {
      return json(route, projectSettings())
    }
    if (
      method === 'GET'
      && path === `/api/v1/admin/projects/${projectId}/scenario-engine/activity-settings`
    ) {
      return json(route, {
        timezone: 'Europe/Madrid',
        visitInactivitySeconds: 1800,
        reconnectGraceSeconds: 30,
        limits: {
          visitInactivitySeconds: { min: 60, max: 86_400 },
          reconnectGraceSeconds: { min: 0, max: 300 },
        },
        semantics: {
          timezone: 'IANA_TIMEZONE',
          visitInactivitySeconds: 'NEW_VISIT_AFTER_INACTIVITY',
          reconnectGraceSeconds: 'OFFLINE_AFTER_DISCONNECT',
        },
      })
    }
    if (
      method === 'GET'
      && path === `/api/v1/admin/projects/${projectId}/security/mfa-policy`
    ) {
      policyReads += 1
      return json(route, policy)
    }
    if (
      method === 'PATCH'
      && path === `/api/v1/admin/projects/${projectId}/security/mfa-policy`
    ) {
      const body = request.postDataJSON()
      policyUpdates.push(body)
      if (options.stepUpOnUpdate) {
        return json(
          route,
          {
            error: {
              code: 'REAUTHENTICATION_REQUIRED',
              message: 'Fresh strong authentication is required',
              requestId: 'mfa-policy-step-up',
            },
          },
          428,
        )
      }
      policy = {
        ...policy,
        mode: (body as { mode: 'OPTIONAL' | 'REQUIRED' }).mode,
        version: policy.version + 1,
        updatedAt: '2026-07-22T09:00:00.000Z',
      }
      return json(route, policy)
    }

    unhandledRequests.push(`${method} ${path}`)
    return json(
      route,
      {
        error: {
          code: 'UNHANDLED_FIXTURE',
          message: `${method} ${path}`,
        },
      },
      501,
    )
  })

  return {
    policyUpdates,
    unhandledRequests,
    policyReads: () => policyReads,
    logoutCalls: () => logoutCalls,
  }
}

async function loginAndOpenProject(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('security@example.com')
  await page
    .getByLabel('Пароль или секрет первоначального доступа')
    .fill('a permanent passphrase')
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page).toHaveURL(/\/overview$/)
  await page.getByRole('link', { name: 'Проект' }).click()
  await expect(page).toHaveURL(/\/project$/)
  await expect(
    page.getByRole('heading', { name: 'Многофакторная аутентификация' }),
  ).toBeVisible()
}

test('project.settings.read exposes the MFA policy as read-only', async ({ page }) => {
  const fixture = await installFixtures(page, {
    permissions: ['project.settings.read'],
  })

  await loginAndOpenProject(page)

  await expect(page.getByText('Необязательная MFA', { exact: true })).toBeVisible()
  await expect(page.getByTestId('mfa-policy-edit')).toHaveCount(0)
  await expect(page.getByTestId('mfa-policy-form')).toHaveCount(0)
  expect(fixture.policyReads()).toBe(1)
  expect(fixture.policyUpdates).toEqual([])
  expect(fixture.unhandledRequests).toEqual([])
})

test('project.settings.write sends mode, expectedVersion and audit reason', async ({ page }) => {
  const fixture = await installFixtures(page, {
    permissions: ['project.settings.read', 'project.settings.write'],
  })

  await loginAndOpenProject(page)
  await page.getByTestId('mfa-policy-edit').click()
  const form = page.getByTestId('mfa-policy-form')
  await form.getByLabel('Режим').selectOption('REQUIRED')
  await form
    .getByLabel('Причина изменения')
    .fill('Требование политики безопасности поддержки')
  await form.getByRole('button', { name: 'Сохранить политику' }).click()

  await expect(page.getByText('Политика MFA обновлена.')).toBeVisible()
  await expect(page.getByText('Обязательная MFA', { exact: true })).toBeVisible()
  expect(fixture.policyUpdates).toEqual([
    {
      mode: 'REQUIRED',
      expectedVersion: 7,
      reason: 'Требование политики безопасности поддержки',
    },
  ])
  expect(fixture.unhandledRequests).toEqual([])
})

test('428 exposes re-login and never automatically replays the policy mutation', async ({ page }) => {
  const fixture = await installFixtures(page, {
    permissions: ['project.settings.read', 'project.settings.write'],
    stepUpOnUpdate: true,
  })

  await loginAndOpenProject(page)
  await page.getByTestId('mfa-policy-edit').click()
  const form = page.getByTestId('mfa-policy-form')
  await form.getByLabel('Режим').selectOption('REQUIRED')
  await form
    .getByLabel('Причина изменения')
    .fill('Требование политики безопасности поддержки')
  await form.getByRole('button', { name: 'Сохранить политику' }).click()

  await expect(page.getByRole('alert')).toContainText(
    'Для изменения политики нужен свежий вход с passkey. Изменение не было повторено.',
  )
  const reauthenticate = page.getByTestId('mfa-policy-reauthenticate')
  await expect(reauthenticate).toBeVisible()
  await page.waitForTimeout(300)
  expect(fixture.policyUpdates).toHaveLength(1)

  await reauthenticate.click()
  await expect(page).toHaveURL(/\/login$/)
  expect(fixture.logoutCalls()).toBe(1)
  expect(fixture.policyUpdates).toHaveLength(1)
  expect(fixture.unhandledRequests).toEqual([])
})
