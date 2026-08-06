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
