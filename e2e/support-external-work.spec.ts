import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test("admin verifies connection and completes the versioned mapping evidence loop", async ({
  page,
}) => {
  await login(page);
  await page.goto("/support/settings/integrations");

  await expect(
    page.getByRole("heading", { level: 1, name: "Интеграции External Work" }),
  ).toBeVisible();
  await expect(page.getByText("JSM · Support cloud", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("HelpDesk · Tier 2", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Требуется повторный вход")).toBeVisible();

  await page.getByRole("button", { name: "Проверить connection" }).click();
  await expect(page.getByText(/Проверка connection подтверждена сервером/)).toBeVisible();

  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await expect(page.getByText(/Пройдено · 1 правил/)).toBeVisible();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText(/Schema и destination подтверждены сервером/)).toBeVisible();
  await page.getByRole("button", { name: "Показать diff" }).click();
  await expect(page.getByText(/Draft #/).last()).toBeVisible();

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    accessibility.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});

test("operator reconstructs compatibility and UNKNOWN command causality without duplicate create", async ({
  page,
}) => {
  await login(page);
  await page.goto("/support/external-work");

  await expect(
    page.getByRole("heading", { level: 1, name: "External Work" }),
  ).toBeVisible();
  await page.getByTestId("external-item").first().click();
  await expect(page.getByText("Correlation", { exact: true })).toBeVisible();
  await expect(page.getByText("Причинная история")).toBeVisible();
  await expect(page.getByText(/содержимое недоступно/i)).toBeVisible();

  await page.getByRole("button", { name: "Связанные объекты" }).click();
  await page.getByTestId("external-item").first().click();
  await expect(page.getByText("Результат неизвестен")).toBeVisible();
  await page.getByRole("button", { name: "Проверить доказательства" }).click();
  await expect(page.getByText(/Recovery-команда подтверждена/)).toBeVisible();
  await expect(page.getByText("Создано")).toBeVisible();

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    accessibility.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});

test("route-owned selection supports keyboard, Back and tablet geometry", async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/support/external-work?mode=linked");

  const item = page.getByTestId("external-item").first();
  await item.focus();
  await item.press("Enter");
  await expect(page).toHaveURL(/mode=linked.*itemId=/);
  await expect(page.getByText("Correlation", { exact: true })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/mode=linked/);
  await expect(page).not.toHaveURL(/itemId=/);
  await expect(item).toBeVisible();

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
});
