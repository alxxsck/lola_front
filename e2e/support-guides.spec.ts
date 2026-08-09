import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function login(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Продолжить' }).click()
}

async function expectAccessibleDocument(page: Page): Promise<void> {
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()

  expect(
    accessibility.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    ),
  ).toEqual([])
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll')
}

test('new operator finds the shift guide and navigates it by headings', async ({ page }) => {
  await login(page)
  await page.goto('/docs')

  await page.getByRole('link', { name: /Работа оператора поддержки/ }).click()
  await expect(page).toHaveURL(/\/docs\/support-operator$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Работа оператора поддержки' })).toBeVisible()
  await expect(page.locator('.guide-screen')).toHaveAttribute('aria-label', 'Рабочее место оператора')

  await page.getByRole('link', { name: 'Как ответить и не потерять черновик', exact: true }).click()
  expect(await page.evaluate(() => decodeURIComponent(window.location.hash))).toBe(
    '#как-ответить-и-не-потерять-черновик',
  )
  await expect(page.getByRole('heading', { name: 'Как ответить и не потерять черновик' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Словарь оператора' })).toBeAttached()

  await expectAccessibleDocument(page)
})

test('lead guide explains control, access and safe launch in one index', async ({ page }) => {
  await login(page)
  await page.goto('/docs/support-lead')

  await expect(page.getByRole('heading', { level: 1, name: 'Работа лида поддержки' })).toBeVisible()
  await expect(page.locator('.guide-screen')).toHaveAttribute('aria-label', 'Панель лида')
  await page.getByRole('link', { name: 'Запуск и возврат', exact: true }).click()
  expect(await page.evaluate(() => decodeURIComponent(window.location.hash))).toBe(
    '#запуск-и-возврат',
  )
  await expect(page.getByRole('heading', { name: 'Запуск и возврат' })).toBeVisible()
  await expect(page.getByText('Права выдаются отдельно')).toBeAttached()
  await expect(page.getByRole('heading', { name: 'Словарь лида' })).toBeAttached()

  await expectAccessibleDocument(page)
})
