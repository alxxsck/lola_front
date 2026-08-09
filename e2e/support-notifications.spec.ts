import { expect, test, type Page } from "@playwright/test";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test("connects the browser without collapsing permission, preference and device state", async ({
  page,
}, testInfo) => {
  await login(page);
  await page.goto("/support/settings/notifications");
  await expect(
    page.getByRole("heading", { level: 1, name: "Уведомления поддержки" }),
  ).toBeVisible();
  await expect(
    page.getByText("Разрешение браузера", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Подписка этого браузера", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Регистрация на сервере", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(2);
  await expect(
    page.getByText("Все новые обращения", { exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Подключить этот браузер" }).click();
  await expect(
    page.getByText("Этот браузер подключён к уведомлениям поддержки."),
  ).toBeVisible();
  await expect(page.getByText("Подтверждена", { exact: true })).toBeVisible();
  await expect(page.getByText("Этот браузер", { exact: true })).toBeVisible();

  const attention = page.getByRole("switch", {
    name: /Обращения, требующие внимания/,
  });
  await attention.click();
  await expect(attention).toBeChecked();
  await expect(page.getByText("Доставка активна").first()).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({
    path: testInfo.outputPath("support-notifications-desktop.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Уведомления поддержки" }),
  ).toBeVisible();
  await expect(page.getByText("Подтверждена", { exact: true })).toBeVisible();
  await expect(page.getByText("Этот браузер", { exact: true })).toBeVisible();
  await page.waitForTimeout(250);
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
  await page.screenshot({
    path: testInfo.outputPath("support-notifications-mobile.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Отключить", exact: true }).click();
  await expect(
    page.getByText("Устройство отключено.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Не создана", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Не подтверждена", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Активных: 0", { exact: true })).toBeVisible();

  await page
    .getByRole("button", { name: "Подключить этот браузер", exact: true })
    .click();
  await expect(page.getByText("Подтверждена", { exact: true })).toBeVisible();
  await expect(page.getByText("Этот браузер", { exact: true })).toBeVisible();
  await expect(page.getByText("Активных: 1", { exact: true })).toBeVisible();
});

test("resolves a single-use notification capability into the exact Case route", async ({
  page,
}) => {
  await login(page);
  await page.goto(`/support/notifications/open#capability=${"A".repeat(43)}`);
  await expect(page).toHaveURL(/\/support\/inbox\/cases\/case-demo-deposit/);
});

test("scrubs a capability before an expired session is redirected to login", async ({
  page,
}) => {
  const capability = "B".repeat(43);
  await page.goto(`/support/notifications/open#capability=${capability}`);

  await expect(page).toHaveURL(/\/login\?redirect=/);
  expect(page.url()).not.toContain(capability);
  expect(page.url()).not.toContain("capability");

  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/support\/inbox\/cases\/case-demo-deposit/);
});
