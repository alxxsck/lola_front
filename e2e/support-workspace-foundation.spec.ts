import { expect, test, type Page } from "@playwright/test";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto("/support/inbox");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Рабочее место оператора",
    }),
  ).toBeVisible();
});

test("opens a project conversation as a deep link without horizontal overflow", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();

  await expect(page).toHaveURL(/\/support\/inbox\/conversations\/conv_3$/);
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Бонусы и программа лояльности",
    }),
  ).toBeVisible();

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    workspaceRight:
      document.querySelector(".support-workspace")?.getBoundingClientRect()
        .right ?? 0,
  }));

  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
  expect(geometry.workspaceRight).toBeLessThanOrEqual(
    geometry.clientWidth + 0.5,
  );
});

test("shows and changes only the operator's authoritative availability intent", async ({
  page,
}) => {
  const status = page.getByRole("region", { name: "Статус для новых обращений" });
  await expect(status).toBeVisible();
  await expect(status.getByText("Доступен", { exact: true }).first()).toBeVisible();
  await expect(status).toContainText("Получаете новые обращения");

  const selects = status.locator("select");
  await selects.nth(0).selectOption("AWAY");
  await expect(selects.nth(1)).toHaveValue("BREAK");
  await expect(status.locator('input[type="number"]')).toHaveValue("15");
  await status.getByRole("button", { name: "Сохранить статус" }).click();

  await expect(status.getByText("Отошёл", { exact: true }).first()).toBeVisible();
  await expect(status).toContainText("Новые обращения не назначаются");
});

test("does not substitute another conversation for an unavailable deep link", async ({
  page,
}) => {
  await page.goto("/support/inbox/conversations/conv_not_available");

  await expect(
    page.getByRole("heading", { level: 2, name: "Диалог недоступен" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Бонусы и программа лояльности",
    }),
  ).not.toBeVisible();
});

test("uses route-aware inbox and chat panes on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/support/inbox");

  await expect(
    page.getByRole("heading", { level: 2, name: "Активный диалог" }),
  ).not.toBeVisible();

  await page.getByRole("button", { name: /Бонусы и программа лояльности/ }).click();
  await expect(page).toHaveURL(/\/support\/inbox\/conversations\/conv_3$/);
  await expect(
    page.getByRole("button", { name: "Назад к списку диалогов" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Назад к списку диалогов" }).click();
  await expect(page).toHaveURL(/\/support\/inbox$/);
});

test("opens the selected conversation context in a mobile drawer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();

  await page.getByRole("button", { name: "Контекст" }).click();

  const drawer = page.getByRole("dialog", { name: "Контекст диалога" });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator("dt", { hasText: "Пользователь" })).toBeVisible();
  await expect(drawer.locator("dd", { hasText: "Пользователь" })).toBeVisible();
  await expect(drawer.getByText("user_11603", { exact: true })).toHaveCount(0);
});

test("loads the profile only from the permission-gated inspector", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();
  await page.getByRole("button", { name: "Контекст" }).click();

  const drawer = page.getByRole("dialog", { name: "Контекст диалога" });
  await expect(drawer.getByText("Marco Silva", { exact: true })).toHaveCount(0);
  await drawer.getByRole("button", { name: "Загрузить" }).click();
  await expect(drawer.getByText("Marco Silva", { exact: true })).toBeVisible();
  await expect(drawer.getByText("user_11603", { exact: true })).toHaveCount(0);
});
