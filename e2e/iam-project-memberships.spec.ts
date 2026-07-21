import { expect, test, type Page, type Route } from '@playwright/test'

test.skip(
  process.env.VITE_DATA_MODE !== 'api',
  'IAM network fixtures require the API-mode frontend adapter',
)

const operatorId = '00000000-0000-4000-8000-000000000001'
const targetId = '00000000-0000-4000-8000-000000000002'
const addedId = '00000000-0000-4000-8000-000000000003'
const projectId = '00000000-0000-4000-8000-000000000010'
const targetMembershipId = '00000000-0000-4000-8000-000000000020'
const addedMembershipId = '00000000-0000-4000-8000-000000000021'
const roleId = '00000000-0000-4000-8000-000000000030'

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

function projectContext() {
  return {
    id: projectId,
    name: 'Project One',
    slug: 'project-one',
    status: 'ACTIVE',
    publicKey: 'public-key',
    serverKeyPrefix: 'server-prefix',
    organizationId: '00000000-0000-4000-8000-000000000100',
    defaultLocale: 'ru',
    supportedLocales: ['ru'],
    assistantName: 'Lola',
    systemPrompt: '',
    voiceInstructions: '',
    settings: {},
    createdAt: '2026-07-20T10:00:00.000Z',
    updatedAt: '2026-07-21T10:00:00.000Z',
    membershipId: '00000000-0000-4000-8000-000000000011',
    membershipStatus: 'ACTIVE',
    membershipVersion: 2,
    roleKeys: ['PROJECT_OWNER'],
    effectivePermissionCodes: [
      'project.members.read',
      'project.members.manage',
    ],
  }
}

function membership(
  id: string,
  cmsUserId: string,
  displayName: string,
  status: 'ACTIVE' | 'REMOVED' = 'ACTIVE',
  version = 3,
) {
  return {
    id,
    projectId,
    cmsUser: {
      id: cmsUserId,
      email: `${cmsUserId === targetId ? 'anna' : 'boris'}@example.com`,
      givenName: displayName.split(' ')[0],
      familyName: displayName.split(' ')[1],
      displayName,
      status: 'ACTIVE',
      emailVerified: true,
      lastLoginAt: '2026-07-21T10:00:00.000Z',
    },
    status,
    version,
    roles: [
      {
        id: roleId,
        key: 'PROJECT_ADMIN',
        name: 'Project Admin',
        managed: true,
        version: 1,
      },
    ],
    effectivePermissionCodes:
      status === 'ACTIVE' ? ['project.members.read'] : [],
    createdAt: '2026-07-20T10:00:00.000Z',
    updatedAt: '2026-07-21T10:00:00.000Z',
    removedAt: status === 'REMOVED' ? '2026-07-21T11:00:00.000Z' : null,
  }
}

async function installFixtures(page: Page) {
  const createBodies: unknown[] = []
  const updateBodies: unknown[] = []
  const removeBodies: unknown[] = []
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (request.method() === 'POST' && path === '/api/v1/auth/login') {
      return json(route, {
        kind: 'AUTHENTICATED',
        tokenType: 'Bearer',
        accessToken: 'cms_access-token',
        refreshToken: 'lrf_refresh-token',
        expiresIn: 900,
        refreshExpiresIn: 3600,
        user: {
          id: operatorId,
          email: 'operator@example.com',
          displayName: 'Оператор',
        },
      })
    }
    if (request.method() === 'GET' && path === '/api/v1/auth/me') {
      return json(route, {
        user: {
          id: operatorId,
          email: 'operator@example.com',
          displayName: 'Оператор',
        },
        platformPermissionCodes: [
          'platform.memberships.read',
          'platform.memberships.manage',
        ],
        projects: [projectContext()],
      })
    }
    if (
      request.method() === 'GET' &&
      path === `/api/v1/admin/projects/${projectId}/roles`
    ) {
      return json(route, {
        items: [
          {
            id: roleId,
            key: 'PROJECT_ADMIN',
            name: 'Project Admin',
            description: 'Manages the Project',
            managed: true,
            permissionCodes: ['project.members.read'],
            version: 1,
          },
        ],
      })
    }
    if (
      request.method() === 'GET' &&
      path === `/api/v1/admin/projects/${projectId}/memberships`
    ) {
      return json(route, {
        items: [membership(targetMembershipId, targetId, 'Анна Орлова')],
        nextCursor: null,
      })
    }
    if (
      request.method() === 'POST' &&
      path === `/api/v1/admin/projects/${projectId}/memberships`
    ) {
      createBodies.push(request.postDataJSON())
      return json(
        route,
        membership(addedMembershipId, addedId, 'Борис Соколов', 'ACTIVE', 1),
        201,
      )
    }
    if (
      request.method() === 'PATCH' &&
      path ===
        `/api/v1/admin/projects/${projectId}/memberships/${targetMembershipId}`
    ) {
      updateBodies.push(request.postDataJSON())
      return json(
        route,
        membership(targetMembershipId, targetId, 'Анна Орлова', 'ACTIVE', 4),
      )
    }
    if (
      request.method() === 'POST' &&
      path ===
        `/api/v1/admin/projects/${projectId}/memberships/${targetMembershipId}/remove`
    ) {
      removeBodies.push(request.postDataJSON())
      return json(
        route,
        membership(targetMembershipId, targetId, 'Анна Орлова', 'REMOVED', 5),
      )
    }
    return json(
      route,
      {
        error: {
          code: 'UNHANDLED_FIXTURE',
          message: `${request.method()} ${path}`,
        },
      },
      501,
    )
  })
  return { createBodies, updateBodies, removeBodies }
}

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('operator@example.com')
  await page
    .getByLabel('Пароль или секрет первоначального доступа')
    .fill('a permanent passphrase')
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page).toHaveURL(/\/overview$/)
}

test('Platform Operator adds, updates and removes Project Memberships through versioned contracts', async ({
  page,
}) => {
  const fixture = await installFixtures(page)
  await login(page)
  await page.getByRole('link', { name: 'Администраторы' }).click()
  await expect(page).toHaveURL(/\/project\/memberships$/)
  await expect(
    page.getByRole('heading', { name: 'Администраторы проекта' }),
  ).toBeVisible()
  await expect(page.getByText('Анна Орлова')).toBeVisible()

  await page.getByRole('button', { name: 'Добавить' }).click()
  const createDialog = page.getByRole('dialog', {
    name: 'Добавить администратора',
  })
  await createDialog.getByLabel('ID существующего CMS User').fill(addedId)
  await createDialog.getByText('Выберите роли').click()
  await page.getByRole('option', { name: 'Project Admin' }).click()
  await createDialog
    .getByLabel('Причина для security audit')
    .fill('Назначение подтверждено владельцем')
  await createDialog.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByText('Борис Соколов')).toBeVisible()

  await page.getByRole('button', { name: 'Изменить роли Анна Орлова' }).click()
  const updateDialog = page.getByRole('dialog', { name: 'Изменить роли' })
  await updateDialog
    .getByLabel('Причина для security audit')
    .fill('Роли проверены владельцем проекта')
  await updateDialog.getByRole('button', { name: 'Сохранить' }).click()

  await page.getByRole('button', { name: 'Удалить доступ Анна Орлова' }).click()
  const removeDialog = page.getByRole('dialog', { name: 'Удалить доступ' })
  await removeDialog
    .getByLabel('Причина для security audit')
    .fill('Доступ более не требуется команде')
  await removeDialog.getByRole('button', { name: 'Удалить доступ' }).click()
  await expect(page.getByText('Удалён')).toBeVisible()

  expect(fixture.createBodies).toEqual([
    {
      cmsUserId: addedId,
      roleIds: [roleId],
      reason: 'Назначение подтверждено владельцем',
    },
  ])
  expect(fixture.updateBodies).toEqual([
    {
      version: 3,
      roleIds: [roleId],
      reason: 'Роли проверены владельцем проекта',
    },
  ])
  expect(fixture.removeBodies).toEqual([
    {
      version: 4,
      reason: 'Доступ более не требуется команде',
    },
  ])
})
