import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

test.skip(process.env.VITE_DATA_MODE !== 'api', 'IAM network fixtures require the API-mode frontend adapter')

const operatorId = '00000000-0000-4000-8000-000000000001'
const targetId = '00000000-0000-4000-8000-000000000002'
const initialAccessSecret = 'lia_one-time-browser-secret'

function json(route: Route, body: unknown, status = 200, headers?: Record<string, string>) {
  return route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) })
}

function summary(status: 'ACTIVE' | 'PENDING_SETUP' = 'ACTIVE', version = 3) {
  return {
    id: targetId,
    email: 'anna@example.com',
    givenName: 'Анна',
    familyName: 'Орлова',
    displayName: 'Анна Орлова',
    status,
    emailVerified: true,
    projectCount: 2,
    lastLoginAt: '2026-07-21T10:00:00.000Z',
    version,
    createdAt: '2026-07-20T10:00:00.000Z',
    updatedAt: '2026-07-21T10:00:00.000Z',
  }
}

async function installFixtures(page: Page) {
  let reset = false
  const resetBodies: unknown[] = []
  const platformRoleBodies: unknown[] = []
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'POST' && path === '/api/v1/auth/login') {
      return json(route, {
        kind: 'AUTHENTICATED',
        tokenType: 'Bearer',
        accessToken: 'cms_access-token',
        expiresIn: 900,
        refreshExpiresIn: 3600,
        user: { id: operatorId, email: 'operator@example.com', displayName: 'Оператор' },
      })
    }
    if (request.method() === 'GET' && path === '/api/v1/auth/me') {
      return json(route, {
        user: { id: operatorId, email: 'operator@example.com', displayName: 'Оператор' },
        platformPermissionCodes: [
          'platform.cms_users.read',
          'platform.cms_users.update',
          'platform.cms_users.deactivate',
          'platform.cms_users.reactivate',
          'platform.cms_users.reset_credentials',
          'platform.roles.read',
          'platform.roles.manage',
        ],
        projects: [],
      })
    }
    if (request.method() === 'GET' && path === '/api/v1/admin/platform/cms-users') {
      return json(route, { items: [summary(reset ? 'PENDING_SETUP' : 'ACTIVE', reset ? 4 : 3)], nextCursor: null })
    }
    if (request.method() === 'GET' && path === `/api/v1/admin/platform/cms-users/${targetId}`) {
      return json(route, {
        ...summary(reset ? 'PENDING_SETUP' : 'ACTIVE', reset ? 4 : 3),
        platformRoleKeys: [],
        platformPermissionCodes: [],
        deactivatedAt: null,
        deactivationReason: null,
      })
    }
    if (request.method() === 'GET' && path === '/api/v1/admin/platform/roles') {
      return json(route, {
        items: [{
          id: '00000000-0000-4000-8000-000000000010',
          key: 'PLATFORM_OPERATOR',
          name: 'Platform operator',
          description: 'Control plane access',
          status: 'ACTIVE',
          managed: true,
          version: 1,
          permissionCodes: ['platform.cms_users.read'],
          assignedUserCount: 2,
          assignedUserCountCapped: false,
          createdAt: '2026-07-20T10:00:00.000Z',
          updatedAt: '2026-07-20T10:00:00.000Z',
        }],
      })
    }
    if (
      request.method() === 'GET'
      && path === `/api/v1/admin/platform/cms-users/${targetId}/platform-roles`
    ) {
      return json(route, {
        cmsUserId: targetId,
        version: 3,
        roleIds: ['00000000-0000-4000-8000-000000000010'],
        roleKeys: ['PLATFORM_OPERATOR'],
        effectivePermissionCodes: ['platform.cms_users.read'],
      })
    }
    if (
      request.method() === 'PUT'
      && path === `/api/v1/admin/platform/cms-users/${targetId}/platform-roles`
    ) {
      platformRoleBodies.push(request.postDataJSON())
      return json(route, {
        error: {
          code: 'REAUTHENTICATION_REQUIRED',
          message: 'internal message must not be rendered',
        },
      }, 428)
    }
    if (
      request.method() === 'POST' &&
      path === `/api/v1/admin/platform/cms-users/${targetId}/initial-access/reset`
    ) {
      resetBodies.push(request.postDataJSON())
      reset = true
      return json(route, {
        cmsUserId: targetId,
        status: 'PENDING_SETUP',
        version: 4,
        initialAccessSecret,
        expiresAt: '2026-07-22T10:00:00.000Z',
      }, 200, { 'Cache-Control': 'no-store, no-transform' })
    }
    return json(route, { error: { code: 'UNHANDLED_FIXTURE', message: `${request.method()} ${path}` } }, 501)
  })
  return { resetBodies, platformRoleBodies }
}

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('operator@example.com')
  await page.getByLabel('Пароль или секрет первоначального доступа').fill('a permanent passphrase')
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page).toHaveURL(/\/platform\/cms-users$/)
}

test('Platform Operator resets access and sees the Initial Access Secret exactly once', async ({ page, context }) => {
  const fixture = await installFixtures(page)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await login(page)
  await page.getByRole('link', { name: 'CMS Users' }).click()
  await expect(page).toHaveURL(/\/platform\/cms-users$/)

  await expect(page.getByRole('heading', { name: 'CMS Users' })).toBeVisible()
  await page.getByText('Анна Орлова').click()
  await page.getByRole('button', { name: 'Сбросить доступ' }).click()
  const reasonDialog = page.getByRole('dialog', { name: 'Сбросить учётные данные?' })
  await reasonDialog.getByLabel('Причина').fill('Подтверждено службой безопасности')
  await reasonDialog.getByRole('button', { name: 'Сбросить доступ' }).click()

  const secretDialog = page.getByRole('dialog', { name: 'Секрет первоначального доступа' })
  await expect(secretDialog.getByText(initialAccessSecret)).toBeVisible()
  await secretDialog.getByRole('button', { name: 'Скопировать' }).click()
  await expect(secretDialog.getByText('Секрет скопирован.')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(initialAccessSecret)
  await secretDialog.getByLabel('Я сохранил секрет и понимаю, что повторно открыть его нельзя.').check()
  await secretDialog.getByRole('button', { name: 'Секрет сохранён' }).click()

  await expect(secretDialog).toBeHidden()
  expect(fixture.resetBodies).toEqual([{ version: 3, reason: 'Подтверждено службой безопасности' }])
  const browserState = await page.evaluate(() => ({
    url: location.href,
    localStorage: Object.values(localStorage),
    sessionStorage: Object.values(sessionStorage),
    html: document.documentElement.innerHTML,
  }))
  expect(JSON.stringify(browserState)).not.toContain(initialAccessSecret)

  // Contrast is tracked separately as shared-theme P2 debt; keep this flow strict
  // for semantic and structural accessibility regressions.
  const accessibility = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze()
  expect(accessibility.violations).toEqual([])
})

test('platform-role mutation requires explicit retry after fresh authentication', async ({ page }) => {
  const fixture = await installFixtures(page)
  await login(page)
  await page.getByRole('link', { name: 'CMS Users' }).click()
  await page.getByText('Анна Орлова').click()
  await page.getByRole('button', { name: 'Изменить роли' }).click()
  await page.getByLabel('Причина изменения').fill('Подтверждено службой безопасности')
  await page.getByRole('button', { name: 'Сохранить роли' }).click()

  await expect(page.getByText('Требуется свежий вход.')).toBeVisible()
  await expect(page.getByText('internal message must not be rendered')).toHaveCount(0)
  expect(fixture.platformRoleBodies).toEqual([{
    version: 3,
    roleIds: ['00000000-0000-4000-8000-000000000010'],
    reason: 'Подтверждено службой безопасности',
  }])
})
