import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("creates a Saved Report-backed Dashboard through the public UI", async ({
  page,
}) => {
  await page.goto("/reports");
  await page.getByRole("tab", { name: /Сохранённые отчёты/ }).click();
  await page
    .getByRole("button", { name: /Активные пользователи/ })
    .first()
    .click();

  await expect(
    page.getByRole("heading", { name: "Активные пользователи" }),
  ).toBeVisible();
  await expect(page.getByText("Точные данные")).toBeVisible();
  await page.getByRole("button", { name: "Добавить в дашборд" }).click();

  await expect(
    page.getByRole("heading", { name: "Новый дашборд" }),
  ).toBeVisible();
  await expect(
    page.getByText("Активные пользователи", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Опубликовать" }).click();

  await expect(page).toHaveURL(/\/dashboards\/dashboard-draft-\d+$/);
  await expect(page.locator("[data-dashboard-widget]")).toHaveCount(1);
  await expect(page.getByText("12 840 активных пользователей")).toBeVisible();
});

test("keeps Reporting pages responsive and free of serious accessibility violations", async ({
  page,
}, testInfo) => {
  const routes = [
    "/reports",
    "/reports/report-active-users",
    "/dashboards/dashboard-product-pulse",
  ];

  for (const route of routes) {
    await page.goto(route);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);

    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      accessibility.violations.filter((violation) =>
        ["critical", "serious"].includes(violation.impact ?? ""),
      ),
      `${testInfo.project.name}: ${route}`,
    ).toEqual([]);
  }

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/reports/report-active-users");
  await page.getByRole("heading", { level: 1 }).waitFor();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});
