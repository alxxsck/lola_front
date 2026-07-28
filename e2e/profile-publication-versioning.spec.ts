import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto("/profile-fields");
  await expect(
    page.getByRole("heading", {
      name: "Поля профиля пользователей",
      level: 1,
    }),
  ).toBeVisible();
});

test("shows publication history separately from producer contract history", async ({
  page,
}) => {
  await expect(page.getByText("Публикация #4", { exact: true })).toBeVisible();
  await expect(page.getByText("Контракт v3", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "История изменений" }).click();
  const dialog = page.getByRole("dialog", {
    name: "История изменений полей",
  });
  await expect(dialog).toBeVisible();

  const publicationTab = dialog.getByRole("tab", { name: "Публикации" });
  const contractTab = dialog.getByRole("tab", { name: "Версии контракта" });
  await expect(publicationTab).toHaveAttribute("aria-selected", "true");
  await expect(
    dialog.getByRole("heading", { name: "Публикации настроек" }),
  ).toBeVisible();

  await dialog
    .locator("button[data-publication-id='demo-publication']")
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Публикация #4", level: 4 }),
  ).toBeVisible();

  await contractTab.click();
  await expect(contractTab).toHaveAttribute("aria-selected", "true");
  await expect(
    dialog.getByRole("heading", { name: "Версии контракта" }),
  ).toBeVisible();
  await expect(
    dialog.locator("button[data-revision-id='demo-revision']"),
  ).toBeVisible();
});

test("keeps the publication workspace readable on narrow screens", async ({
  page,
}) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/profile-fields");
    await expect(
      page.getByRole("heading", {
        name: "Поля профиля пользователей",
        level: 1,
      }),
    ).toBeVisible();

    const layout = await page.evaluate(() => ({
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      summaryColumns: getComputedStyle(
        document.querySelector<HTMLElement>(".summary-grid")!,
      ).gridTemplateColumns.split(" ").length,
      footerColumns: getComputedStyle(
        document.querySelector<HTMLElement>(".workspace-footer")!,
      ).gridTemplateColumns.split(" ").length,
    }));

    expect(layout.overflow).toBe(0);
    expect(layout.summaryColumns).toBe(1);
    expect(layout.footerColumns).toBe(1);
  }
});
