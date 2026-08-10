import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto("/support/settings/sla-calendars");
  await expect(
    page.getByRole("heading", { level: 1, name: "Календарь и правила SLA" }),
  ).toBeVisible();
});

test("saves, publishes, and reconciles an SLA configuration", async ({
  page,
}) => {
  const firstResponse = page.getByRole("spinbutton", {
    name: "Первый ответ правила 1",
  });
  await firstResponse.fill("35");
  await firstResponse.press("Tab");

  await expect(
    page.getByText("Изменения только на этом устройстве", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(
    page
      .getByRole("region", { name: "Состояние SLA-конфигурации" })
      .getByText(/Черновик \d+/),
  ).toBeVisible();

  await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Опубликовать SLA-конфигурацию?" })
    .getByRole("button", { name: "Опубликовать конфигурацию" })
    .click();

  const lifecycle = page.getByRole("region", {
    name: "Состояние SLA-конфигурации",
  });
  await expect(lifecycle.getByText("Нет сохранённого черновика")).toBeVisible();
  await expect(lifecycle.getByText("Синхронизирована")).toBeVisible();
  await expect(firstResponse).toHaveValue("35 мин");
});

test("has no page overflow or critical accessibility violations", async ({
  page,
}) => {
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);

  const accessibility = await new AxeBuilder({ page })
    .include(".sla-settings-page")
    .analyze();
  expect(accessibility.violations).toEqual([]);
});
