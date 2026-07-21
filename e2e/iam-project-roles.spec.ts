import { expect, test, type Page, type Route } from '@playwright/test'

test.skip(
  process.env.VITE_DATA_MODE !== 'api',
  'IAM network fixtures require the API-mode frontend adapter',
)

const projectId = '00000000-0000-4000-8000-000000000010'
const customRoleId = '00000000-0000-4000-8000-000000000020'
const managedRoleId = '00000000-0000-4000-8000-000000000030'

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
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
    effectivePermissionCodes: ['project.roles.read', 'project.roles.manage'],
  }
}

function role(
  id: string,
  key: string,
  name: string,
  managed: boolean,
  version = 3,
  assignedMembershipCount = managed ? 1 : 2,
) {
  return {
    id,
    projectId,
    key,
    name,
    description: `${name} description`,
    managed,
    status: 'ACTIVE',
    permissionCodes: ['project.roles.read'],
    assignedMembershipCount,
    assignedMembershipCountCapped: false,
    version,
    createdAt: '2026-07-20T10:00:00.000Z',
    updatedAt: '2026-07-21T10:00:00.000Z',
  }
}

async function installFixtures(page: Page) {
  const updateBodies: unknown[] = []
  const reassignBodies: unknown[] = []
  const archiveBodies: unknown[] = []
  let currentCustom = role(customRoleId, 'SUPPORT_READER', 'Support reader', false)
  let updateConflicted = false

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
        user: { id: 'operator-1', email: 'operator@example.com', displayName: 'Оператор' },
      })
    }
    if (request.method() === 'GET' && path === '/api/v1/auth/me') {
      return json(route, {
        user: { id: 'operator-1', email: 'operator@example.com', displayName: 'Оператор' },
        platformPermissionCodes: [],
        projects: [projectContext()],
      })
    }
    if (request.method() === 'GET' && path === `/api/v1/admin/projects/${projectId}/permissions`) {
      return json(route, {
        groups: [
          {
            scope: 'PROJECT',
            category: 'roles',
            risk: 'HIGH',
            permissions: [
              {
                code: 'project.roles.read',
                scope: 'PROJECT',
                category: 'roles',
                risk: 'HIGH',
                label: 'Read roles',
                description: 'Read role library',
                labelTranslations: {},
                descriptionTranslations: {},
              },
            ],
          },
        ],
      })
    }
    if (request.method() === 'GET' && path === `/api/v1/admin/projects/${projectId}/roles`) {
      return json(route, {
        items: [
          role(managedRoleId, 'PROJECT_ADMIN', 'Project Admin', true, 1),
          currentCustom,
        ],
      })
    }
    if (
      request.method() === 'GET' &&
      path === `/api/v1/admin/projects/${projectId}/roles/${customRoleId}`
    ) {
      return json(route, currentCustom)
    }
    if (
      request.method() === 'PATCH' &&
      path === `/api/v1/admin/projects/${projectId}/roles/${customRoleId}`
    ) {
      updateBodies.push(request.postDataJSON())
      updateConflicted = true
      currentCustom = { ...currentCustom, version: 4 }
      return json(
        route,
        { error: { code: 'VERSION_CONFLICT', message: 'Role changed', requestId: 'request-1' } },
        409,
      )
    }
    if (
      request.method() === 'POST' &&
      path === `/api/v1/admin/projects/${projectId}/roles/${customRoleId}/reassign`
    ) {
      reassignBodies.push(request.postDataJSON())
      currentCustom = { ...currentCustom, version: 5, assignedMembershipCount: 0 }
      return json(route, currentCustom)
    }
    if (
      request.method() === 'POST' &&
      path === `/api/v1/admin/projects/${projectId}/roles/${customRoleId}/archive`
    ) {
      archiveBodies.push(request.postDataJSON())
      currentCustom = { ...currentCustom, version: 6, status: 'ARCHIVED' }
      return json(route, currentCustom)
    }
    return json(route, { error: { code: 'UNHANDLED_FIXTURE', message: `${request.method()} ${path}` } }, 501)
  })

  return { updateBodies, reassignBodies, archiveBodies, updateConflicted: () => updateConflicted }
}

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('operator@example.com')
  await page.getByLabel('Пароль или секрет первоначального доступа').fill('a permanent passphrase')
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page).toHaveURL(/\/overview$/)
}

test('Project Role manager confirms impact, never replays a conflict, reassigns and archives', async ({
  page,
}) => {
  const fixture = await installFixtures(page)
  await login(page)
  await page.getByRole('link', { name: 'Роли' }).click()
  await expect(page).toHaveURL(/\/project\/roles$/)
  await expect(page.getByRole('heading', { name: 'Роли проекта' })).toBeVisible()
  await expect(page.getByText('Support reader', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Изменить' }).click()
  const updateDialog = page.getByRole('dialog', { name: 'Изменить роль' })
  await updateDialog.getByLabel('Причина').fill('Approved role update')
  await updateDialog.getByTestId('impact-confirmation').check()
  await updateDialog.getByRole('button', { name: 'Подтвердить' }).click()
  await expect(page.getByText(/действие не повторялось/i)).toBeVisible()
  expect(fixture.updateBodies).toHaveLength(1)
  expect(fixture.updateConflicted()).toBe(true)
  await updateDialog.getByRole('button', { name: 'Отмена' }).click()

  await page.getByRole('button', { name: 'Переназначить' }).click()
  const reassignDialog = page.getByRole('dialog', { name: 'Переназначить участников' })
  await reassignDialog.getByTestId('replacement-roles').click()
  await page.getByRole('option', { name: 'Project Admin' }).click()
  await page.keyboard.press('Escape')
  await reassignDialog.getByTestId('impact-confirmation').check()
  await reassignDialog.getByLabel('Причина').fill('Approved role reassignment')
  await reassignDialog.getByRole('button', { name: 'Подтвердить' }).click()

  await page.getByRole('button', { name: 'Архивировать' }).click()
  const archiveDialog = page.getByRole('dialog', { name: 'Архивировать роль' })
  await archiveDialog.getByTestId('impact-confirmation').check()
  await archiveDialog.getByLabel('Причина').fill('Approved role retirement')
  await archiveDialog.getByRole('button', { name: 'Подтвердить' }).click()
  await expect(page.getByText('Support reader', { exact: true })).toHaveCount(0)

  expect(fixture.reassignBodies).toEqual([
    {
      version: 4,
      expectedAssignedMembershipCount: 2,
      expectedAssignedMembershipCountCapped: false,
      replacementRoleIds: [managedRoleId],
      reason: 'Approved role reassignment',
    },
  ])
  expect(fixture.archiveBodies).toEqual([
    {
      version: 5,
      expectedAssignedMembershipCount: 0,
      expectedAssignedMembershipCountCapped: false,
      reason: 'Approved role retirement',
    },
  ])
})
