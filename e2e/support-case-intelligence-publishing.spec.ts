import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto("/support/settings/case-intelligence/evaluation");
  await expect(page.getByRole("heading", { level: 1, name: "Качество и публикация" })).toBeVisible();
});

test("compares a candidate, exposes every admission gate and publishes atomically", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Кандидат готов к публикации" })).toBeVisible();
  for (const gate of ["Безопасность", "Качество", "Калибровка", "Расходы", "Нагрузка"])
    await expect(page.locator(".gate").filter({ hasText: gate })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Кандидат и рабочая версия" })).toBeVisible();
  await expect(page.getByText("Безопасность по языкам и каналам")).toBeVisible();
  await expect(page.getByText("Риск ответственной игры").first()).toBeVisible();
  await expect(page.getByText("Калибровка", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("Примеры, где решения различаются")).toBeVisible();

  await page.getByRole("button", { name: "Запустить проверку" }).click();
  await expect(page.getByText("Проверка завершена. Результаты получены с сервера.")).toBeVisible();
  await page.getByRole("button", { name: "Сделать рабочей" }).click();
  await expect(page.getByText("Новая рабочая версия подтверждена сервером.")).toBeVisible();
  await expect(page.locator(".p-message-success")).not.toHaveClass(/p-message-enter-active/);

  const geometry = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(geometry.scroll).toBe(geometry.client);
  const a11y = await new AxeBuilder({ page }).include(".ci-ops").analyze();
  expect(a11y.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);

  await page.evaluate(() => localStorage.setItem("retenive-theme", "dark"));
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Качество и публикация" })).toBeVisible();
  const darkA11y = await new AxeBuilder({ page }).include(".ci-ops").analyze();
  expect(darkA11y.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
});

test("keeps cost, decision and immutable version detail usable through mobile history", async ({ page }) => {
  await page.getByRole("link", { name: "Расходы", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Расходы и путь обращения" })).toBeVisible();
  await expect(page.getByText("От сообщения до принятой передачи")).toBeVisible();
  await expect(page.getByText("Серверный расчёт")).toBeVisible();

  await page.getByRole("link", { name: "Решения", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Журнал решений" })).toBeVisible();
  await page.locator(".decision-row").first().click();
  await expect(page).toHaveURL(/decision=decision-1048/);
  await expect(page.getByRole("heading", { name: /Создать обращение · Проблема/ })).toBeVisible();
  await expect(page.getByText("Текст сообщений, внутренние рассуждения модели и личные данные здесь не раскрываются.")).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/decision=/);

  await page.getByRole("link", { name: "Версии", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Версии" })).toBeVisible();
  await expect(page.getByText("Возврат не переписывает историю.")).toBeVisible();
  await page.getByRole("button", { name: "Вернуть эту конфигурацию" }).click();
  const dialog = page.getByRole("dialog", { name: "Вернуть проверенную конфигурацию" });
  await dialog.getByLabel("Причина возврата").fill("Возвращаем проверенную конфигурацию после сверки качества");
  await dialog.getByRole("button", { name: "Создать новую рабочую версию" }).click();
  await expect(page.getByText("Новая рабочая версия подтверждена сервером.")).toBeVisible();

  const geometry = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(geometry.scroll).toBe(geometry.client);
});
