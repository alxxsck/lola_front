import { expect, test, type Page } from "@playwright/test";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("groups Support pages and keeps the desktop rail preference", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/overview");

  const navigation = page.getByRole("navigation");
  const supportGroup = navigation.getByRole("group", { name: "Поддержка" });
  const supportRoot = supportGroup.getByRole("link", {
    name: "Поддержка",
    exact: true,
  });
  await expect(supportRoot).toBeVisible();

  const supportLinks = supportGroup.locator(
    'a[href^="/support/"], a[href="/cases/settings"]',
  );
  await expect(supportLinks).toHaveCount(8);
  await expect(supportLinks).toHaveText([
    "Поддержка",
    "Операционный обзор",
    "Настройки обращений",
    "Шаблоны ответов",
    "Уведомления",
    "Внешние задачи",
    "Интеграции",
    "Запуск и возврат",
  ]);

  await page
    .getByRole("button", { name: "Свернуть боковое меню" })
    .click();
  await expect(page.locator(".brand-copy")).not.toHaveCSS("display", "none");
  expect(
    await page
      .locator(".brand-copy")
      .evaluate((element) => getComputedStyle(element).transitionProperty),
  ).toContain("opacity");
  await expect(page.locator(".shell")).toHaveClass(
    /shell--sidebar-collapsed/,
  );
  await expect(page.locator(".sidebar")).toHaveCSS("width", "64px");

  await page.goto("/docs");
  await page.reload();
  await expect(page.locator(".shell")).toHaveClass(
    /shell--sidebar-collapsed/,
  );
  await expect(
    page.getByRole("button", { name: "Развернуть боковое меню" }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Развернуть боковое меню" })
    .click();
  await page.goto("/support/inbox");
  await expect(page.locator(".shell")).not.toHaveClass(
    /shell--sidebar-collapsed/,
  );
  await page.reload();
  await expect(page.locator(".shell")).not.toHaveClass(
    /shell--sidebar-collapsed/,
  );
});

test("keeps the mobile drawer full-width and unchanged", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() =>
    localStorage.setItem("retenive-cms-sidebar-collapsed-v1", "true"),
  );
  await page.goto("/overview");
  await page.getByRole("button", { name: "Открыть меню", exact: true }).click();

  const sidebar = page.getByRole("complementary", {
    name: "Основная навигация CMS",
  });
  await expect(sidebar).toHaveCSS("width", "250px");
  await expect(
    sidebar.getByRole("link", { name: "Поддержка", exact: true }),
  ).toBeVisible();
  await expect(
    sidebar.getByRole("button", { name: /боковое меню/ }),
  ).toBeHidden();
});
