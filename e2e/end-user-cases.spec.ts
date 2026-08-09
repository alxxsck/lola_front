import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("case settings remain responsive and complete the preview-save-publish flow", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/cases/settings");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Категории и приоритеты",
      }),
    ).toBeVisible();
    const geometry = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      clipped: Array.from(
        document.querySelectorAll("main button, main textarea"),
      ).filter((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.left < 0 || bounds.right > window.innerWidth;
      }).length,
    }));
    expect(geometry.scrollWidth).toBe(geometry.clientWidth);
    expect(geometry.clipped).toBe(0);
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/cases/settings");
  await page.getByRole("button", { name: "Проверить" }).click();
  await expect(page.getByText("Правила корректны.")).toBeVisible();
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByText("Черновик сохранён.")).toBeVisible();
  await page.getByRole("button", { name: "Опубликовать" }).click();
  await expect(
    page.getByText("Правила опубликованы и применяются к новым анализам."),
  ).toBeVisible();
});
